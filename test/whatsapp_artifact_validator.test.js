const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { buildWhatsAppCsv } = require('../src/evidence/whatsapp_artifacts');
const {
  countCsvRecords,
  validateWhatsAppArtifactStructure
} = require('../src/evidence/whatsapp_artifact_validator');

function createChatDirectory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forensic-artifact-'));
  const chatDirectory = path.join(root, 'chat_001_Angelite');
  fs.mkdirSync(path.join(chatDirectory, 'multimedia'), { recursive: true });
  return chatDirectory;
}

test('cuenta registros CSV aunque el texto tenga saltos de línea', () => {
  const csv = buildWhatsAppCsv([
    { metadata: '[10:00, 26/9/2026] Angelite:', texto: 'uno\ndos' },
    { metadata: '[10:01, 26/9/2026] Tú:', texto: 'tres' }
  ]);

  assert.equal(countCsvRecords(csv), 2);
});

test('valida un expediente completo y sus adjuntos locales', () => {
  const chatDirectory = createChatDirectory();
  const mediaPath = path.join(chatDirectory, 'multimedia', '001.jpg');
  fs.writeFileSync(mediaPath, 'image-fixture');

  const messages = [{
    id_unico: 'msg-1',
    metadata: '[10:00, 26/9/2026] Angelite:',
    texto: '[Imagen]',
    adjuntos: [{ tipo: 'imagen', archivo: 'multimedia/001.jpg' }]
  }];
  fs.writeFileSync(path.join(chatDirectory, 'historial.json'), JSON.stringify(messages));
  fs.writeFileSync(path.join(chatDirectory, 'historial.csv'), buildWhatsAppCsv(messages));
  fs.writeFileSync(path.join(chatDirectory, 'manifest.json'), JSON.stringify({
    totalMensajes: 1,
    archivos: [{
      archivo: 'multimedia/001.jpg',
      sha256: 'a'.repeat(64)
    }]
  }));

  const result = validateWhatsAppArtifactStructure({ chatDirectory });

  assert.equal(result.ok, true);
  assert.deepEqual(result.summary, {
    jsonMessages: 1,
    csvMessages: 1,
    manifestFiles: 1,
    missingFiles: 0,
    missingMedia: 0
  });
});

test('detecta conteos inconsistentes, rutas inseguras y multimedia faltante', () => {
  const chatDirectory = createChatDirectory();
  const messages = [{
    id_unico: 'msg-1',
    texto: '[Video]',
    adjuntos: [{ tipo: 'video', archivo: 'multimedia/no-existe.mp4' }]
  }];
  fs.writeFileSync(path.join(chatDirectory, 'historial.json'), JSON.stringify(messages));
  fs.writeFileSync(path.join(chatDirectory, 'historial.csv'), buildWhatsAppCsv(messages));
  fs.writeFileSync(path.join(chatDirectory, 'manifest.json'), JSON.stringify({
    totalMensajes: 2,
    archivos: [{ archivo: '../fuera.bin', sha256: 'b'.repeat(64) }]
  }));

  const result = validateWhatsAppArtifactStructure({ chatDirectory });

  assert.equal(result.ok, false);
  assert.ok(result.errors.some(issue => issue.code === 'MANIFEST_COUNT_MISMATCH'));
  assert.ok(result.errors.some(issue => issue.code === 'MANIFEST_PATH_UNSAFE'));
  assert.ok(result.warnings.some(issue => issue.code === 'MEDIA_FILE_MISSING'));
});
