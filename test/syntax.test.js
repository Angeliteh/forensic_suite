const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const projectRoot = path.resolve(__dirname, '..');
const files = [
  'main.js',
  'start.js',
  'preload.js',
  'renderer.js',
  '3_extraccion_galeria_adb.js',
  'fase3_extractor_real.js',
  'src/capture/desktop_recorder.js',
  'src/evidence/file_hash.js',
  'src/evidence/whatsapp_artifacts.js',
  'src/evidence/whatsapp_artifact_validator.js',
  'src/core/operation_logger.js',
  'src/platform/web/whatsapp/whatsapp_domain.js',
  'src/platform/web/whatsapp/message_dom_parser.js',
  'src/platform/web/whatsapp/media_dom_parser.js',
  'src/platform/web/whatsapp/whatsapp_errors.js',
  'src/platform/android/adb_catalog.js',
  'src/platform/android/android_media_inventory.js',
  'src/platform/android/android_gallery_rpa.js',
  'src/platform/android/android_adapter.js',
  'src/platform/android/android_connection.js',
  'src/platform/android/android_observed_session.js',
  'src/platform/android/android_action_runner.js'
];

test('los modulos JavaScript principales mantienen sintaxis valida', () => {
  for (const relativePath of files) {
    const filePath = path.join(projectRoot, relativePath);
    assert.equal(fs.existsSync(filePath), true, `Falta ${relativePath}`);
    execFileSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
  }
});
