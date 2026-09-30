const fs = require('fs');

function createOperationLogger({ runId, scope = 'operation', filePath = null, onEntry = null } = {}) {
  let sequence = 0;
  const entries = [];

  function write(level, message, context = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      sequence: ++sequence,
      runId: runId ? String(runId) : null,
      scope: String(scope),
      level,
      message: String(message),
      context: context && typeof context === 'object' ? { ...context } : {}
    };

    entries.push(entry);
    if (filePath) fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
    if (typeof onEntry === 'function') onEntry(entry);
    return entry;
  }

  return {
    info: (message, context) => write('info', message, context),
    warn: (message, context) => write('warn', message, context),
    error: (message, context) => write('error', message, context),
    event: (name, context) => write('event', name, context),
    getEntries: () => entries.slice()
  };
}

function formatOperationLog(entry) {
  const level = String(entry?.level || 'info').toUpperCase();
  return `[${level}] ${String(entry?.message || '')}`;
}

module.exports = {
  createOperationLogger,
  formatOperationLog
};
