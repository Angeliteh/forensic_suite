const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');
const { runADBExtraction } = require('./3_extraccion_galeria_adb');
const {
  createWhatsAppSession,
  isWhatsAppSessionReady,
  runWhatsAppExtraction,
  getWhatsAppContacts
} = require('./fase3_extractor_real');
const { createAndroidAdapter } = require('./src/platform/android/android_adapter');
const {
  listAdbLearningCommands,
  getAdbLearningCommand,
  summarizeUiHierarchy
} = require('./src/platform/android/adb_catalog');
const { hashFileWithSidecar } = require('./src/evidence/file_hash');
const { createObservedSession } = require('./src/platform/android/android_observed_session');
const { executeMobileAction } = require('./src/platform/android/android_action_runner');
const { prepareAndroidConnection } = require('./src/platform/android/android_connection');
const {
  discoverMediaFolders,
  formatMediaInventory
} = require('./src/platform/android/android_media_inventory');
const { runGalleryNavigation } = require('./src/platform/android/android_gallery_rpa');

let androidMirrorProcess = null;
let androidManualSession = null;
let androidObservedSessionController = null;
let whatsappSessionController = null;
const androidAdapter = createAndroidAdapter();
const WHATSAPP_OUTPUT_DIR = path.join(os.homedir(), 'Desktop', 'Forensic_Extractions', 'Auditoria_WhatsApp');

function readLatestWhatsAppSession() {
  if (!fs.existsSync(WHATSAPP_OUTPUT_DIR)) return { sessionDirectory: null, chats: [] };
  const sessionDirectories = fs.readdirSync(WHATSAPP_OUTPUT_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^session_/i.test(entry.name))
    .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  const latest = sessionDirectories[0];
  if (!latest) return { sessionDirectory: null, chats: [] };

  const sessionDirectory = path.join(WHATSAPP_OUTPUT_DIR, latest.name);
  const chats = fs.readdirSync(sessionDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && /^chat_/i.test(entry.name))
    .map(entry => {
      const directory = path.join(sessionDirectory, entry.name);
      const historyPath = path.join(directory, 'historial.json');
      const manifestPath = path.join(directory, 'manifest.json');
      try {
        const messages = JSON.parse(fs.readFileSync(historyPath, 'utf8'));
        const manifest = fs.existsSync(manifestPath)
          ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
          : {};
        const safeMessages = (Array.isArray(messages) ? messages : []).map(message => ({
          ...message,
          adjuntos: Array.isArray(message.adjuntos)
            ? message.adjuntos.map(attachment => {
                const relativePath = String(attachment.archivo || '');
                const absolutePath = path.resolve(directory, relativePath);
                const relativeCheck = path.relative(directory, absolutePath);
                if (!relativePath || relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck) || !fs.existsSync(absolutePath)) {
                  return { ...attachment, url: null };
                }
                return { ...attachment, url: pathToFileURL(absolutePath).href };
              })
            : []
        }));
        return {
          name: String(manifest.contacto || entry.name.replace(/^chat_\d+_/i, '').replace(/_/g, ' ')),
          directory: entry.name,
          totalMessages: safeMessages.length,
          messages: safeMessages,
          manifest: {
            totalMessages: manifest.totalMensajes || 0,
            files: Array.isArray(manifest.archivos) ? manifest.archivos.length : 0
          }
        };
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);

  return { sessionDirectory: latest.name, chats };
}

ipcMain.on('get-runtime-config', (event) => {
  const forceLicense = process.env.FORENSIC_REQUIRE_LICENSE === '1';
  event.returnValue = {
    developmentMode: !app.isPackaged,
    bypassLicense: !app.isPackaged && !forceLicense
  };
});

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 900,
    minHeight: 600,
    title: "Forensic Data Extractor Suite",
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true,
    backgroundColor: '#0b0f19'
  });

  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (whatsappSessionController) {
    try { whatsappSessionController.context.close(); } catch (_) { /* ya estaba cerrado */ }
    whatsappSessionController = null;
  }
  if (androidObservedSessionController) {
    try { androidObservedSessionController.stop(); } catch (_) { /* ya termino */ }
    androidObservedSessionController = null;
  }
  if (androidMirrorProcess) {
    try { androidMirrorProcess.kill(); } catch (_) { /* ya terminó */ }
    androidMirrorProcess = null;
  }
});

ipcMain.on('android-list-devices', async (event) => {
  try {
    const devices = await androidAdapter.listDevices();
    event.reply('android-devices-result', devices);
  } catch (error) {
    event.reply('android-devices-result', { error: `ADB no pudo consultar dispositivos: ${error.message}` });
  }
});

ipcMain.on('android-connect-device', async (event, data = {}) => {
  event.reply('android-connection-result', {
    status: 'running',
    message: 'Validando la conexion ADB...'
  });
  try {
    const result = await prepareAndroidConnection({
      adapter: androidAdapter,
      method: data.method,
      serial: data.serial,
      pairIpPort: data.pairIpPort,
      pinCode: data.pinCode,
      connectIpPort: data.connectIpPort,
      logger: (message) => event.reply('android-connection-log', message)
    });
    event.reply('android-devices-result', result.devices);
    event.reply('android-connection-result', {
      status: 'success',
      message: `Conexion lista: ${result.serial}.`,
      result
    });
  } catch (error) {
    event.reply('android-connection-result', {
      status: 'error',
      message: error.message
    });
  }
});

ipcMain.on('android-learning-catalog', (event) => {
  event.reply('android-learning-catalog-result', listAdbLearningCommands());
});

ipcMain.on('android-learning-command', async (event, data = {}) => {
  const command = getAdbLearningCommand(data.id);
  if (!command) {
    event.reply('android-learning-result', { error: 'Comando educativo no encontrado.' });
    return;
  }
  if (command.requiresDevice && !data.serial) {
    event.reply('android-learning-result', { error: 'Selecciona un dispositivo antes de ejecutar este comando.' });
    return;
  }

  try {
    const result = await androidAdapter.adb(command.args(data.serial), {
      serial: command.requiresDevice ? data.serial : undefined
    });
    let stdout = result.stdout;
    if (command.id === 'ui-hierarchy') {
      const outputDirectory = path.join(
        os.homedir(),
        'Desktop',
        'Forensic_Extractions',
        'Android_Lab',
        'ui_dumps'
      );
      const outputPath = path.join(outputDirectory, `ui_${Date.now()}.xml`);
      await fs.promises.mkdir(outputDirectory, { recursive: true });
      await fs.promises.writeFile(outputPath, result.stdout, 'utf8');
      const integrity = await hashFileWithSidecar(outputPath);
      stdout = `${summarizeUiHierarchy(result.stdout)}\n\nXML completo guardado en: ${outputPath}\nSHA-256: ${integrity.sha256}`;
    }
    event.reply('android-learning-result', {
      id: command.id,
      command: command.label,
      description: command.description,
      stdout,
      stderr: result.stderr,
    });
  } catch (error) {
    event.reply('android-learning-result', {
      id: command.id,
      command: command.label,
      description: command.description,
      stdout: '',
      stderr: error.message,
    });
  }
});

ipcMain.on('android-evidence-operation', async (event, data = {}) => {
  const allowedOperations = new Set(['screenshot', 'screenrecord', 'backup-plan']);
  if (!allowedOperations.has(data.operation)) {
    event.reply('android-evidence-result', { error: 'Operación de evidencia no reconocida.' });
    return;
  }

  const serial = data.serial;
  if (!serial && data.operation !== 'backup-plan') {
    event.reply('android-evidence-result', { error: 'Selecciona un dispositivo real antes de ejecutar la operación.' });
    return;
  }

  if (data.operation === 'backup-plan') {
    event.reply('android-evidence-result', {
      ok: true,
      operation: data.operation,
      title: 'Plan de respaldo automatico preparado',
      message: 'No se copiaron archivos. Se descubrira el inventario y se preparara el plan antes de copiar.',
      commands: [
        'adb -s SERIAL shell "find -L /sdcard -type f -print 2>/dev/null; exit 0"',
        'adb -s SERIAL pull /sdcard/<carpeta-multimedia-descubierta> <expediente>/Media/'
      ]
    });
    return;
  }

  try {
    const caseRoot = path.join(os.homedir(), 'Desktop', 'Forensic_Extractions', 'Android_Lab');
    if (data.operation === 'screenshot') {
      const outputDir = path.join(caseRoot, 'screenshots');
      const outputPath = path.join(outputDir, `screen_${Date.now()}.png`);
      const result = await androidAdapter.captureScreenshot(outputPath, { serial });
      const integrity = await hashFileWithSidecar(result.outputPath);
      event.reply('android-evidence-result', {
        ok: true,
        operation: data.operation,
        title: 'Captura PNG completada',
        message: `Archivo guardado en ${result.outputPath}\nSHA-256: ${integrity.sha256}`,
        commands: [`adb -s ${serial} exec-out screencap -p`]
      });
      return;
    }

    const remotePath = `/sdcard/Forensic_Lab/screen_${Date.now()}.mp4`;
    const outputDir = path.join(caseRoot, 'recordings');
    await androidAdapter.adb(['shell', "mkdir -p '/sdcard/Forensic_Lab'"], { serial, timeoutMs: 15000 });
    await androidAdapter.startScreenrecord(remotePath, { serial, timeLimit: 10 });
    await androidAdapter.pull(remotePath, outputDir, { serial });
    const localRecordingPath = path.join(outputDir, path.basename(remotePath));
    const integrity = await hashFileWithSidecar(localRecordingPath);
    event.reply('android-evidence-result', {
      ok: true,
      operation: data.operation,
      title: 'Grabación de 10 segundos completada',
      message: `Archivo descargado en ${localRecordingPath}\nSHA-256: ${integrity.sha256}`,
      commands: [`adb -s ${serial} shell screenrecord --time-limit 10 ${remotePath}`, `adb -s ${serial} pull ${remotePath} ${outputDir}`]
    });
  } catch (error) {
    event.reply('android-evidence-result', {
      error: error.message,
      operation: data.operation
    });
  }
});

ipcMain.on('android-discover-media', async (event, data = {}) => {
  if (!data.serial) {
    event.reply('android-media-inventory-result', {
      status: 'error',
      message: 'Selecciona un dispositivo antes de descubrir carpetas multimedia.'
    });
    return;
  }

  event.reply('android-media-inventory-result', {
    status: 'running',
    message: 'Consultando rutas multimedia; no se copiaran archivos.'
  });

  try {
    const inventory = await discoverMediaFolders(androidAdapter, data.serial);
    event.reply('android-media-inventory-result', {
      status: 'success',
      message: `Inventario completado: ${inventory.totalFolders} carpeta(s) y ${inventory.totalMediaFiles} archivo(s) multimedia.`,
      inventory,
      output: formatMediaInventory(inventory)
    });
  } catch (error) {
    event.reply('android-media-inventory-result', {
      status: 'error',
      message: error.message
    });
  }
});

ipcMain.on('android-gallery-rpa', async (event, data = {}) => {
  if (!data.serial) {
    event.reply('android-gallery-rpa-result', {
      status: 'error',
      message: 'Selecciona un dispositivo antes de iniciar el RPA de Galeria.'
    });
    return;
  }
  if (androidObservedSessionController) {
    event.reply('android-gallery-rpa-result', {
      status: 'error',
      message: 'Deten la sesion observada antes de ejecutar este checkpoint RPA.'
    });
    return;
  }

  event.reply('android-gallery-rpa-result', {
    status: 'running',
    message: 'Iniciando navegacion semantica acotada de Galeria.'
  });
  try {
    const result = await runGalleryNavigation({
      adapter: androidAdapter,
      serial: data.serial,
      logger: (message) => event.reply('android-gallery-rpa-log', message)
    });
    event.reply('android-gallery-rpa-result', {
      status: 'success',
      message: 'Checkpoint RPA completado: albumes, un scroll y capturas guardadas.',
      result
    });
  } catch (error) {
    event.reply('android-gallery-rpa-result', {
      status: 'error',
      message: error.message
    });
  }
});

ipcMain.on('android-mobile-action', async (event, data = {}) => {
  if (!data.serial) {
    event.reply('android-mobile-action-result', { error: 'Selecciona un dispositivo antes de ejecutar una accion movil.' });
    return;
  }
  if (!androidMirrorProcess && !androidObservedSessionController) {
    event.reply('android-mobile-action-result', { error: 'Abre primero el mirroring para observar la accion.' });
    return;
  }

  const manualSession = androidManualSession;
  const actionRoot = androidObservedSessionController
    ? path.join(androidObservedSessionController.sessionDirectory, 'actions')
    : manualSession
      ? path.join(manualSession.sessionDirectory, 'actions')
      : path.join(os.homedir(), 'Desktop', 'Forensic_Extractions', 'Android_Lab', 'actions');
  try {
    const result = await executeMobileAction(data.action, {
      adapter: androidAdapter,
      serial: data.serial,
      outputDirectory: actionRoot,
      logger: (message) => {
        event.reply('android-mobile-action-log', message);
        if (manualSession) {
          fs.appendFileSync(manualSession.logPath, `${message}\n`, 'utf8');
          manualSession.events.push({ at: new Date().toISOString(), type: 'action', message });
        }
      }
    });
    if (manualSession) {
      manualSession.events.push({
        at: new Date().toISOString(),
        type: 'action-result',
        action: result.action,
        command: result.command,
        outputPath: result.outputPath || null,
        sha256: result.sha256 || null
      });
      fs.appendFileSync(manualSession.logPath, `[ACCION] Completada: ${result.command}\n`, 'utf8');
    }
    event.reply('android-mobile-action-result', result);
  } catch (error) {
    event.reply('android-mobile-action-result', { error: error.message });
  }
});

ipcMain.on('android-start-observed-session', async (event, data = {}) => {
  if (androidObservedSessionController) {
    event.reply('android-observed-session-state', {
      status: 'error',
      message: 'Ya existe una sesion observada en curso.'
    });
    return;
  }
  if (androidMirrorProcess) {
    event.reply('android-observed-session-state', {
      status: 'error',
      message: 'Deten el mirroring independiente antes de iniciar una sesion observada.'
    });
    return;
  }
  if (!data.serial) {
    event.reply('android-observed-session-state', {
      status: 'error',
      message: 'Selecciona un dispositivo antes de iniciar la sesion observada.'
    });
    return;
  }

  const controller = createObservedSession({
    adapter: androidAdapter,
    serial: data.serial,
    testMode: Boolean(data.testMode),
    recordMirror: data.recordMirror !== false,
    stayAwake: data.stayAwake !== false,
    backup: data.backup !== false,
    captureScreenshots: data.captureScreenshots !== false,
    actions: Array.isArray(data.actions) ? data.actions : [],
    logger: (message) => {
      event.reply('android-observed-session-log', message);
      event.reply('android-terminal-log', message);
    },
    onState: (state) => event.reply('android-observed-session-state', state),
    onMirrorState: (running) => event.reply('android-mirror-state', { running, observed: true })
  });
  androidObservedSessionController = controller;

  try {
    await controller.promise;
  } finally {
    if (androidObservedSessionController === controller) androidObservedSessionController = null;
  }
});

ipcMain.on('android-stop-observed-session', (event) => {
  if (!androidObservedSessionController) {
    event.reply('android-observed-session-log', '[Sistema] No hay una sesion observada activa.');
    return;
  }
  androidObservedSessionController.stop();
  event.reply('android-observed-session-log', '[Sistema] Cancelacion solicitada. Se cerrara scrcpy y se conservara lo ya generado.');
});

ipcMain.on('android-start-mirror', (event, data = {}) => {
  try {
    if (androidMirrorProcess) throw new Error('Ya existe una sesion de mirroring activa.');
    if (androidObservedSessionController) throw new Error('Ya existe una sesion observada activa.');
    if (!data.serial) throw new Error('Selecciona un dispositivo antes de iniciar el mirroring.');

    const sessionId = `manual_${Date.now()}`;
    const sessionDirectory = path.join(
      os.homedir(),
      'Desktop',
      'Forensic_Extractions',
      'Android_Lab',
      'manual_sessions',
      sessionId
    );
    fs.mkdirSync(sessionDirectory, { recursive: true });
    const manualSession = {
      sessionId,
      sessionDirectory,
      logPath: path.join(sessionDirectory, 'session.log'),
      manifestPath: path.join(sessionDirectory, 'session.json'),
      recordingPath: data.recordMirror === true ? path.join(sessionDirectory, 'mirroring', 'session.mp4') : null,
      events: []
    };
    if (manualSession.recordingPath) fs.mkdirSync(path.dirname(manualSession.recordingPath), { recursive: true });
    androidManualSession = manualSession;
    fs.writeFileSync(manualSession.manifestPath, `${JSON.stringify({
      schema: 'forensic-suite.android-manual-session.v1',
      sessionId,
      serial: data.serial,
      recordMirror: Boolean(manualSession.recordingPath),
      startedAt: new Date().toISOString(),
      status: 'running',
      events: []
    }, null, 2)}\n`, 'utf8');
    fs.writeFileSync(manualSession.logPath, `[SESION] Mirroring iniciado para ${data.serial}.\n`, 'utf8');

    androidMirrorProcess = androidAdapter.startMirror({
      serial: data.serial,
      recordPath: manualSession.recordingPath || undefined,
      noAudio: true,
      stayAwake: data.stayAwake !== false,
      maxSize: 1280
    });
    androidMirrorProcess.once('error', (error) => {
      event.reply('android-terminal-log', `[Error] scrcpy: ${error.message}`);
      event.reply('android-mirror-state', { running: false });
      androidMirrorProcess = null;
    });
    androidMirrorProcess.once('close', (code) => {
      event.reply('android-terminal-log', `[Sistema] scrcpy finalizo con codigo ${code ?? 'desconocido'}.`);
      manualSession.events.push({ at: new Date().toISOString(), type: 'mirror-close', code });
      fs.appendFileSync(manualSession.logPath, `[SESION] scrcpy finalizo con codigo ${code ?? 'desconocido'}.\n`, 'utf8');
      if (manualSession.recordingPath && fs.existsSync(manualSession.recordingPath)) {
        hashFileWithSidecar(manualSession.recordingPath).then((integrity) => {
          manualSession.recordingSha256 = integrity.sha256;
          manualSession.events.push({ at: new Date().toISOString(), type: 'recording-hash', sha256: integrity.sha256 });
          fs.writeFileSync(manualSession.manifestPath, `${JSON.stringify({
            schema: 'forensic-suite.android-manual-session.v1',
            sessionId: manualSession.sessionId,
            serial: data.serial,
            recordMirror: true,
            status: 'finished',
            recordingPath: path.relative(manualSession.sessionDirectory, manualSession.recordingPath).replace(/\\/g, '/'),
            recordingSha256: integrity.sha256,
            events: manualSession.events
          }, null, 2)}\n`, 'utf8');
          event.reply('android-terminal-log', `[Evidencia] Grabacion manual guardada con SHA-256 ${integrity.sha256}.`);
        }).catch((error) => event.reply('android-terminal-log', `[Error] No se pudo calcular el hash de la grabacion manual: ${error.message}`));
      } else {
        fs.writeFileSync(manualSession.manifestPath, `${JSON.stringify({
          schema: 'forensic-suite.android-manual-session.v1',
          sessionId: manualSession.sessionId,
          serial: data.serial,
          recordMirror: false,
          status: 'finished',
          events: manualSession.events
        }, null, 2)}\n`, 'utf8');
      }
      event.reply('android-mirror-state', { running: false });
      androidMirrorProcess = null;
      androidManualSession = null;
    });
    event.reply('android-terminal-log', `[Sistema] Mirroring iniciado para ${data.serial}. Carpeta: ${sessionDirectory}`);
    event.reply('android-mirror-state', { running: true });
  } catch (error) {
    event.reply('android-terminal-log', `[Error] ${error.message}`);
    event.reply('android-mirror-state', { running: false });
  }
});

ipcMain.on('android-stop-mirror', (event) => {
  if (!androidMirrorProcess) {
    event.reply('android-terminal-log', '[Sistema] No hay un mirroring real activo.');
    event.reply('android-mirror-state', { running: false });
    return;
  }
  try { androidMirrorProcess.kill(); } catch (_) { /* ya terminó */ }
  androidMirrorProcess = null;
  event.reply('android-terminal-log', '[Sistema] Solicitud de detencion enviada a scrcpy.');
  event.reply('android-mirror-state', { running: false });
});

ipcMain.on('start-adb', async (event, data = {}) => {
    event.reply('adb-extraction-state', { status: 'running', message: 'Iniciando respaldo ADB...' });
    event.reply('terminal-log', '[Sistema] Iniciando modulo ADB...');
    
    // Callback para mandar los logs a la interfaz
    const uiLogger = (msg) => {
        event.reply('terminal-log', msg);
    };

    // Mapear los datos de la UI al formato que espera el backend
    const options = {
        testMode: data.testMode,
        includeThumbnails: Boolean(data.includeThumbnails),
        includeTrash: data.includeTrash !== false,
        autoDiscover: true,
        metodo: data.method,
        connectIpPort: data.connectIpPort || data.ipPort,
        pairIpPort: data.pairIpPort,
        pinCode: data.pinCode,
        serial: String(data.method || '').includes('wifi')
            ? (data.connectIpPort || data.ipPort)
            : data.serial
    };

    // Si es emparejamiento nuevo, asumiremos que en la UI pusimos la IP en adb-ip también
    // Nota: en una UI completa, separaríamos estos inputs, pero por ahora lo adaptamos:
    try {
        const result = await runADBExtraction(options, uiLogger);
        if (!result || result.ok !== true) throw new Error(result?.error || 'El modulo ADB no confirmo una ejecucion exitosa.');
        event.reply('terminal-log', '[Sistema] Operacion finalizada correctamente.');
        event.reply('adb-extraction-state', {
            status: 'success',
            message: `Respaldo terminado. Archivos copiados: ${result.copied ?? 'completo'}. Rutas omitidas: ${result.skipped ?? 0}.`,
            result
        });
    } catch (e) {
        event.reply('terminal-log', `[Error] ${e.message}`);
        event.reply('adb-extraction-state', { status: 'error', message: e.message });
    }
});

ipcMain.on('whatsapp-open-session', async (event) => {
    if (whatsappSessionController) {
        const ready = await isWhatsAppSessionReady(whatsappSessionController, 1200);
        event.reply('wa-session-state', {
            status: ready ? 'ready' : 'open',
            message: ready
                ? 'Sesion de WhatsApp Web ya confirmada.'
                : 'WhatsApp Web esta abierto. Escanea el QR y despues pulsa Comprobar sesion.',
            userDataDir: whatsappSessionController.userDataDir
        });
        return;
    }

    event.reply('wa-session-state', {
        status: 'opening',
        message: 'Abriendo WhatsApp Web con un perfil persistente local...'
    });
    try {
        whatsappSessionController = await createWhatsAppSession();
        const ready = await isWhatsAppSessionReady(whatsappSessionController, 1500);
        event.reply('wa-session-state', {
            status: ready ? 'ready' : 'open',
            message: ready
                ? 'Sesion de WhatsApp Web confirmada y lista para leer chats.'
                : 'Navegador abierto. Escanea el QR si aparece y pulsa Comprobar sesion.',
            userDataDir: whatsappSessionController.userDataDir
        });
    } catch (error) {
        whatsappSessionController = null;
        event.reply('wa-session-state', {
            status: 'error',
            message: `No se pudo abrir WhatsApp Web: ${error.message}`
        });
    }
});

ipcMain.on('whatsapp-check-session', async (event) => {
    if (!whatsappSessionController) {
        event.reply('wa-session-state', {
            status: 'error',
            message: 'Abre primero el navegador de WhatsApp Web.'
        });
        return;
    }
    const ready = await isWhatsAppSessionReady(whatsappSessionController, 3000);
    event.reply('wa-session-state', {
        status: ready ? 'ready' : 'open',
        message: ready
            ? 'Sesion confirmada: la lista de chats esta disponible.'
            : 'La sesion aun no esta confirmada. Completa el QR o espera la sincronizacion.',
        userDataDir: whatsappSessionController.userDataDir
    });
});

ipcMain.on('whatsapp-close-session', async (event) => {
    if (whatsappSessionController) {
        try { await whatsappSessionController.context.close(); } catch (_) { /* ya estaba cerrado */ }
        whatsappSessionController = null;
    }
    event.reply('wa-session-state', {
        status: 'closed',
        message: 'Navegador y sesion de trabajo cerrados. El perfil persistente no fue eliminado.'
    });
});

ipcMain.on('start-whatsapp', async (event, data) => {
    event.reply('wa-terminal-log', '[Sistema] Preparando Módulo Lógico...');
    
    const uiLogger = (msg) => {
        event.reply('wa-terminal-log', msg);
    };

    const ready = await isWhatsAppSessionReady(whatsappSessionController, 1500);
    if (!ready) {
        event.reply('wa-terminal-log', '[Error] Confirma primero la sesion de WhatsApp Web desde el panel.');
        return;
    }

    const options = {
        testMode: data.testMode,
        contactos: Array.isArray(data.contactos) ? data.contactos : [],
        contentOptions: data.contentOptions || {},
        recordVisual: data.recordVisual !== false,
        session: whatsappSessionController,
        onMessageBatch: (batch) => event.reply('wa-live-message-batch', batch)
    };

    try {
        const result = await runWhatsAppExtraction(options, uiLogger);
        if (!result || result.ok !== true) throw new Error(result?.error || 'El módulo WhatsApp no confirmó una ejecución exitosa.');
        if (result.status === 'completed_with_errors') {
            event.reply('wa-terminal-log', `[Advertencia] Auditoria finalizada con incidencias. Chats completados: ${result.completedChats ?? 0}; con error: ${result.failedChats ?? 0}; omitidos: ${result.skippedChats ?? 0}.`);
        } else {
            event.reply('wa-terminal-log', '[Sistema] Auditoria de WhatsApp finalizada correctamente.');
        }
    } catch (e) {
        event.reply('wa-terminal-log', `[Error] ${e.message}`);
    }
});

ipcMain.on('get-wa-contacts', async (event) => {
    event.reply('wa-terminal-log', '[Sistema] Leyendo lista de contactos desde la sesion confirmada...');
    const uiLogger = (msg) => {
        event.reply('wa-terminal-log', msg);
    };
    try {
        const ready = await isWhatsAppSessionReady(whatsappSessionController, 1500);
        if (!ready) throw new Error('Confirma primero la sesion de WhatsApp Web desde el panel.');
        const contacts = await getWhatsAppContacts({
            session: whatsappSessionController,
            onConversationBatch: (batch) => event.reply('wa-live-conversation-batch', batch)
        }, uiLogger);
        event.reply('wa-contacts-result', contacts);
    } catch (e) {
        event.reply('wa-terminal-log', `[Error] No se pudieron cargar los contactos: ${e.message}`);
        event.reply('wa-contacts-result', { error: e.message });
    }
});

ipcMain.on('whatsapp-load-latest-results', (event) => {
    try {
        event.reply('whatsapp-latest-results', { ok: true, ...readLatestWhatsAppSession() });
    } catch (error) {
        event.reply('whatsapp-latest-results', { ok: false, error: error.message });
    }
});
