function parseWhatsAppMessageTimestamp(message) {
  const metadata = String(message?.metadata || '');
  const match = metadata.match(/\[(\d{1,2}):(\d{2}),\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
  if (!match) return Number.POSITIVE_INFINITY;
  const [, hour, minute, day, month, year] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
}

function sortWhatsAppMessages(messages) {
  return messages
    .map((message, index) => ({ message, index }))
    .sort((a, b) => parseWhatsAppMessageTimestamp(a.message) - parseWhatsAppMessageTimestamp(b.message) || a.index - b.index)
    .map(item => item.message);
}

function normalizeConversationTarget(target) {
  if (typeof target === 'string') {
    return { name: target.trim(), id: null, source: 'legacy', kind: 'conversation' };
  }

  return {
    name: String(target?.name || target?.title || '').trim(),
    id: target?.id ? String(target.id) : null,
    source: target?.source ? String(target.source) : 'recent',
    kind: target?.kind ? String(target.kind) : 'conversation'
  };
}

function conversationKey(conversation) {
  const id = String(conversation?.id || '').trim();
  if (id) return `id:${id}`;
  return `name:${String(conversation?.name || '').trim().toLocaleLowerCase()}`;
}

function mergeConversationCatalog(conversations) {
  const merged = new Map();
  for (const item of conversations) {
    const conversation = normalizeConversationTarget(item);
    if (!conversation.name) continue;
    const key = conversationKey(conversation);
    const previous = merged.get(key);
    if (!previous) {
      merged.set(key, { ...conversation, sources: [conversation.source] });
      continue;
    }
    if (!previous.sources.includes(conversation.source)) previous.sources.push(conversation.source);
    if (!previous.id && conversation.id) previous.id = conversation.id;
    if (previous.kind === 'conversation' && conversation.kind !== 'conversation') {
      previous.kind = conversation.kind;
    }
  }
  return Array.from(merged.values());
}

function inferMediaExtension(contentType, mediaType) {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) return 'jpg';
  if (normalized.includes('png')) return 'png';
  if (normalized.includes('webp')) return 'webp';
  if (normalized.includes('gif')) return 'gif';
  if (normalized.includes('mp4')) return 'mp4';
  if (normalized.includes('webm')) return 'webm';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (mediaType === 'imagen') return 'jpg';
  if (mediaType === 'sticker') return 'webp';
  if (mediaType === 'video') return 'mp4';
  if (mediaType === 'audio') return 'ogg';
  return 'bin';
}

function normalizeCsvText(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

module.exports = {
  parseWhatsAppMessageTimestamp,
  sortWhatsAppMessages,
  normalizeConversationTarget,
  conversationKey,
  mergeConversationCatalog,
  inferMediaExtension,
  normalizeCsvText
};
