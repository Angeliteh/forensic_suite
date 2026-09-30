const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createAndroidAdapter } = require('../src/platform/android/android_adapter');

test('interpreta la salida de adb devices sin conectar un teléfono', async () => {
  const adapter = createAndroidAdapter({
    adbPath: 'adb-fixture.exe',
    processRunner: async () => ({
      code: 0,
      stdout: [
        'List of devices attached',
        'emulator-5554 device product:sdk model:Test device:generic',
        'ABC123 unauthorized',
        '192.168.1.6:45783 device product:a54xnsxx model:SM_A546E device:a54x',
        ''
      ].join('\n'),
      stderr: ''
    })
  });

  const devices = await adapter.listDevices();

  assert.deepEqual(devices, [
    {
      serial: 'emulator-5554',
      state: 'device',
      details: 'product:sdk model:Test device:generic',
      transport: 'usb'
    },
    {
      serial: 'ABC123',
      state: 'unauthorized',
      details: '',
      transport: 'usb'
    },
    {
      serial: '192.168.1.6:45783',
      state: 'device',
      details: 'product:a54xnsxx model:SM_A546E device:a54x',
      transport: 'wifi'
    }
  ]);
});

test('construye una captura PNG mediante exec-out sin usar el dispositivo', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'forensic-suite-'));
  const outputPath = path.join(tempDir, 'screen.png');

  try {
    const adapter = createAndroidAdapter({
      adbPath: 'adb-fixture.exe',
      binaryRunner: async (executable, args) => {
        assert.equal(executable, 'adb-fixture.exe');
        assert.deepEqual(args, ['-s', 'ABC123', 'exec-out', 'screencap', '-p']);
        return Buffer.from('fake-png');
      }
    });

    const result = await adapter.captureScreenshot(outputPath, { serial: 'ABC123' });

    assert.equal(result.bytes, 8);
    assert.equal(fs.readFileSync(outputPath, 'utf8'), 'fake-png');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('limita screenrecord al máximo documentado y conserva el serial', async () => {
  let captured;
  const adapter = createAndroidAdapter({
    adbPath: 'adb-fixture.exe',
    processRunner: async (executable, args, options) => {
      captured = { executable, args, options };
      return { code: 0, stdout: '', stderr: '' };
    }
  });

  await adapter.startScreenrecord('/sdcard/Forensic/test.mp4', {
    serial: 'ABC123',
    timeLimit: 999
  });

  assert.equal(captured.executable, 'adb-fixture.exe');
  assert.deepEqual(captured.args, [
    '-s', 'ABC123', 'shell', 'screenrecord', '--time-limit', '180',
    '/sdcard/Forensic/test.mp4'
  ]);
  assert.equal(captured.options.timeoutMs, 210000);
});

test('rechaza rutas de extracción fuera de almacenamiento compartido', async () => {
  const adapter = createAndroidAdapter({ adbPath: 'adb-fixture.exe' });
  await assert.rejects(
    () => adapter.pull('/data/data/example/private.db', 'C:/evidence'),
    /\/sdcard\//
  );
  await assert.rejects(
    () => adapter.pull('/sdcard/../data/private.db', 'C:/evidence'),
    /segmentos de ruta/
  );
});
