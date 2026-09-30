# Roadmap Concreto: RPA para Instagram y Facebook (Appium)

Este documento convierte la teoría de los documentos anteriores en un **plan de acción técnico específico** para automatizar Instagram y Facebook vía Appium.

---

## 1. ¿Por Qué Instagram Antes que Facebook?

| Criterio | Instagram | Facebook |
|---|---|---|
| **UI** | Más predecible, menos cambios | Fragmentada (feed, grupos, marketplace) |
| **DMs** | Estructura simple y consistente | Dos apps separadas (Messenger) |
| **Detección anti-bot** | Moderada | Agresiva en acciones masivas |
| **Objetivo comercial** | DMs en frío, leads por hashtag | Grupos, Lead Ads, marketplace |
| **Recomendación** | ✅ Empezar aquí | Después de dominar IG |

---

## 2. Arquitectura del Sistema (Appium + Node.js)

### Stack Tecnológico
```
PC (Servidor de Control)
├── Node.js + WebDriverIO (cliente Appium)
├── Appium Server (puerto 4723)
└── ADB (conexión al teléfono)
        ↕ USB / WiFi ADB
Teléfono Android
└── Instagram App (app oficial, no modificada)
```

> **¿Por qué WebDriverIO en lugar de Appium Client puro?**
> WebDriverIO tiene mejor integración con el ecosistema JS/Node.js, tiene waiters automáticos más inteligentes, y su sintaxis `async/await` es más limpia. Es el wrapper recomendado en 2024-2025.

### Instalación del Entorno
```bash
# 1. Servidor Appium
npm install -g appium
appium driver install uiautomator2

# 2. Cliente WebDriverIO para Appium
npm install @wdio/cli @wdio/appium-service webdriverio
```

---

## 3. El Primer Script: Conexión y Validación del Entorno

Antes de tocar Instagram, valida que todo funcione con la Calculadora (app nativa garantizada).

```javascript
// hola_mundo_appium.js
const { remote } = require('webdriverio');

const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:deviceName': 'Android', // Puede ser cualquier string
  'appium:appPackage': 'com.android.calculator2', // La Calculadora
  'appium:appActivity': '.Calculator',
  'appium:noReset': true, // No resetear el estado de la app
};

const wdioOptions = {
  hostname: '127.0.0.1',
  port: 4723,
  logLevel: 'info',
  capabilities,
};

async function main() {
  console.log('Conectando al teléfono...');
  const driver = await remote(wdioOptions);

  // Buscar el botón "2" por su resource-id
  const boton2 = await driver.$('//android.widget.Button[@content-desc="2"]');
  await boton2.click();

  const botonSuma = await driver.$('//android.widget.Button[@content-desc="plus"]');
  await botonSuma.click();

  await boton2.click();

  const botonIgual = await driver.$('//android.widget.Button[@content-desc="equals"]');
  await botonIgual.click();

  // Leer el resultado de la pantalla
  const resultado = await driver.$('//android.widget.TextView[@resource-id="com.android.calculator2:id/result"]');
  const texto = await resultado.getText();
  console.log(`Resultado: ${texto}`); // Debe mostrar "4"

  await driver.deleteSession();
}

main();
```

---

## 4. Cómo Descubrir los `resource-id` de Instagram

Esta es la habilidad más importante. En lugar de adivinar coordenadas, usas **Appium Inspector** para escanear la UI en tiempo real.

### Paso a paso
1.  Inicia Appium Server: `appium` en la terminal.
2.  Abre **Appium Inspector** (descarga de `github.com/appium/appium-inspector`).
3.  Configura las Capabilities:
    ```json
    {
      "platformName": "Android",
      "appium:automationName": "UiAutomator2",
      "appium:appPackage": "com.instagram.android",
      "appium:appActivity": ".activity.MainTabActivity",
      "appium:noReset": true
    }
    ```
4.  Haz clic en **Start Session**.
5.  Appium Inspector toma un screenshot del teléfono y te muestra el árbol XML de la UI.
6.  **Haz clic en cualquier elemento** (ej. el botón de DMs) y en el panel derecho verás su `resource-id`.

### Resource-IDs Conocidos de Instagram (Versión Aproximada 2024)
> ⚠️ Estos IDs pueden cambiar con actualizaciones de Instagram. Siempre verificar con Appium Inspector.

| Elemento | Resource-ID |
|---|---|
| Botón de DMs (mensajes) | `com.instagram.android:id/direct_inbox_button` |
| Caja de búsqueda | `com.instagram.android:id/search_edit_text` |
| Lista de chats | `com.instagram.android:id/direct_thread_list` |
| Campo de texto del mensaje | `com.instagram.android:id/message_edit_text` |
| Botón de enviar | `com.instagram.android:id/send_button` |
| Botón de follow | `com.instagram.android:id/follow_button` |
| Corazón (like) | `com.instagram.android:id/like_button` |

---

## 5. Script de Auditoría de DMs de Instagram

```javascript
// instagram_dm_auditor.js
const { remote } = require('webdriverio');
const fs = require('fs');
const path = require('path');

const capabilities = {
  platformName: 'Android',
  'appium:automationName': 'UiAutomator2',
  'appium:appPackage': 'com.instagram.android',
  'appium:appActivity': '.activity.MainTabActivity',
  'appium:noReset': true, // Mantiene la sesión de Instagram activa
};

const wdioOptions = {
  hostname: '127.0.0.1',
  port: 4723,
  logLevel: 'warn', // Solo errores en consola
  capabilities,
};

// Delay humanizado
const esperar = (min, max) =>
  new Promise(r => setTimeout(r, Math.random() * (max - min) + min));

async function auditarDMsInstagram() {
  const driver = await remote(wdioOptions);

  // 1. Navegar a la bandeja de DMs
  const botonDMs = await driver.$('~Direct inbox'); // ~ busca por content-description
  await botonDMs.click();
  await esperar(1500, 3000);

  // 2. Obtener lista de chats
  const chats = await driver.$$('//android.widget.ListView/android.view.ViewGroup');
  console.log(`Se encontraron ${chats.length} conversaciones`);

  const historial = [];

  // 3. Iterar por cada chat
  for (const chat of chats.slice(0, 5)) { // Empezar con los primeros 5
    const nombreElemento = await chat.$('//android.widget.TextView[1]');
    const nombreChat = await nombreElemento.getText();
    console.log(`\nAuditando: ${nombreChat}`);

    await chat.click();
    await esperar(2000, 4000);

    // 4. Scroll hacia arriba para cargar historial
    let mensajesAnteriores = 0;
    let intentosSinCambio = 0;

    while (intentosSinCambio < 3) {
      // Obtener mensajes visibles
      const mensajes = await driver.$$('//android.view.ViewGroup[contains(@content-desc, "")]');
      const mensajesActuales = mensajes.length;

      if (mensajesActuales === mensajesAnteriores) {
        intentosSinCambio++;
      } else {
        intentosSinCambio = 0;
        mensajesAnteriores = mensajesActuales;
      }

      // Scroll hacia arriba (swipe de abajo a arriba en el chat)
      const { width, height } = await driver.getWindowSize();
      await driver.touchAction([
        { action: 'press', x: width / 2, y: height * 0.3 },
        { action: 'moveTo', x: width / 2, y: height * 0.8 },
        { action: 'release' }
      ]);
      await esperar(800, 1500);
    }

    // 5. Extraer mensajes del DOM
    const elementosMensajes = await driver.$$('//*[@content-desc]');
    const mensajesExtraidos = [];

    for (const elem of elementosMensajes) {
      const desc = await elem.getAttribute('content-desc');
      if (desc && desc.length > 3) { // Filtrar elementos sin contenido real
        mensajesExtraidos.push({
          chat: nombreChat,
          texto: desc,
          timestamp: new Date().toISOString()
        });
      }
    }

    historial.push(...mensajesExtraidos);

    // 6. Volver a la lista de chats
    await driver.back();
    await esperar(1000, 2000);
  }

  // 7. Guardar resultados
  const rutaSalida = `./Auditorias/Instagram_${Date.now()}.json`;
  fs.mkdirSync('./Auditorias', { recursive: true });
  fs.writeFileSync(rutaSalida, JSON.stringify(historial, null, 2));
  console.log(`\n✅ Historial guardado en: ${rutaSalida}`);

  await driver.deleteSession();
}

auditarDMsInstagram().catch(console.error);
```

---

## 6. Script de Marketing: Envío Masivo de DMs (Outreach)

```javascript
// instagram_outreach.js - USAR CON RESPONSABILIDAD
// Límites seguros: máximo 30-50 DMs por día por cuenta

const contactosList = [
  { usuario: '@objetivo1', mensaje: 'Hola, vi tu perfil y...' },
  { usuario: '@objetivo2', mensaje: 'Hola, vi tu perfil y...' },
];

async function enviarDMmasivo(driver, contactos) {
  for (const contacto of contactos) {
    // 1. Buscar el perfil
    const botonBuscar = await driver.$('[resource-id="com.instagram.android:id/search_edit_text"]');
    await botonBuscar.click();
    await driver.keys(contacto.usuario);
    await esperar(1500, 2500);

    // 2. Seleccionar el primer resultado
    const primerResultado = await driver.$('//android.widget.ListView/android.view.ViewGroup[1]');
    await primerResultado.click();
    await esperar(2000, 3000);

    // 3. Ir al perfil y presionar "Mensaje"
    const botonMensaje = await driver.$('[resource-id="com.instagram.android:id/button_inbox"]');
    await botonMensaje.click();
    await esperar(1500, 2000);

    // 4. Escribir el mensaje letra por letra (más humano)
    const campoTexto = await driver.$('[resource-id="com.instagram.android:id/message_edit_text"]');
    await campoTexto.click();

    for (const letra of contacto.mensaje) {
      await driver.keys(letra);
      await esperar(50, 150); // Simular velocidad de escritura humana
    }
    await esperar(500, 1000);

    // 5. Enviar
    const botonEnviar = await driver.$('[resource-id="com.instagram.android:id/send_button"]');
    await botonEnviar.click();

    console.log(`✅ DM enviado a ${contacto.usuario}`);

    // 6. Descanso entre mensajes (CRÍTICO para evitar ban)
    const descanso = Math.random() * 120000 + 60000; // Entre 1 y 3 minutos
    console.log(`⏳ Esperando ${Math.round(descanso/1000)}s antes del siguiente...`);
    await esperar(descanso, descanso);

    // 7. Volver atrás para el siguiente contacto
    await driver.back();
    await driver.back();
    await esperar(1000, 2000);
  }
}
```

---

## 7. Estrategia Anti-Ban en Instagram (Reglas de Oro)

Instagram tiene uno de los sistemas anti-spam más sofisticados fuera de Google. Estas son las reglas para operar sin banearse:

### Límites Diarios Seguros (por cuenta)
| Acción | Límite Seguro | Límite Máximo Arriesgado |
|---|---|---|
| DMs nuevos | 30-50 | 80-100 |
| Follows nuevos | 150-200 | 300-400 |
| Likes | 300-500 | 700-1000 |
| Unfollows | 150-200 | 300 |
| Comentarios | 20-30 | 60 |

### Señales que Activan el Sistema Anti-Ban
1.  **Velocidad constante:** Si mandas 1 DM exactamente cada 60 segundos, es un bot. Los humanos son irregulares.
2.  **Acciones inmediatas tras iniciar sesión:** Espera 2-3 minutos antes de cualquier acción.
3.  **IP residencial vs. datacenter:** Instagram sabe si tu IP es de AWS/DigitalOcean. Usa 4G del teléfono o un proxy residencial.
4.  **Cuenta nueva + acción agresiva:** Las cuentas nuevas deben "calentarse" (warming) durante 2-4 semanas antes de cualquier automatización agresiva.
5.  **Misma huella de dispositivo:** Instagram guarda el fingerprint del dispositivo. Si mandas 200 DMs desde el mismo teléfono, ese dispositivo queda marcado.

### El Warming de Cuentas (Protocolo de 4 Semanas)
```
Semana 1: Solo navegar el feed, ver historias, dar 10-20 likes/día manualmente.
Semana 2: Seguir 30-50 cuentas/día. Hacer comentarios reales en 5-10 posts.
Semana 3: Aumentar a 100 follows/día. Primeros 5-10 DMs manuales.
Semana 4: Comenzar automatización suave (20 DMs/día máximo).
```

---

## 8. Extracción de Prospectos desde Hashtags

```javascript
// Estrategia: buscar hashtag → entrar a posts → extraer quien comentó
async function extraerProspectosDeHashtag(driver, hashtag) {
  // 1. Buscar el hashtag
  // 2. Entrar al post más reciente
  // 3. Expandir comentarios
  // 4. Extraer @usernames de los comentaristas
  // 5. Guardar en CSV de prospectos
  // Estos usuarios interactuaron con contenido relevante = prospectos calientes
}
```

---

## 9. Próximos Pasos

1.  **Semana 1:** Instalar Appium, conectar teléfono, correr `hola_mundo_appium.js`.
2.  **Semana 2:** Usar Appium Inspector para mapear los `resource-id` actuales de Instagram en tu versión.
3.  **Semana 3:** Adaptar el script de auditoría de DMs a los resource-ids reales.
4.  **Semana 4:** Probar el outreach con 5 cuentas de prueba antes de escalar.
