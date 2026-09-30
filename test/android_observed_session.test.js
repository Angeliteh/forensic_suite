const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createObservedSession } = require('../src/platform/android/android_observed_session');

test('crea una sesion observada con manifiesto y registro sin ejecutar respaldo', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'forensic-observed-session-'));
  const states = [];
  const logs = [];
  const mirrorArgs = [];

  class FakeMirrorProcess extends EventEmitter {
    constructor() {
      super();
      this.exitCode = null;
      this.killed = false;
      this.stderr = new EventEmitter();
    }

    kill() {
      this.killed = true;
      this.exitCode = 0;
      this.emit('close', 0);
    }
  }

  const adapter = {
    startMirror(options) {
      mirrorArgs.push(options);
      return new FakeMirrorProcess();
    }
  };

  try {
    const session = createObservedSession({
      adapter,
      serial: 'ABC123',
      sessionDirectory: root,
      backup: false,
      recordMirror: true,
      captureScreenshots: false,
      logger: (message) => logs.push(message),
      onState: (state) => states.push(state.status)
    });

    const result = await session.promise;
    assert.equal(result.ok, true);
    assert.equal(mirrorArgs.length, 1);
    assert.equal(mirrorArgs[0].serial, 'ABC123');
    assert.equal(mirrorArgs[0].noAudio, true);
    assert.equal(fs.existsSync(path.join(root, 'session.json')), true);
    assert.equal(fs.existsSync(path.join(root, 'session.log')), true);
    assert.deepEqual(states, ['running', 'mirroring', 'success']);
    assert.equal(logs.some((line) => line.includes('Mirroring iniciado')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
