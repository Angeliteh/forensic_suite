# Baseline V1 — WhatsApp Web

Fecha de referencia: 2026-09-26

Este documento es la pared de referencia para retomar el proyecto. Define qué
está implementado, qué se comprobó, qué todavía es una hipótesis y qué debe
cumplir la primera versión sólida antes de ampliar la interfaz o comenzar el
flujo Android/ADB.

## Estado en una frase

WhatsApp Web ya cuenta con un flujo funcional controlado para seleccionar,
extraer y revisar conversaciones con multimedia, pero todavía falta validar
integridad, rendimiento y recuperación con más de diez chats y conversaciones
largas.

La clasificación actual es:

> Funcionalidad controlada validada; escala masiva todavía no validada.

## Fuente de verdad

Para retomar el trabajo se debe leer en este orden:

1. Este documento, para conocer el estado y los límites actuales.
2. [07_handoff_estado_actual.md](07_handoff_estado_actual.md), para el estado
   general de Android, Electron y las reglas de operación.
3. [14_estado_whatsapp_web_y_plan.md](14_estado_whatsapp_web_y_plan.md), para
   el estado específico y los pendientes de WhatsApp Web.
4. [15_manual_operativo_extraccion_web.md](15_manual_operativo_extraccion_web.md),
   para el contrato de datos, selectores y diagnóstico del DOM.

## Qué está implementado

### Flujo operativo

- Perfil persistente de Edge para WhatsApp Web.
- Apertura, comprobación y cierre de la sesión desde Electron.
- Catálogo de conversaciones recientes y archivadas.
- Selección individual y múltiple de conversaciones.
- Opciones de contenido: texto, imágenes, videos, audio y stickers.
- Grabación visual opcional durante el recorrido.
- Extracción por conversación con deduplicación por identificador.
- Recorrido incremental del DOM virtualizado hasta detectar varias pasadas sin
  contenido nuevo.
- Orden cronológico usando los metadatos completos de cada mensaje.
- Dirección visual izquierda/derecha basada en el autor local y en el DOM.
- Respuestas citadas, mensajes editados, eliminados y emojis.
- Descarga de multimedia visible cuando WhatsApp expone un recurso utilizable.
- Activación controlada de videos y audios que requieren interacción.
- Lectura de fecha y hora de videos desde el modal multimedia cuando el
  contenedor de la conversación no las expone directamente.
- Registro estructurado por sesión en `operation.jsonl`, con eventos de
  sesión y de cada conversación.
- Aislamiento de errores por conversación: un chat fallido genera `error.json`,
  queda marcado como `error` y permite continuar con los demás.

### Expediente generado

Cada ejecución queda aislada en una sesión propia:

```text
Desktop\Forensic_Extractions\Auditoria_WhatsApp\
  session_<timestamp>\
    session.json
    operation.jsonl
    operation.jsonl.sha256.txt
    conversaciones_seleccionadas.json
    chat_001_<nombre>\
      historial.json
      historial.csv
      certificado_integridad.pdf
      manifest.json
      validation.json
      multimedia\
      grabacion\
```

El JSON es la fuente estructurada principal. El CSV facilita la revisión y el
PDF documenta la integridad calculada de los artefactos. El video registra la
navegación visible; no sustituye al respaldo estructurado.

La sesión también conserva `operation.jsonl`, un registro estructurado con
eventos de inicio, chat iniciado, chat omitido, chat completado y resultado de
la sesión. No debe incluir el texto completo de los mensajes; sirve para
diagnóstico y trazabilidad. Su SHA-256 queda asociado a `session.json`.

Las incidencias se clasifican con códigos estables: `SESSION_NOT_READY`,
`CHAT_NOT_FOUND`, `DOM_SELECTOR_MISSING`, `CHAT_EXTRACTION_FAILED`,
`MEDIA_UNAVAILABLE`, `OUTPUT_WRITE_FAILED` y `RECORDING_FAILED`.

Cada chat también deja `validation.json` con un diagnóstico estructural de
conteos JSON/CSV, archivos del manifiesto, hashes con formato válido y
multimedia ausente. Sus advertencias no invalidan automáticamente el chat;
permiten distinguir un expediente consistente de uno con adjuntos que
WhatsApp no llegó a exponer.

### Experiencia visual

- La selección se realiza antes de la extracción.
- La vista de resultados es la misma vista utilizada durante la extracción.
- La columna izquierda muestra conversaciones en espera, procesándose,
  mostrando o completadas.
- La columna derecha muestra el chat activo.
- Los mensajes se muestran individualmente desde bloques ya estructurados.
- Una conversación nueva espera a que termine la presentación visual de la
  anterior.
- La terminal queda como actividad técnica secundaria, no como la experiencia
  principal.

La extracción y la presentación son procesos distintos: la extracción debe
priorizar integridad y la presentación debe priorizar comprensión visual.

## Qué ya se comprobó

La prueba realizada con dos chats confirmó el flujo completo básico:

- selección de conversaciones;
- extracción de mensajes;
- orden y dirección visual corregidos;
- imágenes, audio y video visibles;
- video con metadatos recuperados desde el modal;
- generación de CSV, JSON, PDF, multimedia y manifiesto;
- separación de los expedientes por chat.

La suite automatizada actual registra 44 pruebas correctas. Esas pruebas
validan principalmente módulos Android, catálogo, utilidades y sintaxis; no
reemplazan una prueba real de WhatsApp Web con una cuenta autorizada.

## Qué todavía no está validado

No se debe afirmar todavía que el extractor sea completo para una cuenta grande.
Faltan pruebas reales de:

- más de diez chats en una misma sesión;
- conversaciones con miles de mensajes;
- grupos con varios autores;
- chats archivados dentro de una ejecución masiva;
- grandes volúmenes de multimedia;
- varios videos y audios en la misma conversación;
- chats con documentos, ubicaciones, contactos o encuestas;
- recuperación cuando un chat falla o un recurso multimedia expira;
- grabación visual durante una ejecución larga;
- consumo de memoria, espacio en disco y duración total.

WhatsApp Web virtualiza el DOM. Por tanto, el resultado representa lo que el
navegador llegó a renderizar y recorrer, no una garantía automática de que se
haya leído una base de datos completa.

## Invariantes de integridad

Una ejecución correcta debe cumplir estas reglas:

1. Cada chat seleccionado produce como máximo un expediente dentro de la
   sesión.
2. Cada mensaje tiene un identificador o una clave compuesta estable para
   deduplicación.
3. El orden de `historial.json`, `historial.csv` y la vista final coincide.
4. El autor y la dirección visual coinciden con WhatsApp Web.
5. Cada adjunto registrado apunta a un archivo existente o queda marcado como
   no disponible.
6. Los conteos del manifiesto, JSON y CSV son reconciliables.
7. Los hashes cubren los archivos producidos y no mezclan ejecuciones previas.
8. Un fallo aislado debe quedar registrado sin borrar los expedientes válidos
   de las conversaciones anteriores.

## Prueba de carga de la V1

La siguiente prueba es el punto de decisión antes de seguir agregando diseño.

### Etapa A — control ampliado

- Tres a cinco chats.
- Todos los tipos de contenido activados.
- Grabación visual desactivada.
- Comparar conteos, orden, direcciones y archivos multimedia.

### Etapa B — carga real

- Diez o más chats.
- Al menos una conversación larga.
- Incluir un grupo y, si es posible, un chat archivado.
- Mantener la grabación desactivada para aislar el extractor.
- Medir tiempo, memoria, espacio, duplicados, omitidos y errores.

### Etapa C — evidencia visual

- Repetir una carga similar con grabación activada.
- Revisar segmentos, duración, reproducción, `ffmpeg.log` y hashes.
- Confirmar que la cola visual no bloquee indefinidamente el cierre de la
  sesión.

El reporte mínimo de cada ejecución debe conservar:

```text
Chats seleccionados:
Chats completados:
Chats con error:
Mensajes por chat:
Multimedia registrada:
Multimedia faltante:
Duplicados:
Tiempo total:
Espacio utilizado:
Grabación correcta:
Manifestos reconciliados:
```

## Rendimiento de la presentación visual

La cola visual muestra los mensajes uno por uno para que la extracción sea
comprensible en una demostración. Esa animación no puede convertirse en el
límite de la extracción real.

En conversaciones muy grandes se debe medir especialmente:

- cantidad de mensajes pendientes de presentación;
- tiempo de drenado de la cola;
- memoria ocupada por el DOM de la interfaz;
- comportamiento al cambiar de chat;
- momento en que se habilita la vista final.

Si una cuenta grande vuelve demasiado lenta la reproducción, la solución debe
ser de presentación —por ejemplo, velocidad adaptable o modo demostración— y
no sacrificar el JSON completo ni acelerar de forma insegura la extracción.

Existe además un fixture DOM ejecutable en
`test/fixtures/whatsapp/messages_mixed.html` que cubre mensajes entrantes,
salientes, grupo, cita, emoji, eliminado y sticker. La prueba
`test/whatsapp_dom_parser.test.js` lo procesa mediante Playwright/Edge antes de
probar una cuenta real.

## Arquitectura actual y deuda controlada

```text
index.html + styles.css
        |
        v
renderer.js  -- estado de pantallas, cola visual y render del expediente
        |
        v
preload.js   -- puente IPC permitido
        |
        v
main.js      -- ventana, IPC y orquestación de procesos
        |
        v
fase3_extractor_real.js
        |-- sesión Edge, catálogo y orquestación
        |-- activación multimedia y escritura de expediente
        `-- grabación y manifest de la sesión

src/platform/web/whatsapp/
        |-- whatsapp_domain.js       -- reglas puras y orden
        |-- message_dom_parser.js    -- mensajes desde el DOM
        |-- media_dom_parser.js      -- adjuntos visibles desde el DOM
        `-- whatsapp_errors.js       -- códigos y clasificación de errores

src/evidence/file_hash.js       -- hashing reutilizable
src/evidence/whatsapp_artifacts.js -- CSV y manifest por conversación
src/evidence/whatsapp_artifact_validator.js -- validación estructural del expediente
src/capture/desktop_recorder.js -- FFmpeg y grabación
test/                            -- pruebas automatizadas
```

La arquitectura ya tiene límites útiles en IPC, hashing, grabación y Android.
La escritura de CSV y manifest ya está aislada en
`src/evidence/whatsapp_artifacts.js`. La validación estructural de un
expediente vive en `src/evidence/whatsapp_artifact_validator.js`, de modo que
los conteos y rutas pueden auditarse sin repetir la navegación. La deuda
principal está en que
`fase3_extractor_real.js` todavía concentra la orquestación, activación
multimedia y parte de la escritura de expediente, mientras
`renderer.js` concentra estado de pantalla, eventos y renderizado. No se debe
hacer un movimiento grande antes de terminar la prueba de carga.

### Refactor previsto, en orden seguro

1. Congelar el contrato de salida y completar la prueba densa.
2. Extraer el módulo de sesión/navegador de WhatsApp.
3. Extraer el catálogo de conversaciones.
4. Extraer la activación multimedia y sus adaptadores de red/DOM.
5. Extraer la validación de expediente y manifiesto.
6. Dejar `fase3_extractor_real.js` como orquestador pequeño y compatible con
   la API actual de `main.js`.
7. Separar en `renderer.js` el estado de extracción, la cola visual y los
   componentes de renderizado.
8. Agregar pruebas sintéticas por capa antes de cambiar selectores reales.

Cada paso debe conservar la misma salida y pasar `npm test`. No se deben mover
selectores junto con lógica de negocio sin conservar un fixture DOM o una
prueba equivalente.

## Exportación y terminal

La base de exportación ya está generada en disco: CSV, JSON, PDF, multimedia y
video opcional. Falta convertirla en acciones visibles para usuarios no
técnicos:

- abrir carpeta de la sesión;
- abrir expediente de una conversación;
- abrir CSV;
- abrir PDF;
- abrir multimedia;
- abrir grabación;
- mostrar un resumen de integridad.

La terminal debe permanecer disponible para diagnóstico, pero colapsada u
oculta por defecto. El estado principal debe comunicar qué sucede sin exigir
leer logs técnicos.

## Criterio de cierre de la primera versión

La V1 de WhatsApp Web queda lista para presentar cuando:

- la prueba de carga no muestra pérdida, duplicación ni desorden;
- los chats con error no destruyen los demás expedientes;
- los conteos y manifiestos se reconcilian;
- la multimedia descargada está asociada correctamente;
- la grabación opcional es reproducible;
- la vista final se entiende sin abrir la terminal;
- las acciones de exportación son accesibles para un usuario no técnico;
- el handoff puede ser seguido por otra sesión sin depender de memoria
  conversacional.

Después de ese punto se puede pulir la interfaz y comenzar Android/ADB con una
base estable.

## Retomar en una sesión nueva

```powershell
cd C:\Users\Demetrio\Desktop\newproject
npm test
npm start
```

Antes de cambiar código:

1. Leer este baseline.
2. Revisar el síntoma y el artefacto concreto.
3. Confirmar si afecta extracción, expediente, interfaz o evidencia visual.
4. Cambiar una sola capa.
5. Ejecutar las pruebas automatizadas.
6. Repetir una prueba real mínima antes de una prueba masiva.
7. Registrar el resultado aquí o en el handoff.
