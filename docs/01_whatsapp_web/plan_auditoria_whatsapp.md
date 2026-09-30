# Plan de Desarrollo: Auditoría Forense Visual de WhatsApp Web

> Estado: documento de arquitectura histórica. Describe capacidades objetivo,
> no una garantía de que el módulo actual capture todo el historial. Para el
> estado implementado, limitaciones y siguiente prueba usa
> [docs/14_estado_whatsapp_web_y_plan.md](../14_estado_whatsapp_web_y_plan.md).

## 1. Objetivo Principal
Desarrollar un sistema automatizado que genere evidencia visual y documental incuestionable de conversaciones de WhatsApp. El sistema simulará el comportamiento de un usuario real navegando por el historial para grabar un video continuo y generar un PDF, sirviendo como un respaldo legal o comprobación a terceros ("ver para creer").

## 2. Fases de la Auditoría (Flujo de Trabajo Modular)
Se utilizará **Playwright con Node.js**. Para garantizar escalabilidad y evitar corrupción de datos, el sistema operará en tres fases independientes:

### Fase 1: Mapeo y Reconocimiento (Indexación)
*   **Gestión de Sesión:** Playwright abrirá un perfil persistente. Si es la primera vez, esperará escaneo manual del código QR.
*   **Barrido de Contactos:** Antes de extraer mensajes, el bot hará scroll en el panel izquierdo leyendo la lista de chats recientes.
*   **Chats Archivados:** El bot buscará el elemento `div[data-testid="archived-chatlist"]`, le dará clic y extraerá también los chats archivados.
*   **Resultado:** Generará un `master_index.csv` con todos los chats detectados. Esto permite planificar la auditoría y conocer el volumen exacto de trabajo.

### Fase 2: Configuración y Selección
*   El usuario o el sistema leerá el `master_index.csv` y podrá decidir: auditar todo el historial, o seleccionar únicamente un grupo específico de chats. 

### Fase 3: Extracción Forense Aislada (El Core)
*   **Un Chat = Un Paquete:** El sistema iterará sobre los chats seleccionados. Cada chat se audita en total aislamiento.
*   **Scroll Humano:** Para evitar bloqueos, el bot simulará la rueda del ratón con pausas aleatorias (800ms a 2100ms) esperando la carga correcta del DOM virtual.
*   **Espera de Sincronización:** El bot detectará y pausará si WhatsApp muestra el mensaje de "Syncing older messages..." o "Cargando mensajes anteriores...".

### 2.4. Entregables Generados (Por Contacto)
Por cada chat auditado, el sistema creará una carpeta independiente (ej. `/Auditorias/Juan_Perez/`) con:
1.  `video_parte1.mp4`: Grabación segmentada (vía FFmpeg externo) para evitar corrupción de archivos gigantes.
2.  `historial_datos.csv`: Datos en bruto extraídos del DOM en tiempo real (textos, fechas, remitente) para facilitar búsquedas de abogados/auditores.
3.  `captura_visual.pdf`: PDF final renderizado de los mensajes en pantalla.
4.  `/Multimedia_Descargada/`: Carpeta opcional con fotos y audios interceptados durante el scroll.

---

## 3. Consideraciones Críticas y Manejo de Riesgos

Para que el script no falle, no sea detectado como bot malicioso, y capture todo al 100%, debemos implementar las siguientes medidas de seguridad en el código:

### 3.1. Delays y Comportamiento Humano
*   **Pausas Aleatorias:** Nunca hacer acciones en intervalos perfectos (ej. cada 1.000ms exactos). Se deben usar rangos (ej. entre 800ms y 2100ms) para simular imperfecciones humanas.
*   **Evitar Limitaciones (Rate Limits):** WhatsApp puede desconectar la sesión si detecta miles de solicitudes de carga en un segundo. El scroll lento previene esto.

### 3.2. Carga Diferida de Multimedia (Lazy Loading)
*   Las fotos y videos antiguos en WhatsApp muestran a veces un ícono de "borroso" o requieren un clic para descargar, o simplemente tardan en cargar.
*   **Medida:** El script debe leer la pantalla. Si detecta un "spinner" de carga de imagen, debe pausar el scroll automáticamente y esperar a que la imagen se vea nítida antes de continuar grabando.

### 3.3. Manejo de Errores y "Cargando mensajes anteriores..."
*   Al llegar arriba en un chat largo, WhatsApp muestra un indicador de que está trayendo más historial.
*   **Medida:** El script debe estar configurado para esperar pacientemente a que este indicador desaparezca. Si el scroll llega al tope (principio del chat), el script debe confirmar que ya no hay más historial posible antes de detener la grabación.

### 3.4. Consumo de Memoria, Checkpoints y Grabación Externa
*   **Corrupción de Video:** Usar la función interna de Playwright para grabar sesiones de horas puede generar videos corruptos si ocurre un error inesperado (Aw, Snap!).
*   **Medida de Video:** Desacoplar la grabación usando **FFmpeg** a nivel de sistema, segmentando el video en partes de 15-30 minutos automáticamente.
*   **Fugas de RAM (Checkpoints):** WhatsApp Web acumulará demasiados nodos en el DOM si se scrollea durante horas. Para evitar que la pestaña colapse, el bot implementará un sistema de **Checkpoints**:
    1. Guardará el texto/fecha del último mensaje visible en un `.json` local.
    2. Al llegar a un límite de memoria, refrescará la pestaña completa (`F5`) para limpiar la RAM.
    3. Usará la lupa de búsqueda de WhatsApp para encontrar el mensaje del Checkpoint, saltará de regreso a esa fecha y continuará el proceso.

## 4. Próximos Pasos Técnicos
1.  Actualizar el entorno con herramientas de grabación externa (`FFmpeg`).
2.  Modificar `index.js` para desarrollar la **Fase 1 (Mapeo)**: Lograr que el bot haga scroll automático sobre la lista izquierda de contactos, capture `data-testid="archived-chatlist"` y construya el `master_index.csv`.
3.  Diseñar el sistema modular de carpetas dinámicas por contacto.
