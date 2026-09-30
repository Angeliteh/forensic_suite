const fs = require('fs');
const path = require('path');

function countCsvRecords(csvText) {
  let records = 0;
  let hasContent = false;
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const character = csvText[index];
    if (character === '"') {
      if (inQuotes && csvText[index + 1] === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      hasContent = true;
      continue;
    }
    if (character === '\n' && !inQuotes) {
      if (hasContent) records += 1;
      hasContent = false;
      continue;
    }
    if (character !== '\r') hasContent = true;
  }

  if (hasContent) records += 1;
  return Math.max(0, records - 1);
}

function isPathInsideDirectory(baseDirectory, candidatePath) {
  const relative = path.relative(baseDirectory, candidatePath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function pushIssue(list, code, message, context = {}) {
  list.push({ code, message, ...context });
}

function readJson(filePath, errors, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    pushIssue(errors, code, `No se pudo leer ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

function validateWhatsAppArtifactStructure({ chatDirectory }) {
  const baseDirectory = path.resolve(chatDirectory);
  const errors = [];
  const warnings = [];
  const manifestPath = path.join(baseDirectory, 'manifest.json');
  const jsonPath = path.join(baseDirectory, 'historial.json');
  const csvPath = path.join(baseDirectory, 'historial.csv');

  if (!fs.existsSync(baseDirectory) || !fs.statSync(baseDirectory).isDirectory()) {
    return {
      ok: false,
      errors: [{ code: 'CHAT_DIRECTORY_MISSING', message: 'No existe la carpeta del chat.' }],
      warnings: [],
      summary: { jsonMessages: 0, csvMessages: 0, manifestFiles: 0, missingFiles: 0 }
    };
  }

  const manifest = readJson(manifestPath, errors, 'MANIFEST_INVALID');
  const messages = readJson(jsonPath, errors, 'HISTORY_JSON_INVALID');
  let csvMessages = 0;

  if (fs.existsSync(csvPath)) {
    try {
      csvMessages = countCsvRecords(fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''));
    } catch (error) {
      pushIssue(errors, 'HISTORY_CSV_INVALID', `No se pudo leer historial.csv: ${error.message}`);
    }
  } else {
    pushIssue(errors, 'HISTORY_CSV_MISSING', 'No existe historial.csv.');
  }

  const jsonMessages = Array.isArray(messages) ? messages.length : 0;
  if (Array.isArray(messages) && jsonMessages !== csvMessages) {
    pushIssue(errors, 'MESSAGE_COUNT_MISMATCH', 'JSON y CSV no tienen el mismo número de mensajes.', {
      jsonMessages,
      csvMessages
    });
  }

  if (manifest && manifest.totalMensajes !== jsonMessages) {
    pushIssue(errors, 'MANIFEST_COUNT_MISMATCH', 'El manifiesto no coincide con historial.json.', {
      manifestMessages: manifest.totalMensajes,
      jsonMessages
    });
  }

  let missingFiles = 0;
  const manifestFiles = Array.isArray(manifest?.archivos) ? manifest.archivos : [];
  for (const artifact of manifestFiles) {
    const relativePath = String(artifact?.archivo || '');
    const resolvedPath = path.resolve(baseDirectory, relativePath);
    if (!relativePath || !isPathInsideDirectory(baseDirectory, resolvedPath)) {
      pushIssue(errors, 'MANIFEST_PATH_UNSAFE', 'El manifiesto contiene una ruta fuera del expediente.', {
        archivo: relativePath
      });
      continue;
    }
    if (!fs.existsSync(resolvedPath)) {
      missingFiles += 1;
      pushIssue(errors, 'MANIFEST_FILE_MISSING', 'Falta un archivo listado en el manifiesto.', {
        archivo: relativePath
      });
    }
    if (!/^[a-f0-9]{64}$/i.test(String(artifact?.sha256 || ''))) {
      pushIssue(errors, 'MANIFEST_HASH_INVALID', 'Un archivo del manifiesto no tiene un SHA-256 válido.', {
        archivo: relativePath
      });
    }
  }

  let missingMedia = 0;
  if (Array.isArray(messages)) {
    for (const message of messages) {
      for (const attachment of Array.isArray(message?.adjuntos) ? message.adjuntos : []) {
        if (!attachment?.archivo) continue;
        const mediaPath = path.resolve(baseDirectory, attachment.archivo);
        if (!isPathInsideDirectory(baseDirectory, mediaPath) || !fs.existsSync(mediaPath)) {
          missingMedia += 1;
          pushIssue(warnings, 'MEDIA_FILE_MISSING', 'Un adjunto del historial no está disponible localmente.', {
            archivo: attachment.archivo,
            mensajeId: message.id_unico || null
          });
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary: {
      jsonMessages,
      csvMessages,
      manifestFiles: manifestFiles.length,
      missingFiles,
      missingMedia
    }
  };
}

module.exports = {
  countCsvRecords,
  validateWhatsAppArtifactStructure
};
