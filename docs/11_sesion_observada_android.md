# Sesion observada de Android

## Objetivo

La sesion observada coordina tres salidas del laboratorio:

1. mirroring mediante scrcpy;
2. grabacion visual del mirroring;
3. respaldo ADB dentro de una carpeta propia de ejecucion.

Tambien puede tomar una captura antes y otra despues de la operacion. La
grabacion y las capturas se guardan con SHA-256. Cada sesion conserva un
`session.json` y un `session.log` para relacionar estados, mensajes y
artefactos.

Esta funcion no pretende ser una imagen completa del telefono. El respaldo ADB
actual cubre las rutas autorizadas del extractor y el acceso permitido por el
dispositivo; no incluye automaticamente datos privados de aplicaciones,
particiones protegidas ni bases de datos cifradas.

## Uso en el panel

1. Abrir **Android / Respaldo y observacion**.
2. Consultar dispositivos y seleccionar el serial correcto.
3. Mantener activa la **Prueba controlada** durante la primera ejecucion.
4. En **Sesion observada**, elegir grabacion, respaldo y capturas.
5. Iniciar la sesion.
6. Revisar la carpeta indicada en el registro y el informe PDF del respaldo.

La cancelacion detiene scrcpy y evita iniciar nuevas rutas del extractor. Los
archivos que ya se hayan generado se conservan para inspeccion.

## Control guiado manual

Para aprender la coordenacion entre pantalla y ADB se puede abrir **Mirroring**
con **Grabar esta sesion** activo. Mientras la ventana de scrcpy esta abierta,
el panel **Accion movil** permite ejecutar individualmente:

- `tap` con coordenadas `x/y`;
- `swipe` con origen, destino y duracion;
- espera acotada;
- `back` y `home`;
- captura PNG con hash.

Las acciones no reciben comandos shell escritos. El adaptador genera solamente
las formas permitidas de `adb shell input`, valida rangos y registra la accion
en la carpeta de la sesion manual. El video de scrcpy conserva la misma
secuencia visual que se esta controlando.

## Estructura de salida

```text
Desktop\Forensic_Extractions\Android_Lab\sessions\observed_<timestamp>\
  session.json
  session.log
  mirroring\session.mp4
  mirroring\session.mp4.sha256.txt
  screenshots\before.png
  screenshots\before.png.sha256.txt
  screenshots\after.png
  screenshots\after.png.sha256.txt
  adb\Informe_Integridad_<timestamp>.pdf
  adb\<fuente>\<archivos extraidos>
```

Los archivos opcionales solo aparecen si la salida correspondiente fue
activada y si el dispositivo la permitio.

## Limites actuales

- scrcpy es la capa de visualizacion y control; no es el motor RPA.
- La sesion observada no envia taps ni desplazamientos automaticos por si sola;
  el checkpoint RPA de Galeria es un flujo independiente y deliberadamente
  acotado.
- La navegacion visual no sustituye el `pull` de archivos.
- El video registra lo que aparece en pantalla, no todo el almacenamiento.
- El modo de prueba limita a dos archivos por fuente, igual que el extractor
  ADB existente.

## Siguiente capa: flujos RPA acotados

El primer checkpoint ya esta implementado en la tarjeta **RPA visual de
Galeria**. Con Galeria abierta y el mirroring activo, ejecuta esta secuencia:

```text
ui_dump inicial -> captura inicial -> localizar View all albums
-> tap semantico -> ui_dump/captura -> un scroll
-> ui_dump/captura final -> rpa_gallery.json
```

La salida queda en:

```text
Desktop\\Forensic_Extractions\\Android_Lab\\rpa_gallery\\gallery_<timestamp>\\
  ui_dumps\\before.xml
  ui_dumps\\after_albums.xml
  ui_dumps\\after_scroll.xml
  screenshots\\before.png
  screenshots\\after_albums.png
  screenshots\\after_scroll.png
  rpa_gallery.json
```

Si la app visible no es Samsung Gallery o no aparece el selector esperado,
el flujo se detiene sin pulsar coordenadas de respaldo. Todavia no recorre
todos los albumes ni sustituye el respaldo ADB; su finalidad es validar la
relacion entre jerarquia UI, accion y evidencia visual.

La automatizacion debe construirse sobre esta sesion con una lista de acciones
permitidas, no con comandos libres. Un primer flujo seguro seria:

```text
abrir Galeria
esperar pantalla esperada
capturar pantalla
deslizar un numero limitado de veces
capturar pantalla por paso
detener si la interfaz no coincide
```

Despues se puede crear un flujo equivalente para WhatsApp. Cada accion deberia
registrar tipo, coordenadas o selector, hora, resultado y captura asociada.
La extraccion de medios de WhatsApp seguira siendo una etapa separada para no
confundir evidencia visual con copia de archivos.

## ADB por Wi-Fi

El transporte cambia, pero las operaciones siguen usando ADB. Para Android 11
o superior se recomienda emparejar desde **Depuracion inalambrica** y despues
conectar el puerto ADB. El serial normalmente adopta la forma `IP:puerto` y la
sesion lo clasifica como `adb-wifi` en el manifiesto.

Usar solo una red confiable y desactivar la depuracion inalambrica al terminar.

## Verificacion de desarrollo

```powershell
npm test
npm start
```

La prueba automatizada cubre la creacion de la sesion y la integridad de los
modulos principales. La prueba real debe comenzar en modo controlado con un
unico telefono autorizado.
