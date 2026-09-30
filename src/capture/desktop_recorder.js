const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { hashFile, hashFileWithSidecar } = require('../evidence/file_hash');

function resolveFfmpegExecutable(explicitPath) {
  return explicitPath || process.env.FFMPEG_PATH || 'ffmpeg';
}

function startDesktopRecording(basePath, options = {}) {
  const executable = resolveFfmpegExecutable(options.executable);
  const segmentSeconds = options.segmentSeconds ?? 900;
  const framerate = options.framerate ?? 15;
  const input = options.input || 'desktop';
  const pixelFormat = options.pixelFormat || 'yuv420p';
  const logPath = options.logPath || `${basePath}_ffmpeg.log`;

  fs.mkdirSync(path.dirname(basePath), { recursive: true });
  fs.mkdirSync(path.dirname(logPath), { recursive: true });

  const args = [
    '-f', 'gdigrab',
    '-framerate', String(framerate),
    '-i', input,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', pixelFormat,
    '-f', 'segment',
    '-segment_time', String(segmentSeconds),
    '-segment_format', 'mp4',
    '-segment_format_options', 'movflags=+faststart',
    '-reset_timestamps', '1',
    `${basePath}_parte_%03d.mp4`
  ];

  const logStream = fs.createWriteStream(logPath, { flags: 'w' });

  const processHandle = spawn(executable, args, {
    stdio: ['pipe', 'ignore', 'pipe'],
    windowsHide: true
  });

  let stderr = '';
  processHandle.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    logStream.write(text);
    // Conserva solo la cola para que una grabacion larga no consuma RAM.
    stderr = `${stderr}${text}`.slice(-64 * 1024);
  });
  processHandle.once('close', () => logStream.end());

  return new Promise((resolve, reject) => {
    let settled = false;
    const startupWaitMs = options.startupWaitMs ?? 1000;
    const finishWithError = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const timer = setTimeout(() => {
      if (processHandle.exitCode !== null) {
        finishWithError(new Error(`FFmpeg terminó antes de iniciar la grabación: ${stderr || `código ${processHandle.exitCode}`}`));
        return;
      }
      settled = true;
      resolve({
        process: processHandle,
        executable,
        basePath,
        logPath,
        startedAt: new Date().toISOString(),
        getStderr: () => stderr
      });
    }, startupWaitMs);

    processHandle.once('error', (error) => {
      clearTimeout(timer);
      finishWithError(new Error(`No se pudo iniciar FFmpeg (${executable}): ${error.message}`));
    });
    processHandle.once('exit', (code) => {
      if (settled) return;
      clearTimeout(timer);
      finishWithError(new Error(`FFmpeg terminó antes de iniciar la grabación: ${stderr || `código ${code ?? 'desconocido'}`}`));
    });
  });
}

function stopDesktopRecording(recording, options = {}) {
  if (!recording || !recording.process) return Promise.resolve();

  const processHandle = recording.process;
  if (processHandle.exitCode !== null) return Promise.resolve();

  const timeoutMs = options.timeoutMs || 10000;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      try { processHandle.kill(); } catch (_) { /* ya terminó */ }
      finish();
    }, timeoutMs);

    processHandle.once('close', finish);

    try {
      if (processHandle.stdin && !processHandle.stdin.destroyed) {
        processHandle.stdin.write('q\n');
      } else {
        finish();
      }
    } catch (_) {
      finish();
    }
  });
}

function listRecordingSegments(basePath) {
  const directory = path.dirname(basePath);
  const prefix = `${path.basename(basePath)}_parte_`;
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.mp4'))
    .sort()
    .map((name) => path.join(directory, name));
}

module.exports = {
  startDesktopRecording,
  stopDesktopRecording,
  listRecordingSegments,
  hashFile,
  hashFileWithSidecar
};
