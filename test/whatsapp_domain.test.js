const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  parseWhatsAppMessageTimestamp,
  sortWhatsAppMessages,
  normalizeConversationTarget,
  mergeConversationCatalog,
  inferMediaExtension,
  normalizeCsvText
} = require('../src/platform/web/whatsapp/whatsapp_domain');
const { createOperationLogger } = require('../src/core/operation_logger');
const {
  buildWhatsAppCsv,
  createWhatsAppManifest
} = require('../src/evidence/whatsapp_artifacts');
const {
  WHATSAPP_ERROR_CODES,
  classifyWhatsAppError
} = require('../src/platform/web/whatsapp/whatsapp_errors');

test('ordena mensajes por fecha completa y conserva el orden estable', () => {
  const messages = [
    { id: 'late', metadata: '[23:59, 24/9/2026] Angelite:' },
    { id: 'early', metadata: '[23:21, 24/9/2026] nexo invitaciones:' },
    { id: 'same-a', metadata: '[23:21, 24/9/2026] Angelite:' },
    { id: 'unknown', metadata: '' }
  ];

  assert.equal(parseWhatsAppMessageTimestamp(messages[1]) < parseWhatsAppMessageTimestamp(messages[0]), true);
  assert.deepEqual(sortWhatsAppMessages(messages).map(message => message.id), [
    'early', 'same-a', 'late', 'unknown'
  ]);
});

test('normaliza y fusiona conversaciones recientes, archivadas y grupos', () => {
  assert.deepEqual(normalizeConversationTarget(' Angelite '), {
    name: 'Angelite', id: null, source: 'legacy', kind: 'conversation'
  });

  const merged = mergeConversationCatalog([
    { name: 'Angelite', id: 'chat-1', source: 'recent', kind: 'conversation' },
    { name: 'Angelite', id: 'chat-1', source: 'archived', kind: 'conversation' },
    { name: 'Familia', id: '123@g.us', source: 'recent', kind: 'group' }
  ]);

  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find(item => item.name === 'Angelite').sources, ['recent', 'archived']);
  assert.equal(merged.find(item => item.name === 'Familia').kind, 'group');
});

test('infiere extensiones y normaliza texto para CSV', () => {
  assert.equal(inferMediaExtension('video/mp4', 'video'), 'mp4');
  assert.equal(inferMediaExtension('', 'sticker'), 'webp');
  assert.equal(inferMediaExtension('', 'audio'), 'ogg');
  assert.equal(normalizeCsvText('  uno\r\ndos  '), 'uno\ndos');
});

test('el logger conserva eventos estructurados por sesión', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'forensic-log-'));
  const filePath = path.join(directory, 'operation.jsonl');
  const observed = [];
  const logger = createOperationLogger({
    runId: 'session-test',
    scope: 'whatsapp-extraction',
    filePath,
    onEntry: entry => observed.push(entry)
  });

  logger.event('chat.started', { chat: 'Angelite', index: 1 });
  logger.error('No se encontro el chat', { code: 'CHAT_NOT_FOUND' });

  assert.equal(observed.length, 2);
  assert.equal(observed[0].runId, 'session-test');
  assert.equal(observed[0].context.index, 1);
  assert.equal(observed[1].level, 'error');
  assert.equal(fs.readFileSync(filePath, 'utf8').trim().split(/\r?\n/).length, 2);
});

test('clasifica errores de WhatsApp por fase sin depender solo del texto visible', () => {
  assert.equal(
    classifyWhatsAppError({ code: WHATSAPP_ERROR_CODES.MEDIA_UNAVAILABLE, message: 'blob expirado' }).code,
    'MEDIA_UNAVAILABLE'
  );
  assert.equal(classifyWhatsAppError(new Error('locator msg-container timeout')).code, 'DOM_SELECTOR_MISSING');
  assert.equal(classifyWhatsAppError(new Error('no se encontro el chat')).code, 'CHAT_NOT_FOUND');
  assert.equal(classifyWhatsAppError(new Error('fallo inesperado'), 'CHAT_EXTRACTION_FAILED').code, 'CHAT_EXTRACTION_FAILED');
});

test('construye el CSV de WhatsApp con tipos y valores escapados', () => {
  const csv = buildWhatsAppCsv([
    {
      metadata: '[02:16, 8/9/2026] Angelite:',
      texto: 'Cuando quieras, "guapote"',
      enlaces: [{ url: 'https://example.test/a,b' }],
      adjuntos: [],
      estado_visual: { editado: false },
      respuesta: null
    },
    {
      metadata: '[23:21, 24/9/2026] Tú:',
      texto: '[Video]',
      adjuntos: [{ tipo: 'video', archivo: 'multimedia/001.mp4' }]
    }
  ]);

  assert.match(csv, /^Metadatos \(Hora\/Autor\),Mensaje,Enlaces,Tipo,Adjuntos,Estado visual,Respuesta\n/);
  assert.match(csv, /"Cuando quieras, ""guapote"""/);
  assert.match(csv, /"texto\|enlace"/);
  assert.match(csv, /"video"/);
  assert.match(csv, /https:\/\/example\.test\/a,b/);
});

test('construye un manifiesto portable con rutas relativas y fuentes normalizadas', () => {
  const manifest = createWhatsAppManifest({
    contacto: 'Angelite',
    conversacion: {
      id: 'chat-1',
      kind: 'conversation',
      source: 'recent',
      sources: ['recent', 'archived']
    },
    fechaInicio: '2026-09-26T00:00:00.000Z',
    fechaFin: '2026-09-26T00:01:00.000Z',
    totalMensajes: 2,
    hashes: [
      { filePath: 'C:\\evidence\\Angelite\\historial.csv', sha256: 'abc123' }
    ],
    baseDirectory: 'C:\\evidence\\Angelite'
  });

  assert.equal(manifest.contacto, 'Angelite');
  assert.deepEqual(manifest.conversacion.sources, ['recent', 'archived']);
  assert.equal(manifest.archivos[0].archivo, 'historial.csv');
  assert.equal(manifest.archivos[0].sha256, 'abc123');
});
