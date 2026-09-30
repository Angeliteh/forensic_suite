const { chromium } = require('playwright');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ==========================================
// CONFIGURACIÓN GLOBAL (Heredada y Mejorada)
// ==========================================
const USER_DATA_DIR = path.join(__dirname, 'whatsapp_session');
const OUTPUT_DIR = path.join(__dirname, 'Auditorias');
const ARCHIVO_INDICE = 'master_index.csv';

// ==========================================
// ⚠️ MODO PRUEBA: LÍMITE DE SCROLL
// Cambia este número para controlar cuántas
// "tandas" de scroll sube por cada chat.
// ~15 iteraciones = últimos ~100-200 mensajes.
// Pon Infinity para subir hasta el inicio completo.
// ==========================================
const MAX_SCROLL_ITERACIONES = 2;

// Helpers para pausas humanas
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = async (min = 800, max = 2100) => {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  await delay(ms);
};

// ==========================================
// 🎬 HELPERS DE GRABACIÓN (FFmpeg)
// ==========================================

/**
 * Inicia la grabación de pantalla con FFmpeg en modo segmentado.
 * Cada segmento dura SEGMENT_DURACION_SEG segundos para evitar corrupción.
 * @param {string} rutaBase - Ruta base sin extensión (ej: ./Auditorias/Juan/grabacion)
 * @returns {ChildProcess} Proceso de FFmpeg para detenerlo después.
 */
const SEGMENT_DURACION_SEG = 900; // 15 minutos por segmento

function iniciarGrabacion(rutaBase) {
  const args = [
    '-f', 'gdigrab',
    '-framerate', '15',
    '-i', 'desktop',
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-crf', '28',
    '-f', 'segment',
    '-segment_time', String(SEGMENT_DURACION_SEG),
    '-segment_format', 'mp4',
    '-reset_timestamps', '1',
    `${rutaBase}_parte_%03d.mp4`
  ];

  const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'ignore', 'ignore'] });
  proc.on('error', (err) => {
    if (err.code === 'ENOENT') {
      console.error('\n❌ FFmpeg no encontrado. Instálalo con: winget install -e --id Gyan.FFmpeg');
    }
  });
  console.log(`🎬 Grabación iniciada → ${path.basename(rutaBase)}_parte_000.mp4 ...`);
  return proc;
}

/**
 * Detiene FFmpeg de forma limpia enviando 'q' (graceful quit).
 * NUNCA usar .kill() porque corrompe el video final.
 */
function detenerGrabacion(proc) {
  return new Promise((resolve) => {
    if (!proc || proc.exitCode !== null) { resolve(); return; }
    proc.stdin.write('q');
    proc.on('close', () => { resolve(); });
    // Timeout de seguridad: forzar si no cierra en 8s
    setTimeout(() => { try { proc.kill('SIGTERM'); } catch (_) { } resolve(); }, 8000);
  });
}

/**
 * Genera el hash SHA-256 de un archivo y lo escribe en un .sha256.txt al lado.
 * @param {string} rutaArchivo - Ruta al archivo a hashear.
 * @returns {Promise<string>} El hash en hexadecimal.
 */
function generarHash(rutaArchivo) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(rutaArchivo)) { resolve('archivo_no_encontrado'); return; }
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(rutaArchivo);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => {
      const hex = hash.digest('hex');
      const contenido = `SHA-256: ${hex}\nArchivo: ${path.basename(rutaArchivo)}\nGenerado: ${new Date().toISOString()}\n`;
      fs.writeFileSync(`${rutaArchivo}.sha256.txt`, contenido);
      resolve(hex);
    });
    stream.on('error', reject);
  });
}

// ==========================================
// LÓGICA PRINCIPAL DEL AUTÓMATA
// ==========================================
(async () => {
  console.log(`\n=============================================`);
  console.log(`🚀 INICIANDO FASE 3: AUDITORÍA MASIVA FORENSE`);
  console.log(`=============================================\n`);

  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  // 1. Leer los contactos que vamos a auditar
  if (!fs.existsSync(ARCHIVO_INDICE)) {
    console.error(`❌ No se encontró ${ARCHIVO_INDICE}. Por favor corre index.js primero (Fase 1).`);
    return;
  }

  const csvDatos = fs.readFileSync(ARCHIVO_INDICE, 'utf-8').split('\n').filter(line => line.trim() !== '');
  // Omitimos la cabecera
  const contactos = csvDatos.slice(1).map(line => {
    const cols = line.split(',');
    return cols[0]; // El nombre está en la primera columna
  });

  console.log(`📋 Se encontraron ${contactos.length} contactos para auditar.`);
  // PARA PRUEBAS: Solo vamos a auditar a los primeros 2 contactos para no tardar horas
  const contactosPrueba = contactos.slice(0, 2);
  console.log(`⚠️ MODO PRUEBA: Solo auditaremos a los primeros ${contactosPrueba.length}: ${contactosPrueba.join(', ')}\n`);

  const browserContext = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = browserContext.pages().length > 0 ? browserContext.pages()[0] : await browserContext.newPage();
  page.setDefaultTimeout(120000);

  try {
    console.log('Navegando a WhatsApp Web...');
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('div[data-testid="chat-list-search-container"]', { state: 'visible', timeout: 60000 });
    console.log('✅ Sesión iniciada y sincronizada.\n');

    // 2. Bucle Principal por Contacto
    for (let i = 0; i < contactosPrueba.length; i++) {
      const nombreContacto = contactosPrueba[i];
      console.log(`\n---------------------------------------------`);
      console.log(`🎯 AUDITANDO CONTACTO [${i + 1}/${contactosPrueba.length}]: ${nombreContacto}`);
      console.log(`---------------------------------------------`);

      // Carpeta individual para las evidencias
      const carpetaContacto = path.join(OUTPUT_DIR, nombreContacto.replace(/[^a-zA-Z0-9]/g, '_'));
      if (!fs.existsSync(carpetaContacto)) fs.mkdirSync(carpetaContacto);
      const carpetaMultimedia = path.join(carpetaContacto, 'Multimedia');
      if (!fs.existsSync(carpetaMultimedia)) fs.mkdirSync(carpetaMultimedia);

      // --- A. Búsqueda y Selección ---
      const searchBox = page.locator('div[data-testid="chat-list-search-container"] input');
      await searchBox.click();
      await randomDelay();
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.keyboard.type(nombreContacto, { delay: 100 });
      await randomDelay(1500, 2500);

      // Clic en el resultado exacto
      const resultadoExacto = page.locator(`span[title="${nombreContacto}"]`).first();
      if (await resultadoExacto.count() === 0) {
        console.log(`⚠️ No se encontró el contacto ${nombreContacto}. Saltando...`);
        await page.keyboard.press('Escape'); // Limpiar búsqueda
        continue;
      }

      await resultadoExacto.click();
      await randomDelay(2000, 3000); // Esperar que cargue el panel derecho

      // --- B. Iniciar Grabación de Pantalla ---
      const rutaGrabacion = path.join(carpetaContacto, 'grabacion');
      const procesoFFmpeg = iniciarGrabacion(rutaGrabacion);
      await delay(2000); // Darle 2s a FFmpeg para que arranque antes del scroll
      console.log(`⏳ Iniciando scroll inverso para extracción...`);
      let mensajesExtraidos = new Map();
      let scrollIntentsSincambios = 0;
      let iteracion = 0;
      let contadorMedia = 0;          // Contador para nombrar archivos multimedia
      const blobsDescargados = new Set(); // Evitar descargar el mismo blob dos veces

      while (scrollIntentsSincambios < 2 && iteracion < MAX_SCROLL_ITERACIONES) {
        iteracion++;

        // 1. Extraer mensajes de la pantalla
        const nuevosMensajes = await page.evaluate(() => {
          const contenedores = document.querySelectorAll('div[data-testid="msg-container"]');
          let extraidos = [];
          contenedores.forEach(container => {
            const copyable = container.querySelector('.copyable-text[data-pre-plain-text]');
            if (!copyable) return;
            const metadata = copyable.getAttribute('data-pre-plain-text');
            const textElement = copyable.querySelector('span[data-testid="selectable-text"] span');
            const texto = textElement ? textElement.innerText : '[Multimedia/Audio/Sticker]';
            extraidos.push({
              id_unico: metadata + texto,
              metadata: metadata.replace('\n', ' ').trim(),
              texto: texto.replace(/\n/g, ' ')
            });
          });
          return extraidos;
        });

        // 2. Revisar si hay nuevos
        let countNuevos = 0;
        for (const m of nuevosMensajes) {
          if (!mensajesExtraidos.has(m.id_unico)) {
            mensajesExtraidos.set(m.id_unico, m);
            countNuevos++;
          }
        }

        if (countNuevos === 0) {
          scrollIntentsSincambios++;
        } else {
          scrollIntentsSincambios = 0; // Reseteamos el contador porque sí hubo actividad
        }

        process.stdout.write(`\r   -> Iteración ${iteracion} | Msgs: ${mensajesExtraidos.size} | Media: ${contadorMedia} | Vacíos: ${scrollIntentsSincambios}/4`);

        // 2b. Descargar multimedia visible en pantalla (blobs activos)
        const elementosMedia = await page.evaluate(() => {
          const items = [];
          // Imágenes
          document.querySelectorAll('div[data-testid="msg-container"] img[src^="blob:"]').forEach(img => {
            if (img.naturalWidth > 10) // Ignorar íconos pequeños
              items.push({ url: img.src, tipo: 'imagen' });
          });
          // Audios
          document.querySelectorAll('div[data-testid="msg-container"] audio[src^="blob:"]').forEach(audio => {
            items.push({ url: audio.src, tipo: 'audio' });
          });
          // Videos
          document.querySelectorAll('div[data-testid="msg-container"] video[src^="blob:"]').forEach(video => {
            items.push({ url: video.src, tipo: 'video' });
          });
          return items;
        });

        for (const media of elementosMedia) {
          if (blobsDescargados.has(media.url)) continue; // Ya lo tenemos
          blobsDescargados.add(media.url);

          try {
            // Fetch del blob desde dentro del navegador y transferir bytes a Node.js
            const bytes = await page.evaluate(async (blobUrl) => {
              try {
                const res = await fetch(blobUrl);
                const buf = await res.arrayBuffer();
                return { ok: true, data: Array.from(new Uint8Array(buf)), type: res.headers.get('content-type') || '' };
              } catch (e) {
                return { ok: false };
              }
            }, media.url);

            if (!bytes.ok || bytes.data.length === 0) continue;

            // Determinar extensión
            const ext = bytes.type.includes('jpeg') || bytes.type.includes('jpg') ? 'jpg'
              : bytes.type.includes('png') ? 'png'
                : bytes.type.includes('webp') ? 'webp'
                  : bytes.type.includes('mp4') ? 'mp4'
                    : bytes.type.includes('ogg') ? 'ogg'
                      : bytes.type.includes('mp3') ? 'mp3'
                        : media.tipo === 'imagen' ? 'jpg'
                          : media.tipo === 'audio' ? 'ogg' : 'bin';

            contadorMedia++;
            const nombreArchivo = `${String(contadorMedia).padStart(3, '0')}_${media.tipo}.${ext}`;
            fs.writeFileSync(path.join(carpetaMultimedia, nombreArchivo), Buffer.from(bytes.data));
          } catch (_) { /* blob expirado, ignorar */ }
        }

        // 3. Simulación Humana de Scroll
        const mensajesLocator = page.locator('div[data-testid="conversation-panel-messages"]');
        const box = await mensajesLocator.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, -4000);
        }

        // Clic en "Cargar mensajes antiguos" si aparece
        const btnOlder = page.locator('button:has-text("older messages")');
        if (await btnOlder.count() > 0) {
          await btnOlder.first().click();
          await randomDelay(2000, 3000);
        }

        await randomDelay(800, 1800);
      }

      const razonParo = iteracion >= MAX_SCROLL_ITERACIONES
        ? `⏹️  L\u00edmite de prueba alcanzado (${MAX_SCROLL_ITERACIONES} iteraciones)`
        : `✅ Fin real del chat alcanzado`;
      console.log(`\n${razonParo} para: ${nombreContacto} | Total mensajes: ${mensajesExtraidos.size}`);

      // --- C. Guardar Evidencia (Ordenada Cronológicamente) ---
      // Parsear el timestamp del formato "[HH:MM, M/D/YYYY] Autor:"
      const parsearFecha = (metadata) => {
        const match = metadata.match(/\[(\d+):(\d+),\s*(\d+)\/(\d+)\/(\d+)\]/);
        if (!match) return 0;
        const [, hh, mm, mes, dia, anio] = match;
        return new Date(anio, mes - 1, dia, hh, mm).getTime();
      };

      // Convertir Map a Array, ordenar por fecha ascendente y escribir
      const mensajesOrdenados = Array.from(mensajesExtraidos.values())
        .sort((a, b) => parsearFecha(a.metadata) - parsearFecha(b.metadata));

      let csvContent = "Metadatos (Hora/Autor),Mensaje\n";
      mensajesOrdenados.forEach(m => {
        csvContent += `"${m.metadata}","${m.texto}"\n`;
      });
      const archivoCsv = path.join(carpetaContacto, 'historial_completo.csv');
      fs.writeFileSync(archivoCsv, "\uFEFF" + csvContent, 'utf-8');
      console.log(`💾 Guardado en: ${archivoCsv} (${mensajesOrdenados.length} mensajes ordenados)`);

      // --- D. Detener Grabación y Generar Hashes ---
      console.log('⏹️  Deteniendo grabación de pantalla...');
      await detenerGrabacion(procesoFFmpeg);

      // Buscar todos los segmentos de video generados y hashearlos
      const segmentos = fs.readdirSync(carpetaContacto)
        .filter(f => f.endsWith('.mp4'))
        .map(f => path.join(carpetaContacto, f));

      if (segmentos.length > 0) {
        console.log(`🔐 Generando hashes SHA-256 para ${segmentos.length} segmento(s)...`);
        for (const seg of segmentos) {
          const hex = await generarHash(seg);
          console.log(`   ✅ ${path.basename(seg)} → ${hex.substring(0, 16)}...`);
        }
      } else {
        console.log('⚠️  No se encontraron segmentos de video (FFmpeg puede no estar instalado).');
      }

      // --- E. Prevención de Crash (F5 Limpieza de RAM) ---
      console.log(`🧹 Refrescando WhatsApp para liberar RAM...`);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForSelector('div[data-testid="chat-list-search-container"]', { state: 'visible', timeout: 60000 });
      await randomDelay();
    }

    console.log('\n🎉 AUDITORÍA MASIVA FINALIZADA. Revisa la carpeta "Auditorias".');

  } catch (error) {
    console.error('Error fatal durante la auditoría:', error);
  } finally {
    // await browserContext.close();
  }
})();
