const assert = require('node:assert/strict');
const test = require('node:test');

const {
  validarIpPort,
  validarCodigoPairing
} = require('../3_extraccion_galeria_adb');

test('valida endpoints ADB Wi-Fi y conserva host:puerto', () => {
  assert.equal(validarIpPort('192.168.1.8:42123', 'Conexion'), '192.168.1.8:42123');
  assert.equal(validarIpPort('[fe80::1234]:37123', 'Emparejamiento'), '[fe80::1234]:37123');
  assert.throws(() => validarIpPort('', 'Conexion'), /formato host:puerto/);
  assert.throws(() => validarIpPort('192.168.1.8:70000', 'Conexion'), /entre 1 y 65535/);
});

test('valida el codigo de emparejamiento de seis digitos', () => {
  assert.equal(validarCodigoPairing('123456'), '123456');
  assert.throws(() => validarCodigoPairing('12345'), /exactamente 6 digitos/);
  assert.throws(() => validarCodigoPairing('12345a'), /exactamente 6 digitos/);
});
