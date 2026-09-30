const { spawn } = require('node:child_process');
const path = require('node:path');

const electronPath = require('electron');
const childEnvironment = { ...process.env };
delete childEnvironment.ELECTRON_RUN_AS_NODE;

const electronProcess = spawn(electronPath, [path.resolve(__dirname)], {
  cwd: __dirname,
  env: childEnvironment,
  stdio: 'inherit'
});

electronProcess.once('error', (error) => {
  console.error(`No se pudo iniciar Electron: ${error.message}`);
  process.exitCode = 1;
});

electronProcess.once('close', (code, signal) => {
  if (signal) {
    console.log(`Electron finalizo por la senal ${signal}.`);
  }
  process.exitCode = code ?? 0;
});
