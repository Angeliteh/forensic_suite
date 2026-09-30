# Guía: WhatsApp Web — Grupos, Multimedia y Casos Especiales del DOM

Este documento cubre los casos que el script base (`2_auditoria_masiva.js`) NO maneja correctamente y que romperán la extracción si los ignoras.

---

## 1. El Problema: La Estructura del DOM Cambia por Tipo de Mensaje

El parser actual funciona perfectamente para mensajes de texto en chats individuales porque todos tienen el atributo:
```
data-pre-plain-text="[HH:MM, DD/MM/YYYY] Nombre: "
```

Sin embargo, WhatsApp tiene al menos **8 tipos de nodos diferentes** en el DOM que no siguen esta estructura. Ignorarlos causa gaps en el historial.

---

## 2. Mensajes en Grupos (La Gran Diferencia)

### ¿Cómo cambia el DOM?
En un chat grupal, el `data-pre-plain-text` sigue existiendo, pero el **remitente cambia en cada mensaje**:
```
data-pre-plain-text="[10:32, 15/05/2023] +52 664 123 4567: "
data-pre-plain-text="[10:33, 15/05/2023] María García: "
data-pre-plain-text="[10:35, 15/05/2023] Carlos López: "
```

El parser actual ya extrae esto correctamente siempre que lea el atributo completo.

### El Problema Real: Mensajes de Sistema del Grupo
WhatsApp inserta mensajes de sistema que **no son de ningún usuario**:
```html
<div class="message-system">
  <span>Carlos López fue añadido</span>
</div>

<div class="message-system">
  <span>Cambiaste el ícono del grupo</span>
</div>
```

Estos nodos **no tienen** `data-pre-plain-text`. El parser los ignora silenciosamente, creando un gap. Para captarlos:

```javascript
// Detectar mensajes de sistema del grupo
const mensajesSistema = await page.$$eval(
  '[data-testid="msg-container"] .message-system span',
  (elements) => elements.map(el => ({
    tipo: 'SISTEMA',
    texto: el.innerText,
    timestamp: null, // Los mensajes de sistema no tienen timestamp exacto
  }))
);
```

---

## 3. Mensajes Eliminados: "Este mensaje fue eliminado"

### ¿Cómo se ve en el DOM?
```html
<div data-testid="msg-container">
  <div class="deleted-message">
    <span>Este mensaje fue eliminado</span>
  </div>
</div>
```

### Por qué es importante para una auditoría forense
Un mensaje eliminado **sigue siendo evidencia**. Saber que existió un mensaje (aunque no sepas el contenido) puede ser relevante legalmente.

### Cómo detectarlo en el script
```javascript
// Dentro de tu función de extracción de mensajes
const esEliminado = await nodo.$('[data-testid="msg-container"] .deleted-message');
if (esEliminado) {
  return {
    fecha: timestamp,
    autor: autor,
    texto: '[MENSAJE ELIMINADO]',
    tipo: 'eliminado'
  };
}
```

---

## 4. Mensajes de Voz y Audio

### Problema actual
El script registra `[Multimedia/Audio/Sticker]` para cualquier cosa que no sea texto. Pero un audio de voz es muy diferente a una foto — en términos forenses, uno puede contener conversaciones importantes.

### Lo que WhatsApp pone en el DOM para audios
```html
<audio src="blob:https://web.whatsapp.com/abc-123-def" preload="none">
</audio>
```

### Estrategia de captura
```javascript
// Detectar mensajes de audio
const esAudio = await nodo.$('audio');
if (esAudio) {
  const srcBlob = await esAudio.getAttribute('src');

  // Los blobs son temporales (solo válidos en la sesión actual)
  // Para descargar el audio, debemos interceptar la petición de red
  return {
    fecha: timestamp,
    autor: autor,
    texto: `[AUDIO DE VOZ] blob: ${srcBlob}`,
    tipo: 'audio'
  };
}
```

> **El problema del `blob:`:** Los URLs de tipo `blob:` son temporales. Solo existen mientras la pestaña del navegador está abierta. Para descargar el audio real debes interceptar la petición de red con Playwright:

```javascript
// Interceptar descargas de medios antes de que lleguen al DOM
page.on('response', async (response) => {
  if (response.url().includes('mmg.whatsapp.net') &&
      response.headers()['content-type']?.includes('audio')) {
    const buffer = await response.body();
    fs.writeFileSync(`./Multimedia/audio_${Date.now()}.ogg`, buffer);
  }
});
```

---

## 5. Mensajes en Respuesta (Reply / Cita)

### El DOM de un mensaje con cita
```html
<div data-pre-plain-text="[11:20, 03/05/2024] Juan: ">
  <!-- El mensaje citado aparece primero, como una caja especial -->
  <div class="quoted-message">
    <span class="quoted-author">María</span>
    <span class="quoted-text">¿Puedes venir mañana?</span>
  </div>
  <!-- El mensaje real del emisor -->
  <span class="selectable-text">Sí, a las 3pm</span>
</div>
```

### Cómo extraer la cita correctamente
```javascript
// Dentro del procesamiento de cada mensaje
const citaElement = await nodo.$('.quoted-message');
let mensajeCitado = null;

if (citaElement) {
  const autorCita = await citaElement.$eval(
    '.quoted-author', el => el.innerText
  ).catch(() => 'Desconocido');

  const textoCita = await citaElement.$eval(
    '.quoted-text', el => el.innerText
  ).catch(() => '[Multimedia citado]');

  mensajeCitado = `[En respuesta a ${autorCita}: "${textoCita}"]`;
}

// El texto final del mensaje incluye la referencia a la cita
const textoFinal = mensajeCitado
  ? `${mensajeCitado}\n${textoMensaje}`
  : textoMensaje;
```

---

## 6. Reacciones con Emojis

WhatsApp agregó reacciones (como en Facebook/Telegram). Estas son nuevas en el DOM y pocas guías las documentan.

### Cómo se ven en el DOM
```html
<div data-testid="msg-reaction-list">
  <span class="emoji-reaction">❤️ 3</span>
  <span class="emoji-reaction">😂 1</span>
</div>
```

### Cómo capturarlas
```javascript
const reacciones = await nodo.$$eval(
  '[data-testid="msg-reaction-list"] span',
  elements => elements.map(el => el.innerText).join(', ')
).catch(() => '');

// Agrega al registro del mensaje:
// "reacciones": "❤️ 3, 😂 1"
```

---

## 7. Imágenes: Captura y Descarga

### El problema del Lazy Loading en imágenes
WhatsApp muestra una miniatura borrosa hasta que el usuario hace scroll hacia ella. El DOM muestra un `<img>` con `src` vacío o con una imagen en baja resolución.

### Estrategia correcta (esperar a que cargue)
```javascript
// Hacer hover sobre la imagen para forzar la carga del src real
await imagenElement.hover();
await page.waitForFunction(
  (img) => img.src && !img.src.startsWith('data:image/gif'), // Gif base64 = placeholder
  imagenElement,
  { timeout: 5000 }
);

// Ahora el src tiene la URL blob real
const blobUrl = await imagenElement.getAttribute('src');
```

### Descargar la imagen desde el blob
```javascript
// Ejecutar en el contexto del navegador para convertir blob a ArrayBuffer
const imageBuffer = await page.evaluate(async (blobUrl) => {
  const response = await fetch(blobUrl);
  const buffer = await response.arrayBuffer();
  return Array.from(new Uint8Array(buffer));
}, blobUrl);

// Escribir al disco desde Node.js
fs.writeFileSync(
  `./Multimedia/img_${Date.now()}.jpg`,
  Buffer.from(imageBuffer)
);
```

---

## 8. Resumen: Tabla de Tipos de Mensaje y Estrategia

| Tipo de Mensaje | ¿El parser actual lo captura? | Estrategia |
|---|---|---|
| Texto normal (individual) | ✅ Sí | `data-pre-plain-text` |
| Texto en grupo | ✅ Sí | `data-pre-plain-text` (mismo atributo) |
| Mensajes de sistema del grupo | ❌ No | Selector `.message-system` |
| Mensaje eliminado | ❌ No (lo ignora) | Selector `.deleted-message` |
| Audio de voz | ⚠️ Parcial (solo `[Multimedia]`) | Interceptar `response` de red |
| Foto / Imagen | ⚠️ Parcial (solo `[Multimedia]`) | Esperar lazy-load + blob fetch |
| Video | ⚠️ Parcial (solo `[Multimedia]`) | Interceptar respuesta de red |
| Mensaje con cita/reply | ❌ No captura la cita | Selector `.quoted-message` |
| Sticker | ⚠️ Parcial (solo `[Multimedia]`) | Es un `<img>` con extensión `.webp` |
| Reacciones | ❌ No | Selector `[data-testid="msg-reaction-list"]` |
| Ubicación GPS | ❌ No | El DOM tiene coordenadas en un `<a>` de Google Maps |
