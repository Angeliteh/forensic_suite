const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  isGalleryPackage,
  parseBounds,
  centerOfBounds,
  findGalleryTarget,
  findScrollableNode,
  scrollCoordinates,
  runGalleryNavigation
} = require('../src/platform/android/android_gallery_rpa');

test('reconoce la Galeria Samsung y rechaza otra app visible', () => {
  assert.equal(isGalleryPackage('com.sec.android.gallery3d'), true);
  assert.equal(isGalleryPackage('com.samsung.android.gallery3d'), true);
  assert.equal(isGalleryPackage('com.android.settings'), false);
});

test('calcula centros y limites de bounds validos', () => {
  assert.deepEqual(parseBounds('[0,100][1080,900]'), {
    left: 0, top: 100, right: 1080, bottom: 900
  });
  assert.deepEqual(centerOfBounds('[0,100][1080,900]'), { x: 540, y: 500 });
  assert.equal(parseBounds('[10,10][10,20]'), null);
  assert.equal(centerOfBounds('invalid'), null);
});

test('elige el control semantico View all albums antes que coordenadas fijas', () => {
  const target = findGalleryTarget([
    { text: 'View all', bounds: '[20,700][400,850]' },
    { 'content-desc': 'View all albums', bounds: '[40,800][1040,950]' }
  ]);
  assert.equal(target.selector, 'content-desc=View all albums');
  assert.equal(target.node['content-desc'], 'View all albums');
});

test('encuentra un contenedor desplazable y genera un swipe acotado', () => {
  const node = findScrollableNode([
    { scrollable: 'false', bounds: '[0,0][1080,300]' },
    { scrollable: 'true', bounds: '[0,120][1080,2200]' }
  ]);
  assert.deepEqual(scrollCoordinates(node), {
    x1: 540, y1: 1940, x2: 540, y2: 440, duration: 650
  });
});

test('ejecuta el checkpoint completo con un adaptador simulado y deja manifiesto', async () => {
  const sessionDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'forensic-gallery-rpa-'));
  const uiStates = [
    '<hierarchy rotation="0"><node package="com.sec.android.gallery3d" content-desc="View all albums" clickable="true" bounds="[40,800][1040,950]" /></hierarchy>',
    '<hierarchy rotation="0"><node package="com.sec.android.gallery3d" scrollable="true" bounds="[0,120][1080,2200]" /></hierarchy>',
    '<hierarchy rotation="0"><node package="com.sec.android.gallery3d" scrollable="true" bounds="[0,120][1080,2200]" /></hierarchy>'
  ];
  const calls = [];
  const adapter = {
    async adb(args, options) {
      calls.push({ args, options });
      if (args[0] === 'exec-out') return { stdout: uiStates.shift(), stderr: '' };
      return { stdout: '', stderr: '' };
    },
    async captureScreenshot(outputPath, options) {
      calls.push({ args: ['screencap'], options });
      await fs.promises.writeFile(outputPath, Buffer.from('png-test'));
      return { outputPath };
    }
  };

  try {
    const result = await runGalleryNavigation({ adapter, serial: 'SERIAL', sessionDirectory });
    assert.equal(result.ok, true);
    assert.equal(result.steps.filter((step) => step.type === 'tap').length, 1);
    assert.equal(result.steps.filter((step) => step.type === 'swipe').length, 1);
    assert.equal(await fs.promises.stat(result.manifestPath).then(() => true), true);
    assert.equal(calls.filter((call) => call.args[0] === 'exec-out').length, 3);
    assert.deepEqual(calls.find((call) => call.args[2] === 'tap')?.args, [
      'shell', 'input', 'tap', '540', '875'
    ]);
  } finally {
    await fs.promises.rm(sessionDirectory, { recursive: true, force: true });
  }
});
