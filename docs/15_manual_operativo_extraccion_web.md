# Manual operativo de extracción web y respaldo reproducible

Fecha de referencia: 2026-09-25  
Estado: guía canónica para continuar el proyecto

Este documento explica cómo funciona la extracción web actual, qué evidencia
produce, qué casos de mensajes cubre, cómo reaccionar cuando cambia el DOM y
cómo reutilizar la arquitectura para otra aplicación web. El flujo está
pensado para cuentas y dispositivos autorizados por su propietario.

La regla principal es separar tres conceptos:

1. **Detectado:** existe un selector o una rama de código para el caso.
2. **Validado:** el caso funcionó en una extracción real y sus artefactos se
   revisaron.
3. **Garantizado:** no se usa esta palabra para WhatsApp Web; la interfaz
   virtualiza contenido y puede cambiar sin aviso.

## 1. Mapa rápido del proyecto

La ruta activa de WhatsApp Web es:

```text
Electron UI
  -> preload.js / IPC permitido
  -> main.js
  -> fase3_extractor_real.js
       -> Playwright + Edge persistente
       -> captura FFmpeg
       -> hash SHA-256
       -> CSV, JSON, PDF y manifest
```

Archivos importantes:

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Panel visual de operación |
| `renderer.js` | Selección de chats y envío de opciones por IPC |
| `preload.js` | Superficie limitada y segura entre UI y proceso principal |
| `main.js` | Orquestación de ventanas, IPC y módulos |
| `fase3_extractor_real.js` | Catálogo, navegación, extracción, multimedia y expediente |
| `src/capture/desktop_recorder.js` | Inicio, detención, segmentos y hashes de FFmpeg |
| `src/evidence/file_hash.js` | SHA-256 y sidecars de integridad |
| `src/evidence/whatsapp_artifacts.js` | Construcción de CSV y manifest por conversación |
| `src/evidence/whatsapp_artifact_validator.js` | Validación estructural de expedientes y multimedia |
| `src/platform/web/whatsapp/whatsapp_domain.js` | Orden, claves y reglas puras |
| `src/platform/web/whatsapp/message_dom_parser.js` | Lectura de mensajes desde el DOM |
| `src/platform/web/whatsapp/media_dom_parser.js` | Lectura de multimedia visible desde el DOM |
| `src/platform/web/whatsapp/whatsapp_errors.js` | Códigos y clasificación de errores |
| `test/whatsapp_catalog.test.js` | Pruebas del catálogo y deduplicación |
| `docs/14_estado_whatsapp_web_y_plan.md` | Estado y pendientes concretos |
| `docs/16_baseline_v1_whatsapp_web.md` | Criterio de cierre, prueba de carga y deuda de modularizacion |
| `docs/01_whatsapp_web/guia_whatsapp_grupos_y_multimedia.md` | Referencia histórica de casos DOM |

Los scripts `2_auditoria_masiva.js` y `fase3_extraccion.js` son legacy. No
deben usarse para nuevas pruebas salvo que se esté comparando comportamiento.

## 2. Flujo completo de una sesión

```text
Abrir Edge persistente
        |
        v
Confirmar sesión autenticada
        |
        v
Leer chats recientes y archivados
        |
        v
Seleccionar conversaciones
        |
        v
Crear session_<timestamp>
        |
        v
Por cada chat: abrir -> grabar -> extraer -> descargar medios -> desplazarse
        |
        v
Detener grabación -> escribir CSV/JSON/PDF -> calcular hashes
        |
        v
Actualizar session.json y cerrar navegador
```

### 2.1 Sesión persistente

Playwright usa el perfil:

```text
%USERPROFILE%\.forensic_whatsapp_session
```

El navegador se abre con Edge (`msedge` por defecto). El extractor espera
`div[data-testid="chat-list-search-container"]` antes de permitir el catálogo.
Si la sesión no está autenticada, la operación debe detenerse y dejar que el
usuario autorice el QR o la sesión desde el navegador.

### 2.2 Catálogo de conversaciones

El catálogo recorre dos fuentes:

- lista principal: `div[aria-label="Chat list"]`;
- archivados: `button[data-testid="chatlist-panel-archived-button"]` y
  `div[data-testid="archived-chatlist"]`.

Cada entrada intenta conservar:

```json
{
  "name": "Angelite",
  "id": "identificador-si-está-disponible",
  "source": "recent",
  "kind": "conversation",
  "lastMessagePreview": "...",
  "lastActivity": "..."
}
```

Los grupos se identifican como `kind: "group"` cuando el `data-id` termina en
`@g.us`. Si WhatsApp no expone un identificador estable, el nombre se usa
como fallback y se debe documentar esa limitación.

Después de leer archivados, el flujo usa el botón accesible `Atrás` y vuelve a
esperar la lista principal. Esto evita que el siguiente escaneo se quede en la
vista de archivados.

### 2.3 Recorrido del historial

Por cada conversación seleccionada:

1. Se localiza el título exacto.
2. Se abre el chat.
3. Se inicia la grabación visual.
4. Se inspeccionan los mensajes renderizados.
5. Se activan videos y audios visibles cuando es necesario.
6. Se descargan blobs visibles y se asocian al mensaje.
7. Se desplaza el panel hacia mensajes anteriores en pasos pequeños.
8. Se deduplican mensajes mediante `data-id` o una clave alternativa.
9. Se detiene la grabación y se escriben los artefactos.

El modo de prueba ejecuta dos iteraciones. El modo completo permite hasta
5,000 iteraciones y termina después de tres iteraciones consecutivas sin
mensajes nuevos. Esto es un límite operativo, no una prueba matemática de que
se haya descargado todo el historial.

## 3. Selectores y estrategia de resistencia al cambio

### Selectores preferidos

Se deben priorizar, en este orden:

1. `data-testid` semántico.
2. `aria-label`, `role` y atributos `data-*`.
3. Atributos de contenido o relación, como `data-pre-plain-text`.
4. Texto visible exacto, solo como fallback.
5. Clases CSS `x...`, únicamente como último recurso temporal.

Ejemplos actualmente útiles:

```text
div[data-testid="chat-list-search-container"]
button[data-testid="chatlist-panel-archived-button"]
div[data-testid="archived-chatlist"]
div[data-testid="cell-frame-title"] span[title]
div[data-testid="conversation-panel-messages"]
div[data-testid="msg-container"]
.copyable-text[data-pre-plain-text]
div[data-testid="quoted-message"]
[data-testid="recalled"]
[data-testid="video-content"]
button[aria-label^="Reproducir mensaje de voz"]
```

Las clases largas como `x1n2onr6 x...` no forman parte del contrato del
extractor. WhatsApp puede regenerarlas en cualquier despliegue.

### Qué hacer cuando el DOM cambie

No se debe pegar todo el DOM de una pantalla sin clasificarlo. El procedimiento
es:

1. Guardar un fragmento mínimo que contenga el elemento raíz y el tipo de caso.
2. Identificar qué parte es estable: `data-testid`, `aria-label`, `role`,
   `data-id`, `data-pre-plain-text` o una URL de recurso.
3. Comparar el caso nuevo con el último caso conocido.
4. Cambiar primero el selector más específico y evitar tocar el modelo de
   datos si la semántica no cambió.
5. Añadir una prueba o fixture que compruebe la nueva forma.
6. Ejecutar `npm test` y una extracción controlada de un solo chat.
7. Revisar el JSON, el CSV, el multimedia y el log antes de volver al modo
   completo.

El DOM completo es una evidencia de diagnóstico; no debe convertirse
automáticamente en lógica basada en clases efímeras.

## 4. Modelo de datos de un mensaje

`historial.json` conserva un registro por mensaje detectado. Un ejemplo
representativo es:

```json
{
  "id_unico": "A51AA7AF08E8E0519BF94E12B624BA1C\u0000Aqqqq\u0000",
  "mensaje_id": "A51AA7AF08E8E0519BF94E12B624BA1C",
  "metadata": "[01:05, 25/9/2026] nexo invitaciones:",
  "texto": "Aqqqq",
  "enlaces": [],
  "vista_previa": null,
  "respuesta": {
    "tipo": "mensaje_citado",
    "autor": "Angelite",
    "contenido": "mumuaiehdhwioqow",
    "tipo_contenido": "texto"
  },
  "estado_visual": {
    "eliminado": false,
    "editado": false,
    "sticker": false
  },
  "adjuntos": []
}
```

El `metadata` conserva hora y autor desde `data-pre-plain-text`. En grupos,
ese mismo atributo normalmente cambia de autor en cada mensaje, por lo que no
se debe inferir el autor desde el título del chat.

## 5. Matriz de casos cubiertos

| Caso | Detección actual | Salida |
|---|---|---|
| Texto normal | `copyable-text` + `data-pre-plain-text` | `texto` |
| Emojis | `img[data-plain-text]` o `img[alt]` | texto Unicode |
| Mensaje eliminado | `[data-testid="recalled"]` o `data-icon="recalled"` | `estado_visual.eliminado` |
| Mensaje editado | texto `Editado` o `Edited` en metadatos visibles | `estado_visual.editado` |
| Respuesta a mensaje | `[data-testid="quoted-message"]` | `respuesta.tipo: mensaje_citado` |
| Respuesta a estado | autor citado contiene `Estados` | `respuesta.tipo: estado` |
| Cita de texto | `span[data-testid="selectable-text"]` dentro de la cita | `respuesta.contenido` |
| Cita de imagen/video/audio | título de `chat-msg-symbol` | `respuesta.tipo_contenido` |
| Imagen | `img[src^="blob:"]` cargada | archivo en `multimedia/` |
| Sticker | imagen cuyo `alt` o clase contiene `sticker` | `estado_visual.sticker` |
| Video | `video-content`, activación controlada y `/stream/video` | MP4 u otra extensión inferida |
| Nota de voz | botón reproducir y respuesta de red de audio | OGG/Opus u otra extensión inferida |
| Enlace | `a[href]` dentro del mensaje | `enlaces` |
| Vista previa | `link-preview-container` | `vista_previa` |
| Grupo | mismo contenedor de mensaje + autor por metadata | mismo modelo |

### Respuestas y citas

El texto citado se excluye del texto principal. Esto evita registrar como una
sola cadena:

```text
mumuaiehdhwioqow Aqqqq
```

En su lugar se conserva:

```text
respuesta.contenido = mumuaiehdhwioqow
texto = Aqqqq
```

Actualmente se guarda el autor, contenido y tipo de contenido de la cita. Si
la cita es multimedia, todavía no se promete descargar el archivo original
citado si no aparece como adjunto independiente en el DOM.

### Grupos

La arquitectura sí está preparada para grupos porque el mensaje de un grupo
usa el mismo contenedor `msg-container` y el autor se obtiene del metadata del
mensaje. Antes de declararlo validado hay que ejecutar una prueba real con:

- dos participantes distintos;
- una respuesta a un mensaje de otro participante;
- un mensaje de sistema del grupo;
- multimedia, edición, eliminación y emoji.

Los mensajes de sistema, encuestas, contactos, ubicaciones y documentos
requieren una validación específica si aparecen en una prueba real y no entran
por las ramas actuales de texto o multimedia.

## 6. Multimedia y activación controlada

### Imágenes y stickers

Se descargan imágenes blob visibles cuando tienen dimensiones reales. Las
miniaturas de una vista previa de enlace no se cuentan automáticamente como
adjuntos independientes.

### Videos

WhatsApp puede mostrar primero una miniatura sin crear un `<video>` utilizable.
El extractor hace clic sobre `video-content`, espera el modal
`div[data-testid="media-video"] video`, toma su URL temporal y cierra el modal.

Cada mensaje activado se registra en `videosActivados`, así que el scroll no
debe abrir dos veces el mismo video. La descarga ocurre mientras la URL sigue
viva en la sesión del navegador.

### Audios

Las notas de voz pueden no exponer un `<audio src>` permanente. El extractor
activa el botón de reproducción, espera la respuesta de red de tipo audio,
guarda el cuerpo como Base64 temporal y pausa la reproducción. El conjunto
`audiosActivados` evita repetir la operación al renderizar de nuevo el mensaje.

No se debe interpretar el video de pantalla como el respaldo del archivo: son
dos evidencias diferentes. El video muestra la interacción; el archivo de
`multimedia/` permite revisar el recurso descargado.

## 7. Estructura de salida

Cada ejecución está aislada por sesión:

```text
Desktop\Forensic_Extractions\Auditoria_WhatsApp\
  session_<timestamp>\
    session.json
    conversaciones_seleccionadas.json
    chat_001_<nombre>\
      historial.csv
      historial.json
      certificado_integridad.pdf
      manifest.json
      validation.json
      multimedia\
      grabacion\
        video_parte_000.mp4
        video_parte_000.mp4.sha256.txt
        ffmpeg.log
```

`session.json` describe el estado global y los chats procesados. Cada
`manifest.json` describe un chat, sus fechas, total de mensajes y archivos con
SHA-256. El hash confirma que un archivo no cambió después de generarse; no
confirma por sí solo autenticidad, origen ni admisibilidad jurídica.
`validation.json` conserva la revisión estructural del expediente: conteos
JSON/CSV, archivos listados, hashes con formato válido y multimedia faltante.

El CSV actual incluye estas columnas:

```text
Metadatos (Hora/Autor),Mensaje,Enlaces,Tipo,Adjuntos,Estado visual,Respuesta
```

El JSON es la fuente estructurada principal. El CSV es una vista cómoda para
revisión y el PDF certifica el hash del CSV; ninguno sustituye al otro.

## 8. Protocolo de prueba antes de una extracción completa

Usar siempre esta secuencia:

1. Ejecutar `npm test`.
2. Abrir una sesión autorizada y comprobar que el catálogo carga.
3. Seleccionar un solo chat propio.
4. Mantener activada **Prueba controlada**.
5. Revisar al menos un caso de texto, emoji, imagen, video y audio.
6. Revisar eliminado, editado y respuesta citada.
7. Revisar que el video no se abra dos veces después del scroll.
8. Revisar que cada chat quede dentro de la sesión correcta.
9. Confirmar que el `manifest.json` enumera todos los archivos.
10. Repetir con grupo y archivado.
11. Desactivar **Prueba controlada** solo después de validar el expediente.

Comandos básicos:

```powershell
npm test
npm start
```

Para revisar un archivo multimedia:

```powershell
ffprobe -v error -show_format -show_streams "ruta\archivo.mp4"
```

## 9. Qué hacer si una extracción falla

Clasificar el fallo antes de modificar el código:

| Síntoma | Área probable | Primera revisión |
|---|---|---|
| Catálogo vacío | sesión o selector de lista | sesión autenticada y `chat-list-search-container` |
| Solo aparecen archivados | navegación | botón `Atrás` y lista principal |
| Error `querySelector` sobre `null` | DOM incompleto | optional chaining y fixture del nodo faltante |
| Faltan mensajes antiguos | virtualización/scroll | iteraciones, panel y criterio de fin |
| Video se repite | deduplicación | `data-id` y `videosActivados` |
| Audio no aparece | reproducción/red | botón de voz y respuesta `content-type` audio |
| Eliminado no aparece | rama sin `copyable-text` | `[data-testid="recalled"]` |
| Editado no se marca | metadatos visibles | `rawCopyableText` y `msg-meta` |
| Respuesta mezcla cita y texto | selección de spans | excluir descendientes de `quoted-message` |
| Grupo sin autor correcto | metadata | `data-pre-plain-text` por mensaje |
| Archivos mezclados entre pruebas | salida | crear una nueva `session_<timestamp>` |

Cada corrección debe incluir una nota breve en el handoff o en este manual:
fecha, síntoma, selector observado, cambio realizado y resultado de la prueba.

## 10. Patrón para replicar en otra aplicación web

No se debe copiar `fase3_extractor_real.js` completo y cambiar selectores a
ciegas. La parte reutilizable es el contrato, no el DOM de WhatsApp.

Un adaptador para otra aplicación debería exponer conceptualmente:

```javascript
{
  isReady(page),
  listConversations(page),
  openConversation(page, target),
  extractVisibleMessages(page),
  activateVisibleMedia(page, processed),
  scrollToOlderMessages(page),
  closeConversation(page)
}
```

El núcleo común se encarga de:

- crear la sesión;
- deduplicar registros;
- descargar y nombrar adjuntos;
- generar CSV/JSON/PDF;
- calcular hashes;
- manejar logs, errores y estado;
- separar expedientes por conversación.

El adaptador específico solo conoce:

- cómo comprobar autenticación;
- cómo listar conversaciones;
- cómo localizar un mensaje;
- cómo activar multimedia lazy-loaded;
- cómo volver o cerrar una vista.

Para una nueva web, crear primero una matriz de descubrimiento:

| Capacidad | Pregunta | Evidencia mínima |
|---|---|---|
| Identidad | ¿Cómo se identifica la conversación? | id, título o URL |
| Mensaje | ¿Cuál es el contenedor raíz? | nodo estable |
| Autor/fecha | ¿Dónde están? | atributo o nodo semántico |
| Texto | ¿Cómo se separa de una cita? | selector de contenido |
| Multimedia | ¿Se carga por blob, modal o red? | URL y content-type |
| Paginación | ¿Cómo aparece el historial? | scroll, botón o cursor |
| Dedupe | ¿Qué permanece estable al rerenderizar? | id o clave compuesta |
| Evidencia | ¿Qué se graba y qué se descarga? | mapa de artefactos |

Después se implementa un solo caso de texto, se agrega deduplicación, luego
multimedia y por último los casos especiales. Así el cambio de una aplicación
no contamina el contrato de las demás.

## Arquitectura y plan de modularizacion

La arquitectura actual es funcional, pero el modulo activo de WhatsApp todavia
concentra varias responsabilidades en `fase3_extractor_real.js`: sesion de
navegador, catalogo, lectura del DOM, multimedia, orden, exportacion y
manifiesto. `renderer.js` concentra estado de pantallas, cola visual y
renderizado. Esto se considera deuda controlada, no un motivo para mover todo
antes de la prueba de carga.

La ejecucion ya conserva `operation.jsonl` en la raiz de la sesion. Sus eventos
permiten distinguir inicio, chat iniciado, chat omitido, chat completado, chat
fallido y cierre de sesion. Si un chat falla durante la navegacion o la
extraccion, se conserva `error.json` dentro de su carpeta y la sesion puede
continuar con los chats restantes. El estado global queda como
`completed_with_errors` cuando corresponde.

El parser DOM tiene un fixture ejecutable en
`test/fixtures/whatsapp/messages_mixed.html`. Antes de probar grupos reales se
debe ampliar ese fixture o agregar uno nuevo para el caso concreto; asi un
cambio de selector puede diagnosticarse sin abrir WhatsApp Web.

El refactor seguro debe conservar la API que usa `main.js` y avanzar en este
orden:

1. Congelar el contrato de `historial.json`, CSV, manifiesto y eventos de
   progreso.
2. Separar sesion y navegador.
3. Separar catalogo de conversaciones.
4. Separar adaptador DOM de mensajes y multimedia.
5. Separar escritura de expediente y validacion de manifiesto.
6. Dejar el archivo actual como orquestador compatible.
7. Separar estado de extraccion, cola visual y componentes de UI.

Cada movimiento debe conservar una prueba o fixture del caso que cubre. No se
deben cambiar selectores, contrato de datos y estructura de carpetas en el
mismo cambio sin una prueba de regresion.

## Regla de mantenimiento

Cuando aparezca un fallo:

1. conservar el expediente generado y el DOM relevante;
2. clasificarlo como catalogo, navegacion, DOM, multimedia, orden, salida,
   IPC o presentacion;
3. corregir una sola capa;
4. ejecutar `npm test`;
5. repetir una prueba real minima;
6. actualizar el handoff y el baseline si cambia el comportamiento esperado.

No se deben borrar los scripts legacy hasta confirmar que no contienen una
capacidad que falte en la ruta activa. Tampoco se deben copiar selectores de
WhatsApp directamente a Android/ADB: cada plataforma conserva su adaptador.

## 11. Criterio de cierre de esta etapa

Esta etapa documental se considera completa cuando:

- el equipo puede localizar la ruta activa sin leer todo el proyecto;
- cada caso DOM tiene selector, salida y limitación documentados;
- una persona puede reproducir una prueba controlada;
- una modificación de WhatsApp tiene un protocolo de diagnóstico;
- el expediente de una sesión no mezcla chats ni ejecuciones;
- el patrón de adaptador permite iniciar otra web sin copiar lógica específica.

Los siguientes puntos técnicos siguen abiertos: validación real de un grupo,
mensajes de sistema, encuestas/contactos/ubicaciones/documentos, criterio de
fin para historiales muy largos y grabación global opcional de toda la sesión.
