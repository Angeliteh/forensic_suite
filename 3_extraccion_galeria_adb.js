const fs = require('fs');
const os = require('os');
const path = require('path');
const PDFDocument = require('pdfkit');
const {
  createAndroidAdapter,
  resolveAdbPath
} = require('./src/platform/android/android_adapter');
const {
  pairWifi,
  validarIpPort,
  validarCodigoPairing
} = require('./src/platform/android/android_connection');
const {
  discoverMediaFolders,
  buildBackupTargets
} = require('./src/platform/android/android_media_inventory');
const { hashFile } = require('./src/evidence/file_hash');

const OUTPUT_DIR = path.join(os.homedir(), 'Desktop', 'Forensic_Extractions', 'Extraccion_Fisica_ADB');
const ADB_PATH = resolveAdbPath();
const androidAdapter = createAndroidAdapter({ adbPath: ADB_PATH });

const RUTAS_A_EXTRAER = [
  { nombre: 'Galeria_Camara_DCIM', rutaAndroid: '/sdcard/DCIM/' },
  { nombre: 'Galeria_Pictures', rutaAndroid: '/sdcard/Pictures/' },
  { nombre: 'Descargas_Download', rutaAndroid: '/sdcard/Download/' },
  { nombre: 'WhatsApp_Images', rutaAndroid: '/sdcard/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Images/' },
  { nombre: 'WhatsApp_Videos', rutaAndroid: '/sdcard/Android/media/com.whatsapp/WhatsApp/Media/WhatsApp Video/' }
];

let uiLogger = null;

function log(message) {
  const text = String(message);
  console.log(text);
  if (uiLogger) uiLogger(text);
}

function logError(message) {
  const text = String(message);
  console.error(text);
  if (uiLogger) uiLogger(`[ERROR] ${text}`);
}

function displayArg(value) {
  const text = String(value);
  return /\s/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
}

function displayCommand(args, serial) {
  const prefix = serial ? ['-s', serial] : [];
  return ['adb', ...prefix, ...args].map(displayArg).join(' ');
}

function quoteShellPath(remotePath) {
  return `'${String(remotePath).replace(/'/g, "'\"'\"'")}'`;
}

async function ejecutarADB(args, serial, options = {}) {
  log(`> ${displayCommand(args, serial)}`);
  return androidAdapter.adb(args, { ...options, serial });
}

async function ejecutarShell(command, serial, options = {}) {
  return ejecutarADB(['shell', command], serial, options);
}

async function listarArchivos(rutaAndroid, serial) {
  const result = await ejecutarShell(`ls -1p ${quoteShellPath(rutaAndroid)}`, serial, { timeoutMs: 15000 });
  return result.stdout
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter((item) => item && !item.endsWith('/') && !item.includes('No such file'));
}

async function emparejarADBWifi(ipPort, codigo) {
  return pairWifi(ADB_PATH, ipPort, codigo);
}

async function seleccionarDispositivo(preferredSerial) {
  const devices = (await androidAdapter.listDevices()).filter((device) => device.state === 'device');
  if (preferredSerial) {
    const selected = devices.find((device) => device.serial === preferredSerial);
    if (!selected) throw new Error(`El dispositivo ${preferredSerial} no esta conectado o no esta autorizado.`);
    return selected.serial;
  }
  if (devices.length === 0) throw new Error('No se detecto ningun dispositivo ADB autorizado.');
  if (devices.length > 1) throw new Error('Hay varios dispositivos ADB; selecciona uno por serial antes de extraer.');
  return devices[0].serial;
}

async function listEvidenceFiles(rootDirectory) {
  const files = [];

  async function walk(currentDirectory) {
    const entries = await fs.promises.readdir(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDirectory, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }
      if (!entry.isFile() || /\.(txt|pdf|sha256)$/i.test(entry.name)) continue;
      files.push(fullPath);
    }
  }

  await walk(rootDirectory);
  return files;
}

async function generarReportePDF(directorio, archivoSalida) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  const stream = fs.createWriteStream(archivoSalida);
  doc.pipe(stream);
  const terminado = new Promise((resolve, reject) => {
    stream.once('finish', resolve);
    stream.once('error', reject);
  });

  doc.fontSize(20).font('Helvetica-Bold').text('INFORME DE EXTRACCION E INTEGRIDAD', { align: 'center' });
  doc.moveDown();
  doc.fontSize(12).font('Helvetica').text(
    'Este informe enumera archivos extraidos y sus huellas SHA-256. El hash permite verificar integridad posterior; no sustituye la evaluacion de autenticidad o admisibilidad juridica.',
    { align: 'justify' }
  );
  doc.moveDown();
  doc.font('Helvetica-Bold').text('Fecha y hora: ', { continued: true }).font('Helvetica').text(new Date().toISOString());
  doc.font('Helvetica-Bold').text('Herramienta: ', { continued: true }).font('Helvetica').text('Forensic Data Extractor Suite - modulo ADB');
  doc.moveDown(2);
  doc.fontSize(14).font('Helvetica-Bold').text('ARCHIVOS Y HASHES', { underline: true });
  doc.moveDown();
  doc.fontSize(10);

  const files = await listEvidenceFiles(directorio);
  let count = 0;
  for (const fullPath of files) {
    try {
      const hash = await hashFile(fullPath);
      const relativePath = path.relative(directorio, fullPath);
      doc.font('Helvetica-Bold').text('Archivo: ', { continued: true }).font('Helvetica').text(relativePath);
      doc.font('Helvetica-Bold').text('SHA-256: ', { continued: true }).font('Courier').text(hash);
      doc.moveDown(0.5);
      count += 1;
      if (count % 5 === 0) log(`Validando ${count} archivos de esta ejecucion...`);
    } catch (error) {
      doc.fillColor('red').text(`Error leyendo ${path.relative(directorio, fullPath)}: ${error.message}`).fillColor('black');
    }
  }
  if (count === 0) log('No se encontraron archivos nuevos para incluir en el informe.');
  doc.moveDown(2);
  doc.fontSize(12).font('Helvetica-Oblique').text('Fin del informe de integridad.', { align: 'center' });
  doc.end();
  await terminado;
  log(`Informe de integridad guardado en: ${path.basename(archivoSalida)}`);
}

async function extraerObjetivo(objetivo, serial, testMode, runOutputDir) {
  const carpetaDestino = path.join(
    runOutputDir,
    objetivo.destinationRelativePath || objetivo.nombre
  );
  fs.mkdirSync(carpetaDestino, { recursive: true });
  log(`\nIniciando extraccion de: ${objetivo.nombre}...`);

  if (testMode) {
    log(`[TEST MODE] Maximo 2 archivos de ${objetivo.nombre}.`);
    let archivos;
    try {
      archivos = await listarArchivos(objetivo.rutaAndroid, serial);
    } catch (error) {
      log(`[OMITIDO] La ruta no esta disponible o no pudo listarse: ${objetivo.rutaAndroid}`);
      log(`[DETALLE] ${error.message}`);
      return { copied: 0, skipped: true };
    }

    if (archivos.length === 0) {
      log(`[OMITIDO] No hay archivos en ${objetivo.rutaAndroid}.`);
      return { copied: 0, skipped: false };
    }

    let copied = 0;
    for (const archivo of archivos.slice(0, 2)) {
      const remoteFile = `${objetivo.rutaAndroid}${archivo}`;
      log(`Descargando: ${archivo}`);
      await ejecutarADB(['pull', remoteFile, carpetaDestino], serial, { timeoutMs: 60000 });
      copied += 1;
    }
    return { copied, skipped: false };
  }

  await ejecutarADB(['pull', objetivo.rutaAndroid, carpetaDestino], serial, { timeoutMs: 300000 });
  return { copied: null, skipped: false };
}

async function runADBExtraction(options = {}, loggerCallback) {
  uiLogger = typeof loggerCallback === 'function' ? loggerCallback : null;
  const testMode = Boolean(options.testMode);
  const metodo = options.metodo || 'usb';
  log(`\n=== INICIANDO EXTRACCION ADB ${testMode ? '[TEST MODE]' : ''} ===\n`);

  if (ADB_PATH !== 'adb' && !fs.existsSync(ADB_PATH)) {
    const error = `No se encontro adb en ${ADB_PATH}.`;
    logError(error);
    return { ok: false, error };
  }

  try {
    if (metodo === 'wifi-new') {
      const pairIpPort = validarIpPort(options.pairIpPort, 'La direccion de emparejamiento');
      const connectIpPort = validarIpPort(options.connectIpPort, 'La direccion de conexion');
      const pinCode = validarCodigoPairing(options.pinCode);
      await emparejarADBWifi(pairIpPort, pinCode);
      log('Emparejamiento ADB Wi-Fi completado.');
      const connected = await ejecutarADB(['connect', connectIpPort]);
      log(`Respuesta ADB: ${connected.stdout.trim()}`);
    } else if (metodo === 'wifi-paired') {
      const connectIpPort = validarIpPort(options.connectIpPort, 'La direccion de conexion');
      const connected = await ejecutarADB(['connect', connectIpPort]);
      log(`Respuesta ADB: ${connected.stdout.trim()}`);
    } else {
      log('Esperando dispositivo USB...');
    }

    const serial = await seleccionarDispositivo(options.serial);
    log(`Dispositivo seleccionado: ${serial}`);
    const extractionRoot = options.outputDir
      ? path.resolve(options.outputDir)
      : OUTPUT_DIR;
    fs.mkdirSync(extractionRoot, { recursive: true });
    const runOutputDir = options.outputDir
      ? extractionRoot
      : path.join(extractionRoot, `run_${Date.now()}`);
    fs.mkdirSync(runOutputDir, { recursive: true });
    log(`Carpeta de esta ejecucion: ${runOutputDir}`);

    let objetivos = RUTAS_A_EXTRAER;
    let inventory = null;
    if (!testMode && options.autoDiscover !== false) {
      log('Descubriendo carpetas multimedia accesibles antes del respaldo...');
      inventory = await discoverMediaFolders(androidAdapter, serial);
      fs.writeFileSync(
        path.join(runOutputDir, 'inventario_multimedia.json'),
        `${JSON.stringify(inventory, null, 2)}\n`,
        'utf8'
      );
      objetivos = buildBackupTargets(inventory, {
        includeThumbnails: options.includeThumbnails,
        includeTrash: options.includeTrash
      });
      log(`Inventario: ${inventory.totalMediaFiles} archivos en ${inventory.totalFolders} carpetas.`);
      log(`Rutas seleccionadas para el respaldo: ${objetivos.length}.`);
      log(`Politica: papelera=${options.includeTrash !== false ? 'incluida' : 'excluida'}, miniaturas=${options.includeThumbnails ? 'incluidas' : 'excluidas'}.`);
      fs.mkdirSync(path.join(runOutputDir, 'Media'), { recursive: true });
    }

    let copied = 0;
    let skipped = 0;
    for (const objetivo of objetivos) {
      if (typeof options.isCancelled === 'function' && options.isCancelled()) {
        throw new Error('La ejecucion fue cancelada por el usuario.');
      }
      const result = await extraerObjetivo(objetivo, serial, testMode, runOutputDir);
      if (result.skipped) skipped += 1;
      if (typeof result.copied === 'number') copied += result.copied;
      log(`Seccion terminada: ${objetivo.nombre}.`);
    }

    if (!testMode) {
      copied = (await listEvidenceFiles(path.join(runOutputDir, 'Media'))).length;
    }

    const reportPath = path.join(runOutputDir, `Informe_Integridad_${Date.now()}.pdf`);
    await generarReportePDF(runOutputDir, reportPath);
    log(`\nEXTRACCION ADB FINALIZADA. Archivos copiados: ${copied}. Rutas omitidas: ${skipped}.`);
    return { ok: true, serial, outputDir: runOutputDir, copied, skipped };
  } catch (error) {
    logError(`La extraccion ADB fallo: ${error.message || error}`);
    return { ok: false, error: error.message || String(error) };
  } finally {
    uiLogger = null;
  }
}

module.exports = {
  runADBExtraction,
  listEvidenceFiles,
  validarIpPort,
  validarCodigoPairing
};
