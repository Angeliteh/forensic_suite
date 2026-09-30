# Mapa de capacidades: Android, iOS y web

Este documento fija el alcance real de la suite. La palabra "respaldo" no
significa lo mismo en todas las rutas: cada transporte expone una parte
distinta del dispositivo y debe conservarse como una fuente separada.

## La diferencia esencial

| Ruta | Que observa | Que permite | Limite principal |
| --- | --- | --- | --- |
| ADB USB o Wi-Fi | El dispositivo Android autorizado y sus interfaces ADB | Inventario, capturas, comandos acotados y copia de rutas accesibles | No es una imagen fisica ni abre por si solo `/data/data` o bases privadas |
| scrcpy | La pantalla del Android real | Mirroring, entrada, grabacion y observacion en tiempo real | No es un emulador ni un extractor; depende de ADB |
| WhatsApp Web | La cuenta mediante un dispositivo vinculado | Chats y multimedia que el cliente web carga | No representa todo el almacenamiento local ni todos los datos privados de la app |
| Google Photos, Samsung Gallery/OneDrive u otra nube | La biblioteca sincronizada | Consulta o descarga desde una interfaz web | Es una copia sincronizada, no necesariamente el archivo original del telefono |
| Apple Devices/Finder/iTunes | Un iPhone emparejado y su respaldo local | Copia local, especialmente util si esta cifrada y se conoce la contrasena | No equivale a ADB; requiere un transporte y herramientas de Apple |

## Wi-Fi ADB: QR, codigo y marcas

El QR y el codigo no son dos tipos distintos de ADB. Son dos maneras de
establecer el mismo emparejamiento de depuracion inalambrica.

- Android 11 / API 30 o posterior soporta el flujo moderno de depuracion
  inalambrica.
- El telefono y el equipo deben estar en la misma red Wi-Fi y conviene usar
  las Platform-Tools actualizadas.
- El telefono muestra una direccion de emparejamiento temporal y una
  direccion de conexion; sus puertos pueden ser distintos.
- El codigo de emparejamiento tiene seis digitos. El QR suele iniciarse desde
  Android Studio y evita teclear ese codigo.
- La funcion depende principalmente de la version de Android y del soporte
  que el fabricante exponga en Ajustes de desarrollador, no de que sea una
  marca concreta.
- Android 10 / API 29 y anteriores usan el flujo antiguo, normalmente con una
  primera conexion USB y `adb tcpip 5555`; no es el mismo flujo QR/codigo.

En esta suite, `Emparejar por Wi-Fi` solicita ambos endpoints y el codigo.
`Wi-Fi ya emparejado` solo solicita el endpoint de conexion. El QR queda como
una comodidad futura: se puede hacer el emparejamiento una vez desde Android
Studio y continuar desde la suite con la conexion ya emparejada.

Referencia: [documentacion oficial de ADB inalambrico](https://developer.android.com/tools/adb#wireless).

## Que cubrimos hoy en Android

La suite ya cubre un nucleo util para laboratorio:

1. Seleccion explicita de un dispositivo ADB en estado `device`.
2. Transporte USB y transporte Wi-Fi moderno por codigo.
3. Copia controlada de DCIM, Pictures, Download y rutas publicas de
   multimedia de WhatsApp cuando existen y son accesibles.
4. Capturas, `screenrecord`, hash SHA-256, logs, manifiesto y carpetas por
   ejecucion.
5. scrcpy para observar, controlar y grabar el Android real.
6. Acciones guiadas limitadas: tap, swipe, espera, atras, inicio y captura.
7. WhatsApp Web como fuente web independiente.

Eso no equivale a cubrir "todo Android". Todavia quedan fuera o dependen del
modelo, la version, los permisos y el estado del equipo:

- imagen fisica completa del almacenamiento;
- `/data/data` y bases privadas de aplicaciones sin root o sin un mecanismo de
  respaldo permitido;
- todos los proveedores multimedia, carpetas OEM y variantes de WhatsApp;
- automatizacion semantica por selectores, aserciones visuales y secuencias
  RPA completas;
- validacion formal de autenticidad, cadena de custodia o admisibilidad.

La forma correcta de describirlo es: **respaldo logico controlado de zonas
accesibles de Android, con observacion visual y fuentes web complementarias**.

## WhatsApp Web e iPhone

WhatsApp Web funciona como capa de cuenta vinculada. Por eso la ruta web puede
usarse aunque el telefono principal sea Android o iPhone: el sistema operativo
del telefono queda detras del cliente de WhatsApp y no se convierte en ADB.
La suite puede mantener esa ruta comun para ambos sistemas, siempre que el
usuario vincule el navegador desde el telefono principal.

La ruta web debe etiquetarse como `WhatsApp Web`, no como `extraccion iOS` ni
como `imagen del telefono`. Solo contiene lo que el cliente web presenta,
carga y permite exportar.

Referencia: [dispositivos vinculados de WhatsApp](https://faq.whatsapp.com/378279804439436/?cms_platform=android&helpref=hc_fnav&locale=es_LA).

## Futuro iOS

iOS no tiene un equivalente directo de ADB + scrcpy para este proyecto.
La ruta razonable seria un adaptador separado:

1. detectar y documentar la confianza del equipo;
2. crear un respaldo local con Apple Devices en Windows o Finder en macOS;
3. manejar respaldos cifrados cuando el operador conozca la contrasena;
4. analizar el respaldo con un inventario propio;
5. tratar la automatizacion visual como una capacidad aparte.

`XCUIAutomation` y `XCTest` sirven principalmente para pruebas UI de apps y
requieren el ecosistema de Apple; no son una consola universal equivalente a
ADB para controlar cualquier iPhone desde Windows.

Referencias: [respaldos cifrados de Apple](https://support.apple.com/en-ie/108353),
[XCUIAutomation](https://developer.apple.com/documentation/xcuiautomation) y
[XCTest](https://developer.apple.com/documentation/xctest).

## Galeria en web y herramientas tipo scrcpy

No existe una "Galeria Web" universal del telefono comparable a WhatsApp Web.
Hay tres familias distintas:

- sincronizacion en nube: practica para consultar, pero depende de cuenta,
  sincronizacion y retencion;
- transferencia de archivos: MTP, ADB pull o utilidades del fabricante,
  mejores para conservar el archivo accesible tal cual;
- control remoto: herramientas de escritorio o administracion remota, utiles
  para comodidad, pero con agentes, cuentas y permisos adicionales.

Para este proyecto, ADB es la fuente primaria de archivos accesibles y la
vista web o el mirroring son fuentes de contexto visual. No deben mezclarse
como si produjeran el mismo tipo de evidencia.

## Orden recomendado

1. Probar Wi-Fi por codigo y registrar el endpoint, version de Android y
   serial en el manifiesto.
2. Probar una sesion manual: scrcpy + grabacion + dos acciones + capturas.
3. Convertir las acciones manuales en secuencias RPA acotadas y repetibles.
4. Consolidar el expediente comun para ADB, scrcpy y WhatsApp Web.
5. Diseñar el adaptador iOS despues de estabilizar Android; no intentar
   esconder sus diferencias detras de una falsa interfaz comun.
