const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function auditarChatDestino(contactoDestino) {
  const userDataDir = path.join(__dirname, 'whatsapp_session');
  
  console.log(`🚀 Iniciando FASE 3: Extracción del chat -> ${contactoDestino}`);

  const browserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 720 },
  });

  const page = browserContext.pages().length > 0 ? browserContext.pages()[0] : await browserContext.newPage();
  page.setDefaultTimeout(120000); 

  try {
    console.log('Navegando a WhatsApp Web...');
    await page.goto('https://web.whatsapp.com/', { waitUntil: 'domcontentloaded' });
    
    await page.waitForSelector('div[data-testid="chat-list-search-container"]', { state: 'visible', timeout: 60000 });
    console.log('✅ Sesión ya iniciada.');

    // 1. Buscar al contacto
    console.log(`🔎 Buscando a: ${contactoDestino}`);
    const searchBox = page.locator('div[data-testid="chat-list-search-container"] input');
    await searchBox.click();
    await page.waitForTimeout(500);
    
    // Limpiamos y escribimos
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type(contactoDestino, { delay: 100 });
    await page.waitForTimeout(2000); // Esperar que la búsqueda reaccione

    // 2. Dar clic en el resultado exacto que tenga el nombre
    console.log(`🖱️ Haciendo clic en el resultado...`);
    const resultadoExacto = page.locator(`span[title="${contactoDestino}"]`).first();
    await resultadoExacto.waitFor({ state: 'visible', timeout: 10000 });
    await resultadoExacto.click();
    await page.waitForTimeout(2000); // Esperar a que el chat cargue a la derecha

    // 3. Identificar el panel derecho (el de los mensajes)
    console.log(`🕵️ Identificando la estructura del chat...`);
    
    // Inyectamos un script para ver cómo es la estructura de los mensajes en el panel derecho
    const DOM_Estructura = await page.evaluate(() => {
        // El panel principal derecho suele tener el ID 'main'
        const mainPanel = document.getElementById('main');
        if (!mainPanel) return "No se encontró #main";
        
        // Vamos a extraer los primeros 5 mensajes para entender sus selectores
        const mensajesDoms = Array.from(mainPanel.querySelectorAll('div[role="row"]')).slice(-5);
        
        return mensajesDoms.map(m => m.outerHTML).join('\n\n--- SEPARADOR ---\n\n');
    });

    // Guardamos la muestra del DOM para que nuestro asistente AI (yo) la pueda leer y crear los selectores correctos
    fs.writeFileSync('dom_mensajes_muestra.html', DOM_Estructura, 'utf-8');
    
    console.log('✅ Muestra del DOM de mensajes guardada en dom_mensajes_muestra.html');
    console.log('El chat fue abierto con éxito. ¡Todo listo para construir el scroller inverso!');

  } catch (error) {
    console.error('Hubo un error en la ejecución:', error);
  } finally {
    // Para depuración, no cerramos el navegador rápido
    // await browserContext.close(); 
    console.log("Manteniendo el navegador abierto para que veas el resultado.");
  }
}

// Para probar, vamos a intentar con el primer contacto de tu CSV
auditarChatDestino('welegat0💖');
