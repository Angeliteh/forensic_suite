const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function firstExisting(paths) {
  return paths.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function projectRoot() {
  return path.resolve(__dirname, '..', '..', '..');
}

function resolveAdbPath(explicitPath) {
  if (explicitPath) return explicitPath;
  const sdkRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT];
  if (process.env.LOCALAPPDATA) {
    sdkRoots.push(path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'));
  }

  return firstExisting([
    path.join(process.resourcesPath || '', 'bin', 'adb.exe'),
    path.join(projectRoot(), 'bin', 'adb.exe'),
    ...sdkRoots.filter(Boolean).map((root) => path.join(root, 'platform-tools', 'adb.exe'))
  ]) || 'adb';
}

function resolveScrcpyPath(explicitPath) {
  if (explicitPath) return explicitPath;
  return firstExisting([
    path.join(process.resourcesPath || '', 'bin', 'scrcpy.exe'),
    path.join(projectRoot(), 'bin', 'scrcpy.exe')
  ]) || 'scrcpy';
}

function normalizeSerial(serial) {
  if (!serial) return null;
  const value = String(serial).trim();
  if (!/^[A-Za-z0-9._:-]+$/.test(value)) {
    throw new Error('El identificador del dispositivo contiene caracteres no validos.');
  }
  return value;
}

function withSerial(args, serial) {
  const normalized = normalizeSerial(serial);
  return normalized ? ['-s', normalized, ...args] : args;
}

function normalizeSharedStoragePath(remotePath, operation) {
  const value = String(remotePath || '').replace(/\\/g, '/');
  if (value.split('/').includes('..')) {
    throw new Error(`${operation} no permite segmentos de ruta '..'.`);
  }
  const normalized = path.posix.normalize(value);
  if (!normalized.startsWith('/sdcard/')) {
    throw new Error(`${operation} solo puede usar rutas bajo /sdcard/.`);
  }
  return normalized;
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: options.windowsHide !== false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timeoutMs = options.timeoutMs || 120000;
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) { /* ya termino */ }
      if (!settled) {
        settled = true;
        reject(new Error(`El proceso excedio el tiempo limite de ${timeoutMs} ms.`));
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`No se pudo iniciar ${executable}: ${error.message}`));
      }
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(new Error(`${path.basename(executable)} termino con codigo ${code}: ${stderr || stdout}`));
    });
  });
}

function runBinaryProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: options.windowsHide !== false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const chunks = [];
    let stderr = '';
    let settled = false;
    const timeoutMs = options.timeoutMs || 120000;
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_) { /* ya termino */ }
      if (!settled) {
        settled = true;
        reject(new Error(`La captura excedio el tiempo limite de ${timeoutMs} ms.`));
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.once('error', (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(new Error(`No se pudo iniciar ${executable}: ${error.message}`));
      }
    });
    child.once('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`${path.basename(executable)} termino con codigo ${code}: ${stderr}`));
    });
  });
}

function createAndroidAdapter(options = {}) {
  const adbPath = resolveAdbPath(options.adbPath);
  const scrcpyPath = resolveScrcpyPath(options.scrcpyPath);
  const processRunner = options.processRunner || runProcess;
  const binaryRunner = options.binaryRunner || runBinaryProcess;

  async function adb(args, commandOptions = {}) {
    return processRunner(adbPath, withSerial(args, commandOptions.serial), commandOptions);
  }

  async function listDevices() {
    const result = await adb(['devices', '-l']);
    return result.stdout
      .split(/\r?\n/)
      .slice(1)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('*'))
      .map((line) => {
        const parts = line.split(/\s+/);
        return {
          serial: parts[0],
          state: parts[1] || 'unknown',
          details: parts.slice(2).join(' '),
          transport: parts[0].includes(':') ? 'wifi' : 'usb'
        };
      });
  }

  async function captureScreenshot(outputPath, commandOptions = {}) {
    const bytes = await binaryRunner(
      adbPath,
      withSerial(['exec-out', 'screencap', '-p'], commandOptions.serial),
      commandOptions
    );
    await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.promises.writeFile(outputPath, bytes);
    return { outputPath, bytes: bytes.length };
  }

  async function startScreenrecord(remotePath, commandOptions = {}) {
    const safeRemotePath = normalizeSharedStoragePath(remotePath, 'screenrecord');
    const timeLimit = Math.max(1, Math.min(180, Number(commandOptions.timeLimit || 180)));
    return adb(
      ['shell', 'screenrecord', '--time-limit', String(timeLimit), safeRemotePath],
      { ...commandOptions, timeoutMs: (timeLimit + 30) * 1000 }
    );
  }

  async function pull(remotePath, localPath, commandOptions = {}) {
    const safeRemotePath = normalizeSharedStoragePath(remotePath, 'pull');
    if (!safeRemotePath) {
      throw new Error('La extraccion normalizada solo permite rutas /sdcard/.');
    }
    await fs.promises.mkdir(localPath, { recursive: true });
    return adb(['pull', safeRemotePath, localPath], commandOptions);
  }

  function startMirror(commandOptions = {}) {
    const args = [];
    const serial = normalizeSerial(commandOptions.serial);
    if (serial) args.push('--serial', serial);
    if (commandOptions.recordPath) {
      args.push('--record', commandOptions.recordPath);
    }
    if (commandOptions.noAudio) args.push('--no-audio');
    if (commandOptions.noControl) args.push('--no-control');
    if (commandOptions.stayAwake) args.push('--stay-awake');
    if (commandOptions.maxSize) args.push('--max-size', String(commandOptions.maxSize));

    return spawn(scrcpyPath, args, {
      windowsHide: false,
      stdio: ['pipe', 'ignore', 'pipe']
    });
  }

  return {
    adbPath,
    scrcpyPath,
    adb,
    listDevices,
    captureScreenshot,
    startScreenrecord,
    pull,
    startMirror
  };
}

module.exports = {
  createAndroidAdapter,
  resolveAdbPath,
  resolveScrcpyPath
};
