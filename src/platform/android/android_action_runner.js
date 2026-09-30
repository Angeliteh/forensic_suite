const path = require('path');
const { hashFileWithSidecar } = require('../../evidence/file_hash');

const MAX_SEQUENCE_LENGTH = 24;
const ACTION_TYPES = new Set(['tap', 'swipe', 'wait', 'back', 'home', 'screenshot']);

function integer(value, field, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} debe ser un entero entre ${min} y ${max}.`);
  }
  return parsed;
}

function safeLabel(value) {
  const label = String(value || `step_${Date.now()}`).trim();
  if (!/^[A-Za-z0-9_-]{1,48}$/.test(label)) {
    throw new Error('El nombre de la captura solo puede usar letras, numeros, guion y guion bajo.');
  }
  return label;
}

function normalizeAction(action) {
  if (!action || typeof action !== 'object') throw new Error('La accion movil debe ser un objeto.');
  const type = String(action.type || '').trim().toLowerCase();
  if (!ACTION_TYPES.has(type)) throw new Error(`Accion movil no permitida: ${type || '(vacia)'}.`);

  if (type === 'tap') {
    return { type, x: integer(action.x, 'x', 0, 10000), y: integer(action.y, 'y', 0, 10000) };
  }
  if (type === 'swipe') {
    return {
      type,
      x1: integer(action.x1, 'x1', 0, 10000),
      y1: integer(action.y1, 'y1', 0, 10000),
      x2: integer(action.x2, 'x2', 0, 10000),
      y2: integer(action.y2, 'y2', 0, 10000),
      duration: integer(action.duration ?? 500, 'duracion', 50, 5000)
    };
  }
  if (type === 'wait') return { type, milliseconds: integer(action.milliseconds ?? 500, 'espera', 50, 10000) };
  if (type === 'screenshot') return { type, label: safeLabel(action.label) };
  return { type };
}

function displayAction(action) {
  if (action.type === 'tap') return `adb shell input tap ${action.x} ${action.y}`;
  if (action.type === 'swipe') return `adb shell input swipe ${action.x1} ${action.y1} ${action.x2} ${action.y2} ${action.duration}`;
  if (action.type === 'wait') return `esperar ${action.milliseconds} ms`;
  if (action.type === 'back') return 'adb shell input keyevent KEYCODE_BACK';
  if (action.type === 'home') return 'adb shell input keyevent KEYCODE_HOME';
  return `adb exec-out screencap -p -> ${action.label}.png`;
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function executeMobileAction(action, config = {}) {
  const normalized = normalizeAction(action);
  const adapter = config.adapter;
  const serial = String(config.serial || '').trim();
  if (!adapter || typeof adapter.adb !== 'function') throw new Error('El adaptador ADB no esta disponible.');
  if (!serial) throw new Error('Selecciona un dispositivo antes de ejecutar una accion movil.');
  if (typeof config.isCancelled === 'function' && config.isCancelled()) {
    throw new Error('La accion movil fue cancelada.');
  }

  const startedAt = new Date().toISOString();
  const started = Date.now();
  if (typeof config.logger === 'function') config.logger(`[ACCION] ${displayAction(normalized)}`);

  if (normalized.type === 'tap') {
    await adapter.adb(['shell', 'input', 'tap', String(normalized.x), String(normalized.y)], { serial, timeoutMs: 15000 });
  } else if (normalized.type === 'swipe') {
    await adapter.adb([
      'shell', 'input', 'swipe',
      String(normalized.x1), String(normalized.y1),
      String(normalized.x2), String(normalized.y2),
      String(normalized.duration)
    ], { serial, timeoutMs: 15000 });
  } else if (normalized.type === 'back') {
    await adapter.adb(['shell', 'input', 'keyevent', 'KEYCODE_BACK'], { serial, timeoutMs: 15000 });
  } else if (normalized.type === 'home') {
    await adapter.adb(['shell', 'input', 'keyevent', 'KEYCODE_HOME'], { serial, timeoutMs: 15000 });
  } else if (normalized.type === 'wait') {
    await sleep(normalized.milliseconds);
  } else if (normalized.type === 'screenshot') {
    const outputDirectory = path.resolve(config.outputDirectory || path.join(process.cwd(), 'Android_Actions'));
    const outputPath = path.join(outputDirectory, `${normalized.label}.png`);
    const capture = await config.adapter.captureScreenshot(outputPath, { serial });
    const integrity = await hashFileWithSidecar(capture.outputPath);
    const result = {
      ok: true,
      action: normalized,
      command: displayAction(normalized),
      startedAt,
      durationMs: Date.now() - started,
      outputPath: capture.outputPath,
      sha256: integrity.sha256
    };
    if (typeof config.logger === 'function') config.logger(`[ACCION] Captura guardada: ${capture.outputPath}`);
    return result;
  }

  return {
    ok: true,
    action: normalized,
    command: displayAction(normalized),
    startedAt,
    durationMs: Date.now() - started
  };
}

async function runMobileActionSequence(actions, config = {}) {
  if (!Array.isArray(actions) || actions.length === 0) throw new Error('La secuencia movil esta vacia.');
  if (actions.length > MAX_SEQUENCE_LENGTH) {
    throw new Error(`La secuencia movil no puede superar ${MAX_SEQUENCE_LENGTH} acciones.`);
  }

  const results = [];
  for (const action of actions) {
    if (typeof config.isCancelled === 'function' && config.isCancelled()) {
      throw new Error('La secuencia movil fue cancelada.');
    }
    results.push(await executeMobileAction(action, config));
  }
  return results;
}

module.exports = {
  ACTION_TYPES,
  MAX_SEQUENCE_LENGTH,
  normalizeAction,
  executeMobileAction,
  runMobileActionSequence
};
