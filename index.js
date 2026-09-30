const readline = require('readline');
const { runADBExtraction } = require('./3_extraccion_galeria_adb');
const { runWhatsAppExtraction } = require('./fase3_extractor_real');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
  console.clear();
  console.log(`=================================================`);
  console.log(`🛡️  FORENSIC DATA EXTRACTOR SUITE (v1.0.0-beta)  🛡️`);
  console.log(`=================================================\n`);
  
  console.log(`Por favor, seleccione el módulo a ejecutar:`);
  console.log(`1) Extracción de Galería Física (Vía ADB)`);
  console.log(`2) Auditoría de WhatsApp Web (Vía Navegador)`);
  console.log(`3) Salir\n`);

  let opcion = await question(`Ingrese el número de opción (1-3): `);

  if (opcion === '3') {
    console.log(`Saliendo del sistema...`);
    rl.close();
    process.exit(0);
  }

  if (opcion !== '1' && opcion !== '2') {
    console.log(`Opción inválida.`);
    rl.close();
    process.exit(1);
  }

  console.log(`\n¿Desea ejecutar en TEST MODE?`);
  console.log(`(El Test Mode limita la extracción a unos pocos scrolls o procesos para validación rápida)`);
  let testModeStr = await question(`¿Activar Test Mode? (y/n) [default: y]: `);
  
  const testMode = testModeStr.toLowerCase() !== 'n';

  console.log(`\nIniciando módulo con Test Mode = ${testMode}...\n`);

  try {
    if (opcion === '1') {
      const metodo = await question(`Metodo de conexion (usb/wifi-paired) [default: usb]: `);
      const connectIpPort = metodo.trim() === 'wifi-paired'
        ? await question(`IP y puerto del dispositivo (ej. 192.168.1.8:5555): `)
        : '';
      await runADBExtraction(
        { testMode, metodo: metodo.trim() || 'usb', connectIpPort },
        (mensaje) => console.log(mensaje)
      );
    } else if (opcion === '2') {
      const contactos = await question(`Chats a extraer, separados por coma: `);
      const listaContactos = contactos
        .split(',')
        .map((contacto) => contacto.trim())
        .filter(Boolean);
      await runWhatsAppExtraction(
        { testMode, contactos: listaContactos },
        (mensaje) => console.log(mensaje)
      );
    }
  } catch (error) {
    console.error(`\n❌ Error en la ejecución principal:`, error);
  }

  console.log(`\n✅ Proceso finalizado. Regresando al menú principal...`);
  
  // Reiniciar el menú (opcional)
  // await main(); 
  rl.close();
}

// Iniciar la CLI
main();
