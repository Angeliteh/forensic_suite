const WHATSAPP_ERROR_CODES = Object.freeze({
  SESSION_NOT_READY: 'SESSION_NOT_READY',
  CHAT_NOT_FOUND: 'CHAT_NOT_FOUND',
  DOM_SELECTOR_MISSING: 'DOM_SELECTOR_MISSING',
  CHAT_EXTRACTION_FAILED: 'CHAT_EXTRACTION_FAILED',
  MEDIA_UNAVAILABLE: 'MEDIA_UNAVAILABLE',
  OUTPUT_WRITE_FAILED: 'OUTPUT_WRITE_FAILED',
  RECORDING_FAILED: 'RECORDING_FAILED',
  UNKNOWN: 'UNKNOWN'
});

function classifyWhatsAppError(error, fallbackCode = WHATSAPP_ERROR_CODES.UNKNOWN) {
  const message = String(error?.message || error || 'Error desconocido');
  const explicitCode = String(error?.code || '').trim();
  if (Object.values(WHATSAPP_ERROR_CODES).includes(explicitCode)) {
    return { code: explicitCode, message };
  }

  if (/no se encontr|not found|chat.*(missing|inexistente)/i.test(message)) {
    return { code: WHATSAPP_ERROR_CODES.CHAT_NOT_FOUND, message };
  }
  if (/selector|queryselector|locator|msg-container|conversation-panel/i.test(message)) {
    return { code: WHATSAPP_ERROR_CODES.DOM_SELECTOR_MISSING, message };
  }
  if (/ffmpeg|grabaci[oó]n|recording/i.test(message)) {
    return { code: WHATSAPP_ERROR_CODES.RECORDING_FAILED, message };
  }
  if (/media|multimedia|video|audio|blob|stream/i.test(message)) {
    return { code: WHATSAPP_ERROR_CODES.MEDIA_UNAVAILABLE, message };
  }
  if (/write|escrib|manifest|csv|json|pdf|hash/i.test(message)) {
    return { code: WHATSAPP_ERROR_CODES.OUTPUT_WRITE_FAILED, message };
  }
  return { code: fallbackCode, message };
}

module.exports = {
  WHATSAPP_ERROR_CODES,
  classifyWhatsAppError
};
