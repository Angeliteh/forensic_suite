# Mapa tecnico de Android y seguridad

Este documento conserva lo aprendido mientras construimos el laboratorio de la
suite. Su objetivo es conectar cada operacion visible de la interfaz con la
capa de Android que realmente participa. No es un manual de exploits ni de
acceso no autorizado: el laboratorio parte de un dispositivo propio,
autorizado y documentado.

## 1. La pila completa: del hardware a una app

Android se entiende mejor como una pila. Linux es una parte fundamental, pero
Android agrega muchas capas encima que definen el modelo de aplicaciones,
permisos, ventanas y servicios.

```text
Aplicaciones y SystemUI
        |
        | APIs publicas: Activity, Media, Storage, Input, Notifications
        v
Framework Android y system_server
        |
        | Binder: llamadas entre procesos y servicios del sistema
        v
ART + bibliotecas Java / C++ + Bionic
        |
        | HAL: interfaz estable hacia camara, audio, pantalla, sensores
        v
init, daemons, SELinux y servicios nativos
        |
        | syscalls, drivers, memoria, procesos, red, almacenamiento
        v
Kernel Linux
        |
        v
Hardware, firmware y componentes de seguridad
```

La separacion es conceptual: algunos componentes se cruzan en la practica,
pero este mapa sirve para ubicar una observacion.

### Kernel Linux

El kernel administra procesos, memoria virtual, planificacion de CPU, red,
dispositivos y sistemas de archivos. Los drivers convierten operaciones de
alto nivel en acciones sobre el hardware. Android tambien usa hooks de
seguridad del kernel, especialmente para aplicar SELinux.

El kernel no sabe que existe WhatsApp como concepto. Para el kernel existen
procesos, UID, archivos, sockets, dispositivos y llamadas al sistema.

### `init`, daemons y SELinux

`init` arranca servicios de userspace. Entre ellos se encuentran procesos que
preparan almacenamiento, conectividad y otros servicios nativos. SELinux
agrega una politica obligatoria: aunque un proceso tenga permisos Unix
aparentes, una regla de la politica puede impedir la operacion.

Esta es una de las razones por las que "tener una terminal" no equivale a
tener acceso total.

### HAL y bibliotecas nativas

La HAL permite que el framework use camara, audio, sensores y otros
componentes sin depender directamente de cada driver del fabricante. Bionic,
las bibliotecas C/C++ y servicios nativos forman el puente entre el framework y
el kernel.

### ART y el framework

ART ejecuta el codigo de las aplicaciones Android. El framework ofrece APIs y
servicios como ActivityManager, PackageManager, WindowManager, InputManager,
Media y Storage. Muchos servicios centrales viven en `system_server` y se
comunican mediante Binder.

### Aplicaciones, SystemUI y SurfaceFlinger

Una app dibuja una interfaz y solicita servicios mediante APIs del framework.
SurfaceFlinger compone las superficies visibles y coordina la salida a la
pantalla. SystemUI muestra elementos del sistema como barra de estado,
notificaciones y controles de navegacion.

## 2. Que ocurre durante una operacion de la suite

### Consultar una propiedad

```text
Panel Electron
  -> IPC de Electron
  -> AndroidAdapter
  -> cliente adb / servidor adb
  -> transporte USB o TCP
  -> adbd
  -> shell getprop
  -> respuesta por stdout
```

`getprop` consulta propiedades expuestas por el sistema. No abre por si mismo
las bases privadas de las aplicaciones.

### Capturar la pantalla

```text
adb exec-out screencap -p
  -> adbd ejecuta la utilidad
  -> Android obtiene una imagen de la composicion de pantalla
  -> bytes PNG regresan por stdout
  -> Node los guarda en un archivo
```

La captura representa lo visible en ese instante. No es un volcado de todos
los datos internos de las aplicaciones.

### Grabar la pantalla

```text
adb shell screenrecord /sdcard/Lab/session.mp4
  -> Android captura la composicion de pantalla
  -> MediaCodec codifica video
  -> el archivo se guarda en almacenamiento compartido
  -> adb pull copia el archivo al equipo
```

La grabacion y la captura de archivos originales son evidencias distintas:
una conserva una secuencia visual y la otra conserva bytes de origen.

### Respaldar la galeria

```text
adb pull /sdcard/DCIM/Camera/ destino/DCIM/Camera/
adb pull /sdcard/Pictures/ destino/Pictures/
adb pull /sdcard/Download/ destino/Download/
```

`pull` solicita una transferencia a traves de `adbd`. El resultado depende de
las rutas existentes, el usuario, el perfil Android y los permisos efectivos.
La suite debe registrar el serial, las rutas y los hashes de los archivos
recibidos.

### Mirroring con scrcpy

scrcpy usa ADB para iniciar un componente servidor temporal en Android y
transportar video y eventos de entrada. La ventana en Windows es una vista y
un canal de control; no convierte a la PC en root ni elimina el sandbox de las
aplicaciones. Sus opciones de audio, control y grabacion deben tratarse como
capacidades separadas.

## 3. El modelo de seguridad

### Identidad y sandbox

Las aplicaciones suelen ejecutarse con UID propios. El aislamiento combina
UID, permisos Unix, procesos separados, almacenamiento protegido y politicas
SELinux. Una aplicacion normal no puede leer libremente `/data/data/` de otra.

### Almacenamiento compartido

`/sdcard/` es la ruta historica que normalmente representa el almacenamiento
compartido del usuario. Es distinto de los directorios privados de cada app.
En Android moderno tambien intervienen MediaStore y Scoped Storage, por lo
que la ruta visible y el permiso efectivo no siempre cuentan toda la historia.

### ADB y el usuario `shell`

Una sesion ADB autorizada usa `adbd` y, normalmente, comandos bajo el usuario
`shell`. Eso permite diagnostico, capturas, transferencia autorizada y ciertas
operaciones de entrada, pero no equivale automaticamente a root. El resultado
varia por version, fabricante, build, perfil de usuario, depuracion y estado
de bloqueo.

### Por que la autorizacion importa

La primera conexion USB suele mostrar una solicitud para aceptar la clave RSA
de la computadora. Esa aprobacion crea una frontera de confianza. Por eso el
flujo real debe comprobar:

1. que el cable o red pertenece al entorno controlado;
2. que el serial mostrado es el dispositivo esperado;
3. que el estado es `device`, no `unauthorized` u `offline`;
4. que la depuracion se desactiva o se revocan autorizaciones al terminar.

## 4. Como encaja el laboratorio seguro

La suite tiene dos niveles operativos que no deben mezclarse:

| Nivel | Implementacion | Que valida |
|---|---|---|
| Adaptador probado | `android_adapter.js` + tests | Construccion de argumentos, validacion de rutas y manejo de procesos |
| Dispositivo real | ADB/scrcpy + acciones acotadas | USB, RSA, permisos, ROM, rendimiento y comportamiento efectivo |

La secuencia real agrega transporte, autorizacion y permisos:

```text
comando -> adb -> adbd -> shell/servicio Android -> permisos/SELinux -> resultado
```

## 5. Matriz de decisiones para la suite

| Necesidad | Camino principal | Resultado |
|---|---|---|
| Saber que telefono esta conectado | `adb devices -l` | Inventario y serial |
| Saber modelo o version | `adb shell getprop` | Propiedades del sistema |
| Ver lo que ocurre | scrcpy | Vista interactiva |
| Guardar una imagen puntual | `exec-out screencap -p` | PNG |
| Guardar una secuencia visual | `screenrecord` o scrcpy con grabacion | Video |
| Conservar archivos originales | `adb pull` | Copia de bytes |
| Localizar elementos de interfaz | UIAutomator/Appium | Arbol/selectores, no respaldo |
| Conservar integridad | SHA-256 + manifest | Verificacion posterior |

Ningun camino sustituye a todos los demas. Un video no reemplaza los archivos
originales y un `pull` no demuestra por si solo que aplicacion estaba visible.

## 6. Metodo de aprendizaje

Para cada capacidad conviene estudiar en este orden:

1. **Modelo:** que capa produce el resultado.
2. **Comando:** que argumentos se envian.
3. **Estado:** que cambia y que no cambia.
4. **Limite:** permisos, ruta, usuario o version que puede bloquearlo.
5. **Evidencia:** que archivo, log, hash y metadatos deben conservarse.
6. **Prueba real:** despues de los tests automatizados y con un unico serial autorizado.

Este orden transforma ADB de una lista de comandos en un sistema observable:
transporte, daemon, servicio, seguridad, resultado y trazabilidad.

## Referencias oficiales

- [Android Debug Bridge](https://developer.android.com/tools/adb)
- [Arquitectura de Android en AOSP](https://source.android.com/docs/core/architecture)
- [Sandbox de aplicaciones Android](https://source.android.com/docs/security/app-sandbox)
- [SELinux en Android](https://source.android.com/docs/security/features/selinux)
- [scrcpy, repositorio oficial](https://github.com/Genymobile/scrcpy)
