/**
 * Playwright serializes this function and executes it inside WhatsApp Web.
 * Keep it self-contained: it must not depend on Node modules or outer scope.
 */
function extractVisibleMessagesFromDom({ selectedContent = {}, knownOwnAuthors = [] } = {}) {
  const extraidos = [];
  const ownAuthors = new Set(knownOwnAuthors.map(author => String(author).trim().toLocaleLowerCase()));
  const containers = Array.from(document.querySelectorAll('div[data-testid="msg-container"]'));
  const fullDates = containers.map(container => {
    const value = container.querySelector('.copyable-text[data-pre-plain-text]')?.getAttribute('data-pre-plain-text') || '';
    const match = value.match(/\[(\d{1,2}):\d{2},\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\]/);
    return match ? `${match[2]}/${match[3]}/${match[4]}` : null;
  });
  const nearestDate = (index) => {
    if (fullDates[index]) return fullDates[index];
    for (let distance = 1; distance < fullDates.length; distance++) {
      const previous = index - distance;
      if (previous >= 0 && fullDates[previous]) return fullDates[previous];
      const next = index + distance;
      if (next < fullDates.length && fullDates[next]) return fullDates[next];
    }
    return null;
  };

  containers.forEach((container, domIndex) => {
    const copyable = container.querySelector('.copyable-text[data-pre-plain-text]');
    const recalled = Boolean(container.querySelector('[data-testid="recalled"], [data-icon="recalled"]'));
    const hasVideo = Boolean(container.querySelector('video, [data-testid="video-content"], [data-testid*="video"]'));
    const hasAudio = Boolean(container.querySelector('audio, button[aria-label^="Reproducir mensaje de voz"], [data-icon*="audio"], [data-testid*="audio"], [data-testid*="ptt"]'));
    const hasImage = Boolean(container.querySelector('img[src^="blob:"], img[data-testid*="image"], [data-testid*="image"]'));
    const hasStickerImage = Array.from(container.querySelectorAll('img')).some(image => {
      const description = `${image.getAttribute('alt') || ''} ${image.className || ''}`.toLocaleLowerCase();
      return description.includes('sticker');
    });
    const hasMedia = Boolean(container.querySelector('img, video, audio'));
    const hasRequestedMedia = (selectedContent.includeImages && hasImage)
      || (selectedContent.includeVideos && hasVideo)
      || (selectedContent.includeAudio && hasAudio)
      || (selectedContent.includeStickers && hasStickerImage);
    if (!copyable && !recalled && !hasMedia) return;
    if (!selectedContent.includeText && !recalled && !hasRequestedMedia) return;

    const metadata = copyable?.getAttribute('data-pre-plain-text') || '';
    const senderLabel = container.querySelector('span[aria-label$=":"]')?.getAttribute('aria-label') || '';
    const tailOut = Boolean(container.querySelector('[data-icon="tail-out"], [data-testid="tail-out"]'));
    const tailIn = Boolean(container.querySelector('[data-icon="tail-in"], [data-testid="tail-in"]'));
    const isSelf = /^(?:tu|t\u00fa|you)\s*:/i.test(senderLabel);
    const autorMatch = metadata.match(/\]\s*(.*?):\s*$/);
    const autor = autorMatch ? autorMatch[1].trim() : (senderLabel.replace(/:\s*$/, '').trim() || null);
    const autorNormalizado = autor ? autor.toLocaleLowerCase() : '';
    const direccion = tailOut || isSelf || (autorNormalizado && ownAuthors.has(autorNormalizado))
      ? 'saliente'
      : tailIn
        ? 'entrante'
        : 'desconocida';
    const visibleMetaNode = container.querySelector('[data-testid="msg-meta"]');
    const visibleMeta = visibleMetaNode?.innerText || visibleMetaNode?.textContent || '';
    const timeMatch = String(metadata || visibleMeta).match(/\b(\d{1,2}:\d{2})\b/);
    const dateContext = nearestDate(domIndex);
    const normalizedMetadata = metadata.match(/\[\d{1,2}:\d{2},\s*\d{1,2}\/\d{1,2}\/\d{4}\]/)
      ? metadata
      : dateContext && timeMatch
        ? `[${timeMatch[1]}, ${dateContext}] ${autor || senderLabel.replace(/:\s*$/, '').trim()}:`
        : String(metadata || visibleMeta).replace(/\s+/g, ' ').trim();
    const rawContainerText = String(container.textContent || '').replace(/\s+/g, ' ').trim();
    const rawCopyableText = String(copyable?.textContent || '').replace(/\s+/g, ' ').trim();
    const readRichText = (element) => {
      if (!element) return '';
      const richText = element.cloneNode(true);
      richText.querySelectorAll('img[data-plain-text], img[alt]').forEach(image => {
        image.replaceWith(document.createTextNode(
          image.getAttribute('data-plain-text') || image.getAttribute('alt') || ''
        ));
      });
      return (richText.innerText || richText.textContent || '')
        .replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
    };
    const quotedMessage = container.querySelector('[data-testid="quoted-message"]');
    const quotedAuthor = quotedMessage?.querySelector('[data-testid="author"]')?.textContent?.trim() || '';
    const quotedTextElement = quotedMessage
      ? Array.from(quotedMessage.querySelectorAll('span[data-testid="selectable-text"]'))[0]
      : null;
    const quotedSymbol = quotedMessage?.querySelector('[data-testid="chat-msg-symbol"] title')?.textContent || '';
    const quotedType = /image/i.test(quotedSymbol)
      ? 'imagen'
      : /video/i.test(quotedSymbol)
        ? 'video'
        : /audio|mic|ptt/i.test(quotedSymbol)
          ? 'audio'
          : (quotedTextElement ? 'texto' : 'multimedia');
    const respuestaEstado = /(?:·|Â·|Ã‚Â·)?\s*Estados\b/i.test(quotedAuthor);
    const textElement = copyable
      ? Array.from(copyable.querySelectorAll('span[data-testid="selectable-text"]'))
          .find(element => !element.closest('[data-testid="quoted-message"]'))
      : null;
    if (!hasRequestedMedia && !textElement && !recalled) return;

    let texto = hasVideo ? '[Video]' : '[Multimedia/Sticker]';
    if (textElement && selectedContent.includeText) {
      texto = readRichText(textElement);
    } else if (textElement && !selectedContent.includeText) {
      texto = '[Texto omitido]';
    } else if (recalled) {
      const recalledMatch = rawContainerText.match(/(Se elimin(?:ó|Ã³) este mensaje\.|Eliminaste este mensaje\.)/i);
      texto = recalledMatch ? recalledMatch[1] : 'Mensaje eliminado.';
    }

    const enlaces = Array.from(container.querySelectorAll('a[href]'))
      .map(link => ({
        url: link.href,
        texto: link.innerText || link.textContent || '',
        titulo: link.getAttribute('title') || ''
      }))
      .filter((link, index, all) => link.url && all.findIndex(item => item.url === link.url) === index);
    const preview = container.querySelector('[data-testid="link-preview-container"]');
    const vistaPrevia = preview ? {
      titulo: preview.querySelector('[data-testid="link-preview-title"]')?.innerText || '',
      descripcion: preview.querySelector('[data-testid="link-description"]')?.innerText || '',
      dominio: preview.querySelector('[data-testid="url-element"]')?.innerText || '',
      miniatura: Boolean(preview.querySelector('img[data-testid="link-preview-thumbnail-jpeg"]'))
    } : null;
    const visibleText = `${rawContainerText} ${rawCopyableText} ${visibleMeta}`.toLocaleLowerCase();
    const estadoVisual = {
      eliminado: recalled || /this message was deleted|este mensaje fue eliminado|mensaje eliminado|se elimin(?:ó|Ã³) este mensaje/.test(visibleText),
      editado: /\b(edited|editado)\b/i.test(`${rawCopyableText} ${visibleMeta}`),
      sticker: hasStickerImage
    };
    const mensajeId = container.closest('[data-id]')?.getAttribute('data-id') || '';
    const idFallback = `meta:${metadata || visibleMeta || texto}`;
    extraidos.push({
      id_unico: mensajeId || `${idFallback}\u0000${texto}\u0000${enlaces.map(link => link.url).join('|')}`,
      mensaje_id: mensajeId || idFallback,
      autor,
      direccion,
      metadata: normalizedMetadata,
      dom_index: domIndex,
      texto: texto.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim(),
      enlaces,
      vista_previa: vistaPrevia,
      respuesta: quotedMessage ? {
        tipo: respuestaEstado ? 'estado' : 'mensaje_citado',
        autor: quotedAuthor || null,
        contenido: readRichText(quotedTextElement) || null,
        tipo_contenido: quotedType
      } : null,
      estado_visual: estadoVisual,
      adjuntos: []
    });
  });
  return extraidos;
}

module.exports = { extractVisibleMessagesFromDom };
