# Guía Práctica: FFmpeg + Grabación Forense y Hashing de Integridad

> La integración activa vive en `src/capture/desktop_recorder.js` y
> `fase3_extractor_real.js`. Esta guía conserva fundamentos y comandos de
> diagnóstico; no implica que el flujo de WhatsApp esté validado de extremo a
> extremo.

Este documento cubre el **siguiente paso inmediato** de la Fase Web: integrar grabación de video real y verificación de integridad a los scripts de auditoría de WhatsApp Web.

---

## 1. ¿Por Qué No Usar la Grabación Nativa de Playwright?

Playwright tiene una función integrada de grabación:
```javascript
const context = await browser.newContext({ recordVideo: { dir: './videos/' } });
```

**El problema:** Este método guarda el video en un buffer en RAM y lo escribe al disco **solo cuando cierras el contexto**. Si la sesión dura 3 horas y el navegador crashea (Aw, Snap! de Chromium), **pierdes el video completo**. No hay recovery.

**La solución:** FFmpeg externo captura la pantalla a nivel del sistema operativo, independientemente de lo que haga el navegador. Si Playwright explota, FFmpeg sigue grabando.

---

## 2. Instalación de FFmpeg en Windows

### Opción A: Winget (Recomendada, 1 comando)
```powershell
winget install -e --id Gyan.FFmpeg
```

### Opción B: Manual
1.  Ve a `https://ffmpeg.org/download.html` → Windows → gyan.dev builds.
2.  Descarga `ffmpeg-release-essentials.zip`.
3.  Extrae a `C:\ffmpeg\`.
4.  Agrega `C:\ffmpeg\bin` al PATH del sistema (Variables de entorno).
5.  Verifica: `ffmpeg -version` en CMD.

### Verificación
```bash
ffmpeg -version
# Debe mostrar: ffmpeg version 6.x.x ...
```

---

## 3. Grabar la Pantalla con FFmpeg (Comandos Clave)

FFmpeg captura la pantalla usando el driver `gdigrab` en Windows (o `x11grab` en Linux).

### Comando Básico de Grabación
```bash
ffmpeg -f gdigrab -framerate 15 -i desktop -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p output.mp4
```

**Desglose de parámetros:**
| Parámetro | Valor | Explicación |
|---|---|---|
| `-f gdigrab` | Windows | Driver de captura de pantalla en Windows |
| `-framerate 15` | 15 FPS | Suficiente para scroll de texto. 30 FPS duplica el tamaño |
| `-i desktop` | Pantalla completa | Puede ser `title=WhatsApp` para capturar solo esa ventana |
| `-c:v libx264` | H.264 | Codec estándar, compatible con todo |
| `-preset ultrafast` | Más rápido | Prioriza velocidad de codificación sobre tamaño de archivo |
| `-crf 28` | Calidad media | 0=sin pérdida, 51=peor calidad. 28 es buen balance |
| `-pix_fmt yuv420p` | Compatibilidad | Evita H.264 4:4:4, que algunos reproductores de Windows no abren |

### Capturar Solo la Ventana de Chrome (Más Limpio)
```bash
ffmpeg -f gdigrab -framerate 15 -i title="WhatsApp - Google Chrome" -c:v libx264 -preset ultrafast -crf 28 -pix_fmt yuv420p contacto_juan.mp4
```

> **Secreto:** El valor de `-i title=` debe ser exactamente el título de la ventana de Windows. Puedes verlo en la barra de título del navegador. Si Chrome cambia el título mientras graba, FFmpeg seguirá grabando con el último título encontrado.

---

## 4. Grabación Segmentada (Anti-Corrupción de Video)

Para auditorías largas (2-6 horas), dividir el video en segmentos de 15 minutos protege contra corrupción:

```bash
ffmpeg -f gdigrab -framerate 15 -i desktop \
  -c:v libx264 -preset ultrafast -crf 28 \
  -pix_fmt yuv420p \
  -f segment -segment_time 900 -segment_format mp4 \
  -segment_format_options movflags=+faststart \
  -reset_timestamps 1 \
  "Auditorias/Juan_Perez/video_parte_%03d.mp4"
```

**Resultado:** Genera archivos como:
```
video_parte_000.mp4  (minutos 0-15)
video_parte_001.mp4  (minutos 15-30)
video_parte_002.mp4  (minutos 30-45)
```

Si el proceso falla a los 47 minutos, tienes los primeros 3 segmentos perfectos. Solo pierdes los últimos 2 minutos.

---

## 5. Integración con Node.js / Playwright (El Código Real)

La clave es lanzar FFmpeg como un **proceso hijo** desde Node.js usando `child_process.spawn`. Así Playwright y FFmpeg corren en paralelo.

```javascript
const { spawn } = require('child_process');
const path = require('path');

/**
 * Inicia la grabación de pantalla con FFmpeg.
 * @param {string} outputPath - Ruta completa del archivo de salida (sin extensión).
 * @returns {ChildProcess} - El proceso de FFmpeg para poder detenerlo.
 */
function iniciarGrabacion(outputPath) {
  const args = [
    '-f', 'gdigrab',
    '-framerate', '15',
    '-i', 'desktop',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-pix_fmt', 'yuv420p',
    '-f', 'segment',
    '-segment_time', '900',  // 15 minutos por segmento
    '-segment_format', 'mp4',
    '-segment_format_options', 'movflags=+faststart',
    '-reset_timestamps', '1',
    `${outputPath}_parte_%03d.mp4`
  ];

  const procesoFFmpeg = spawn('ffmpeg', args, {
    stdio: ['pipe', 'pipe', 'pipe'] // Capturamos stderr de FFmpeg
  });

  procesoFFmpeg.stderr.on('data', (data) => {
    // FFmpeg escribe su log en stderr, no en stdout. Esto es normal.
    // console.log(`[FFmpeg]: ${data}`); // Descomentar para debug
  });

  console.log(`[GRABACION] Iniciada para: ${path.basename(outputPath)}`);
  return procesoFFmpeg;
}

/**
 * Detiene la grabación enviando 'q' (quit graceful) a FFmpeg.
 * Esto es CRÍTICO: no uses .kill() porque corrompe el video final.
 * @param {ChildProcess} proceso - El proceso de FFmpeg a detener.
 */
function detenerGrabacion(proceso) {
  return new Promise((resolve) => {
    proceso.stdin.write('q'); // Señal de cierre graceful
    proceso.on('close', () => {
      console.log('[GRABACION] Detenida y archivo guardado correctamente.');
      resolve();
    });
    // Timeout de seguridad: si FFmpeg no cierra en 10s, forzar
    setTimeout(() => {
      proceso.kill('SIGTERM');
      resolve();
    }, 10000);
  });
}

// --- USO EN EL SCRIPT PRINCIPAL ---
async function auditarContacto(nombre, page) {
  const carpetaContacto = `./Auditorias/${nombre}`;
  const rutaVideo = `${carpetaContacto}/grabacion`;

  // 1. Iniciar grabación ANTES de navegar al chat
  const ffmpeg = iniciarGrabacion(rutaVideo);

  // 2. Tu lógica de Playwright aquí (scroll, extracción, etc.)
  await page.waitForTimeout(2000); // Dale 2s a FFmpeg para iniciar
  // ... tu código de extracción ...

  // 3. Detener grabación DESPUÉS de que el scroll terminó
  await detenerGrabacion(ffmpeg);
}
```

---

## 6. Hashing de Integridad (SHA-256): El Sello Notarial Digital

Un hash SHA-256 es la "huella digital" de un archivo. Si el archivo cambia aunque sea 1 byte, el hash cambia completamente. Esto **prueba que el video no fue editado** después de la auditoría.

### ¿Qué es SHA-256?
*   Es un algoritmo criptográfico que convierte cualquier archivo en una cadena de 64 caracteres hexadecimales.
*   Ejemplo: `e3b0c44298fc1c149afbf4c8996fb924...` (64 caracteres).
*   **Es irreversible:** No puedes recuperar el archivo original desde el hash.
*   **Es determinista:** El mismo archivo siempre produce el mismo hash.

### Generar el Hash en Node.js
```javascript
const crypto = require('crypto');
const fs = require('fs');

/**
 * Genera el hash SHA-256 de un archivo y lo guarda en un .txt al lado del archivo.
 * @param {string} rutaArchivo - Ruta al archivo a hashear (ej. video_parte_000.mp4)
 */
async function generarHashIntegridad(rutaArchivo) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(rutaArchivo);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => {
      const hashHex = hash.digest('hex');
      const rutaHash = `${rutaArchivo}.sha256.txt`;
      const contenido = `SHA-256: ${hashHex}\nArchivo: ${rutaArchivo}\nGenerado: ${new Date().toISOString()}\n`;

      fs.writeFileSync(rutaHash, contenido);
      console.log(`[HASH] ${rutaArchivo} → ${hashHex.substring(0, 12)}...`);
      resolve(hashHex);
    });
    stream.on('error', reject);
  });
}
```

### Verificar el Hash (Para el Auditor / Abogado)
```bash
# En Windows PowerShell:
Get-FileHash .\video_parte_000.mp4 -Algorithm SHA256

# En Linux/Mac:
sha256sum video_parte_000.mp4
```
El resultado debe coincidir **byte por byte** con el contenido del `.sha256.txt` generado en el momento de la auditoría.

---

## 7. Estructura Final de Carpetas por Contacto

```
/Auditorias/
  └── Juan_Perez_2024-05-03/
      ├── historial_completo.csv          ← Datos extraídos del DOM
      ├── /grabacion/
      │   ├── video_parte_000.mp4         ← Video segmento 1 (0-15 min)
      │   ├── video_parte_000.mp4.sha256.txt
      │   ├── video_parte_001.mp4         ← Video segmento 2 (15-30 min)
      │   ├── video_parte_001.mp4.sha256.txt
      │   └── ffmpeg.log                  ← Diagnóstico de captura
      ├── manifiesto_auditoria.json       ← Metadatos (fecha, duración, nº mensajes)
      └── /Multimedia/
          ├── img_001.jpg
          └── audio_003.ogg
```

### El `manifiesto_auditoria.json` (El Registro Oficial)
```json
{
  "contacto": "Juan Perez",
  "fecha_inicio": "2024-05-03T08:15:30.000Z",
  "fecha_fin": "2024-05-03T10:42:11.000Z",
  "total_mensajes_extraidos": 1847,
  "mensaje_mas_antiguo": "2021-03-15T14:22:00.000Z",
  "mensaje_mas_reciente": "2024-05-02T23:11:00.000Z",
  "archivos_video": [
    { "archivo": "grabacion/video_parte_000.mp4", "sha256": "e3b0c44298fc1c..." },
    { "archivo": "grabacion/video_parte_001.mp4", "sha256": "a665a45920422f..." }
  ],
  "herramienta": "Playwright v1.43 + FFmpeg 6.1",
  "operador": "Auditoría automatizada"
}
```

---

## 8. Próximos Pasos

1.  Instalar FFmpeg: `winget install -e --id Gyan.FFmpeg`
2.  Probar la grabación básica: `ffmpeg -f gdigrab -framerate 15 -i desktop -t 10 -c:v libx264 -pix_fmt yuv420p test.mp4`
3.  Integrar `iniciarGrabacion()` y `detenerGrabacion()` en `2_auditoria_masiva.js`.
4.  Agregar `generarHashIntegridad()` al final de cada contacto auditado.
