# Estrategia RPA para Android

## Idea central

El RPA no debe depender de una coordenada fija ni de un modelo que interprete
cada imagen desde cero. La secuencia debe intentar la señal mas estable
disponible y dejar un registro de lo que encontro antes de actuar.

```text
1. Estado esperado
       |
2. Selector semantico / UIAutomator
       | si no existe o es ambiguo
3. Coordenada normalizada respecto a la pantalla
       | si el layout cambia o falta estructura
4. Vision local sobre una captura puntual
       | si supera el umbral de confianza
5. Tap/swipe + captura + registro
```

## Capas de localizacion

### 1. Semantica de interfaz

La mejor señal es el texto, descripcion de accesibilidad, tipo de control o
jerarquia UI. Es mas resistente que `(x, y)` porque una pantalla puede cambiar
de resolucion, densidad o posicion sin cambiar el significado del boton.

La primera implementacion debe obtener un `ui_dump` de la pantalla y buscar
solo patrones permitidos, por ejemplo:

- nombre visible del chat;
- boton con descripcion `Buscar`;
- boton `Mas opciones`;
- elemento con `scrollable=true`.

El resultado debe incluir el bounds del elemento y una razon legible:
`encontre boton Buscar por content-desc`.

El XML completo es util como artefacto tecnico, pero no como texto para leer
manualmente o enviar entero a un modelo. El panel conserva el XML con SHA-256
y presenta una vista resumida con el paquete visible, el total de nodos y los
elementos que tienen texto, accesibilidad, identificador, `clickable` o
`scrollable`. Si el paquete visible es el launcher, primero hay que abrir la
aplicacion objetivo y repetir la inspeccion.

### 2. Coordenadas normalizadas

Cuando una aplicacion no expone una jerarquia util, se trabaja con una
coordenada relativa:

```text
x_real = x_normalizada * ancho_actual / 10000
y_real = y_normalizada * alto_actual / 10000
```

Esto no elimina todos los problemas, pero es mucho mejor que guardar
coordenadas de un unico Samsung. Cada tap debe conservar la resolucion,
orientacion y coordenada usada en el manifiesto.

### 3. Vision local

La vision debe ser un respaldo focalizado, no el controlador principal. Un
modulo local podria detectar un icono, texto o region de interes en una
captura puntual y devolver:

```json
{
  "target": "boton_buscar",
  "center": { "x": 944, "y": 116 },
  "confidence": 0.93,
  "source": "local-template-or-ocr"
}
```

El orquestador solo debe actuar si la confianza supera un umbral configurado,
la region esta dentro de la pantalla y una captura posterior confirma el
cambio esperado. Si no, se detiene y solicita intervencion manual.

No conviene ejecutar un modelo pesado en cada frame del mirroring: aumenta la
latencia, dificulta reproducir el caso y puede pulsar un elemento equivocado.
Una captura por estado es mas auditable y suficiente para navegar por una
galeria o una lista.

## Flujo de WhatsApp

Para una ruta futura de chats, el flujo seria:

1. Capturar pantalla y obtener jerarquia UI.
2. Confirmar que estamos en WhatsApp y en la pantalla esperada.
3. Localizar el chat por texto o accesibilidad.
4. Pulsar y capturar la pantalla de confirmacion.
5. Desplazarse con una distancia limitada.
6. Repetir hasta que el estado no cambie o se alcance un limite.
7. Guardar cada captura, accion, bounds, resolucion y resultado.

La extraccion de WhatsApp Web sigue siendo otra ruta. En ella se usan
selectores del DOM y no coordenadas del telefono. No hay que mezclar ambos
controladores en una unica secuencia opaca.

## Galeria y respaldo visual

ADB debe seguir siendo la fuente primaria de archivos accesibles. El
mirroring y la grabacion documentan el proceso visual, pero no convierten una
captura en el archivo original ni garantizan que se hayan recorrido todas las
carpetas.

Una futura secuencia puede coordinar:

```text
captura inicial -> accion -> espera -> captura -> archivo o estado observado
```

Cada paso tendra un resultado `success`, `ambiguous`, `timeout` o `failed`.
Los casos ambiguos nunca deben continuar automaticamente.

## Escritorio frente a web

La suite necesita Electron o un agente local porque ADB y scrcpy son procesos
del sistema. Un navegador normal no puede ejecutar `adb`, abrir scrcpy ni
escribir libremente en carpetas locales.

La arquitectura web viable seria:

```text
Frontend web remoto
        |
API local autenticada / companion
        |
ADB + scrcpy + almacenamiento local de evidencia
```

WhatsApp Web puede permanecer en una ventana del navegador, pero el
mirroring Android no se vuelve automaticamente una pagina web. Para eso
habria que retransmitir el video desde un agente local, con mas complejidad,
latencia y controles de seguridad. Por ahora Electron es la opcion mas clara
para el laboratorio.

## Siguiente implementacion

1. Separar la pantalla de conexion, ya incorporado en el panel Android.
2. Implementar un localizador semantico para un unico objetivo de prueba,
   completado para el boton `View all albums` de Samsung Gallery.
3. Guardar una secuencia manual como JSON antes de reproducirla,
   completado mediante `rpa_gallery.json`.
4. Añadir aserciones de estado y capturas por paso.
5. Probar el checkpoint en el telefono real y medir cambios de selector entre
   resoluciones o versiones de Gallery.
6. Evaluar vision local solo para objetivos que no tengan selector.
