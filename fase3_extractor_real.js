const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const { pathToFileURL } = require('url');
const { hashFile } = require('./src/evidence/file_hash');
const {
  startDesktopRecording,
  stopDesktopRecording,
  listRecordingSegments,
  hashFileWithSidecar
} = require('./src/capture/desktop_recorder');
const {
  sortWhatsAppMessages,
  normalizeConversationTarget,
  conversationKey,
  mergeConversationCatalog,
  inferMediaExtension
} = require('./src/platform/web/whatsapp/whatsapp_domain');
const {
  buildWhatsAppCsv,
  createWhatsAppManifest
} = require('./src/evidence/whatsapp_artifacts');
const {
  validateWhatsAppArtifactStructure
} = require('./src/evidence/whatsapp_artifact_validator');
const {
  createOperationLogger,
  formatOperationLog
} = require('./src/core/operation_logger');
const { extractVisibleMessagesFromDom } = require('./src/platform/web/whatsapp/message_dom_parser');
const { extractVisibleMediaFromDom } = require('./src/platform/web/whatsapp/media_dom_parser');
const {
  WHATSAPP_ERROR_CODES,
  classifyWhatsAppError
} = require('./src/platform/web/whatsapp/whatsapp_errors');

let uiLogger = null;
let activeOperationLogger = null;
const WHATSAPP_URL = 'https://web.whatsapp.com/';
const WHATSAPP_READY_SELECTOR = 'div[data-testid="chat-list-search-container"]';
const DEFAULT_BROWSER_CHANNEL = process.env.FORENSIC_BROWSER_CHANNEL || 'msedge';
const WHATSAPP_OUTPUT_DIR = path.join(os.homedir(), 'Desktop', 'Forensic_Extractions', 'Auditoria_WhatsApp');

async function collectConversationEntries(page, listLocator, source, options = {}) {
  const maxPasses = options.maxPasses ?? 80;
  const unchangedLimit = options.unchangedLimit ?? 4;
  const onBatch = typeof options.onBatch === 'function' ? options.onBatch : null;
  const found = new Map();
  let unchanged = 0;

  for (let pass = 0; pass < maxPasses && unchanged < unchangedLimit; pass++) {
    const before = found.size;
    if (await listLocator.count() > 0 || !options.requireListLocator) {
      const visibleEntries = await page.evaluate(({ entrySource, rootSelector }) => {
        const root = rootSelector ? document.querySelector(rootSelector) : document;
        if (!root) return [];
        return Array.from(root.querySelectorAll('div[data-testid="cell-frame-title"] span[title]'))
          .map((span) => {
            const name = String(span.getAttribute('title') || '').trim();
            const cell = span.closest('[data-testid="list-item-0"], [role="listitem"], [data-id]') || span;
            const stableId = cell.closest('[data-id]')?.getAttribute('data-id') || '';
            const preview = cell.closest('[role="listitem"]')?.querySelector('[data-testid="last-msg-status"]');
            const activity = cell.closest('[role="listitem"]')?.querySelector('[data-testid="cell-frame-primary-detail"]');
            return {
              name,
              id: stableId || null,
              source: entrySource,
              kind: stableId.endsWith('@g.us') ? 'group' : 'conversation',
              lastMessagePreview: preview?.getAttribute('title') || preview?.innerText || '',
              lastActivity: activity?.innerText || ''
            };
          })
          .filter((entry) => entry.name);
      }, { entrySource: source, rootSelector: options.rootSelector || null });

      const newEntries = [];
      for (const entry of visibleEntries) {
        const key = conversationKey(entry);
        if (!found.has(key)) {
          found.set(key, entry);
          newEntries.push(entry);
        }
      }
      if (onBatch && newEntries.length > 0) {
        await onBatch({ type: 'conversations', source, conversations: newEntries, total: found.size });
      }
    }

    unchanged = found.size === before ? unchanged + 1 : 0;
    if (await listLocator.count() === 0) break;
    await listLocator.first().hover();
    await page.mouse.wheel(0, options.scrollDistance ?? 900);
    await page.waitForTimeout(options.scrollDelayMs ?? 650);
  }

  return Array.from(found.values());
}

async function returnToMainConversationList(page) {
  const backButton = page.locator('button[data-tab="2"][aria-label^="Atr"]').first();
  if (await backButton.count() === 0 || !(await backButton.isVisible())) {
    log('No se encontro el boton Atrás; se verificara la lista principal directamente.');
    return false;
  }

  await backButton.click();
  await page.waitForSelector(WHATSAPP_READY_SELECTOR, { state: 'visible', timeout: 10000 });
  await page.waitForTimeout(700);
  log('Lista principal de conversaciones restaurada.');
  return true;
}

function log(msg) {
  if (activeOperationLogger) {
    activeOperationLogger.info(msg);
    return;
  }
  console.log(msg);
  if (uiLogger) uiLogger(msg);
}
function logError(msg) {
  if (activeOperationLogger) {
    activeOperationLogger.error(msg);
    return;
  }
  console.error(msg);
  if (uiLogger) uiLogger(`[Error] ${msg}`);
}

async function smoothScrollMessages(page, box, options = {}) {
  const totalDistance = options.totalDistance ?? 900;
  const stepDistance = options.stepDistance ?? 90;
  const stepDelayMs = options.stepDelayMs ?? 180;

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  let remaining = totalDistance;
  while (remaining > 0) {
    const distance = Math.min(stepDistance, remaining);
    await page.mouse.wheel(0, -distance);
    remaining -= distance;
    await page.waitForTimeout(stepDelayMs);
  }
}

async function readVisibleMediaModalMetadata(page) {
  return page.evaluate(() => {
    const isVisible = (element) => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && rect.width > 0
        && rect.height > 0;
    };

    const secondary = Array.from(document.querySelectorAll('[data-testid="cell-frame-secondary"]'))
      .filter(isVisible)
      .map((element) => ({
        element,
        text: String(element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim()
      }))
      .filter(({ text }) => /\b\d{1,2}\/\d{1,2}\/\d{4}\b/.test(text) && /\b\d{1,2}:\d{2}\b/.test(text))
      .at(-1);

    if (!secondary) return null;

    const card = secondary.element.closest('[data-testid="cell-frame-container"]') || secondary.element.parentElement;
    const title = card?.querySelector('[data-testid="cell-frame-title"]');
    const author = String(title?.innerText || title?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/^TÃº$/i, 'Tú');
    const dateMatch = secondary.text.match(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/);
    const timeMatch = secondary.text.match(/\b(\d{1,2}:\d{2})\b/);

    return {
      autor: author || null,
      fecha: dateMatch?.[1] || null,
      hora: timeMatch?.[1] || null,
      raw: secondary.text
    };
  });
}

function createMediaModalMetadata(modalContext, fallbackContext = {}) {
  if (!modalContext?.fecha || !modalContext?.hora) return null;
  const autor = String(modalContext.autor || fallbackContext.autor || '').trim();
  return {
    metadata: `[${modalContext.hora}, ${modalContext.fecha}]${autor ? ` ${autor}:` : ''}`,
    autor: autor || fallbackContext.autor || null,
    metadata_fuente: 'modal_multimedia',
    metadata_modal: {
      autor: modalContext.autor || null,
      fecha: modalContext.fecha,
      hora: modalContext.hora,
      raw: modalContext.raw || ''
    }
  };
}

async function activateVisibleVideoMessages(page, processedMessages = new Set()) {
  const videoMessages = page.locator('div[data-testid="msg-container"] div[data-testid="video-content"]');
  const count = Math.min(await videoMessages.count(), 12);
  const activatedVideos = [];
  for (let index = 0; index < count; index++) {
    try {
      const videoMessage = videoMessages.nth(index);
      const contexto = await videoMessage.evaluate((node) => {
        const container = node.closest('div[data-testid="msg-container"]');
        if (!container) return { id: '', metadata: '', autor: null, direccion: 'desconocida' };
        const domId = container.closest('[data-id]')?.getAttribute('data-id') || '';
        const metadata = container.querySelector('.copyable-text[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
        const visibleMeta = container.querySelector('[data-testid="msg-meta"]')?.innerText || '';
        const messageText = String(container.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const senderLabel = container.querySelector('span[aria-label$=":"]')?.getAttribute('aria-label') || '';
        const tailOut = Boolean(container.querySelector('[data-icon="tail-out"], [data-testid="tail-out"]'));
        const tailIn = Boolean(container.querySelector('[data-icon="tail-in"], [data-testid="tail-in"]'));
        const autorMatch = metadata.match(/\]\s*(.*?):\s*$/);
        return {
          id: domId || `meta:${metadata || visibleMeta || messageText}`,
          metadata: String(metadata || visibleMeta).replace(/\s+/g, ' ').trim(),
          autor: autorMatch ? autorMatch[1].trim() : (senderLabel.replace(/:\s*$/, '').trim() || null),
          direccion: tailOut || /^(?:tu|t\u00fa|you)\s*:/i.test(senderLabel)
            ? 'saliente'
            : tailIn
              ? 'entrante'
              : 'desconocida'
        };
      });
      if (processedMessages.has(contexto.id)) continue;
      await videoMessage.scrollIntoViewIfNeeded({ timeout: 2500 });
      await videoMessage.click({ timeout: 2500 });
      const modalVideo = page.locator('div[data-testid="media-video"] video').last();
      await modalVideo.waitFor({ state: 'attached', timeout: 5000 });
      const url = await modalVideo.evaluate(video => video.currentSrc || video.getAttribute('src') || '');
      if (url) {
        const modalContext = createMediaModalMetadata(
          await readVisibleMediaModalMetadata(page),
          contexto
        );
        const enrichedContext = modalContext
          ? { ...contexto, ...modalContext }
          : contexto;
        processedMessages.add(contexto.id);
        activatedVideos.push({ url, tipo: 'video', mensaje_id: contexto.id, ...enrichedContext });
      }
      await page.keyboard.press('Escape');
      await page.waitForTimeout(350);
    } catch (_) {
      // Algunos mensajes solo muestran la miniatura hasta que WhatsApp
      // termina de preparar el medio; el siguiente ciclo volvera a intentar.
      try { await page.keyboard.press('Escape'); } catch (_) { /* modal ausente */ }
    }
  }
  return activatedVideos;
}

async function activateVisibleVoiceMessages(page, processedMessages = new Set()) {
  const voiceButtons = page.locator('div[data-testid="msg-container"] button[aria-label^="Reproducir mensaje de voz"]');
  const count = Math.min(await voiceButtons.count(), 12);
  const activatedAudios = [];

  for (let index = 0; index < count; index++) {
    try {
      const voiceButton = voiceButtons.nth(index);
      const contexto = await voiceButton.evaluate((node) => {
        const container = node.closest('div[data-testid="msg-container"]');
        if (!container) return { id: '', metadata: '', autor: null, direccion: 'desconocida' };
        const domId = container.closest('[data-id]')?.getAttribute('data-id') || '';
        const metadata = container.querySelector('.copyable-text[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
        const visibleMeta = container.querySelector('[data-testid="msg-meta"]')?.innerText || '';
        const messageText = String(container.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const senderLabel = container.querySelector('span[aria-label$=":"]')?.getAttribute('aria-label') || '';
        const tailOut = Boolean(container.querySelector('[data-icon="tail-out"], [data-testid="tail-out"]'));
        const tailIn = Boolean(container.querySelector('[data-icon="tail-in"], [data-testid="tail-in"]'));
        const autorMatch = metadata.match(/\]\s*(.*?):\s*$/);
        return {
          id: domId || `meta:${metadata || visibleMeta || messageText}`,
          metadata: String(metadata || visibleMeta).replace(/\s+/g, ' ').trim(),
          autor: autorMatch ? autorMatch[1].trim() : (senderLabel.replace(/:\s*$/, '').trim() || null),
          direccion: tailOut || /^(?:tu|t\u00fa|you)\s*:/i.test(senderLabel)
            ? 'saliente'
            : tailIn
              ? 'entrante'
              : 'desconocida'
        };
      });
      if (processedMessages.has(contexto.id)) continue;
      await voiceButton.scrollIntoViewIfNeeded({ timeout: 2500 });

      const responsePromise = page.waitForResponse((response) => {
        const contentType = String(response.headers()['content-type'] || '').toLowerCase();
        const url = response.url().toLowerCase();
        return contentType.includes('audio')
          || contentType.includes('ogg')
          || contentType.includes('opus')
          || url.includes('/stream/');
      }, { timeout: 8000 }).catch(() => null);

      await voiceButton.click({ timeout: 2500 });
      const response = await responsePromise;
      if (response) {
        const body = await response.body();
        if (body.length > 0) {
          processedMessages.add(contexto.id);
          activatedAudios.push({
            url: response.url(),
            tipo: 'audio',
            mensaje_id: contexto.id,
            mime: response.headers()['content-type'] || 'audio/ogg',
            dataBase64: body.toString('base64'),
            ...contexto
          });
        }
      }

      const pauseButton = page.locator('div[data-testid="msg-container"] button[aria-label^="Pausar mensaje de voz"]').first();
      if (await pauseButton.count() > 0 && await pauseButton.isVisible()) {
        await pauseButton.click({ timeout: 1500 }).catch(() => {});
      }
      await page.waitForTimeout(250);
    } catch (_) {
      // La nota puede estar descargada en cache o no exponer una respuesta
      // de audio en este ciclo; el escaneo DOM posterior sigue activo.
    }
  }

  return activatedAudios;
}

async function createWhatsAppSession(options = {}) {
  const userDataDir = options.userDataDir || path.join(os.homedir(), '.forensic_whatsapp_session');
  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    channel: options.browserChannel || DEFAULT_BROWSER_CHANNEL
  });
  const page = browserContext.pages().length > 0
    ? browserContext.pages()[0]
    : await browserContext.newPage();
  page.setDefaultTimeout(120000);
  if (!page.url().startsWith(WHATSAPP_URL)) {
    await page.goto(WHATSAPP_URL, { waitUntil: 'domcontentloaded' });
  }
  return { context: browserContext, page, userDataDir };
}

async function isWhatsAppSessionReady(session, timeoutMs = 2000) {
  if (!session?.page || session.page.isClosed()) return false;
  try {
    await session.page.waitForSelector(WHATSAPP_READY_SELECTOR, {
      state: 'visible',
      timeout: timeoutMs
    });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Genera un reporte FORENSE en PDF para WhatsApp
 */
function generarReportePDFWhatsApp(rutaCSV, archivoSalida) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(archivoSalida);
      doc.pipe(stream);

      // Encabezado
      doc.fontSize(20).font('Helvetica-Bold').text('CERTIFICADO DE AUDITORÍA DE WHATSAPP', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).font('Helvetica').text('Este documento certifica la extracción de un historial de conversaciones desde la plataforma web y su correspondiente huella criptográfica (Hash SHA-256) para garantizar que el historial no ha sido alterado.', { align: 'justify' });
      doc.moveDown();
      doc.font('Helvetica-Bold').text(`Fecha y Hora de Extracción: `, { continued: true }).font('Helvetica').text(new Date().toISOString());
      doc.font('Helvetica-Bold').text(`Herramienta Utilizada: `, { continued: true }).font('Helvetica').text('Forensic Data Extractor Suite v1.0 (Módulo Lógico)');
      doc.moveDown(2);

      doc.fontSize(14).font('Helvetica-Bold').text('REGISTRO DE EVIDENCIA Y HASH', { underline: true });
      doc.moveDown();
      doc.fontSize(10);

      const hashCSV = await hashFile(rutaCSV);
      
      // Añadir al PDF
      doc.font('Helvetica-Bold').text(`Archivo Original: `, { continued: true }).font('Helvetica').text(path.basename(rutaCSV));
      doc.font('Helvetica-Bold').text(`SHA-256: `, { continued: true }).font('Courier').text(hashCSV);
      doc.moveDown(2);

      doc.fontSize(12).font('Helvetica-Oblique').text('Fin del registro. Cualquier alteración de una sola coma o letra en el archivo CSV original modificará su Hash SHA-256 de forma irreversible, invalidando esta certificación.', { align: 'center' });
      
      doc.end();

      stream.on('finish', () => {
        resolve();
      });
      stream.on('error', reject);
    } catch (e) {
      reject(e);
    }
  });
}

async function getWhatsAppContactsLegacy(options = {}, loggerCallback) {
  uiLogger = typeof loggerCallback === 'function' ? loggerCallback : null;
  const session = options.session || await createWhatsAppSession(options);
  const ownsSession = !options.session;
  const browserContext = session.context;
  const page = session.page;
  
  log(`\n⏳ Abriendo navegador en segundo plano para leer contactos...`);
  try {
    if (!page.url().startsWith(WHATSAPP_URL)) {
      await page.goto(WHATSAPP_URL, { waitUntil: 'domcontentloaded' });
    }
    log('⏳ Esperando conexión a WhatsApp Web...');
    await page.waitForSelector(WHATSAPP_READY_SELECTOR, { timeout: 120000 });
    
    // Scrollear un poco la lista de chats para cargar más
    log('✅ Escaneando lista de chats recientes...');
    const chatList = page.locator('div[aria-label="Chat list"]');
    if (await chatList.count() > 0) {
        await chatList.hover();
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1500);
        await page.mouse.wheel(0, 1000);
        await page.waitForTimeout(1500);
    }

    const contacts = await page.evaluate(() => {
        // Seleccionamos los títulos de los chats en el panel izquierdo
        const spans = document.querySelectorAll('div[data-testid="cell-frame-title"] span[title]');
        const uniqueNames = new Set();
        spans.forEach(span => {
            if (span.title && span.title.trim() !== '') {
                uniqueNames.add(span.title);
            }
        });
        return Array.from(uniqueNames);
    });

    log(`🎉 Se encontraron ${contacts.length} conversaciones recientes.`);
    if (ownsSession) await browserContext.close();
    return contacts;
  } catch (error) {
    if (ownsSession) await browserContext.close();
    logError(`❌ Error al leer contactos: ${error.message}`);
    throw error;
  }
}

async function getWhatsAppContacts(options = {}, loggerCallback) {
  uiLogger = typeof loggerCallback === 'function' ? loggerCallback : null;
  const conversationCallback = typeof options.onConversationBatch === 'function'
    ? options.onConversationBatch
    : null;
  const session = options.session || await createWhatsAppSession(options);
  const ownsSession = !options.session;
  const browserContext = session.context;
  const page = session.page;

  try {
    if (!page.url().startsWith(WHATSAPP_URL)) {
      await page.goto(WHATSAPP_URL, { waitUntil: 'domcontentloaded' });
    }
    log('Escaneando conversaciones recientes...');
    await page.waitForSelector(WHATSAPP_READY_SELECTOR, { timeout: 120000 });

    const recentList = page.locator('div[aria-label="Chat list"]').first();
    const recentConversations = await collectConversationEntries(page, recentList, 'recent', {
      rootSelector: null,
      requireListLocator: false,
      onBatch: conversationCallback
    });
    let archivedConversations = [];

    const archivedButton = page.locator('button[data-testid="chatlist-panel-archived-button"]').first();
    if (await archivedButton.count() > 0 && await archivedButton.isVisible()) {
      log('Entrando en Archivados para completar el catalogo...');
      await archivedButton.click();
      const archivedList = page.locator('div[data-testid="archived-chatlist"]').first();
      try {
        await archivedList.waitFor({ state: 'visible', timeout: 10000 });
        archivedConversations = await collectConversationEntries(page, archivedList, 'archived', {
          rootSelector: 'div[data-testid="archived-chatlist"]',
          requireListLocator: true,
          onBatch: conversationCallback
        });
      } catch (archiveError) {
        logError(`No se pudo leer Archivados: ${archiveError.message}`);
      }
      await returnToMainConversationList(page);
    } else {
      log('No se encontro el acceso a Archivados; se continuara con recientes.');
    }

    const conversations = mergeConversationCatalog([
      ...recentConversations,
      ...archivedConversations
    ]);
    fs.mkdirSync(WHATSAPP_OUTPUT_DIR, { recursive: true });
    const catalogPath = path.join(WHATSAPP_OUTPUT_DIR, `catalogo_conversaciones_${Date.now()}.json`);
    fs.writeFileSync(catalogPath, `${JSON.stringify({
      schema: 'forensic-suite.whatsapp-conversation-catalog.v1',
      capturedAt: new Date().toISOString(),
      sources: ['recent', 'archived'],
      total: conversations.length,
      conversations
    }, null, 2)}\n`, 'utf8');

    log(`Se encontraron ${conversations.length} conversaciones (${recentConversations.length} recientes, ${archivedConversations.length} archivadas).`);
    log(`Catalogo guardado: ${path.basename(catalogPath)}`);
    if (ownsSession) await browserContext.close();
    return conversations;
  } catch (error) {
    if (ownsSession) await browserContext.close();
    logError(`Error al leer conversaciones: ${error.message}`);
    throw error;
  }
}

async function runWhatsAppExtraction(options, loggerCallback) {
  uiLogger = typeof loggerCallback === 'function' ? loggerCallback : null;
  activeOperationLogger = null;
  const messageCallback = typeof options?.onMessageBatch === 'function' ? options.onMessageBatch : null;
  const testMode = options.testMode || false;
  const contentOptions = {
    includeText: options.contentOptions?.includeText !== false,
    includeImages: options.contentOptions?.includeImages !== false,
    includeVideos: options.contentOptions?.includeVideos !== false,
    includeAudio: options.contentOptions?.includeAudio !== false,
    includeStickers: options.contentOptions?.includeStickers !== false
  };
  const recordVisual = options.recordVisual !== false;
  const contactosObjetivo = options.contactos || options.conversaciones || [];

  if (contactosObjetivo.length === 0) {
      logError("❌ No se seleccionó ningún contacto para extraer.");
      return { ok: false, error: 'No se seleccionó ningún contacto.' };
  }

  const OUTPUT_DIR = path.join(require('os').homedir(), 'Desktop', 'Forensic_Extractions', 'Auditoria_WhatsApp');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const sessionId = `session_${Date.now()}`;
  const sessionDirectory = path.join(OUTPUT_DIR, sessionId);
  const sessionManifestPath = path.join(sessionDirectory, 'session.json');
  const operationLogPath = path.join(sessionDirectory, 'operation.jsonl');
  const sessionManifest = {
    schema: 'forensic-suite.whatsapp-session.v1',
    sessionId,
    startedAt: new Date().toISOString(),
    status: 'starting',
    testMode,
    contentOptions,
    recordVisual,
    operationLog: 'operation.jsonl',
    requestedConversations: contactosObjetivo.map(normalizeConversationTarget),
    chats: []
  };
  fs.mkdirSync(sessionDirectory, { recursive: true });
  activeOperationLogger = createOperationLogger({
    runId: sessionId,
    scope: 'whatsapp-extraction',
    filePath: operationLogPath,
    onEntry: (entry) => {
      console.log(formatOperationLog(entry));
      if (uiLogger) {
        uiLogger(entry.level === 'error' ? `[Error] ${entry.message}` : entry.message);
      }
    }
  });
  activeOperationLogger.event('session.started', {
    selectedChats: contactosObjetivo.length,
    testMode,
    recordVisual
  });
  fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(sessionDirectory, 'conversaciones_seleccionadas.json'),
    `${JSON.stringify(sessionManifest.requestedConversations, null, 2)}\n`,
    'utf8'
  );
  
  log(`\n=============================================`);
  log(`🚀 INICIANDO EXTRACCIÓN LÓGICA DE ${contactosObjetivo.length} CHATS ${testMode ? '[TEST MODE]' : ''}`);
  log(`=============================================\n`);

  const session = options.session || await createWhatsAppSession(options);
  const ownsSession = !options.session;
  const browserContext = session.context;
  const page = session.page;
  let activeRecording = null;

  try {
    sessionManifest.status = 'running';
    fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
    log('Navegando a WhatsApp Web...');
    if (!page.url().startsWith(WHATSAPP_URL)) {
      await page.goto(WHATSAPP_URL, { waitUntil: 'domcontentloaded' });
    }
    await page.waitForSelector(WHATSAPP_READY_SELECTOR, { timeout: 120000 });
    log('✅ Conexión establecida.\n');

    for (let i = 0; i < contactosObjetivo.length; i++) {
        const conversacion = normalizeConversationTarget(contactosObjetivo[i]);
        const nombreContacto = conversacion.name;
        if (!nombreContacto) {
          logError(`Se omitio una conversacion sin nombre en la posicion ${i + 1}.`);
          continue;
        }
        let carpetaContacto = null;
        let grabacion = null;
        try {
        activeOperationLogger?.event('chat.started', {
          chat: nombreContacto,
          index: i + 1,
          totalChats: contactosObjetivo.length,
          kind: conversacion.kind,
          source: conversacion.source
        });
        log(`\n---------------------------------------------`);
        log(`🎯 AUDITANDO [${i + 1}/${contactosObjetivo.length}]: ${nombreContacto}`);
        log(`---------------------------------------------`);

        const safeName = nombreContacto.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80) || `chat_${i + 1}`;
        carpetaContacto = path.join(
          sessionDirectory,
          `chat_${String(i + 1).padStart(3, '0')}_${safeName}`
        );
        fs.mkdirSync(carpetaContacto, { recursive: true });
        sessionManifest.chats.push({
          index: i + 1,
          name: nombreContacto,
          source: conversacion.source,
          kind: conversacion.kind,
          directory: path.relative(sessionDirectory, carpetaContacto).split(path.sep).join('/'),
          status: 'running'
        });
        fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
        const carpetaGrabacion = path.join(carpetaContacto, 'grabacion');
        const rutaGrabacion = path.join(carpetaGrabacion, 'video');
        const rutaLogFfmpeg = path.join(carpetaGrabacion, 'ffmpeg.log');
        const fechaInicio = new Date().toISOString();

        // La grabacion cubre la navegacion visible completa de este chat:
        // busqueda, seleccion, carga y recorrido del historial renderizado.
        if (recordVisual) {
          try {
            grabacion = await startDesktopRecording(rutaGrabacion, {
              logPath: rutaLogFfmpeg
            });
            activeRecording = grabacion;
            log(`Grabacion iniciada para ${nombreContacto}.`);
          } catch (recordingError) {
            logError(`No se pudo iniciar FFmpeg; se continuara sin grabacion: ${recordingError.message}`);
          }
        } else {
          log(`Grabacion visual desactivada para ${nombreContacto}.`);
        }

        // 1. Buscar el contacto
        const searchBox = page.locator('div[data-testid="chat-list-search-container"] input');
        await searchBox.click();
        await page.keyboard.press('Control+A');
        await page.keyboard.press('Backspace');
        // Ritmo legible para la demostracion; la seleccion sigue siendo DOM visible.
        await page.keyboard.type(nombreContacto, { delay: 90 });
        await page.waitForTimeout(1800);

        // 2. Hacer clic en el resultado
        const resultadoExacto = page.getByTitle(nombreContacto, { exact: true }).first();
        if (await resultadoExacto.count() === 0) {
            logError(`⚠️ No se encontró el chat "${nombreContacto}". Saltando...`);
            await page.keyboard.press('Escape');
            await stopDesktopRecording(grabacion);
            activeRecording = null;
            const missingChat = sessionManifest.chats[sessionManifest.chats.length - 1];
            if (missingChat?.status === 'running') missingChat.status = 'skipped';
            fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
            activeOperationLogger?.event('chat.skipped', {
              chat: nombreContacto,
              index: i + 1,
              reason: 'not_found',
              errorCode: WHATSAPP_ERROR_CODES.CHAT_NOT_FOUND
            });
            continue;
        }

        await resultadoExacto.click();
        await page.waitForTimeout(2000); // Esperar que cargue el chat

        let iteracion = 0;
        let mensajesExtraidos = new Map();
        const carpetaMultimedia = path.join(carpetaContacto, 'multimedia');
        fs.mkdirSync(carpetaMultimedia, { recursive: true });
        const blobsDescargados = new Set();
        const videosActivados = new Set();
        const audiosActivados = new Set();
        const autoresPropios = new Set();
        let contadorMedia = 0;
        const MAX_ITERACIONES = testMode ? 2 : 5000; // Si es test mode, solo sube 2 veces
        let scrollSinCambios = 0;

        while (iteracion < MAX_ITERACIONES && scrollSinCambios < 3) { 
            iteracion++;
            
            const nuevosMensajes = await page.evaluate(extractVisibleMessagesFromDom, {
              selectedContent: contentOptions,
              knownOwnAuthors: Array.from(autoresPropios)
            });

            let countNuevos = 0;
            const mensajesStreaming = [];
            for (const m of nuevosMensajes) {
                const autorNormalizado = String(m.autor || '').trim().toLocaleLowerCase();
                if (m.direccion === 'saliente' && autorNormalizado) autoresPropios.add(autorNormalizado);
            }
            for (const m of nuevosMensajes) {
                const autorNormalizado = String(m.autor || '').trim().toLocaleLowerCase();
                if (m.direccion === 'desconocida' && autorNormalizado && autoresPropios.has(autorNormalizado)) {
                    m.direccion = 'saliente';
                }
                if (!mensajesExtraidos.has(m.id_unico)) {
                    mensajesExtraidos.set(m.id_unico, m);
                    mensajesStreaming.push(m);
                    countNuevos++;
                }
            }
            if (messageCallback && mensajesStreaming.length > 0) {
                await Promise.resolve(messageCallback({
                    type: 'messages',
                    chat: nombreContacto,
                    messages: mensajesStreaming,
                    totalMessages: mensajesExtraidos.size,
                    iteration: iteracion
                }));
            }

            // WhatsApp puede mostrar primero una miniatura de video sin crear
            // todavia el elemento <video>; un clic controlado activa su carga.
            const activatedVideos = contentOptions.includeVideos
              ? await activateVisibleVideoMessages(page, videosActivados)
              : [];
            const activatedAudios = contentOptions.includeAudio
              ? await activateVisibleVoiceMessages(page, audiosActivados)
              : [];

            // Los adjuntos visibles usan blobs temporales dentro del navegador.
            // Se descargan mientras siguen vivos y se vinculan con el data-id
            // del mensaje; las miniaturas de una vista previa no se cuentan
            // como adjuntos independientes.
            const elementosMediaVisibles = await page.evaluate(extractVisibleMediaFromDom, contentOptions);
            // Los medios activados primero llevan la metadata enriquecida del
            // modal. Si el video ya expuso una URL en el DOM, no debemos dejar
            // que el registro básico (solo con hora) gane la carrera.
            const elementosMedia = [...activatedVideos, ...activatedAudios];
            const activatedUrls = new Set(elementosMedia.map(media => `${media.mensaje_id}|${media.url}`));
            elementosMedia.push(
              ...elementosMediaVisibles.filter(media => !activatedUrls.has(`${media.mensaje_id}|${media.url}`))
            );

            const mensajesMediaActualizados = new Set();
            for (const media of elementosMedia) {
                const mediaKey = `${media.mensaje_id}|${media.url}`;
                if (blobsDescargados.has(mediaKey)) continue;
                blobsDescargados.add(mediaKey);

                try {
                    const bytes = media.dataBase64
                      ? { ok: true, data: media.dataBase64, type: media.mime || '' }
                      : await page.evaluate(async (mediaUrl) => {
                          try {
                              const response = await fetch(mediaUrl);
                              const bytes = new Uint8Array(await response.arrayBuffer());
                              let binary = '';
                              const chunkSize = 0x8000;
                              for (let offset = 0; offset < bytes.length; offset += chunkSize) {
                                  binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
                              }
                              return {
                                  ok: true,
                                  data: btoa(binary),
                                  type: response.headers.get('content-type') || ''
                              };
                          } catch (_) {
                              return { ok: false, data: '', type: '' };
                          }
                      }, media.url);

                    if (!bytes.ok || !bytes.data) continue;

                    contadorMedia++;
                    const extension = inferMediaExtension(bytes.type, media.tipo);
                    const nombreArchivo = `${String(contadorMedia).padStart(3, '0')}_${media.tipo}.${extension}`;
                    const rutaMedia = path.join(carpetaMultimedia, nombreArchivo);
                    const mediaBuffer = Buffer.from(bytes.data, 'base64');
                    if (mediaBuffer.length === 0) continue;
                    fs.writeFileSync(rutaMedia, mediaBuffer);
                    const adjunto = {
                        archivo: path.relative(carpetaContacto, rutaMedia).split(path.sep).join('/'),
                        tipo: media.tipo,
                        mime: bytes.type || null,
                        bytes: mediaBuffer.length
                    };

                    const mediaAutorNormalizado = String(media.autor || '').trim().toLocaleLowerCase();
                    if (media.direccion === 'saliente' && mediaAutorNormalizado) autoresPropios.add(mediaAutorNormalizado);
                    let mensaje = Array.from(mensajesExtraidos.values())
                        .find(item => item.mensaje_id && item.mensaje_id === media.mensaje_id);
                    if (!mensaje) {
                        mensaje = {
                            id_unico: media.mensaje_id || `media-${contadorMedia}`,
                            mensaje_id: media.mensaje_id,
                            autor: media.autor || null,
                            direccion: media.direccion === 'saliente' || autoresPropios.has(mediaAutorNormalizado)
                              ? 'saliente'
                              : media.direccion || 'desconocida',
                            metadata: media.metadata || '',
                            metadata_fuente: media.metadata_fuente || null,
                            metadata_modal: media.metadata_modal || null,
                            texto: media.tipo === 'audio'
                              ? '[Nota de voz]'
                              : media.tipo === 'video'
                                ? '[Video]'
                                : '[Multimedia/Sticker]',
                            enlaces: [],
                            vista_previa: null,
                            estado_visual: { eliminado: false, editado: false, sticker: media.tipo === 'sticker' },
                            adjuntos: []
                        };
                        mensajesExtraidos.set(mensaje.id_unico, mensaje);
                    } else {
                        // Si el pase de multimedia llegó antes que el pase
                        // semántico, completa el mismo mensaje; nunca crea
                        // una segunda burbuja sin fecha ni autor.
                        const messageHasFullDate = /\[\d{1,2}:\d{2},\s*\d{1,2}\/\d{1,2}\/\d{4}\]/.test(String(mensaje.metadata || ''));
                        const mediaHasFullDate = /\[\d{1,2}:\d{2},\s*\d{1,2}\/\d{1,2}\/\d{4}\]/.test(String(media.metadata || ''));
                        if ((!messageHasFullDate && mediaHasFullDate) || (!mensaje.metadata && media.metadata)) {
                            mensaje.metadata = media.metadata;
                        }
                        if (!mensaje.autor && media.autor) mensaje.autor = media.autor;
                        if (media.metadata_fuente === 'modal_multimedia') {
                            mensaje.metadata_fuente = media.metadata_fuente;
                            mensaje.metadata_modal = media.metadata_modal;
                        }
                        if (mensaje.direccion === 'desconocida' && (media.direccion === 'saliente' || autoresPropios.has(mediaAutorNormalizado))) {
                            mensaje.direccion = 'saliente';
                        } else if (mensaje.direccion === 'desconocida' && media.direccion) {
                            mensaje.direccion = media.direccion;
                        }
                    }
                    mensaje.adjuntos.push(adjunto);
                    mensajesMediaActualizados.add(mensaje.id_unico);
                } catch (mediaError) {
                    logError(`No se pudo guardar multimedia visible: ${mediaError.message}`);
                }
            }

            if (messageCallback && mensajesMediaActualizados.size > 0) {
                await Promise.resolve(messageCallback({
                    type: 'media',
                    chat: nombreContacto,
                    messages: Array.from(mensajesMediaActualizados)
                        .map(id => mensajesExtraidos.get(id))
                        .map(message => message ? {
                            ...message,
                            adjuntos: (message.adjuntos || []).map(adjunto => ({
                                ...adjunto,
                                url: pathToFileURL(path.join(carpetaContacto, adjunto.archivo)).href
                            }))
                        } : null)
                        .filter(Boolean),
                    totalMessages: mensajesExtraidos.size,
                    iteration: iteracion
                }));
            }

            if (countNuevos === 0) scrollSinCambios++;
            else scrollSinCambios = 0;

            log(`   -> Iteración ${iteracion}/${MAX_ITERACIONES} | Total msgs: ${mensajesExtraidos.size}`);

            const mensajesLocator = page.locator('div[data-testid="conversation-panel-messages"]');
            const box = await mensajesLocator.boundingBox();
            if (box) {
                // Desplazamiento incremental para que la grabacion muestre
                // el contenido y no un salto de varios miles de pixeles.
                await smoothScrollMessages(page, box);
            }

            const btnOlder = page.locator('button:has-text("older messages")');
            if (await btnOlder.count() > 0) {
                await btnOlder.first().click();
                await page.waitForTimeout(1500);
            }
            await page.waitForTimeout(1000);
        }

        // El video termina al finalizar la navegacion visible; los archivos
        // estructurados se generan despues y quedan fuera de la captura.
        await stopDesktopRecording(grabacion);
        activeRecording = null;

        // 4. Guardar resultados estructurados y una copia JSON fiel.
        const mensajesOrdenados = sortWhatsAppMessages(Array.from(mensajesExtraidos.values()));
        const csvPath = path.join(carpetaContacto, 'historial.csv');
        fs.writeFileSync(csvPath, "\uFEFF" + buildWhatsAppCsv(mensajesOrdenados), 'utf-8');
        log(`💾 CSV Guardado: ${path.basename(csvPath)}`);

        const jsonPath = path.join(carpetaContacto, 'historial.json');
        fs.writeFileSync(
          jsonPath,
          JSON.stringify(mensajesOrdenados, null, 2),
          'utf8'
        );
        log(`🧾 JSON detallado Guardado: ${path.basename(jsonPath)}`);

        const pdfPath = path.join(carpetaContacto, 'certificado_integridad.pdf');
        await generarReportePDFWhatsApp(csvPath, pdfPath);
        log(`📄 PDF Legal Generado: ${path.basename(pdfPath)}`);

        const videos = listRecordingSegments(rutaGrabacion);
        const archivosMultimedia = fs.existsSync(carpetaMultimedia)
          ? fs.readdirSync(carpetaMultimedia)
              .filter(nombre => fs.statSync(path.join(carpetaMultimedia, nombre)).isFile())
              .map(nombre => path.join(carpetaMultimedia, nombre))
          : [];
        const segmentos = [
          ...videos,
          rutaLogFfmpeg,
          csvPath,
          jsonPath,
          pdfPath,
          ...archivosMultimedia
        ].filter(fs.existsSync);
        const hashes = [];
        for (const segmento of segmentos) {
          hashes.push(await hashFileWithSidecar(segmento));
        }
        if (videos.length > 0) log(`🔐 ${videos.length} segmento(s) de video hasheado(s).`);
        fs.writeFileSync(
           path.join(carpetaContacto, 'manifest.json'),
          JSON.stringify(createWhatsAppManifest({
            contacto: nombreContacto,
            conversacion,
            fechaInicio,
            fechaFin: new Date().toISOString(),
            totalMensajes: mensajesExtraidos.size,
            hashes,
            baseDirectory: carpetaContacto
          }), null, 2),
           'utf8'
         );
        const artifactValidation = validateWhatsAppArtifactStructure({
          chatDirectory: carpetaContacto
        });
        fs.writeFileSync(
          path.join(carpetaContacto, 'validation.json'),
          `${JSON.stringify({
            generatedAt: new Date().toISOString(),
            ...artifactValidation
          }, null, 2)}\n`,
          'utf8'
        );
        if (!artifactValidation.ok) {
          logError(`La validación del expediente de "${nombreContacto}" encontró ${artifactValidation.errors.length} incidencia(s).`);
        } else if (artifactValidation.warnings.length > 0) {
          log(`La validación del expediente de "${nombreContacto}" terminó con ${artifactValidation.warnings.length} advertencia(s).`);
        }
        const sessionChat = sessionManifest.chats[sessionManifest.chats.length - 1];
        sessionChat.status = 'completed';
        sessionChat.totalMessages = mensajesExtraidos.size;
        sessionChat.manifest = path.relative(sessionDirectory, path.join(carpetaContacto, 'manifest.json')).split(path.sep).join('/');
        sessionChat.validation = path.relative(sessionDirectory, path.join(carpetaContacto, 'validation.json')).split(path.sep).join('/');
        sessionChat.validationStatus = artifactValidation.ok ? 'ok' : 'issues';
        fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
        if (messageCallback) {
          await Promise.resolve(messageCallback({
            type: 'chat-complete',
            chat: nombreContacto,
            totalMessages: mensajesExtraidos.size,
            index: i + 1,
            totalChats: contactosObjetivo.length
          }));
        }
        activeOperationLogger?.event('chat.completed', {
          chat: nombreContacto,
          index: i + 1,
          totalChats: contactosObjetivo.length,
          totalMessages: mensajesExtraidos.size
        });
        } catch (chatError) {
          const errorMessage = chatError?.message || String(chatError);
          const errorInfo = classifyWhatsAppError(chatError, WHATSAPP_ERROR_CODES.CHAT_EXTRACTION_FAILED);
          const failedChat = sessionManifest.chats.find(chat => chat.index === i + 1);
          if (failedChat) {
            failedChat.status = 'error';
            failedChat.errorCode = errorInfo.code;
            failedChat.error = errorMessage;
          }
          activeOperationLogger?.event('chat.failed', {
            chat: nombreContacto,
            index: i + 1,
            totalChats: contactosObjetivo.length,
            errorCode: errorInfo.code,
            error: errorMessage
          });
          logError(`[${errorInfo.code}] No se pudo completar el chat "${nombreContacto}": ${errorMessage}`);
          try { await stopDesktopRecording(grabacion); } catch (_) { /* limpieza best-effort */ }
          activeRecording = null;
          if (carpetaContacto) {
            try {
              fs.writeFileSync(
                path.join(carpetaContacto, 'error.json'),
                `${JSON.stringify({ chat: nombreContacto, errorCode: errorInfo.code, error: errorMessage, at: new Date().toISOString() }, null, 2)}\n`,
                'utf8'
              );
            } catch (_) { /* best effort */ }
          }
          fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
        }
    }

    log(`\n🎉 PROCESO COMPLETADO. Revisa la carpeta de Auditoría.`);
    sessionManifest.status = 'completed';
    sessionManifest.finishedAt = new Date().toISOString();
    sessionManifest.completedChats = sessionManifest.chats.filter(chat => chat.status === 'completed').length;
    sessionManifest.failedChats = sessionManifest.chats.filter(chat => chat.status === 'error').length;
    sessionManifest.skippedChats = sessionManifest.chats.filter(chat => chat.status === 'skipped').length;
    if (sessionManifest.failedChats > 0 || sessionManifest.skippedChats > 0) {
      sessionManifest.status = 'completed_with_errors';
    }
    fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
    activeOperationLogger?.event('session.completed', {
      completedChats: sessionManifest.completedChats,
      requestedChats: contactosObjetivo.length,
      failedChats: sessionManifest.failedChats,
      skippedChats: sessionManifest.skippedChats,
      status: sessionManifest.status
    });
    const operationLogIntegrity = await hashFileWithSidecar(operationLogPath);
    sessionManifest.operationLogSha256 = operationLogIntegrity.sha256;
    fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
    if (ownsSession) await browserContext.close();
    activeOperationLogger = null;
    return {
      ok: true,
      sessionDirectory,
      status: sessionManifest.status,
      completedChats: sessionManifest.completedChats,
      failedChats: sessionManifest.failedChats,
      skippedChats: sessionManifest.skippedChats
    };

  } catch (error) {
    logError(`❌ Error fatal: ${error.message || error}`);
    activeOperationLogger?.event('session.failed', {
      errorCode: classifyWhatsAppError(error).code,
      error: error.message || String(error),
      completedChats: sessionManifest.chats.filter(chat => chat.status === 'completed').length
    });
    sessionManifest.status = 'error';
    sessionManifest.finishedAt = new Date().toISOString();
    sessionManifest.error = error.message || String(error);
    const activeChat = sessionManifest.chats[sessionManifest.chats.length - 1];
    if (activeChat?.status === 'running') activeChat.status = 'error';
    try {
      fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
    } catch (_) { /* best effort */ }
    try {
      const operationLogIntegrity = await hashFileWithSidecar(operationLogPath);
      sessionManifest.operationLogSha256 = operationLogIntegrity.sha256;
      fs.writeFileSync(sessionManifestPath, `${JSON.stringify(sessionManifest, null, 2)}\n`, 'utf8');
    } catch (_) { /* best effort */ }
    try { await stopDesktopRecording(activeRecording); } catch (_) { /* limpieza best-effort */ }
    if (ownsSession) {
      try { await browserContext.close(); } catch (_) { /* ya estaba cerrado */ }
    }
    activeOperationLogger = null;
    return { ok: false, error: error.message || String(error) };
  }
}

module.exports = {
  createWhatsAppSession,
  isWhatsAppSessionReady,
  runWhatsAppExtraction,
  getWhatsAppContacts,
  normalizeConversationTarget,
  conversationKey,
  mergeConversationCatalog
};
