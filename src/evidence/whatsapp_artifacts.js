const path = require('path');
const { normalizeCsvText } = require('../platform/web/whatsapp/whatsapp_domain');

const WHATSAPP_CSV_HEADER = 'Metadatos (Hora/Autor),Mensaje,Enlaces,Tipo,Adjuntos,Estado visual,Respuesta\n';

function csvEscape(value) {
  return `"${normalizeCsvText(value).replace(/"/g, '""')}"`;
}

function buildWhatsAppCsv(messages = []) {
  let csvContent = WHATSAPP_CSV_HEADER;

  for (const message of messages) {
    const enlaces = Array.isArray(message.enlaces) ? message.enlaces : [];
    const adjuntos = Array.isArray(message.adjuntos) ? message.adjuntos : [];
    const tipos = new Set();

    if (message.texto && !String(message.texto).startsWith('[')) tipos.add('texto');
    if (enlaces.length > 0) tipos.add('enlace');
    adjuntos.forEach(adjunto => tipos.add(adjunto.tipo || 'multimedia'));
    if (tipos.size === 0) tipos.add('multimedia');

    csvContent += [
      csvEscape(message.metadata),
      csvEscape(message.texto),
      csvEscape(enlaces.map(enlace => enlace.url).join(' | ')),
      csvEscape(Array.from(tipos).join('|')),
      csvEscape(JSON.stringify(adjuntos)),
      csvEscape(JSON.stringify(message.estado_visual || {})),
      csvEscape(JSON.stringify(message.respuesta || null))
    ].join(',') + '\n';
  }

  return csvContent;
}

function createWhatsAppManifest({
  contacto,
  conversacion = {},
  fechaInicio,
  fechaFin,
  totalMensajes,
  hashes = [],
  baseDirectory
}) {
  const sources = Array.isArray(conversacion.sources)
    ? conversacion.sources.filter(Boolean)
    : [conversacion.source].filter(Boolean);

  return {
    contacto,
    conversacion: {
      id: conversacion.id || null,
      kind: conversacion.kind || 'conversation',
      source: conversacion.source || null,
      sources
    },
    fechaInicio,
    fechaFin,
    totalMensajes,
    archivos: hashes.map(({ filePath, sha256 }) => ({
      archivo: path.relative(baseDirectory, filePath).split(path.sep).join('/'),
      sha256
    }))
  };
}

module.exports = {
  WHATSAPP_CSV_HEADER,
  buildWhatsAppCsv,
  createWhatsAppManifest
};
