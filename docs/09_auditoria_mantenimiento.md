# Auditoria de mantenimiento del codigo

Fecha: 2026-09-26

Esta auditoria se enfoca en mantenibilidad, reutilizacion, limites de
seguridad y regresiones faciles de introducir. No sustituye una auditoria
funcional con un telefono real.

## Cambios aplicados

### 1. Aislamiento del renderer

Antes, Electron exponia Node directamente al renderer mediante
`nodeIntegration` y `contextIsolation: false`. Ahora:

- `preload.js` expone `window.electronAPI`;
- los canales IPC de entrada y salida estan en listas permitidas;
- el renderer no importa Electron ni Node;
- `contextIsolation` esta activo;
- `nodeIntegration` esta desactivado.

Esto reduce la superficie de impacto de un error en la interfaz.

### 2. Salida de logs segura

Los logs de ADB, FFmpeg y Playwright se insertan con `textContent`. La interfaz
ya no interpreta como HTML una ruta, nombre de contacto o mensaje que llegue de
un proceso externo. La tabla de contactos tambien se construye con nodos DOM,
sin interpolar nombres dentro de HTML.

### 3. Un solo adaptador ADB

`3_extraccion_galeria_adb.js` fue reescrito para reutilizar
`src/platform/android/android_adapter.js`. Ahora comparte:

- resolucion del binario;
- timeouts y manejo de procesos;
- seleccion por serial;
- validacion de rutas bajo `/sdcard/`.

El extractor rechaza ambiguedad cuando hay varios dispositivos autorizados y
devuelve `{ ok: false, error }` en fallos.

### 4. Hashing reutilizable

La logica SHA-256 y la escritura de sidecars viven en
`src/evidence/file_hash.js`. Se eliminaron copias de la misma funcion en el
grabador, el extractor ADB y el extractor de WhatsApp.

### 5. Ciclo de vida de FFmpeg

El grabador ya no considera exitoso un proceso que termina durante el periodo
de arranque. Los errores de inicio se propagan y el proceso tiene limpieza con
timeout al detenerse.

### 6. Higiene del proyecto

Se agrego `.gitignore` para dependencias, builds, sesiones persistentes,
evidencias generadas y archivos de video temporales. Los scripts legacy no se
borraron: siguen pendientes de clasificacion para evitar perder material
historico.

### 7. Panel Android orientado a operaciones

El frontend separa dispositivo, observacion, evidencia y control guiado. Las
operaciones de captura y grabacion usan el adaptador real y generan hashes
sidecar; las acciones moviles solo aceptan tipos y rangos definidos.

### 8. Correccion del primer flujo real ADB

La primera prueba con un Samsung SM-A546E evidencio dos problemas de
operacion: los comandos `adb shell` con rutas que contienen espacios no se
enviaban como una orden remota unica, y el fallback de `ls` hacia `pull` de la
carpeta completa podia quedarse bloqueado durante 120 segundos.

Ahora el extractor:

- cita las rutas remotas para `adb shell`;
- limita la prueba a dos archivos por ruta;
- omite rutas ausentes sin intentar copiar carpetas completas;
- usa un timeout de 60 segundos por archivo en modo de prueba;
- muestra el progreso en una salida visible dentro de la tarjeta de respaldo;
- comunica estados de ejecucion, exito y error al renderer.
- crea un directorio aislado por ejecucion para que el informe no vuelva a
  procesar archivos de respaldos anteriores.

### 9. Rediseño de experiencia

La interfaz dejó de agrupar todas las funciones en una sola tarjeta larga.
Ahora la navegación se organiza alrededor del expediente y separa:

- resumen del caso y estado del dispositivo;
- respaldo Android como operación guiada;
- captura y grabación como evidencia puntual;
- mirroring como observación visual externa;
- laboratorio educativo como sección avanzada plegable;
- WhatsApp Web como flujo independiente.

Se conservaron los IDs y canales IPC existentes para evitar regresiones de
funcionalidad. La referencia visual queda en
`docs/10_propuesta_visual_forensic_suite.html`.

### 10. Arranque de Electron

El entorno de desarrollo tenía `ELECTRON_RUN_AS_NODE=1`, lo que hacía que
`npm start` cargara `main.js` sin `ipcMain`. `start.js` elimina esa variable
solo para el proceso hijo de Electron. El script de inicio ya no depende de
que la terminal tenga un entorno limpio.

## Verificacion realizada

Durante desarrollo, la pantalla de licencia se omite automaticamente cuando
la app no esta empaquetada. Para probar el flujo visual de licencia se puede
iniciar con `FORENSIC_REQUIRE_LICENSE=1`. La validacion de Lemon Squeezy sigue
siendo una integracion pendiente; el formulario actual continua siendo un
mock local.

```powershell
npm test
```

La suite registra 44 pruebas: catalogo ADB, adaptador, acciones moviles,
sesion observada, inventario multimedia, checkpoint RPA de Galeria y sintaxis
de los modulos principales.

Tambien se comprobo estaticamente que en el codigo activo:

- no quedan usos de `innerHTML` para datos dinamicos;
- no queda `ipcRenderer` en `renderer.js`;
- no queda `nodeIntegration: true`;
- no se duplican las funciones de hashing.

### 11. Revision de modularizacion de WhatsApp Web

La revision actual confirma estos limites:

- `preload.js` es el puente IPC permitido.
- `main.js` coordina Electron y los eventos del proceso principal.
- `src/evidence/file_hash.js` y `src/capture/desktop_recorder.js` son modulos
  reutilizables.
- `fase3_extractor_real.js` es la ruta activa, pero todavia concentra sesion,
  catalogo, DOM, multimedia, exportacion y manifiesto.
- `renderer.js` concentra estado de pantallas, cola visual y renderizado.

La deuda esta identificada y no se debe resolver con un movimiento grande antes
de la prueba de carga de WhatsApp. El orden previsto es congelar el contrato,
probar diez o mas chats, extraer modulos por responsabilidad y mantener una
API compatible durante la transicion. El detalle esta en
[16_baseline_v1_whatsapp_web.md](16_baseline_v1_whatsapp_web.md).

## Pendientes importantes

### Alta prioridad

- Probar manualmente la sesion observada con el telefono conectado y comprobar
  la grabacion, capturas, manifiesto e informe PDF.
- Revisar que la cancelacion conserve los artefactos parciales sin mezclar otra
  ejecucion.

### Media prioridad

- Validar manualmente la sesion observada y el checkpoint RPA de Galeria con
  el telefono de laboratorio.
- Anadir un modo `dry-run` que muestre los argumentos exactos antes de ejecutar
  ADB real.
- Completar el recorrido de Galeria por checkpoints, con acciones permitidas y
  parada si la pantalla no coincide con lo esperado.
- Probar WhatsApp Web en modo controlado y crear el checkpoint independiente
  para chats archivados.
- Reescribir el generador PDF de WhatsApp para evitar el patron
  `new Promise(async ...)`.
- Ejecutar la prueba de carga de WhatsApp Web y comprobar que la cola visual no
  mantenga abierta indefinidamente una sesion ya extraida.
- Agregar validacion automatica de conteos, duplicados, multimedia faltante y
  cobertura de hashes antes de presentar el expediente como completo.

### Legacy

- `2_auditoria_masiva.js` contiene una implementacion anterior de grabacion y
  hashing que no usa el flujo actual. Debe archivarse o migrarse despues de
  comparar sus capacidades.
- `AI_CONTEXT_FORENSIC_SUITE.md` contiene afirmaciones comerciales y legales
  mas fuertes que el estado tecnico actual. Debe tratarse como contexto
  historico, no como especificacion del producto.

## Criterio para continuar

La sesion observada ya es la base comun para inventario, serial, captura, copia
y manifiesto. El primer flujo RPA acotado de Galeria ya existe; el siguiente
cambio debe validar ese checkpoint y despues llevar la misma disciplina de
selectores, limites y evidencia a WhatsApp Web, no crear un interprete de
comandos arbitrarios.
