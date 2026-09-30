# Arquitectura multiplataforma de la suite

## Objetivo

Separar el núcleo forense de las tecnologías específicas de cada plataforma.
La suite debe poder trabajar con Android, iOS, WhatsApp Web y respaldos locales
sin asumir que todos los dispositivos ofrecen las mismas capacidades.

## Capas

```text
Interfaz Electron
        |
Orquestador de casos y tareas
        |
Núcleo común de evidencia
  ├── expediente, operador y autorización
  ├── manifiesto JSON
  ├── timestamps UTC
  ├── hashes SHA-256
  └── reportes y logs
        |
Adaptadores de plataforma
  ├── AndroidAdapter
  │   ├── ADB: inventario, capturas y pull
  │   ├── scrcpy: mirroring, control y grabación
  │   └── Appium: automatización semántica opcional
  └── IOSAdapter
      ├── respaldo local Apple/libimobiledevice
      ├── captura visual según el entorno disponible
      └── Appium/XCUITest cuando exista macOS y dispositivo preparado
        |
Proveedores de captura
  ├── DesktopRecorder: FFmpeg para WhatsApp Web
  ├── AndroidRecorder: scrcpy o screenrecord
  └── IOSRecorder: proveedor específico del entorno
```

## Capacidades comunes

Cada adaptador deberá declarar sus capacidades en lugar de fingir que todas
las plataformas funcionan igual:

```json
{
  "platform": "android",
  "capabilities": {
    "filePull": true,
    "screenCapture": true,
    "mirroring": true,
    "remoteInput": true,
    "semanticAutomation": false
  }
}
```

La interfaz debe ocultar o deshabilitar operaciones no disponibles para el
dispositivo conectado.

## Android

### Respaldo

Usar ADB para copiar únicamente rutas seleccionadas y conservar los archivos
originales. Cada ejecución debe tener su propio directorio de caso y su propio
manifiesto.

### Captura visual

- `adb screencap`: capturas puntuales.
- `adb screenrecord`: grabación simple del dispositivo.
- `scrcpy`: mirroring, control y grabación prolongada.

### Automatización

- ADB `input`: pruebas simples basadas en coordenadas.
- Appium/UIAutomator: automatización basada en elementos de interfaz.

## iOS

iOS no utiliza ADB. El adaptador debe trabajar con respaldos locales de Apple
o herramientas compatibles como `libimobiledevice`, siempre respetando el
emparejamiento y la confianza del dispositivo.

La captura visual y el control son más limitados que en Android. La
automatización real mediante Appium usa XCUITest/WebDriverAgent y requiere una
configuración específica de Apple.

## Estructura de un caso

```text
cases/
└── CASE-2026-0001/
    ├── case.json
    ├── acquisition.log
    ├── manifest.json
    ├── android/
    │   ├── device.json
    │   ├── raw/
    │   ├── screenshots/
    │   └── recordings/
    ├── ios/
    │   ├── device.json
    │   ├── backup/
    │   └── recordings/
    └── reports/
```

## Orden de implementación

1. Extraer funciones comunes de hashing, manifiesto, logs y expedientes.
2. Convertir ADB en un adaptador con selección explícita de dispositivo.
3. Integrar scrcpy como proveedor opcional de mirroring y grabación.
4. Migrar la grabación FFmpeg de WhatsApp Web al orquestador común.
5. Reparar el flujo Electron y agregar pruebas con datos sintéticos.
6. Añadir el adaptador iOS para respaldo local.
7. Separar Appium como módulo de automatización, no como parte del respaldo.

## Estado de la arquitectura implementada

La separacion anterior ya existe parcialmente en el codigo activo:

- Electron se comunica con el renderer mediante `preload.js` y canales IPC
  permitidos.
- Android tiene adaptadores dentro de `src/platform/android/`.
- El hashing esta centralizado en `src/evidence/file_hash.js`.
- La captura de escritorio esta separada en
  `src/capture/desktop_recorder.js`.
- WhatsApp Web todavia usa un extractor activo grande en
  `fase3_extractor_real.js` porque se priorizo estabilizar el flujo real.

La proxima modularizacion debe respetar la direccion de dependencias:

```text
UI -> IPC -> orquestador -> adaptador de plataforma -> evidencia comun
```

La UI no debe conocer selectores del DOM, la evidencia no debe conocer detalles
de WhatsApp y un adaptador no debe escribir directamente en componentes del
renderer. Los scripts legacy se mantienen fuera del camino activo hasta que se
compare su comportamiento.

## Principio operativo

La grabación visual, el respaldo de archivos y la automatización son productos
distintos. Pueden ejecutarse juntos en un caso, pero deben conservar procesos,
logs, errores y hashes independientes.
