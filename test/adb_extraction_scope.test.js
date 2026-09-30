const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { listEvidenceFiles } = require('../3_extraccion_galeria_adb');

test('el informe queda limitado a la carpeta de la ejecucion actual', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forensic-run-scope-'));
  const currentRun = path.join(root, 'run_001');
  const legacyRun = path.join(root, 'run_000');

  try {
    fs.mkdirSync(path.join(currentRun, 'Pictures'), { recursive: true });
    fs.mkdirSync(legacyRun, { recursive: true });
    fs.writeFileSync(path.join(currentRun, 'Pictures', 'current.jpg'), 'current');
    fs.writeFileSync(path.join(currentRun, 'current.png'), 'current');
    fs.writeFileSync(path.join(currentRun, 'Informe_Integridad.pdf'), 'report');
    fs.writeFileSync(path.join(legacyRun, 'old-archive.jpg'), 'legacy');

    const files = await listEvidenceFiles(currentRun);

    assert.deepEqual(files.sort(), [
      path.join(currentRun, 'Pictures', 'current.jpg'),
      path.join(currentRun, 'current.png')
    ].sort());
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
