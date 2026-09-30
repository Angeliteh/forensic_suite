# Preparación de Entorno RPA Móvil (Appium) y Auditoría de Galería

## 1. La Limitante de WhatsApp Web (Por qué el Móvil es el único camino)
El mensaje que encontraste (`Use WhatsApp on your phone to see older messages...`) es el clavo en el ataúd para las auditorías profundas en la Web. 

Desde que WhatsApp implementó la función "Multidispositivo", los servidores ya no sincronizan todo el historial de 10 años a la web por cuestiones de seguridad y almacenamiento. Solo envían los mensajes recientes (usualmente de un año para acá). **La única copia completa y real reside físicamente en la base de datos de tu celular.** 

Esto confirma matemáticamente que si queremos auditar 100% de la información (mensajes viejos, y ahora la galería), el **Entorno Móvil con Appium no es una alternativa, es el único camino viable.**

---

## 2. Auditoría de Galería (Fotos y Videos)
¿Es posible auditar la galería visualmente y extraerla? **Sí, y de hecho es más fácil que WhatsApp.**

Al estar en el entorno móvil, no estamos limitados a apps de terceros. Podemos controlar el sistema operativo.

### El Plan Forense para la Galería (Híbrido)
1.  **Evidencia Visual (Appium):** El script abre la app nativa de la Galería (ej. Samsung Gallery o Google Photos). Inicia la grabación de pantalla. Hace scroll por la cuadrícula de fotos, abre fotos específicas para que se vean en pantalla completa, reproduce videos unos segundos para demostrar que no están corruptos.
2.  **Extracción Pura (ADB Pull):** Mientras el video se graba, la computadora usa un comando nativo de Android (`adb pull /sdcard/DCIM/Camera`) para descargar silenciosamente y a máxima velocidad TODOS los archivos originales (JPG, MP4) a tu disco duro, conservando sus metadatos (EXIF) originales, fechas de creación y ubicaciones GPS.
3.  **Resultado:** Tienes el video de la galería navegándose (prueba visual) y los archivos crudos respaldados. Es una auditoría perfecta.

---

## 3. Lista de Tareas para Preparar tu PC (Tu Misión)

Ya que tienes una computadora más potente con **Android Studio**, ese será nuestro "Centro de Mando". Para poder empezar a programar el RPA, necesitas instalar y configurar lo siguiente en esa PC. 

Sigue estos pasos en orden:

### Fase 1: El Teléfono Físico (Android)
1.  Ve a **Ajustes > Acerca del teléfono**.
2.  Toca 7 veces seguidas el "Número de compilación" hasta que diga "Eres un desarrollador".
3.  Regresa, entra a "Opciones de Desarrollador" y activa **"Depuración por USB"** (USB Debugging).
4.  Conecta el teléfono a la PC por cable original. Te saldrá un aviso en el celular de "Permitir depuración", marca *Siempre* y dale a *Aceptar*.

### Fase 2: Comprobación del Entorno (En la PC)
Dado que ya tienes Android Studio, ya tienes la herramienta principal: **ADB** (Android Debug Bridge).
1.  Abre una consola (CMD o PowerShell) en esa PC.
2.  Escribe: `adb devices`
3.  Debería salir una lista con una serie de números y la palabra `device`. Si sale eso, ¡tu PC ya puede comunicarse con las entrañas del celular!

### Fase 3: Instalación del Motor Appium
Appium corre sobre Node.js, así que asegúrate de tener Node instalado en esa PC.
1.  Instala el servidor globalmente: 
    *   `npm install -g appium`
2.  Instala el "Driver" que controla Android (UIAutomator2):
    *   `appium driver install uiautomator2`
3.  *Opcional pero muy recomendado:* Descarga e instala el programa **Appium Inspector** (búscalo en Google). Es una interfaz gráfica que nos va a permitir "escanear" tu teléfono para descubrir los IDs de los botones de Instagram, WhatsApp o la Galería.

---

## 4. Próximos Pasos de Desarrollo
Una vez que me confirmes que instalaste Appium y tu teléfono responde al comando `adb devices`, el primer paso técnico que haremos será:

*   **Script "Hola Mundo" Móvil:** Crearemos un script en Node.js de 20 líneas que se conecte a tu teléfono por cable, abra la aplicación de la Calculadora, presione "2 + 2", cierre la app y grabe todo en un video. 

Con eso validaremos que nuestro entorno está listo para atacar WhatsApp o la Galería.
