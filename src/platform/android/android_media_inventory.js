const path = require('path');

const SHARED_STORAGE_ROOT = '/sdcard/';
const EMULATED_STORAGE_ROOT = '/storage/emulated/0/';
const MEDIA_EXTENSIONS = new Set([
  '3gp', 'avi', 'bmp', 'cr2', 'dng', 'gif', 'heic', 'heif', 'jpeg',
  'jpg', 'm4v', 'mkv', 'mov', 'mp4', 'png', 'raw', 'webm', 'webp'
]);

function buildMediaInventoryCommand() {
  // Se mantiene como comando fijo y de solo lectura. El filtrado se hace en
  // Node para no depender de las variantes de find disponibles en Android.
  return 'find -L /sdcard -type f -print 2>/dev/null; exit 0';
}

function normalizeRemotePath(value) {
  const candidate = String(value || '').trim().replace(/\\/g, '/');
  if (candidate.startsWith(SHARED_STORAGE_ROOT)) return candidate;
  if (candidate.startsWith(EMULATED_STORAGE_ROOT)) {
    return `${SHARED_STORAGE_ROOT}${candidate.slice(EMULATED_STORAGE_ROOT.length)}`;
  }
  return null;
}

function isMediaFile(remotePath) {
  const normalized = normalizeRemotePath(remotePath);
  if (!normalized) return false;
  const lowerPath = normalized.toLowerCase();
  if (lowerPath.startsWith('/sdcard/android/data/') || lowerPath.startsWith('/sdcard/android/obb/')) {
    return false;
  }
  const extension = path.posix.extname(lowerPath).replace('.', '');
  return MEDIA_EXTENSIONS.has(extension);
}

function parentDirectory(remotePath) {
  const directory = path.posix.dirname(remotePath);
  return directory.endsWith('/') ? directory : `${directory}/`;
}

function classifyFolder(remotePath) {
  const lowerPath = remotePath.toLowerCase();
  if (lowerPath.includes('/.trash/') || lowerPath.includes('/android/.trash/')) return 'papelera';
  if (lowerPath.includes('/.thumbnails/')) return 'miniaturas';
  if (lowerPath.includes('/android/media/')) return 'app-media';
  if (lowerPath.split('/').some((segment) => segment.startsWith('.') && segment !== '.')) return 'oculta';
  return 'usuario';
}

function displayFolderName(remotePath) {
  const withoutTrailingSlash = remotePath.replace(/\/$/, '');
  return path.posix.basename(withoutTrailingSlash) || '/sdcard';
}

function parseMediaFileList(stdout) {
  return String(stdout || '')
    .split(/\r?\n/)
    .map(normalizeRemotePath)
    .filter((remotePath) => remotePath && isMediaFile(remotePath));
}

function buildMediaInventory(stdout) {
  const files = parseMediaFileList(stdout);
  const folders = new Map();
  const extensionTotals = {};

  for (const remotePath of files) {
    const folderPath = parentDirectory(remotePath);
    const extension = path.posix.extname(remotePath).replace('.', '').toLowerCase();
    extensionTotals[extension] = (extensionTotals[extension] || 0) + 1;
    const current = folders.get(folderPath) || {
      remotePath: folderPath,
      name: displayFolderName(folderPath),
      category: classifyFolder(folderPath),
      fileCount: 0,
      extensions: {},
      sampleFiles: []
    };
    current.fileCount += 1;
    current.extensions[extension] = (current.extensions[extension] || 0) + 1;
    if (current.sampleFiles.length < 3) current.sampleFiles.push(remotePath);
    folders.set(folderPath, current);
  }

  const categoryOrder = { usuario: 0, 'app-media': 1, oculta: 2, miniaturas: 3, papelera: 4 };
  const folderList = [...folders.values()].sort((left, right) => (
    (categoryOrder[left.category] ?? 99) - (categoryOrder[right.category] ?? 99)
      || left.remotePath.localeCompare(right.remotePath)
  ));
  const categoryTotals = folderList.reduce((totals, folder) => {
    totals[folder.category] = (totals[folder.category] || 0) + folder.fileCount;
    return totals;
  }, {});
  return {
    root: SHARED_STORAGE_ROOT,
    command: buildMediaInventoryCommand(),
    totalMediaFiles: files.length,
    totalFolders: folderList.length,
    categoryTotals,
    extensionTotals,
    folders: folderList
  };
}

async function discoverMediaFolders(adapter, serial) {
  if (!adapter || typeof adapter.adb !== 'function') {
    throw new Error('El adaptador ADB no esta disponible.');
  }
  if (!serial) throw new Error('Selecciona un dispositivo antes de descubrir carpetas multimedia.');
  const roots = [SHARED_STORAGE_ROOT, EMULATED_STORAGE_ROOT];
  let lastInventory = buildMediaInventory('');
  for (const root of roots) {
    const command = root === SHARED_STORAGE_ROOT
      ? buildMediaInventoryCommand()
      : `find -L ${root} -type f -print 2>/dev/null; exit 0`;
    const result = await adapter.adb(['shell', command], {
      serial,
      timeoutMs: 180000
    });
    lastInventory = buildMediaInventory(result.stdout);
    if (lastInventory.totalMediaFiles > 0) {
      return { ...lastInventory, command };
    }
  }
  return lastInventory;
}

function formatMediaInventory(inventory, maxFolders = 300) {
  const lines = [
    'INVENTARIO MULTIMEDIA (SOLO LECTURA)',
    `Raiz consultada: ${inventory.root}`,
    `Archivos multimedia encontrados: ${inventory.totalMediaFiles}`,
    `Carpetas con multimedia: ${inventory.totalFolders}`,
    `Categorias: ${Object.entries(inventory.categoryTotals || {}).map(([category, count]) => `${category}=${count}`).join(', ') || '(ninguna)'}`,
    `Extensiones: ${Object.entries(inventory.extensionTotals).map(([extension, count]) => `${extension}=${count}`).join(', ') || '(ninguna)'}`,
    ''
  ];

  inventory.folders.slice(0, maxFolders).forEach((folder, index) => {
    const types = Object.entries(folder.extensions).map(([extension, count]) => `${extension}=${count}`).join(', ');
    lines.push(`[${String(index + 1).padStart(3, '0')}] ${folder.remotePath} | categoria=${folder.category} | archivos=${folder.fileCount} | ${types}`);
    folder.sampleFiles.forEach((sample) => lines.push(`      muestra: ${sample}`));
  });

  if (inventory.totalFolders > maxFolders) {
    lines.push(`... ${inventory.totalFolders - maxFolders} carpetas omitidas de la vista.`);
  }
  return lines.join('\n');
}

function buildBackupTargets(inventory, options = {}) {
  const includeThumbnails = Boolean(options.includeThumbnails);
  const includeTrash = options.includeTrash !== false;
  const excludedCategories = new Set();
  if (!includeThumbnails) excludedCategories.add('miniaturas');
  if (!includeTrash) excludedCategories.add('papelera');
  return (inventory?.folders || [])
    .filter((folder) => !excludedCategories.has(folder.category))
    .map((folder) => {
      const relative = path.posix.relative(SHARED_STORAGE_ROOT, folder.remotePath.replace(/\/$/, ''));
      const safeRelative = relative && !relative.startsWith('..') ? relative : '_root';
      return {
        nombre: safeRelative,
        rutaAndroid: folder.remotePath,
        category: folder.category,
        destinationRelativePath: path.join('Media', ...safeRelative.split('/')),
        fileCount: folder.fileCount
      };
    });
}

module.exports = {
  MEDIA_EXTENSIONS,
  buildMediaInventoryCommand,
  parseMediaFileList,
  buildMediaInventory,
  discoverMediaFolders,
  formatMediaInventory,
  buildBackupTargets
};
