const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  pairWifi,
  prepareAndroidConnection,
  selectAuthorizedDevice,
  validarIpPort,
  validarCodigoPairing
} = require('../src/platform/android/android_connection');

test('invoca adb pair con el codigo como argumento no interactivo', async () => {
  let captured;
  const spawnProcess = (executable, args, options) => {
    captured = { executable, args, options };
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => child.emit('close', 0));
    return child;
  };

  await pairWifi('adb-fixture.exe', '192.168.1.8:37123', '040481', { spawnProcess });

  assert.equal(captured.executable, 'adb-fixture.exe');
  assert.deepEqual(captured.args, ['pair', '192.168.1.8:37123', '040481']);
  assert.deepEqual(captured.options.stdio, ['ignore', 'pipe', 'pipe']);
});

test('selecciona un unico dispositivo autorizado o respeta el serial solicitado', () => {
  const devices = [
    { serial: 'RZCW81RKYFR', state: 'device', details: 'model:SM_A546E' },
    { serial: 'ABC123', state: 'unauthorized', details: '' }
  ];
  assert.equal(selectAuthorizedDevice(devices).serial, 'RZCW81RKYFR');
  assert.equal(selectAuthorizedDevice(devices, 'RZCW81RKYFR').serial, 'RZCW81RKYFR');
  assert.throws(() => selectAuthorizedDevice(devices, 'ABC123'), /no esta conectado/);
});

test('prepara una conexion USB sin ejecutar una extraccion', async () => {
  const calls = [];
  const adapter = {
    adbPath: 'adb-fixture.exe',
    async listDevices() {
      calls.push('devices');
      return [{ serial: 'RZCW81RKYFR', state: 'device', details: 'model:SM_A546E' }];
    },
    async adb(args) {
      calls.push(args);
      return { code: 0, stdout: '', stderr: '' };
    }
  };

  const result = await prepareAndroidConnection({
    adapter,
    method: 'usb',
    serial: 'RZCW81RKYFR'
  });

  assert.equal(result.ok, true);
  assert.equal(result.serial, 'RZCW81RKYFR');
  assert.deepEqual(calls, ['devices']);
});

test('reutiliza un dispositivo Wi-Fi ya conectado aunque el campo tenga un puerto antiguo', async () => {
  const calls = [];
  const adapter = {
    adbPath: 'adb-fixture.exe',
    async listDevices() {
      calls.push('devices');
      return [{ serial: '192.168.1.6:45783', state: 'device', details: 'model:SM_A546E' }];
    },
    async adb(args) {
      calls.push(args);
      return { code: 0, stdout: 'connected to old-endpoint', stderr: '' };
    }
  };

  const result = await prepareAndroidConnection({
    adapter,
    method: 'wifi-paired',
    serial: '192.168.1.6:45783',
    connectIpPort: '192.168.1.6:45705'
  });

  assert.equal(result.serial, '192.168.1.6:45783');
  assert.deepEqual(calls, ['devices']);
});

test('rechaza datos Wi-Fi incompletos antes de invocar ADB', async () => {
  assert.equal(validarIpPort('192.168.1.8:42123'), '192.168.1.8:42123');
  assert.equal(validarCodigoPairing('040481'), '040481');
  const adapter = {
    adbPath: 'adb-fixture.exe',
    async adb() { throw new Error('no debe ejecutarse'); },
    async listDevices() { throw new Error('no debe ejecutarse'); }
  };
  await assert.rejects(
    () => prepareAndroidConnection({
      adapter,
      method: 'wifi-new',
      pairIpPort: '192.168.1.8:37123',
      pinCode: '123',
      connectIpPort: '192.168.1.8:42123'
    }),
    /exactamente 6 digitos/
  );
});
