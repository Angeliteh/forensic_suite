# Handoff - estado actual del proyecto

Fecha de referencia: 2026-09-26

Este archivo es operativo: resume lo implementado, lo que aun no se ha probado
y el siguiente paso para retomar el trabajo en otra sesion. La explicacion
tecnica vive en:

- [05_arquitectura_multiplataforma.md](05_arquitectura_multiplataforma.md)
- [06_android_desde_cero.md](06_android_desde_cero.md)
- [08_mapa_tecnico_android_y_seguridad.md](08_mapa_tecnico_android_y_seguridad.md)
- [14_estado_whatsapp_web_y_plan.md](14_estado_whatsapp_web_y_plan.md)
- [15_manual_operativo_extraccion_web.md](15_manual_operativo_extraccion_web.md)
- [16_baseline_v1_whatsapp_web.md](16_baseline_v1_whatsapp_web.md)

## Punto de reanudacion actual

La referencia mas reciente para WhatsApp Web es
[16_baseline_v1_whatsapp_web.md](16_baseline_v1_whatsapp_web.md). La primera
version controlada ya respaldo dos chats con multimedia y genero sus
expedientes. La siguiente validacion prioritaria es una ejecucion con mas de
diez chats y conversaciones largas.

La funcionalidad esta validada en un escenario controlado, pero no se debe
presentar todavia como validada para cuentas grandes ni como producto forense
formal. La extraccion, la presentacion visual y la evidencia de pantalla son
capas distintas y deben conservarse separadas.

## Estado general

La aplicacion es una suite Electron/Node.js con paneles para:

- extraccion de galeria mediante ADB;
- laboratorio Android con inventario, mirroring y comandos educativos;
- acciones moviles acotadas sobre un dispositivo autorizado;
- extraccion de chats de WhatsApp Web;
- grabacion de escritorio con FFmpeg y generacion de evidencia.

El proyecto esta en consolidacion tecnica y pruebas controladas sobre
dispositivos propios. Todavia no debe presentarse como producto forense formal.

## Implementado

### Android

- `src/platform/android/android_adapter.js` centraliza ADB y scrcpy, seleccion
  por serial, capturas, `screenrecord`, `pull` y mirroring.
- `src/platform/android/adb_catalog.js` expone un catalogo limitado de comandos
  educativos.
- `src/platform/android/android_action_runner.js` limita las acciones a tap,
  swipe, espera, navegacion y captura; no acepta shell libre.
- `src/platform/android/android_gallery_rpa.js` implementa el primer checkpoint
  RPA visual: valida que Samsung Gallery este en primer plano, localiza
  `View all albums` por jerarquia UI, ejecuta un tap, un solo scroll y guarda
  XML, PNG, hashes y `rpa_gallery.json`. No copia archivos ni acepta comandos
  shell arbitrarios.
- `src/platform/android/android_connection.js` separa la preparacion de ADB
  del respaldo: USB, Wi-Fi ya emparejado y emparejamiento Wi-Fi por codigo.
- `src/platform/android/android_media_inventory.js` ejecuta un inventario de
  solo lectura sobre el almacenamiento compartido, sigue el alias `/sdcard`,
  normaliza `/storage/emulated/0`, descubre carpetas con imagenes/vídeos y
  clasifica usuario, multimedia de apps, ocultas, miniaturas y papelera.
- La interfaz ADB separa emparejamiento Wi-Fi nuevo (direccion + codigo) de
  conexion Wi-Fi ya emparejada y valida ambos endpoints antes de invocar ADB.
- El inventario clasifica cada serial como USB o Wi-Fi. El selector muestra
  solamente los dispositivos compatibles con el transporte elegido, evitando
  reutilizar por accidente un endpoint Wi-Fi cuando se eligio cable USB.
- La interfaz consulta dispositivos reales, inicia y detiene scrcpy y permite
  ejecutar acciones moviles guiadas.
- `adb exec-out uiautomator dump /dev/tty` conserva el XML completo en
  `Desktop\Forensic_Extractions\Android_Lab\ui_dumps` con SHA-256 y muestra en
  el panel una jerarquia resumida con paquete, nodos relevantes y bounds.
- El extractor ADB heredado fue reescrito para reutilizar el adaptador central,
  exigir serial cuando hay varias opciones, limitar rutas y devolver resultados
  consistentes.
- El panel incluye el checkpoint `Descubrir carpetas`: enumera rutas y muestras
  sin copiar archivos. En el telefono de laboratorio se observaron 21,745
  archivos multimedia en 231 carpetas, incluyendo 6,486 archivos de usuario,
  8,326 de multimedia de aplicaciones, 6,490 miniaturas y 395 de papelera.
- El respaldo completo usa ese inventario: incluye la papelera por defecto,
  deja las miniaturas como opcion y no intenta entrar en datos privados de
  aplicaciones.

### Electron y renderer

- El renderer ya no tiene acceso directo a Node.
- `preload.js` expone solo canales IPC permitidos.
- `contextIsolation` esta activo y `nodeIntegration` esta desactivado.
- Los logs se insertan como texto, no como HTML.
- La tabla de contactos se construye con nodos DOM y `textContent`.
- El panel Android fue reorganizado por etapas: dispositivo, observacion,
  evidencia y control guiado.
- La tarjeta de conexion tiene consulta, preparacion, estado y log propios;
  el respaldo, scrcpy y las acciones quedan bloqueados hasta validar el
  dispositivo.
- El frontend fue llevado a una estructura centrada en expediente: resumen,
  dispositivo, respaldo guiado, evidencia y laboratorio avanzado plegable.
- `docs/10_propuesta_visual_forensic_suite.html` conserva la referencia visual
  usada para el rediseño.
- El respaldo Android ahora tiene su propio estado y terminal visible dentro
  de la tarjeta de operacion; muestra progreso, exito y error sin depender del
  terminal antiguo al final de la pagina.
- El panel incluye pruebas de captura PNG, grabacion corta y plan de respaldo;
  las capturas y grabaciones reales se acompanian de SHA-256 y sidecar.
- El extractor ADB ya no hace `pull` completo como fallback cuando falla el
  listado de una ruta opcional. En modo de prueba omite la ruta y continua,
  evitando bloqueos largos por carpetas inexistentes.
- Las rutas de `adb shell` con espacios se envian como una sola orden citada;
  esto corrige `WhatsApp Images` y `WhatsApp Video`.
- Cada ejecucion crea ahora una carpeta `run_<timestamp>` dentro de
  `Extraccion_Fisica_ADB`; el informe de integridad solo enumera archivos de
  esa ejecucion y nunca mezcla resultados historicos.

### WhatsApp Web y evidencia visual

- La ruta activa es `fase3_extractor_real.js`; `2_auditoria_masiva.js` y
  `fase3_extraccion.js` son legacy y no deben ejecutarse desde el panel.
- La sesion de Edge usa el perfil persistente
  `%USERPROFILE%\\.forensic_whatsapp_session`; el panel separa abrir,
  comprobar y cerrar la sesion antes de leer chats.
- La extraccion recibe los chats seleccionados desde Electron y recorre el
  historial renderizado con scroll incremental de 90 px y pausas de 180 ms.
- El catalogo distingue conversaciones recientes y archivadas, entra mediante
  `chatlist-panel-archived-button`, espera `archived-chatlist` y guarda un
  catalogo JSON unificado antes de la seleccion.
- Cada auditoria de WhatsApp crea una carpeta `session_<timestamp>` y dentro
  coloca una carpeta `chat_###_<nombre>` por conversacion, junto con
  `session.json` y `conversaciones_seleccionadas.json`.
- `historial.csv` contiene `Metadatos`, `Mensaje`, `Enlaces`, `Tipo`,
  `Adjuntos`, `Estado visual` y `Respuesta`; `historial.json` conserva la
  estructura completa, incluyendo enlaces, vistas previas y citas.
- Los blobs visibles de imagen, video y audio se descargan a `multimedia/`
  cuando siguen disponibles en el DOM y se asocian al mensaje.
- FFmpeg crea segmentos por chat en `grabacion/` con H.264 `yuv420p`,
  `faststart` y `ffmpeg.log`; la captura empieza antes de buscar el chat y
  termina al finalizar el recorrido visible.
- El hashing se centralizo en `src/evidence/file_hash.js`.
- `src/evidence/whatsapp_artifacts.js` separa la construcción de `historial.csv`
  y `manifest.json` de la navegación del navegador; esto permite probar los
  artefactos con datos sintéticos antes de someterlos a una cuenta grande.
- `src/evidence/whatsapp_artifact_validator.js` revisa conteos JSON/CSV, rutas
  del manifiesto, hashes con formato válido y multimedia ausente sin abrir
  WhatsApp.
- Esa validación se ejecuta al cerrar cada chat y queda en `validation.json`;
  sus incidencias se reflejan también en el registro de operación y en el
  `session.json` mediante `validationStatus`.
- Se calculan hashes SHA-256 para video, log, CSV, JSON, PDF y multimedia, y
  se escribe un `manifest.json` por contacto.
- El hash demuestra integridad posterior; no demuestra por si solo autenticidad,
  origen o admisibilidad juridica.
- El estado detallado y el plan de archivados estan en
  [14_estado_whatsapp_web_y_plan.md](14_estado_whatsapp_web_y_plan.md).

## Verificacion

```powershell
npm test
```

La ultima ejecucion completa registro 44 pruebas correctas y tambien se reviso
la sintaxis de los modulos JavaScript principales. Todavia falta repetir una
prueba real masiva de WhatsApp con un grupo, una conversacion archivada y
conversaciones largas.

## Incidencia corregida en la primera prueba real

El Samsung SM-A546E fue detectado correctamente como `device`. La primera
ejecucion copio rutas de galeria, pero el listado de WhatsApp fallo porque la
ruta con espacios se dividia en `WhatsApp` e `Images`. El fallback intentaba
copiar la carpeta completa y alcanzaba el timeout de 120 segundos.

La implementacion actual omite rutas no disponibles, limita el modo de prueba
a dos archivos por ruta, usa un timeout de 60 segundos por archivo y muestra
el detalle en el panel. La prueba real anterior copio ocho archivos y genero
su informe de integridad; antes de cada nueva sesion hay que verificar
`adb devices -l`.

## Lo que sigue pendiente

- ADB esta disponible desde el SDK local de Windows y scrcpy funciona desde
  PATH en el entorno de desarrollo.
- La carpeta `bin` del empaquetado debe definirse con binarios redistribuibles y
  sus licencias correspondientes.
- El archivo heredado `2_auditoria_masiva.js` aun debe clasificarse como
  legacy o migrarse; no es el camino activo del panel.
- Validar manualmente la sesion observada Android completa: capturas, grabacion,
  archivos copiados, logs y manifiesto en una sola carpeta.
- Falta probar manualmente el flujo Wi-Fi moderno con el telefono y confirmar
  que el endpoint de emparejamiento y el endpoint de conexion sean los que
  muestra el panel de Depuracion inalambrica.
- Falta probar manualmente el checkpoint RPA de Galeria con mirroring activo:
  abrir Galeria en su pantalla principal, ejecutar `Explorar Galeria (1 scroll)`
  y revisar los XML/PNG del expediente `Android_Lab\\rpa_gallery`.
- Falta repetir WhatsApp Web con un chat propio y un grupo que contengan
  enlaces y multimedia, revisar `historial.csv`, `historial.json`, `multimedia/`,
  `grabacion/`, `ffmpeg.log` y `manifest.json`.
- Falta ejecutar la prueba de carga de la V1: diez o mas chats, al menos una
  conversacion larga, reconciliacion de conteos, duplicados, multimedia,
  memoria, espacio en disco y tiempo total.
- Falta verificar que la cola de presentacion visual no convierta una cuenta
  grande en una espera excesiva despues de que la extraccion ya termino.
- Falta crear acciones de exportacion visibles para usuarios no tecnicos:
  abrir sesion, CSV, PDF, multimedia y grabacion.
- La deuda de modularizacion esta identificada: `fase3_extractor_real.js`
  concentra varias capas y `renderer.js` concentra estado y renderizado. No
  refactorizar antes de congelar el contrato y completar la prueba masiva.
- Falta mejorar el criterio de fin del historial completo y confirmar un
  identificador estable para chats archivados sin `data-id`.
- Falta decidir e implementar la grabacion global opcional de toda la sesion;
  actualmente la grabacion es por chat.
- `npm start` usa `start.js` para limpiar `ELECTRON_RUN_AS_NODE` y arrancar
  Electron como aplicacion, no como proceso Node.

## Como retomar sin telefono

1. Ejecutar `npm test`.
2. Ejecutar `npm start`.
3. Abrir el panel Android.
4. Revisar el catalogo educativo y confirmar que las acciones reales exigen
   un dispositivo seleccionado.

## Primera sesion con telefono real

Antes de extraer archivos o grabar:

```powershell
adb devices -l
```

La aplicacion debe mostrar el serial esperado en estado `device`. Si aparece
`unauthorized`, hay que aceptar la clave en el telefono. Si aparece `offline`,
se detiene la prueba y se revisa el transporte.

Orden recomendado:

1. inventario y propiedades;
2. captura PNG puntual;
3. ejecutar el respaldo controlado con el checkbox de prueba activo;
4. revisar el terminal visible y confirmar que las rutas inexistentes se omiten;
5. validar los archivos copiados y sus hashes;
6. probar la sesion observada con grabacion y capturas;
7. revisar el manifiesto y el informe PDF;
8. respaldo completo de las rutas autorizadas.

## Siguientes cambios tecnicos

1. Ejecutar la prueba de carga de WhatsApp Web definida en
   [16_baseline_v1_whatsapp_web.md](16_baseline_v1_whatsapp_web.md).
2. Probar la sesion observada en el telefono real y revisar sus artefactos.
3. Probar Wi-Fi moderno y el checkpoint RPA de Galeria con mirroring activo.
4. Validar archivados, grupos y casos multimedia especiales; despues,
   implementar la grabacion global opcional de sesion.
5. Agregar las acciones de exportacion y un resumen de integridad para la UI.
6. Separar gradualmente el extractor de WhatsApp por capas, conservando su API.
7. Anadir modo `dry-run` que muestre argumentos antes de ADB real.
8. Ampliar el perfil de selectores de Galeria para otros fabricantes despues
   de validar el perfil Samsung.
9. Clasificar o retirar del camino activo los scripts legacy.
10. Definir empaquetado y verificacion de version de ADB/scrcpy.
11. Despues de estabilizar Android, disenar el adaptador iOS por separado.

El mapa de alcance multiplataforma esta en
[12_mapa_capacidades_android_ios_y_web.md](12_mapa_capacidades_android_ios_y_web.md).

## Regla de operacion

El modo real requiere seleccion explicita de dispositivo, rutas autorizadas,
registro de operaciones y confirmacion antes de acciones que modifiquen el
telefono. Las acciones moviles se limitan a tipos conocidos y tienen rangos
de coordenadas y tiempo definidos.
