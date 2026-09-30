const assert = require('node:assert/strict');
const test = require('node:test');

const {
  normalizeConversationTarget,
  conversationKey,
  mergeConversationCatalog
} = require('../fase3_extractor_real');

test('normaliza una conversacion heredada recibida como nombre', () => {
  assert.deepEqual(normalizeConversationTarget('  +52 555 000 0000  '), {
    name: '+52 555 000 0000',
    id: null,
    source: 'legacy',
    kind: 'conversation'
  });
});

test('fusiona una conversacion repetida y conserva sus fuentes', () => {
  const catalog = mergeConversationCatalog([
    { name: 'Grupo de prueba', id: '123@g.us', source: 'recent', kind: 'group' },
    { name: 'Grupo de prueba', id: '123@g.us', source: 'archived', kind: 'group' }
  ]);

  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0].sources, ['recent', 'archived']);
  assert.equal(catalog[0].kind, 'group');
});

test('deduplica nombres sin id de forma insensible a mayusculas', () => {
  const catalog = mergeConversationCatalog([
    { name: 'Contacto de prueba', source: 'recent' },
    { name: ' contacto DE PRUEBA ', source: 'archived' }
  ]);

  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0].sources, ['recent', 'archived']);
  assert.equal(conversationKey(catalog[0]), 'name:contacto de prueba');
});
