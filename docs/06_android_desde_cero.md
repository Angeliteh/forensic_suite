# Android desde cero para esta suite

Para el mapa profundo de capas, flujo de ADB y seguridad, consulta
[08_mapa_tecnico_android_y_seguridad.md](08_mapa_tecnico_android_y_seguridad.md).

Este documento explica la ruta Android sin requerir todavía un teléfono conectado.
La meta es entender qué hace cada capa antes de automatizar o extraer datos.

## 1. El modelo mental

```text
Suite Electron / Node.js
        |
        | ejecuta comandos
        v
Cliente adb en Windows
        |
        | puerto USB o TCP/IP
        v
Servidor adb en la computadora
        |
        | canal autenticado
        v
adbd dentro de Android
        |
        +-- screencap / screenrecord
        +-- pull de almacenamiento compartido
        +-- input para taps y gestos
```

`adb` no es una conexión directa sencilla desde Node. Normalmente existe un
cliente, un servidor ADB en la computadora y un daemon `adbd` en el teléfono.
El teléfono debe estar desbloqueado y aceptar la clave RSA de la computadora.

## 2. Estados que veremos

| Estado | Significado |
|---|---|
| `device` | Conectado y autorizado |
| `unauthorized` | El teléfono espera aprobar la computadora |
| `offline` | La conexión existe pero no responde correctamente |
| Sin entrada | No hay dispositivo visible para ADB |

La suite no debe asumir que el primer dispositivo es el correcto. Cuando haya
más de uno, deberá exigir selección explícita por serial.

## 3. Capacidades y límites

### ADB

- `adb devices -l`: inventario.
- `adb exec-out screencap -p`: captura PNG directa al equipo.
- `adb shell screenrecord`: grabación en el almacenamiento del teléfono.
- `adb pull`: copia de archivos hacia el equipo.
- `adb shell input`: eventos básicos de entrada.

ADB no proporciona por sí solo una interfaz visual cómoda ni selectores
semánticos de la aplicación.

### scrcpy

scrcpy usa ADB como transporte y añade visualización, control por teclado y
ratón y grabación. Es la opción adecuada para observar manualmente una sesión
del teléfono antes de automatizarla.

### Appium/UIAutomator

Appium agrega una capa de automatización que puede localizar elementos de la
interfaz. Es más estable que coordenadas fijas, pero requiere una configuración
adicional y debe tratarse como un módulo separado del respaldo.

## 4. Por qué el proyecto usa tres rutas

```text
Archivo original       -> ADB pull
Pantalla visible       -> scrcpy o screenrecord
Elemento de interfaz   -> Appium/UIAutomator
```

Una grabación no reemplaza los archivos originales. Un `pull` tampoco demuestra
por sí solo qué aplicación estaba visible. Por eso pueden coexistir en un mismo
expediente, con hashes y logs independientes.

## 5. Laboratorio offline

Antes de conectar el teléfono, se ejecutan:

```powershell
npm test
```

Las pruebas usan salidas simuladas de ADB y archivos temporales. Verifican que
el adaptador interprete dispositivos, valide rutas, construya comandos y guarde
capturas sin hablar con un dispositivo real.

Después, la primera prueba física será únicamente:

```powershell
adb devices -l
```

No se hará `pull`, grabación ni automatización hasta confirmar que el modelo del
dispositivo y su estado son los esperados.

## 6. Linux no es lo mismo que Android

Android usa el kernel Linux, pero no es una distribucion de escritorio con una
interfaz movil encima. La diferencia principal esta en las capas superiores y
en el modelo de seguridad:

```text
Linux de escritorio             Android
------------------             ----------------------------
Procesos/usuarios               Procesos + UID por aplicacion
systemd y servicios             init + system_server
POSIX y herramientas GNU        Framework Android + APIs Java/Kotlin
Archivos accesibles              Almacenamiento mediado y sandbox
X11/Wayland                      SurfaceFlinger y ventanas Android
Bibliotecas nativas              ART + bibliotecas nativas + HAL
```

La base sigue siendo un kernel: procesos, memoria virtual, sockets, drivers,
permisos Unix y dispositivos. Android anade varias capas:

- **ART:** ejecuta bytecode DEX de las aplicaciones y puede compilarlo para el
  procesador del telefono.
- **Framework Android:** servicios como Activity Manager, Package Manager,
  Media Server y Window Manager.
- **Binder:** IPC del kernel usado para que aplicaciones y servicios hablen de
  forma controlada.
- **HAL:** interfaces que separan el framework de camaras, audio, sensores,
  pantalla y componentes especificos del fabricante.
- **SELinux:** controles obligatorios que restringen incluso a procesos que
  ya tienen permisos Unix aparentes.
- **SurfaceFlinger:** compone las superficies de las aplicaciones para formar
  la imagen que termina en pantalla.

La arquitectura oficial de AOSP describe estas capas como kernel, HAL,
bibliotecas nativas, runtime ART, framework y aplicaciones. [AOSP: arquitectura](https://source.android.com/docs/core/architecture)

## 7. Que significa el sandbox

Cada aplicacion recibe normalmente un UID Linux distinto y su propio espacio
privado:

```text
/data/data/app.a/  <- accesible para app.a
/data/data/app.b/  <- no accesible para app.a
/sdcard/DCIM/      <- almacenamiento compartido, sujeto a permisos y version
```

Por eso ADB puede acceder normalmente a almacenamiento compartido como
`/sdcard/DCIM`, pero no puede leer libremente la base privada de otra
aplicacion en `/data/data/...` sin privilegios adicionales o un mecanismo de
respaldo autorizado.

ADB tampoco equivale automaticamente a root. La autorizacion del dispositivo
permite usar el daemon `adbd`, pero los comandos siguen sujetos a los permisos
del build, del usuario y de las politicas de Android.

La documentacion de seguridad de AOSP describe el sandbox como una separacion
basada en UID, procesos y controles del kernel. [AOSP: sandbox de aplicaciones](https://source.android.com/docs/security/app-sandbox)

## 8. Que puede hacer ADB

### Puede hacer, normalmente

- Enumerar dispositivos y consultar propiedades.
- Capturar pantalla y grabar la pantalla.
- Copiar archivos del almacenamiento compartido autorizado.
- Enviar eventos basicos de entrada.
- Instalar o desinstalar paquetes cuando el dispositivo y el usuario lo
  permiten.
- Consultar logs y estado del sistema dentro de los limites disponibles.

### No puede hacer automaticamente

- Leer todas las bases privadas de todas las aplicaciones.
- Saltarse el bloqueo de pantalla de forma legitima.
- Convertir un telefono no autorizado en un dispositivo autorizado.
- Garantizar acceso a datos cifrados.
- Sustituir una automatizacion semantica de Appium con simples coordenadas.

La capacidad efectiva depende de la version de Android, fabricante, permisos,
estado del dispositivo, perfil de usuario, depuracion USB y si existe root.

## 9. Android frente a iOS

Android expone una superficie de depuracion mas amplia mediante ADB. iOS usa un
modelo mas cerrado basado en sandbox, firma de codigo, entitlements y
servicios de emparejamiento. Las aplicaciones de terceros no pueden acceder
libremente a los datos de otras aplicaciones; el sistema media ese acceso.

Por eso la suite debe tratar iOS como otro adaptador, no como "Android sin
ADB":

```text
Android -> ADB / scrcpy / Appium
iOS     -> respaldo local / protocolos Apple / XCUITest cuando aplique
```

Apple documenta que las aplicaciones iOS estan aisladas mediante sandbox y que
el acceso entre aplicaciones se realiza mediante servicios explicitos del
sistema. [Apple: seguridad del runtime](https://support.apple.com/en-ca/guide/security/sec15bfe098e/web)

## 10. Modelo defensivo de amenazas

Para aprender seguridad no necesitamos empezar explotando un dispositivo. Es
mas util identificar primero las fronteras que deberian protegerlo:

1. **Emparejamiento:** una computadora no deberia poder usar ADB sin que el
   usuario apruebe la clave o revoque autorizaciones antiguas.
2. **Transporte:** ADB por WiFi debe limitarse a una red confiable y apagarse
   cuando ya no sea necesario.
3. **Privilegios:** ADB autorizado no equivale a root; el sandbox y SELinux
   siguen siendo fronteras importantes.
4. **Datos:** el almacenamiento compartido, los respaldos cifrados y los datos
   privados de cada aplicacion tienen niveles de acceso diferentes.
5. **Trazabilidad:** una herramienta de respaldo debe registrar que dispositivo
   se selecciono, que rutas leyo y que archivos produjo.
6. **Estado del sistema:** root, bootloader desbloqueado, depuracion persistente
   o perfiles de trabajo pueden cambiar el resultado y deben quedar anotados.

Estudiaremos posibles abusos como escenarios de defensa: que señal dejan, que
control los evita y como documentarlos. La suite no necesita implementar
bypasses ni mecanismos de vigilancia para aprender esas fronteras.

## 11. Acciones moviles controladas

El panel operativo trabaja sobre un dispositivo real seleccionado. El
explorador educativo ejecuta comandos concretos de solo lectura; el control
guiado usa un catalogo separado de acciones:

| Accion | Operacion | Limite |
|---|---|---|
| `tap` | `adb shell input tap x y` | Coordenadas enteras acotadas |
| `swipe` | `adb shell input swipe ...` | Duracion de 50 a 5000 ms |
| `wait` | Pausa local | Maximo 10 segundos |
| `back` / `home` | Keyevent Android | Tipo fijo, sin shell libre |
| `screenshot` | `exec-out screencap -p` | Nombre de archivo validado |

Estas acciones se pueden observar en scrcpy y grabar en el mismo expediente.
La aplicacion no interpreta una linea arbitraria de PowerShell o `adb shell`;
cada tipo se valida antes de llegar al adaptador.

El control real permite estudiar las diferencias con RPA de escritorio:
coordenadas dependientes de resolucion, latencia, cambios de orientacion,
transiciones de pantalla y necesidad de verificar el estado visual antes de
continuar. La siguiente capa sera una secuencia con esperas y validaciones de
interfaz, no un ejecutor de comandos genérico.

## Referencias

- [Android Debug Bridge — documentación oficial](https://developer.android.com/tools/adb)
- [scrcpy — repositorio oficial](https://github.com/Genymobile/scrcpy)
