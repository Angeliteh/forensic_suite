# Guía Maestra: Forense Móvil, Root, Jailbreak y Extracción Profunda

Este documento explora el nivel más bajo (God Mode) de los sistemas operativos móviles. Entender esto completa tu stack de conocimientos, permitiéndote saber exactamente qué barreras existen y cómo los auditores forenses (o hackers) las rompen.

> **Secreto #1:** La mayoría de la gente cree que Root = peligroso e inestable. En 2024-2025, con las herramientas modernas (Magisk + módulos), un teléfono rooteado bien configurado es **más estable y silencioso** que uno sin root, porque tienes control total sobre qué apps detectan qué.

---

## 1. El Concepto Base: El Sandbox (La Prisión)
Tanto Android como iOS basan su seguridad en un concepto llamado **Sandbox** (Caja de arena). 
*   **¿Qué significa?** Que cada aplicación vive en su propia celda aislada. La App de WhatsApp tiene una carpeta secreta (ej. `/data/data/com.whatsapp/`) donde guarda sus bases de datos, contraseñas y cookies. 
*   **La Regla:** Ni Instagram, ni una app tuya, ni tú mismo conectando el teléfono a la PC pueden entrar a esa carpeta. El sistema operativo lo prohíbe rotundamente.

### ¿Qué es el Root (Android) o Jailbreak (iOS)?
Es el proceso de escalar privilegios para obtener permisos de **"Superusuario"**. Al ser Superusuario, la regla del Sandbox desaparece. Tienes la llave maestra de todas las celdas y puedes entrar a la carpeta secreta de cualquier aplicación.

---

## 2. La Realidad de Rootear Hoy en Día (Mitos y Verdades)

### ¿Al rootear se formatea el teléfono?
**SÍ, CASI SIEMPRE.** Y esto es vital para la forense.
Para poder instalar el software de Root (ej. Magisk o KernelSU), primero tienes que hacer algo llamado **"Desbloquear el Bootloader"**. Por seguridad (para evitar que alguien robe un teléfono bloqueado con PIN y lo rootee para sacar las fotos), los fabricantes como Samsung, Motorola o Google programaron los teléfonos para que, al desbloquear el bootloader, **el teléfono haga un borrado de fábrica automático e irreversible.**

*   **Impacto Forense:** Si te entregan un teléfono con evidencia y NO está rooteado, *no puedes rootearlo* para sacar los datos sin destruirlos en el proceso. Las extracciones forenses en dispositivos no rooteados se hacen mediante fallas del sistema (Zero-Days) o herramientas carísimas como Cellebrite.
*   **Para tu uso:** Si vas a crear teléfonos de granja/RPA, los compras, los desbloqueas/rooteas el día 1 en blanco, y luego les instalas las apps.

### Las Herramientas de Root en 2024-2025 (El Ecosistema Real)

No todos los métodos de root son iguales. Aquí está la jerarquía actual:

#### Magisk (El Rey Absoluto)
*   **¿Qué es?** Un sistema de root que funciona a nivel de partición `boot.img`. No modifica el sistema de archivos de Android directamente; en su lugar, crea una capa virtual encima. Esto lo hace casi indetectable.
*   **Por qué es el estándar:** Existe desde 2016 y tiene un ecosistema enorme de módulos (plugins). La comunidad es gigante.
*   **Flujo de instalación:**
    1.  Descargas la imagen del firmware de tu teléfono (`.zip` del fabricante).
    2.  Extraes el archivo `boot.img` de ese zip.
    3.  Copias `boot.img` al teléfono, abres la app de Magisk, le das "Parchear archivo" y te genera un `magisk_patched_boot.img`.
    4.  Conectas el teléfono en modo fastboot (`adb reboot bootloader`) y flasheas: `fastboot flash boot magisk_patched_boot.img`.
    5.  Reinicias. Magisk Manager aparece en el teléfono. **Eres root.**

#### KernelSU (El Contendiente Nuevo)
*   Funciona a nivel de kernel (más profundo que Magisk). Es más silencioso pero tiene menos módulos compatibles aún. Ideal si las apps detectan Magisk específicamente.

#### Zygisk (El Motor Interno de Magisk)
*   No es un método de root separado. Es la funcionalidad dentro de Magisk que permite inyectar código en cada proceso de Android desde el inicio. Es lo que permite que los módulos funcionen.
*   **Shamiko** es el módulo que usa Zygisk para ocultar el root a apps específicas.

> **Secreto de Granja:** Para granjas de teléfonos Android (10-50 dispositivos), el proceso se automatiza con scripts que flashean Magisk en lote via `fastboot` conectando todos los teléfonos a un hub USB y corriendo un `.bat` que los rootea uno por uno sin intervención manual.

---

## 3. ¿Qué puedes extraer al tener Root? (El Botín)

Una vez que eres Root, el teléfono es un libro abierto. Aquí es donde se conecta con nuestras charlas anteriores sobre auditoría:

1.  **Bases de Datos de Chats (SQLite):**
    *   WhatsApp guarda sus chats en tu teléfono en formato encriptado (`msgstore.db.crypt15`). Nadie puede leerlo sin la llave.
    *   **Con Root:** Puedes entrar a `/data/data/com.whatsapp/files/key` y **robar la llave criptográfica real**. Con esa llave, desencriptas la base de datos en un segundo y tienes todos los chats en texto plano, sin necesidad de hacer *scroll visual*.
2.  **Cookies y Sesiones (Tokens):**
    *   Puedes entrar a la carpeta de Instagram o Facebook, copiar sus archivos de "Preferencias" (`shared_prefs`), robar el Token de Autorización (Auth Token) y usarlo en un script en tu computadora para hacer peticiones como si fueras el usuario, sin tener su contraseña.
3.  **Contraseñas de Redes WiFi:** Guardadas en texto plano en directorios protegidos de Android.

---

## 3.5. El Truco Antes del Root: `adb backup` y sus Herederos

Este es uno de los secretos más ignorados. Existe una vía que está **entre el acceso normal y el root** que mucha gente no conoce.

### `adb backup` Clásico (El Comando Nativo)
```bash
adb backup -apk -shared -all -f backup_completo.ab
```
*   Genera un archivo `.ab` (Android Backup) que es básicamente un TAR comprimido.
*   Para ver su contenido: `java -jar abe.jar unpack backup_completo.ab backup_unpacked.tar`
*   **Limitante:** WhatsApp tiene `android:allowBackup="false"` en su manifest. Este comando simplemente ignora WhatsApp.

### `adb-enhanced` (La Herramienta Pro)
*   **¿Qué es?** Una utilería de terceros (`pip install adb-enhanced`) que envuelve ADB con superpoderes.
*   **Comando clave:**
    ```bash
    adbe pull-screen  # Captura el estado actual de la pantalla
    adbe permissions grant com.whatsapp android.permission.READ_CONTACTS
    adbe processes  # Lista todos los procesos en el teléfono
    ```
*   No rompe el sandbox de WhatsApp, pero es increíblemente útil para **diagnóstico y auditoría del entorno** sin root.

### El Truco de `--no-apk` en Backups
Algunas apps tienen `allowBackup=true` por descuido del desarrollador. Para esas apps:
```bash
adb backup -noapk com.app.objetivo -f solo_datos.ab
```
Esto extrae solo los datos de esa app específica (base de datos SQLite, preferencias, caché). Muchos juegos móviles y apps de productividad caen en esto.

> **Secreto:** Las apps bancarias de países en desarrollo (especialmente LATAM) frecuentemente tienen `allowBackup=true` porque los desarrolladores no revisan la seguridad del manifest. Es un vector de extracción de datos sin root que las herramientas de hacking comerciales no anuncian, pero los pentesters saben bien.

---

## 4. El "God Mode" Supremo: Bypass de SSL Pinning

En nuestra charla sobre RPA, dijimos que era casi imposible interceptar los JSON de la red de la app de Instagram porque usan algo llamado **SSL Pinning** (la app verifica criptográficamente que está hablando con el servidor oficial de Meta, si detecta tu script intermedio, corta la conexión).

**Con Root, rompemos el SSL Pinning:**
1.  Instalas herramientas de inyección en memoria como **Frida** o **LSPosed**.
2.  Estas herramientas inyectan código *dentro* de la aplicación de Instagram en tiempo real.
3.  Le "mienten" a Instagram, obligando a que la función que revisa el certificado de seguridad siempre responda "Sí, todo es seguro".
4.  **Resultado:** Puedes conectar tu celular rooteado a un Proxy en tu PC (como Charles o Burp Suite) y **ver todo el tráfico JSON en vivo**. Esto cambia las reglas del juego: tendrías la precisión de extracción web con la invisibilidad del entorno móvil.

---

## 5. Android vs iOS (Profundidad de Seguridad)

### Android (El entorno preferido del Hacker/Auditor)
*   **Situación Actual:** Es relativamente fácil de rootear si compras marcas como Google Pixel o Xiaomi. Marcas como Samsung lo hacen más difícil (su sistema Knox "quema" un fusible físico si detecta root, perdiendo la garantía).
*   **Seguridad Activa:** Las apps como bancos (o WhatsApp/Instagram) detectan si eres Root y no se abren.
*   **La Solución:** Existe el "Root Hide" (ej. Zygisk, Shamiko). El root se oculta a sí mismo tan bien, que Instagram jura que el teléfono es 100% legal y original, permitiéndote operar en las sombras.

### La Detección de Root (Cómo Funcionan las Apps para Detectarte)
Para entender cómo ocultarte, primero entiende cómo te detectan:
1.  **Buscan el binario `su`:** El binario de superusuario existe en `/system/bin/su` en teléfonos rooteados. Shamiko lo oculta de procesos específicos.
2.  **Revisan el estado del Bootloader:** Con una llamada al sistema, una app puede saber si el bootloader está desbloqueado (señal de root). Magisk no puede ocultar esto... pero sí puede mentir sobre ello con módulos específicos.
3.  **Google Play Integrity API (antes SafetyNet):** Google lanza una "prueba" cifrada al servidor de Google que certifica que el teléfono es legítimo. Magisk tiene el módulo `PlayIntegrityFix` que falsifica esta respuesta exitosamente en 2024-2025.
4.  **Buscan apps de Magisk:** Detectan si hay una app llamada "Magisk" instalada. Solución: renombrar la app de Magisk a cualquier otro nombre inocente (ej. "Gestión del Sistema") desde el propio Magisk Manager.

### Teléfonos Recomendados para Granjas RPA (2024-2025)
| Marca/Modelo | Facilidad de Root | Precio Aprox | Notas |
|---|---|---|---|
| **Google Pixel 6a / 7a** | ⭐⭐⭐⭐⭐ Muy fácil | $150-200 USD | Los mejores. 1 comando en fastboot. |
| **Xiaomi Redmi Note 12** | ⭐⭐⭐⭐☆ Fácil | $100-130 USD | Hay que esperar 7 días para desbloquear (política de Xiaomi). |
| **Motorola Moto G** | ⭐⭐⭐⭐☆ Fácil | $80-120 USD | Sin restricciones de espera. Buena opción económica. |
| **Samsung Galaxy A** | ⭐⭐☆☆☆ Difícil | $150-250 USD | Knox quema un fusible. Evitar para granjas. |

### iOS / iPhone (La fortaleza impenetrable moderna)
*   **Situación Actual:** El Jailbreak está **casi muerto** en versiones modernas de iOS (iOS 16, 17, 18). Solo es posible en versiones antiguas o usando vulnerabilidades muy raras. Apple ha cerrado brutalmente su ecosistema.
*   **Seguridad:** Su cifrado por hardware (Secure Enclave) es legendario. Incluso el FBI tiene problemas para extraer información de iPhones modernos apagados.
*   **Para Auditoría/RPA:** No se recomiendan iPhones para este tipo de experimentación profunda. Son costosos, hostiles al desarrollador no oficial, y si los logras vulnerar, Apple lo parcheará en semanas.

---

## 6. Conclusión y Conexión con tu Proyecto

Tener teléfonos Android Rooteados expande tu proyecto de forma exponencial:

1.  **Auditoría Híbrida (La Evidencia Perfecta):**
    *   Usas **RPA/Accesibilidad** para grabar el video visual del chat de Instagram.
    *   Al mismo tiempo, usas **Frida (Root)** para romper el SSL Pinning y capturar el JSON en la red.
    *   *Resultado:* Tienes el video para el abogado y el JSON estructurado para tu base de datos.
2.  **Clonación de Sesiones:**
    *   Podrías iniciar sesión en Instagram en un teléfono físico rooteado, extraer las cookies de la carpeta interna (`/data/data/`), y mandarlas a un servidor en la nube para que un script puro siga operando sin necesitar el teléfono prendido.
