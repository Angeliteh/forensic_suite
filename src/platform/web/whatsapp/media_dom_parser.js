function extractVisibleMediaFromDom(selectedContent = {}) {
  const items = [];
  document.querySelectorAll('div[data-testid="msg-container"]').forEach(container => {
    const mensajeId = container.closest('[data-id]')?.getAttribute('data-id') || '';
    const metadata = container.querySelector('.copyable-text[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
    const visibleMeta = container.querySelector('[data-testid="msg-meta"]')?.innerText || '';
    const messageKey = mensajeId || `meta:${metadata || visibleMeta}`;
    const senderLabel = container.querySelector('span[aria-label$=":"]')?.getAttribute('aria-label') || '';
    const tailOut = Boolean(container.querySelector('[data-icon="tail-out"], [data-testid="tail-out"]'));
    const tailIn = Boolean(container.querySelector('[data-icon="tail-in"], [data-testid="tail-in"]'));
    const autorMatch = metadata.match(/\]\s*(.*?):\s*$/);
    const contexto = {
      metadata: String(metadata || visibleMeta).replace(/\s+/g, ' ').trim(),
      autor: autorMatch ? autorMatch[1].trim() : (senderLabel.replace(/:\s*$/, '').trim() || null),
      direccion: tailOut || /^(?:tu|t\u00fa|you)\s*:/i.test(senderLabel)
        ? 'saliente'
        : tailIn
          ? 'entrante'
          : 'desconocida'
    };

    container.querySelectorAll('img[src^="blob:"]').forEach(element => {
      if (element.naturalWidth <= 10) return;
      const description = `${element.getAttribute('alt') || ''} ${element.className || ''}`.toLocaleLowerCase();
      const tipo = description.includes('sticker') ? 'sticker' : 'imagen';
      if ((tipo === 'imagen' && selectedContent.includeImages) || (tipo === 'sticker' && selectedContent.includeStickers)) {
        items.push({ url: element.currentSrc || element.src, tipo, mensaje_id: messageKey, ...contexto });
      }
    });
    container.querySelectorAll('video, video source').forEach(element => {
      const url = element.currentSrc || element.src || element.getAttribute('src') || '';
      if (selectedContent.includeVideos && url && !url.startsWith('data:')) {
        items.push({ url, tipo: 'video', mensaje_id: messageKey, ...contexto });
      }
    });
    container.querySelectorAll('audio, audio source').forEach(element => {
      const url = element.currentSrc || element.src || element.getAttribute('src') || '';
      if (selectedContent.includeAudio && url && !url.startsWith('data:')) {
        items.push({ url, tipo: 'audio', mensaje_id: messageKey, ...contexto });
      }
    });
  });
  return items;
}

module.exports = { extractVisibleMediaFromDom };
