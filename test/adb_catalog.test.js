const assert = require('node:assert/strict');
const test = require('node:test');

const {
  listAdbLearningCommands,
  getAdbLearningCommand,
  summarizeUiHierarchy
} = require('../src/platform/android/adb_catalog');

test('el catálogo solo expone comandos educativos definidos', () => {
  const commands = listAdbLearningCommands();
  assert.ok(commands.length >= 5);
  assert.equal(commands.some((command) => command.id === 'arbitrary-shell'), false);
  assert.equal(commands.find((command) => command.id === 'devices').requiresDevice, false);
});

test('cada comando del catálogo tiene argumentos definidos', () => {
  for (const summary of listAdbLearningCommands()) {
    const command = getAdbLearningCommand(summary.id);
    assert.ok(command);
    assert.ok(Array.isArray(command.args('ABC123')));
  }
});

test('la inspeccion de jerarquia UI usa una orden acotada', () => {
  const command = getAdbLearningCommand('ui-hierarchy');
  assert.ok(command);
  assert.deepEqual(command.args('SERIAL'), ['exec-out', 'uiautomator', 'dump', '/dev/tty']);
  assert.equal(command.requiresDevice, true);
});

test('resume la jerarquia UI sin perder los elementos accionables', () => {
  const summary = summarizeUiHierarchy(`<?xml version="1.0"?><hierarchy rotation="0"><node bounds="[0,0][1080,2340]" package="com.test"><node text="Galeria" content-desc="Abrir Galeria" clickable="true" bounds="[10,20][200,220]" class="android.widget.TextView" /></node></hierarchy>`);
  assert.match(summary, /JERARQUIA UI RESUMIDA/);
  assert.match(summary, /Paquete visible: com.test/);
  assert.match(summary, /text="Galeria"/);
  assert.match(summary, /desc="Abrir Galeria"/);
  assert.match(summary, /bounds=\[10,20\]\[200,220\]/);
  assert.doesNotMatch(summary, /version=/);
});
