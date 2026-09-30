const fs = require('fs');
const os = require('os');
const path = require('path');
const { runADBExtraction, listEvidenceFiles } = require('../../../3_extraccion_galeria_adb');
const { createAndroidAdapter } = require('./android_adapter');
const { hashFileWithSidecar } = require('../../evidence/file_hash');
const { runMobileActionSequence } = require('./android_action_runner');

const DEFAULT_SESSION_ROOT = path.join(
  os.homedir(),
  'Desktop',
  'Forensic_Extractions',
  'Android_Lab',
  'sessions'
);

function relativeArtifact(sessionDirectory, filePath) {
  return path.relative(sessionDirectory, filePath).replace(/\\/g, '/');
}

async function waitForMirrorStartup(processHandle, timeoutMs = 900) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => finish(), timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      processHandle.removeListener('error', onError);
      processHandle.removeListener('close', onClose);
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    }

    function onError(error) {
      finish(new Error(`scrcpy no pudo iniciarse: ${error.message}`));
    }

    function onClose(code) {
      finish(new Error(`scrcpy termino antes de iniciar (codigo ${code ?? 'desconocido'}).`));
    }

    processHandle.once('error', onError);
    processHandle.once('close', onClose);
  });
}

async function stopProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null) return;

  await new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => finish(), 3500);

    function finish() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      processHandle.removeListener('close', finish);
      resolve();
    }

    processHandle.once('close', finish);
    try {
      processHandle.kill();
    } catch (_) {
      finish();
    }
  });
}

function createObservedSession(config = {}) {
  const adapter = config.adapter || createAndroidAdapter();
  const serial = String(config.serial || '').trim();
  const sessionId = `observed_${Date.now()}`;
  const sessionDirectory = path.resolve(
    config.sessionDirectory || path.join(DEFAULT_SESSION_ROOT, sessionId)
  );
  const sessionLogPath = path.join(sessionDirectory, 'session.log');
  const manifestPath = path.join(sessionDirectory, 'session.json');
  const recordMirror = config.recordMirror !== false;
  const stayAwake = config.stayAwake !== false;
  const backup = config.backup !== false;
  const testMode = Boolean(config.testMode);
  const captureScreenshots = config.captureScreenshots !== false;
  const actions = Array.isArray(config.actions) ? config.actions : [];
  const startedAt = new Date().toISOString();
  const manifest = {
    schema: 'forensic-suite.android-observed-session.v1',
    sessionId,
    startedAt,
    serial,
    transport: serial.includes(':') ? 'adb-wifi' : 'adb-usb-or-local',
    options: { recordMirror, stayAwake, backup, testMode, captureScreenshots, actionCount: actions.length },
    status: 'starting',
    artifacts: [],
    events: []
  };

  let stopped = false;
  let mirrorProcess = null;
  let stopPromise = null;
  let mirrorRecordingPath = null;

  fs.mkdirSync(sessionDirectory, { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  function emitState(status, message, extra = {}) {
    manifest.status = status;
    const event = { at: new Date().toISOString(), status, message };
    manifest.events.push(event);
    if (typeof config.onState === 'function') config.onState({ status, message, ...extra });
  }

  function log(message) {
    const text = String(message);
    manifest.events.push({ at: new Date().toISOString(), type: 'log', message: text });
    fs.appendFileSync(sessionLogPath, `${text}\n`, 'utf8');
    if (typeof config.logger === 'function') config.logger(text);
  }

  async function captureScreen(label) {
    const outputPath = path.join(sessionDirectory, 'screenshots', `${label}.png`);
    try {
      const capture = await adapter.captureScreenshot(outputPath, { serial });
      const integrity = await hashFileWithSidecar(capture.outputPath);
      manifest.artifacts.push({
        type: 'screenshot',
        label,
        path: relativeArtifact(sessionDirectory, capture.outputPath),
        sha256: integrity.sha256
      });
      log(`[EVIDENCIA] Captura ${label} guardada con SHA-256 ${integrity.sha256}.`);
    } catch (error) {
      log(`[AVISO] No se pudo capturar ${label}: ${error.message}`);
    }
  }

  async function startMirror() {
    mirrorRecordingPath = path.join(sessionDirectory, 'mirroring', 'session.mp4');
    fs.mkdirSync(path.dirname(mirrorRecordingPath), { recursive: true });
    mirrorProcess = adapter.startMirror({
      serial,
      recordPath: mirrorRecordingPath,
      noAudio: true,
      stayAwake,
      maxSize: 1280
    });

    if (mirrorProcess.stderr) {
      mirrorProcess.stderr.on('data', (chunk) => {
        const text = String(chunk).trim();
        if (text) log(`[scrcpy] ${text}`);
      });
    }
    if (typeof config.onMirrorState === 'function') config.onMirrorState(true);
    log(`[SESION] Mirroring iniciado para ${serial}.`);
    await waitForMirrorStartup(mirrorProcess);
  }

  async function execute() {
    let result = { ok: false, sessionId, sessionDirectory };

    try {
      if (!serial) throw new Error('Selecciona un dispositivo antes de iniciar la sesion observada.');
      if (!recordMirror && !backup) throw new Error('Activa al menos una salida: grabacion o respaldo ADB.');

      emitState('running', 'Preparando la sesion observada.', { sessionId, sessionDirectory });
      log(`=== INICIANDO SESION OBSERVADA ${sessionId} ===`);
      log(`[SESION] Carpeta: ${sessionDirectory}`);
      log(`[SESION] Dispositivo: ${serial}`);
      log(`[SESION] Modo de prueba: ${testMode ? 'activado' : 'desactivado'}.`);

      if (recordMirror) {
        emitState('mirroring', 'Abriendo mirroring y grabacion visual.');
        await startMirror();
      }

      if (captureScreenshots) await captureScreen('before');

      if (actions.length > 0) {
        emitState('actions', `Ejecutando ${actions.length} accion(es) movil(es).`);
        manifest.actions = await runMobileActionSequence(actions, {
          adapter,
          serial,
          outputDirectory: path.join(sessionDirectory, 'actions'),
          isCancelled: () => stopped,
          logger: log
        });
      }

      if (stopped) throw new Error('La sesion fue cancelada por el usuario.');

      let extractionResult = null;
      if (backup) {
        emitState('extracting', 'Ejecutando respaldo ADB dentro de esta sesion.');
        extractionResult = await runADBExtraction({
          serial,
          testMode,
          outputDir: path.join(sessionDirectory, 'adb'),
          isCancelled: () => stopped
        }, log);
        if (!extractionResult.ok) throw new Error(extractionResult.error || 'El respaldo ADB fallo.');
        manifest.artifacts.push({
          type: 'adb-extraction',
          directory: 'adb',
          copied: extractionResult.copied,
          skipped: extractionResult.skipped
        });
      }

      if (captureScreenshots && !stopped) await captureScreen('after');
      if (stopped) throw new Error('La sesion fue cancelada por el usuario.');

      result = {
        ok: true,
        sessionId,
        sessionDirectory,
        extraction: extractionResult
      };
      emitState('success', 'Sesion observada finalizada correctamente.', result);
      log('=== SESION OBSERVADA FINALIZADA ===');
    } catch (error) {
      const cancelled = stopped || /cancelada/i.test(error.message || '');
      const status = cancelled ? 'cancelled' : 'error';
      const message = cancelled ? 'Sesion cancelada por el usuario.' : error.message;
      result = { ok: false, sessionId, sessionDirectory, error: message, cancelled };
      emitState(status, message, result);
      log(`[${cancelled ? 'CANCELADA' : 'ERROR'}] ${message}`);
    } finally {
      if (mirrorProcess) {
        await (stopPromise || stopProcess(mirrorProcess));
        if (typeof config.onMirrorState === 'function') config.onMirrorState(false);
        log('[SESION] Mirroring detenido.');
      }

      if (mirrorRecordingPath && fs.existsSync(mirrorRecordingPath)) {
        try {
          const integrity = await hashFileWithSidecar(mirrorRecordingPath);
          manifest.artifacts.push({
            type: 'mirror-recording',
            path: relativeArtifact(sessionDirectory, mirrorRecordingPath),
            sha256: integrity.sha256
          });
          log(`[EVIDENCIA] Grabacion guardada con SHA-256 ${integrity.sha256}.`);
        } catch (error) {
          log(`[AVISO] No se pudo calcular el hash de la grabacion: ${error.message}`);
        }
      }

      try {
        const evidenceFiles = await listEvidenceFiles(sessionDirectory);
        manifest.evidenceFileCount = evidenceFiles.filter((filePath) => {
          const name = path.basename(filePath).toLowerCase();
          return name !== 'session.log' && name !== 'session.json';
        }).length;
      } catch (_) {
        manifest.evidenceFileCount = 0;
      }
      manifest.finishedAt = new Date().toISOString();
      fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    }

    return result;
  }

  const controller = {
    sessionId,
    sessionDirectory,
    get promise() {
      return runPromise;
    },
    stop() {
      stopped = true;
      if (mirrorProcess) {
        stopPromise = stopPromise || stopProcess(mirrorProcess);
      }
      return stopPromise || Promise.resolve();
    }
  };

  const runPromise = execute();
  return controller;
}

module.exports = { createObservedSession, DEFAULT_SESSION_ROOT };
