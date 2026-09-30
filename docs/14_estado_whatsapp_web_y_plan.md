# Estado de WhatsApp Web y plan de cierre

Fecha de referencia: 2026-09-26

Este documento separa lo que existe en el modulo activo de lo que sigue siendo
una idea o un script legacy. La ruta activa es `fase3_extractor_real.js` y se
invoca desde el panel Electron; `2_auditoria_masiva.js` y `fase3_extraccion.js`
no forman parte del flujo normal.

La guía operativa canónica, con el flujo completo, contrato de datos, matriz
de casos DOM y protocolo para adaptar otra web, está en
[15_manual_operativo_extraccion_web.md](15_manual_operativo_extraccion_web.md).

## Lo que ya existe

0. **Preparacion explicita desde el panel.** La interfaz permite abrir el
   navegador, escanear el QR si hace falta, comprobar la sesion y cerrarla.
   La lectura de chats queda bloqueada hasta que el selector de lista confirme
   que WhatsApp Web esta autenticado.
1. **Sesion del navegador.** Playwright abre un perfil persistente en
   `%USERPROFILE%\\.forensic_whatsapp_session`, navega a WhatsApp Web y espera
   que la lista de chats este disponible. El flujo actual solicita Microsoft
   Edge mediante `channel: 'msedge'`.
2. **Catalogo de conversaciones.** El panel descubre conversaciones recientes
   y archivadas, recorre sus listas virtualizadas y genera un catalogo unico
   con nombre visible, origen, tipo, ultimo mensaje visible y actividad.
   El panel permite seleccionar objetos de conversacion, aunque conserva
   compatibilidad con nombres recibidos por el flujo legacy.
3. **Extraccion logica.** Por cada chat seleccionado busca el titulo exacto,
   abre el chat y lee los mensajes renderizados mediante
   `div[data-testid="msg-container"]` y `data-pre-plain-text`.
4. **Recorrido controlado.** En modo de prueba hace dos iteraciones. En modo
   completo permite hasta 5,000 iteraciones y se detiene despues de tres
   iteraciones sin mensajes nuevos. Cada iteracion desplaza el panel en pasos
   pequenos de 90 px con pausas de 180 ms para que la grabacion sea legible.
   Es un limite operativo, no una garantia de que exista todo el historial.
5. **Evidencia visual.** FFmpeg graba el escritorio por chat desde antes de
   buscarlo hasta terminar el recorrido visible del historial. La salida usa
   H.264 `yuv420p`, un formato reproducible por los reproductores comunes de
   Windows, y conserva un `ffmpeg.log` por ejecucion. Esto documenta lo que se
   ve en pantalla; no es una copia de la base de datos de WhatsApp.
6. **Resultados.** Cada chat produce `historial.csv` con texto, enlaces,
   tipo, adjuntos, estado visual y respuestas; `historial.json` con la estructura completa; una carpeta
   `multimedia/` para blobs visibles descargables;
   `certificado_integridad.pdf`, una carpeta `grabacion/` con segmentos de
   video cuando FFmpeg esta disponible, `ffmpeg.log`, sidecars SHA-256 y
   `manifest.json` en `Desktop\\Forensic_Extractions\\Auditoria_WhatsApp`.
   La sesión conserva además `operation.jsonl` con eventos estructurados y su
   hash en `session.json`.

## Presentacion unificada y estado de validacion

La extraccion y el resultado utilizan la misma vista de expediente:
conversaciones a la izquierda y chat a la derecha. Los lotes estructurados se
encolan y los mensajes se presentan uno por uno; los chats siguientes quedan
en espera hasta que termina la presentacion visual del chat activo. El evento
`chat-complete` actualiza el estado sin volver a insertar mensajes.

El flujo ya fue comprobado con dos chats y multimedia. La suite automatizada
actual tiene 44 pruebas correctas. Todavia no se ha validado una cuenta con mas
de diez chats, conversaciones muy largas ni una ejecucion extensa con
grabacion.

Los artefactos ya se generan en disco, pero falta exponer acciones sencillas
para usuarios no tecnicos: abrir la sesion, CSV, PDF, multimedia y grabaciones.
La terminal debe conservarse como registro tecnico opcional, no como la vista
principal.

## Lo que no debe darse por terminado

- **Chats archivados:** el flujo ya localiza
  `button[data-testid="chatlist-panel-archived-button"]`, entra en Archivados,
  espera `data-testid="archived-chatlist"`, vuelve con `Atrás` y agrega esas
  conversaciones al catalogo. Ya existe una validación real de un chat
  archivado; queda estabilizar un identificador distinto del nombre cuando
  WhatsApp no expone `data-id`.
- **Historial completo:** WhatsApp Web virtualiza mensajes y puede cargar
  historico bajo demanda. El CSV contiene lo que el DOM llego a renderizar y
  recorrer, no una garantia de totalidad.
- **Multimedia del chat:** el modulo activo descarga blobs visibles de imagen,
  video y audio cuando siguen disponibles en el DOM y los asocia al mensaje.
  No es una garantia de que WhatsApp Web haya renderizado todos los adjuntos;
  los mensajes virtualizados, blobs expirados y cambios de selectores siguen
  requiriendo una prueba controlada.
- **Compatibilidad:** los selectores `data-testid` pueden cambiar con nuevas
  versiones de WhatsApp Web. No hace falta una configuracion por telefono,
  pero si puede requerirse adaptar selectores o el navegador del equipo.
- **Prueba densa pendiente:** ya se comprobo el flujo controlado con dos chats;
  falta ejecutarlo con mas de diez chats, al menos una conversacion larga, un
  grupo y, si es posible, un chat archivado. FFmpeg debe estar disponible en
  PATH o en `FFMPEG_PATH` para la prueba visual.

## Relacion entre respaldo logico y visual

```text
WhatsApp Web + Playwright
        |-- mensajes renderizados -> CSV/PDF/manifest
        |-- FFmpeg -> video de la navegacion visible
        `-- futuras capturas por checkpoint -> estado y selector
```

El CSV/PDF permite buscar y revisar datos estructurados. El video conserva la
secuencia visual del navegador. Son evidencias complementarias y ambas deben
conservar su hash; ninguna convierte por si sola el resultado en una prueba
juridica automaticamente admisible.

## Estructura recomendada de grabacion

Cada ejecucion completa crea una sesion independiente para que distintas
auditorias no mezclen sus artefactos:

```text
session_<timestamp>/
  session.json
  conversaciones_seleccionadas.json
  chat_001_<nombre>/
    grabacion/
      video_parte_000.mp4
      video_parte_000.mp4.sha256.txt
      ffmpeg.log
    multimedia/
      001_imagen.jpg
      002_video.mp4
    historial.csv
    historial.json
    certificado_integridad.pdf
    manifest.json
```

El video por chat facilita revisar o entregar un expediente individual. No
debe confundirse con un respaldo completo: solo registra la interfaz que se
mostro y la navegacion que el automatizador realizo.

Para una version de produccion, la mejor evolucion es un esquema hibrido:

- una grabacion global segmentada de la sesion completa, desde el inicio de
  la auditoria hasta el cierre;
- una carpeta independiente por chat con CSV, PDF, manifiesto y capturas de
  checkpoints;
- video individual por chat como opcion, no como duplicado obligatorio.

Asi se conserva continuidad cuando se cambia de chat, pero se mantienen
artefactos faciles de revisar. Esa grabacion global aun no esta implementada;
la salida activa es por chat.

## Prueba densa pendiente

Antes de continuar con mejoras grandes de interfaz se debe ejecutar:

1. Tres a cinco chats con grabacion desactivada para confirmar conteos y orden.
2. Diez o mas chats, incluyendo un chat largo, un grupo y, si es posible,
   uno archivado.
3. La misma carga con grabacion activada.
4. Reconciliacion de JSON, CSV, manifiestos, multimedia, errores, memoria,
   espacio y tiempo total.

La cola visual puede tardar mas que la extraccion real; ese tiempo debe medirse
por separado. El protocolo completo esta en
[16_baseline_v1_whatsapp_web.md](16_baseline_v1_whatsapp_web.md).

## Siguiente secuencia de trabajo

1. Leer primero [15_manual_operativo_extraccion_web.md](15_manual_operativo_extraccion_web.md),
   ejecutar `npm test` y abrir `npm start`.
2. Verificar `msedge --version` y `ffmpeg -version`.
3. Leer chats recientes y ejecutar un solo chat en **Prueba controlada**.
4. Revisar CSV, JSON, carpeta `multimedia/`, PDF, video, `ffmpeg.log`,
   sidecars y manifiesto con un chat propio que contenga enlaces y adjuntos.
5. Implementar una grabacion global opcional para la sesion completa, sin
   sustituir los artefactos por chat.
6. Repetir la prueba con un chat archivado propio y confirmar su expediente.
7. Probar un grupo con autor por mensaje, sticker, emoji, edicion y eliminacion.
8. Despues estabilizar archivados, ampliar multimedia y mejorar el criterio de
   fin del historial.

## Higiene del proyecto

- `dist/` es salida de empaquetado regenerable y no pertenece al codigo fuente.
- `whatsapp_session/` es un perfil Chromium legacy dentro del proyecto y
  puede contener estado de sesion; no se debe borrar sin confirmar que ya no
  se necesita.
- `Auditorias/`, `Extraccion_Fisica_ADB/` y `videos/` pueden contener
  evidencia; se conservan hasta clasificar cada ejecucion.
- `dom_mensajes_muestra.html`, `historial_prueba.csv` y `master_index.csv`
  son artefactos o entradas de la ruta legacy y pueden contener datos reales.
