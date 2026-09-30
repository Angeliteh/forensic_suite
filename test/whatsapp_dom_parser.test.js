const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');

const { extractVisibleMessagesFromDom } = require('../src/platform/web/whatsapp/message_dom_parser');
const { extractVisibleMediaFromDom } = require('../src/platform/web/whatsapp/media_dom_parser');

test('extrae mensajes mixtos, citas, grupos, emojis, eliminados y stickers desde un fixture DOM', async (t) => {
  let browser;
  try {
    browser = await chromium.launch({
      channel: process.env.FORENSIC_BROWSER_CHANNEL || 'msedge',
      headless: true
    });
  } catch (error) {
    t.skip(`No hay un navegador Playwright disponible para el fixture DOM: ${error.message}`);
    return;
  }

  try {
    const page = await browser.newPage();
    const fixturePath = path.join(__dirname, 'fixtures', 'whatsapp', 'messages_mixed.html');
    await page.setContent(fs.readFileSync(fixturePath, 'utf8'));
    const selectedContent = {
        includeText: true,
        includeImages: true,
        includeVideos: true,
        includeAudio: true,
        includeStickers: true
    };
    const messages = await page.evaluate(extractVisibleMessagesFromDom, {
      selectedContent,
      knownOwnAuthors: ['nexo invitaciones']
    });

    assert.equal(messages.length, 6);
    assert.equal(messages.find(message => message.mensaje_id === 'incoming-1').direccion, 'entrante');
    assert.equal(messages.find(message => message.mensaje_id === 'outgoing-1').direccion, 'saliente');
    assert.equal(messages.find(message => message.mensaje_id === 'group-1').autor, 'Carlos');
    assert.equal(messages.find(message => message.mensaje_id === 'outgoing-1').respuesta.contenido, 'Mensaje citado');
    assert.equal(messages.find(message => message.mensaje_id === 'emoji-1').texto, '🙂');
    assert.equal(messages.find(message => message.mensaje_id === 'deleted-1').estado_visual.eliminado, true);
    assert.equal(messages.find(message => message.mensaje_id === 'sticker-1').estado_visual.sticker, true);

    await page.locator('img[src^="blob:"]').evaluate(image => {
      Object.defineProperty(image, 'naturalWidth', { value: 100 });
    });
    const media = await page.evaluate(extractVisibleMediaFromDom, selectedContent);
    assert.deepEqual(media.map(item => item.tipo).sort(), ['audio', 'sticker', 'video']);
    assert.equal(media.find(item => item.tipo === 'sticker').direccion, 'entrante');
  } finally {
    await browser.close();
  }
});
