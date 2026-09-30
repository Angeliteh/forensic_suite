const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('end', () => resolve(hash.digest('hex')));
    stream.once('error', reject);
  });
}

async function hashFileWithSidecar(filePath) {
  const sha256 = await hashFile(filePath);
  const sidecarPath = `${filePath}.sha256.txt`;
  const contents = [
    `SHA-256: ${sha256}`,
    `Archivo: ${path.basename(filePath)}`,
    `Generado: ${new Date().toISOString()}`,
    ''
  ].join('\n');
  await fs.promises.writeFile(sidecarPath, contents, 'utf8');
  return { filePath, sha256, sidecarPath };
}

module.exports = { hashFile, hashFileWithSidecar };
