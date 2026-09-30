const { contextBridge, ipcRenderer } = require('electron');

const SEND_CHANNELS = new Set([
  'android-list-devices',
  'android-connect-device',
  'android-learning-catalog',
  'android-learning-command',
  'android-evidence-operation',
  'android-discover-media',
  'android-gallery-rpa',
  'android-mobile-action',
  'android-start-observed-session',
  'android-stop-observed-session',
  'android-start-mirror',
  'android-stop-mirror',
  'start-adb',
  'start-whatsapp',
  'get-wa-contacts',
  'whatsapp-open-session',
  'whatsapp-check-session',
  'whatsapp-close-session',
  'whatsapp-load-latest-results'
]);

const LISTEN_CHANNELS = new Set([
  'android-devices-result',
  'android-connection-result',
  'android-connection-log',
  'android-learning-catalog-result',
  'android-learning-result',
  'android-evidence-result',
  'android-media-inventory-result',
  'android-gallery-rpa-result',
  'android-gallery-rpa-log',
  'android-mobile-action-result',
  'android-mobile-action-log',
  'android-observed-session-state',
  'android-observed-session-log',
  'android-mirror-state',
  'android-terminal-log',
  'adb-extraction-state',
  'terminal-log',
  'wa-contacts-result',
  'wa-terminal-log',
  'wa-session-state',
  'wa-live-conversation-batch',
  'wa-live-message-batch',
  'whatsapp-latest-results'
]);

function getRuntimeConfig() {
  return ipcRenderer.sendSync('get-runtime-config');
}

contextBridge.exposeInMainWorld('electronAPI', {
  getRuntimeConfig,
  send(channel, payload) {
    if (!SEND_CHANNELS.has(channel)) {
      throw new Error(`Canal IPC de salida no permitido: ${channel}`);
    }
    ipcRenderer.send(channel, payload);
  },
  on(channel, listener) {
    if (!LISTEN_CHANNELS.has(channel)) {
      throw new Error(`Canal IPC de entrada no permitido: ${channel}`);
    }
    const wrappedListener = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrappedListener);
    return () => ipcRenderer.removeListener(channel, wrappedListener);
  }
});
