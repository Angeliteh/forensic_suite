const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildMediaInventoryCommand,
  parseMediaFileList,
  buildMediaInventory,
  discoverMediaFolders,
  formatMediaInventory,
  buildBackupTargets
} = require('../src/platform/android/android_media_inventory');

test('construye una consulta multimedia fija y de solo lectura', () => {
  assert.equal(buildMediaInventoryCommand(), 'find -L /sdcard -type f -print 2>/dev/null; exit 0');
});

test('descubre carpetas multimedia sin confundir documentos ni rutas privadas', () => {
  const output = [
    '/sdcard/DCIM/Camera/photo.JPG',
    '/sdcard/Pictures/Screenshots/capture.png',
    '/sdcard/Pictures/Screenshots/second.webp',
    '/sdcard/Download/manual.pdf',
    '/sdcard/Android/data/com.example/cache/image.jpg',
    '/storage/emulated/0/Pictures/other.jpg'
  ].join('\n');

  assert.deepEqual(parseMediaFileList(output), [
    '/sdcard/DCIM/Camera/photo.JPG',
    '/sdcard/Pictures/Screenshots/capture.png',
    '/sdcard/Pictures/Screenshots/second.webp',
    '/sdcard/Pictures/other.jpg'
  ]);

  const inventory = buildMediaInventory(output);
  assert.equal(inventory.totalMediaFiles, 4);
  assert.equal(inventory.totalFolders, 3);
  assert.equal(inventory.folders[0].remotePath, '/sdcard/DCIM/Camera/');
  assert.equal(inventory.folders[0].category, 'usuario');
  assert.equal(inventory.folders.find((folder) => folder.remotePath === '/sdcard/Pictures/Screenshots/')?.fileCount, 2);
  assert.match(formatMediaInventory(inventory), /Pictures\/Screenshots/);
});

test('consulta el dispositivo seleccionado sin copiar archivos', async () => {
  const calls = [];
  const adapter = {
    async adb(args, options) {
      calls.push({ args, options });
      return { stdout: '/sdcard/DCIM/Camera/photo.jpg\n', stderr: '' };
    }
  };

  const inventory = await discoverMediaFolders(adapter, 'SERIAL');
  assert.equal(inventory.totalMediaFiles, 1);
  assert.deepEqual(calls, [{
    args: ['shell', 'find -L /sdcard -type f -print 2>/dev/null; exit 0'],
    options: { serial: 'SERIAL', timeoutMs: 180000 }
  }]);
});

test('normaliza la ruta emulada a la raiz semantica sdcard', () => {
  const inventory = buildMediaInventory('/storage/emulated/0/Pictures/Screenshots/capture.png\n');
  assert.equal(inventory.folders[0].remotePath, '/sdcard/Pictures/Screenshots/');
});

test('incluye papelera por defecto y deja miniaturas como opcion', () => {
  const inventory = buildMediaInventory([
    '/sdcard/DCIM/Camera/photo.jpg',
    '/sdcard/Pictures/.thumbnails/thumb.jpg',
    '/sdcard/Android/.Trash/com.gallery/deleted.jpg'
  ].join('\n'));

  const defaultTargets = buildBackupTargets(inventory);
  assert.deepEqual(defaultTargets.map((target) => target.category), ['usuario', 'papelera']);

  const allTargets = buildBackupTargets(inventory, { includeThumbnails: true });
  assert.equal(allTargets.length, 3);

  const noTrashTargets = buildBackupTargets(inventory, { includeTrash: false });
  assert.deepEqual(noTrashTargets.map((target) => target.category), ['usuario']);
});
