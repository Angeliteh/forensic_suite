const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseUiHierarchyNodes } = require('./adb_catalog');
const { hashFileWithSidecar } = require('../../evidence/file_hash');

const GALLERY_PACKAGE_PATTERN = /^com\.(?:sec|samsung)\.android\.gallery3d$/;
const MAX_WAIT_MS = 10000;

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isGalleryPackage(packageName) {
  return GALLERY_PACKAGE_PATTERN.test(String(packageName || ''));
}

function parseBounds(bounds) {
  const match = String(bounds || '').match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
  if (!match) return null;
  const left = Number(match[1]);
  const top = Number(match[2]);
  const right = Number(match[3]);
  const bottom = Number(match[4]);
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom };
}

function centerOfBounds(bounds) {
  const parsed = parseBounds(bounds);
  if (!parsed) return null;
  return {
    x: Math.round((parsed.left + parsed.right) / 2),
    y: Math.round((parsed.top + parsed.bottom) / 2)
  };
}

function findGalleryTarget(nodes) {
  const candidates = Array.isArray(nodes) ? nodes : [];
  const selectors = [
    ['content-desc', 'View all albums'],
    ['content-desc', 'Ver todos los álbumes'],
    ['resource-id', 'com.sec.android.gallery3d:id/view_all'],
    ['resource-id', 'com.samsung.android.gallery3d:id/view_all'],
    ['text', 'View all'],
    ['text', 'Ver todos']
  ];

  for (const [attribute, expected] of selectors) {
    const exact = candidates.find((node) => (
      node[attribute] === expected && centerOfBounds(node.bounds)
    ));
    if (exact) return { node: exact, selector: `${attribute}=${expected}` };
  }
  return null;
}

function findScrollableNode(nodes) {
  return (Array.isArray(nodes) ? nodes : []).find((node) => (
    node.scrollable === 'true' && parseBounds(node.bounds)
  )) || null;
}

function getVisiblePackage(nodes) {
  return nodes.find((node) => node.package)?.package || '';
}

function safeStepLabel(label) {
  if (!/^[A-Za-z0-9_-]+$/.test(label)) throw new Error('Etiqueta de paso RPA no valida.');
  return label;
}

async function saveUiDump(adapter, serial, directory, label, logger) {
  const result = await adapter.adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], {
    serial,
    timeoutMs: 30000
  });
  const outputPath = path.join(directory, `${safeStepLabel(label)}.xml`);
  await fs.promises.writeFile(outputPath, result.stdout, 'utf8');
  const integrity = await hashFileWithSidecar(outputPath);
  const parsed = parseUiHierarchyNodes(result.stdout);
  logger?.(`[RPA] Jerarquia ${label}: ${parsed.nodes.length} nodos; paquete ${getVisiblePackage(parsed.nodes) || 'desconocido'}.`);
  return {
    label,
    outputPath,
    sha256: integrity.sha256,
    nodes: parsed.nodes,
    rootAttributes: parsed.rootAttributes
  };
}

async function saveScreenshot(adapter, serial, directory, label, logger) {
  const outputPath = path.join(directory, `${safeStepLabel(label)}.png`);
  const result = await adapter.captureScreenshot(outputPath, { serial });
  const integrity = await hashFileWithSidecar(result.outputPath);
  logger?.(`[RPA] Captura ${label}: ${integrity.sha256}.`);
  return { label, outputPath, sha256: integrity.sha256 };
}

function scrollCoordinates(scrollableNode) {
  const bounds = parseBounds(scrollableNode.bounds);
  if (!bounds) throw new Error('El contenedor desplazable no tiene bounds validos.');
  const x = Math.round((bounds.left + bounds.right) / 2);
  const y1 = Math.max(bounds.top + 80, bounds.bottom - 260);
  const y2 = Math.min(bounds.bottom - 80, bounds.top + 320);
  if (y1 <= y2) throw new Error('El contenedor desplazable no tiene altura suficiente.');
  return { x1: x, y1, x2: x, y2, duration: 650 };
}

async function runGalleryNavigation(config = {}) {
  const adapter = config.adapter;
  const serial = String(config.serial || '').trim();
  if (!adapter || typeof adapter.adb !== 'function') throw new Error('El adaptador ADB no esta disponible.');
  if (!serial) throw new Error('Selecciona un dispositivo antes de iniciar el RPA de Galeria.');

  const sessionDirectory = path.resolve(config.sessionDirectory || path.join(
    os.homedir(), 'Desktop', 'Forensic_Extractions', 'Android_Lab', 'rpa_gallery', `gallery_${Date.now()}`
  ));
  const dumpDirectory = path.join(sessionDirectory, 'ui_dumps');
  const screenshotDirectory = path.join(sessionDirectory, 'screenshots');
  await fs.promises.mkdir(dumpDirectory, { recursive: true });
  await fs.promises.mkdir(screenshotDirectory, { recursive: true });
  const manifestPath = path.join(sessionDirectory, 'rpa_gallery.json');
  const manifest = {
    schema: 'forensic-suite.android-gallery-rpa.v1',
    startedAt: new Date().toISOString(),
    serial,
    scope: 'navegacion visual acotada; no copia archivos',
    steps: []
  };

  const checkCancelled = () => {
    if (typeof config.isCancelled === 'function' && config.isCancelled()) {
      throw new Error('El RPA de Galeria fue cancelado.');
    }
  };
  const logger = typeof config.logger === 'function' ? config.logger : () => {};

  try {
    checkCancelled();
    const before = await saveUiDump(adapter, serial, dumpDirectory, 'before', logger);
    const packageName = getVisiblePackage(before.nodes);
    if (!isGalleryPackage(packageName)) {
      throw new Error(`La pantalla visible no es Galeria (${packageName || 'paquete desconocido'}). Abre Galeria y reintenta.`);
    }
    manifest.steps.push({ type: 'ui-dump', label: before.label, path: path.relative(sessionDirectory, before.outputPath), sha256: before.sha256, packageName });
    manifest.steps.push({ type: 'screenshot', ...(await saveScreenshot(adapter, serial, screenshotDirectory, 'before', logger)), path: 'screenshots/before.png' });

    const target = findGalleryTarget(before.nodes);
    if (!target) {
      throw new Error('No se encontro "View all albums". Abre la pantalla principal de albumes de Galeria y reintenta.');
    }
    const tap = centerOfBounds(target.node.bounds);
    logger(`[RPA] Selector ${target.selector}; tap en (${tap.x}, ${tap.y}).`);
    await adapter.adb(['shell', 'input', 'tap', String(tap.x), String(tap.y)], { serial, timeoutMs: 15000 });
    manifest.steps.push({ type: 'tap', selector: target.selector, bounds: target.node.bounds, x: tap.x, y: tap.y });
    await sleep(Math.min(1200, MAX_WAIT_MS));
    checkCancelled();

    const afterAlbums = await saveUiDump(adapter, serial, dumpDirectory, 'after_albums', logger);
    manifest.steps.push({ type: 'ui-dump', label: afterAlbums.label, path: path.relative(sessionDirectory, afterAlbums.outputPath), sha256: afterAlbums.sha256, packageName: getVisiblePackage(afterAlbums.nodes) });
    manifest.steps.push({ type: 'screenshot', ...(await saveScreenshot(adapter, serial, screenshotDirectory, 'after_albums', logger)), path: 'screenshots/after_albums.png' });

    const scrollable = findScrollableNode(afterAlbums.nodes);
    if (!scrollable) throw new Error('Galeria cambio de pantalla, pero no se encontro un contenedor desplazable.');
    const swipe = scrollCoordinates(scrollable);
    logger(`[RPA] Scroll acotado en (${swipe.x1},${swipe.y1}) -> (${swipe.x2},${swipe.y2}).`);
    await adapter.adb([
      'shell', 'input', 'swipe',
      String(swipe.x1), String(swipe.y1), String(swipe.x2), String(swipe.y2), String(swipe.duration)
    ], { serial, timeoutMs: 15000 });
    manifest.steps.push({ type: 'swipe', ...swipe, containerBounds: scrollable.bounds });
    await sleep(Math.min(900, MAX_WAIT_MS));
    checkCancelled();

    const afterScroll = await saveUiDump(adapter, serial, dumpDirectory, 'after_scroll', logger);
    manifest.steps.push({ type: 'ui-dump', label: afterScroll.label, path: path.relative(sessionDirectory, afterScroll.outputPath), sha256: afterScroll.sha256, packageName: getVisiblePackage(afterScroll.nodes) });
    manifest.steps.push({ type: 'screenshot', ...(await saveScreenshot(adapter, serial, screenshotDirectory, 'after_scroll', logger)), path: 'screenshots/after_scroll.png' });
    manifest.status = 'success';
    manifest.finishedAt = new Date().toISOString();
    await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    return { ok: true, sessionDirectory, manifestPath, steps: manifest.steps };
  } catch (error) {
    manifest.status = 'error';
    manifest.error = error.message;
    manifest.finishedAt = new Date().toISOString();
    await fs.promises.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    throw error;
  }
}

module.exports = {
  isGalleryPackage,
  parseBounds,
  centerOfBounds,
  findGalleryTarget,
  findScrollableNode,
  scrollCoordinates,
  runGalleryNavigation
};
