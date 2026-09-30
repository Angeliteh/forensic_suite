const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeAction,
  executeMobileAction,
  runMobileActionSequence
} = require('../src/platform/android/android_action_runner');

test('normaliza tap y swipe con limites explicitos', () => {
  assert.deepEqual(normalizeAction({ type: 'tap', x: 100, y: 200 }), {
    type: 'tap', x: 100, y: 200
  });
  assert.deepEqual(normalizeAction({ type: 'swipe', x1: 10, y1: 20, x2: 30, y2: 40, duration: 600 }), {
    type: 'swipe', x1: 10, y1: 20, x2: 30, y2: 40, duration: 600
  });
  assert.throws(() => normalizeAction({ type: 'shell', command: 'reboot' }), /no permitida/);
  assert.throws(() => normalizeAction({ type: 'swipe', x1: 0, y1: 0, x2: 1, y2: 1, duration: 1 }), /duracion/);
});

test('ejecuta una secuencia movil sin aceptar comandos shell libres', async () => {
  const calls = [];
  const adapter = {
    adb: async (args, options) => calls.push({ args, options })
  };

  const results = await runMobileActionSequence([
    { type: 'tap', x: 100, y: 200 },
    { type: 'swipe', x1: 100, y1: 500, x2: 100, y2: 100, duration: 400 },
    { type: 'back' }
  ], { adapter, serial: 'ABC123' });

  assert.equal(results.length, 3);
  assert.deepEqual(calls, [
    { args: ['shell', 'input', 'tap', '100', '200'], options: { serial: 'ABC123', timeoutMs: 15000 } },
    { args: ['shell', 'input', 'swipe', '100', '500', '100', '100', '400'], options: { serial: 'ABC123', timeoutMs: 15000 } },
    { args: ['shell', 'input', 'keyevent', 'KEYCODE_BACK'], options: { serial: 'ABC123', timeoutMs: 15000 } }
  ]);
});
