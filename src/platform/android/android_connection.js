const { spawn } = require('child_process');

function validarIpPort(value, label = 'La direccion') {
  const endpoint = String(value || '').trim();
  const match = endpoint.match(/^(?:[A-Za-z0-9.-]+|\[[0-9A-Fa-f:]+\]):(\d{1,5})$/);
  const port = match ? Number(match[1]) : NaN;
  if (!match || port < 1 || port > 65535) {
    throw new Error(`${label} debe tener el formato host:puerto y un puerto entre 1 y 65535.`);
  }
  return endpoint;
}

function validarCodigoPairing(value) {
  const code = String(value || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new Error('El codigo de emparejamiento debe contener exactamente 6 digitos.');
  }
  return code;
}

function pairWifi(adbPath, ipPort, pairingCode, options = {}) {
  const endpoint = validarIpPort(ipPort, 'La direccion de emparejamiento');
  const code = validarCodigoPairing(pairingCode);
  return new Promise((resolve, reject) => {
    const spawnProcess = options.spawnProcess || spawn;
    // Pasar el codigo como argumento evita el modo interactivo de adb pair,
    // que en Windows puede terminar en "protocol fault ... No error" aunque
    // el endpoint y el codigo sean correctos.
    const processHandle = spawnProcess(adbPath, ['pair', endpoint, code], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = options.timeoutMs || 30000;
    const timer = setTimeout(() => finish(new Error('El emparejamiento ADB excedio el tiempo limite.')), timeoutMs);

    function cleanup() {
      clearTimeout(timer);
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve({ stdout, stderr });
    }

    processHandle.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    processHandle.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    processHandle.once('error', (error) => finish(new Error(`No se pudo iniciar adb pair: ${error.message}`)));
    processHandle.once('close', (exitCode) => {
      if (exitCode === 0) finish();
      else {
        const detail = stderr || stdout || 'sin detalle adicional';
        const hint = /protocol fault/i.test(detail)
          ? ' Genera un codigo nuevo y usa el puerto de emparejamiento temporal, no el puerto principal de conexion; si persiste, desactiva VPN o aislamiento de clientes Wi-Fi.'
          : '';
        finish(new Error(`Fallo el emparejamiento ADB Wi-Fi: ${detail}${hint}`));
      }
    });
  });
}

function selectAuthorizedDevice(devices, preferredSerial, expectedSerial) {
  const authorized = devices.filter((device) => device.state === 'device');
  const wanted = preferredSerial || expectedSerial;
  if (wanted) {
    const selected = authorized.find((device) => device.serial === wanted);
    if (!selected) throw new Error(`El dispositivo ${wanted} no esta conectado o no esta autorizado.`);
    return selected;
  }
  if (authorized.length === 0) throw new Error('No se detecto ningun dispositivo ADB autorizado.');
  if (authorized.length > 1) throw new Error('Hay varios dispositivos ADB; selecciona uno por serial.');
  return authorized[0];
}

async function prepareAndroidConnection({ adapter, method = 'usb', serial, pairIpPort, pinCode, connectIpPort, logger } = {}) {
  if (!adapter) throw new Error('No se proporciono un adaptador Android.');
  const log = typeof logger === 'function' ? logger : () => {};
  let expectedSerial = serial;

  if (method === 'wifi-new') {
    const pairEndpoint = validarIpPort(pairIpPort, 'La direccion de emparejamiento');
    const connectEndpoint = validarIpPort(connectIpPort, 'La direccion de conexion');
    const code = validarCodigoPairing(pinCode);
    log(`Emparejando ADB Wi-Fi en ${pairEndpoint}...`);
    await pairWifi(adapter.adbPath, pairEndpoint, code);
    log('Emparejamiento completado. Conectando al endpoint principal...');
    expectedSerial = connectEndpoint;
    const connected = await adapter.adb(['connect', connectEndpoint]);
    log(`Respuesta ADB: ${(connected.stdout || connected.stderr || '').trim()}`);
  } else if (method === 'wifi-paired') {
    const currentDevices = await adapter.listDevices();
    const alreadyConnected = serial && serial.includes(':')
      ? currentDevices.find((device) => device.serial === serial && device.state === 'device')
      : null;
    if (alreadyConnected) {
      log(`El dispositivo ${serial} ya esta conectado; no se repite adb connect.`);
      return {
        ok: true,
        method,
        serial: alreadyConnected.serial,
        state: alreadyConnected.state,
        details: alreadyConnected.details,
        devices: currentDevices
      };
    }
    const connectEndpoint = validarIpPort(connectIpPort || serial, 'La direccion de conexion');
    expectedSerial = connectEndpoint;
    const connected = await adapter.adb(['connect', connectEndpoint]);
    log(`Respuesta ADB: ${(connected.stdout || connected.stderr || '').trim()}`);
  } else if (method !== 'usb') {
    throw new Error(`Transporte no reconocido: ${method}.`);
  }

  const devices = await adapter.listDevices();
  const selected = selectAuthorizedDevice(devices, method === 'usb' ? serial : null, expectedSerial);
  log(`Dispositivo autorizado: ${selected.serial}.`);
  return {
    ok: true,
    method,
    serial: selected.serial,
    state: selected.state,
    details: selected.details,
    devices
  };
}

module.exports = {
  pairWifi,
  prepareAndroidConnection,
  selectAuthorizedDevice,
  validarIpPort,
  validarCodigoPairing
};
