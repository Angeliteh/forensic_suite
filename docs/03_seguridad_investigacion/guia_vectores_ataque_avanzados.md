# Guía Avanzada: Vectores de Ataque — Los Que Parecen Indefendibles

> Este documento es de carácter educativo e investigativo. El conocimiento de cómo funcionan estos ataques es la base de la ciberseguridad defensiva. Conocer el ataque es el primer paso para defenderse.

---

## 1. SS7 — El Agujero de 50 Años en el Corazón de las Telecomunicaciones

### El contexto histórico
En 1975, los ingenieros de las telecomunicaciones diseñaron un sistema para que todas las compañías telefónicas del mundo pudieran comunicarse entre sí: rotar llamadas internacionales, enviar SMS entre operadoras distintas, saber dónde está geográficamente un teléfono (roaming). A este sistema lo llamaron **SS7 (Signaling System No. 7)**.

El problema: lo diseñaron en una era donde solo existían unas pocas docenas de operadoras en el mundo, todas ellas grandes corporaciones confiables. **Nunca se imaginaron que el acceso a esta red algún día se vendería en el mercado negro.**

### ¿Cómo funciona el ataque SS7 en detalle?

La red SS7 es una red de confianza mutua total. Si eres un nodo de la red SS7, todas las demás operadoras asumen que eres legítimo. No hay autenticación de "¿quién eres tú realmente?".

**El ataque paso a paso:**
```
1. El atacante compra acceso a un nodo SS7 en el mercado negro
   (operadoras pequeñas de países poco regulados lo venden por ~$500-5000 USD)

2. El atacante envía un mensaje SS7 a la red global:
   "MAP_REGISTER_SS7_NUMBER: El teléfono +52 664 XXX XXXX
    ahora está en el área de mi MSC (Mobile Switching Center)"

3. La red global le cree. Actualiza su tabla de ubicaciones.

4. Ahora TODOS los SMS destinados a ese número llegan al atacante.
   Las llamadas también pueden ser redirigidas.

5. El teléfono real de la víctima no recibe nada.
   Sin alerta. Sin aviso. Sin que el sistema operativo pueda detectarlo.
   El ataque ocurre en la infraestructura de la operadora, no en el dispositivo.
```

### ¿Por qué esto es tan devastador?
*   Es el ataque que **rompe el 2FA de SMS de absolutamente todo:** WhatsApp, Instagram, Gmail, bancos, Coinbase, cualquier servicio.
*   **No requiere acceso al dispositivo físico.** Ni siquiera necesitas estar en la misma ciudad.
*   **Es invisible para la víctima.** El teléfono sigue mostrando cobertura normal.
*   Los **gobiernos lo usan activamente** para seguimiento y vigilancia.

### Lo que SÍ puede protegerte
*   **2FA por TOTP (Google Authenticator, Authy):** Genera códigos localmente. No pasan por SMS. SS7 no puede interceptarlos.
*   **Llaves de Seguridad Físicas (YubiKey):** El nivel máximo. El código de autenticación se genera dentro de un chip físico. Imposible de interceptar remotamente.
*   **Signal como mensajería:** Signal no depende del número de teléfono para la criptografía de extremo a extremo. Un SS7 attack que intercepte tus SMS no afecta los mensajes de Signal.

---

## 2. DIAMETER — SS7 Evolucionado (El Problema que Nadie Resolvió)

Cuando llegó el 4G/LTE, las telecomunicaciones migraron a un nuevo protocolo llamado **DIAMETER**. Todos pensaron que habían solucionado los problemas de SS7.

**No lo hicieron.**

DIAMETER tiene exactamente los mismos problemas conceptuales:
*   Sigue siendo una red de confianza mutua entre operadoras.
*   Los ataques de intercepción de SMS siguen funcionando.
*   Adicionalmente, DIAMETER permite ataques de **geolocalización en tiempo real** con mayor precisión que SS7.

### El problema de 5G
5G introduce mejoras de seguridad reales, pero:
*   La transición es lenta. Los teléfonos 5G siguen teniendo fallback a 4G/LTE y 3G.
*   Un atacante puede forzar que el teléfono se conecte a 3G (donde SS7 puro sigue activo) simplemente bloqueando las frecuencias 4G/5G.
*   **En LATAM, la mayoría de la infraestructura crítica sigue siendo 3G/4G en 2024-2025.**

---

## 3. IMSI Catcher / Stingray — La Torre Celular Falsa

Esta es la versión física del ataque SS7. En lugar de hackear la red de la operadora, construyes una **torre celular falsa** que los teléfonos cercanos se conectan automáticamente pensando que es legítima.

### ¿Cómo funciona?
Los teléfonos siempre se conectan a la torre con la señal más fuerte. Un IMSI Catcher emite una señal más fuerte que las torres reales del área.

```
Torre Real de Telcel          IMSI Catcher (del atacante)
     Señal: -85 dBm    vs.         Señal: -60 dBm  ← MÁS FUERTE

El teléfono se conecta al IMSI Catcher automáticamente.
```

**Una vez conectado, el IMSI Catcher puede:**
1.  **Capturar el IMSI** (International Mobile Subscriber Identity) — el identificador único de tu SIM. Esto permite rastrear a cualquier persona físicamente.
2.  **Interceptar llamadas y SMS** (en redes 2G/3G, que no usan cifrado fuerte).
3.  **Forzar downgrade:** Le dice al teléfono "aquí no hay 4G, usa 2G" — donde el cifrado es débil o inexistente.
4.  **Bloquear llamadas:** Actúa como un "jammer selectivo" para números específicos.

### ¿Quién lo usa?
*   Policía y ejército (oficialmente). En EE.UU., el FBI tiene miles de dispositivos Stingray.
*   En México, la SEIDO y el CISEN (ahora CNI) han sido documentados usándolos.
*   **Precio en el mercado:** Los fabricantes como Harris Corporation venden el "StingRay II" por $75,000-$500,000 USD solo a gobiernos. Pero hay réplicas open-source por $1,000 USD con una Raspberry Pi y una antena de SDR (Software Defined Radio).

### La Defensa
*   Activar **"Conexión preferida: Solo LTE/4G"** en ajustes. Reduce (no elimina) la vulnerabilidad.
*   **Signal**: cifra el contenido aunque el transporte sea interceptado.
*   **Faraday Bag**: una bolsa que bloquea todas las señales de radio. Usado por periodistas en zonas de riesgo.

---

## 4. SIM Swapping — El Ataque de Ingeniería Social Más Rentable

El SIM Swap no es un ataque técnico. Es puro **engaño telefónico**. Y en LATAM funciona aterradoramente bien porque el nivel de verificación de identidad en las operadoras es mínimo.

### El Ataque
```
1. El atacante investiga a su víctima en redes sociales:
   - Nombre completo
   - Fecha de nacimiento
   - Últimos 4 dígitos del número (a veces visibles en grupos de WhatsApp)

2. Llama al servicio de atención al cliente de Telcel/AT&T/Movistar:
   "Hola, soy [Nombre de la víctima]. Perdí mi SIM y necesito una nueva.
    Mi fecha de nacimiento es [dato de Facebook]."

3. El ejecutivo del call center, siguiendo el protocolo:
   "¿Puede decirme el nombre completo y fecha de nacimiento? ✅
    ¿Algún número de cuenta o RFC? ✅ (obtenido de LinkedIn)"
   → Emite una nueva SIM con el mismo número.

4. La SIM de la víctima real se DESACTIVA en segundos.
   La nueva SIM (del atacante) empieza a recibir llamadas y SMS.

5. El atacante solicita "Olvidé mi contraseña" en Gmail, banco, Instagram.
   → El SMS de verificación llega al atacante.
   → Controla todas las cuentas.
```

### Casos Reales y Famosos
*   **Jack Dorsey (fundador de Twitter):** Hackearon su cuenta de Twitter via SIM Swap en 2019.
*   **Michael Terpin (inversor crypto):** Perdió $24 millones en criptomonedas via SIM Swap. Demandó a AT&T.
*   En LATAM, periodistas y activistas han reportado SIM Swaps usados para desactivar sus comunicaciones antes de detenciones.

---

## 5. Evil Twin WiFi — El Gemelo Malvado

Es la versión WiFi del IMSI Catcher. Creas una red WiFi con el mismo nombre (SSID) que una red legítima.

### El Setup (con hardware de $50 USD)
```bash
# Con una Raspberry Pi y un adaptador WiFi en modo monitor:
# 1. Escanear redes cercanas
sudo airmon-ng start wlan0
sudo airodump-ng wlan0mon

# 2. Crear un punto de acceso falso con el mismo nombre
sudo hostapd evil_twin.conf
# donde evil_twin.conf tiene: ssid=Starbucks_WiFi (copiado del real)

# 3. Lanzar un servidor DHCP propio
sudo dnsmasq -C dnsmasq.conf

# 4. Redirigir todo el DNS a tu servidor (DNS Spoofing)
# Ahora controlas a qué IP lleva cada dominio
```

### El Ataque en la Práctica
*   Los dispositivos configurados para "conectar automáticamente a redes conocidas" se conectan solos.
*   Funciona especialmente bien en: aeropuertos, hoteles, cafeterías, centros comerciales.
*   **HTTPS mitiga el ataque** (el browser muestra un error de certificado), pero **HSTS bypass** y certificados SSL falsos de Let's Encrypt en dominios typosquatted (`g00gle.com`) siguen funcionando.

### Variante Móvil: Evil Twin de App Store
En móvil, el Evil Twin evoluciona: en lugar de hacerse pasar por una red WiFi, te redirigen (via DNS Spoofing) a una **página de descarga falsa** que sirve un APK clonado de Instagram, tu banco, o WhatsApp.

La víctima instala lo que cree que es la app oficial. En realidad es un clon que:
*   Muestra la interfaz real (funciona normal).
*   En paralelo, manda credentials y tokens a un servidor externo.

---

## 6. ADB sobre WiFi — El Puerto Abierto que Nadie Cierra

Este vector usa directamente la herramienta que ya conoces (**ADB**) pero de forma inalámbrica. Y es más común de lo que parece.

### ¿Cómo queda ADB expuesto?
**Escenario 1: El desarrollador descuidado**
```bash
# El desarrollador habilita ADB WiFi para comodidad:
adb tcpip 5555
# Ahora el teléfono escucha conexiones ADB en el puerto 5555 por WiFi
# Si están en la misma red, CUALQUIERA puede conectarse:
adb connect 192.168.1.45:5555
# Y sin ningún diálogo de confirmación, ya tienen acceso completo
```

**Escenario 2: USB Debugging nunca desactivado**
Muchos usuarios activan "USB Debugging" una vez para algo, y nunca lo desactivan. Si el atacante conecta un cable USB mientras el teléfono está desbloqueado y ya había autorizado previamente ese tipo de conexión, tiene acceso inmediato.

### Lo que puede hacer un atacante con ADB en 60 segundos
```bash
# Sacar todas las fotos y videos (sin Root, sin permiso adicional)
adb pull /sdcard/DCIM/Camera ./fotos_victima/

# Ver todos los archivos de WhatsApp (imágenes recibidas, documentos)
adb pull /sdcard/Android/media/com.whatsapp/WhatsApp/ ./whatsapp_media/

# Instalar una app maliciosa silenciosamente
adb install -r malware.apk

# Tomar screenshot en tiempo real
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png

# Grabar la pantalla en video
adb shell screenrecord /sdcard/grabacion.mp4

# Ver el portapapeles (contraseñas copiadas, etc.)
adb shell service call clipboard 2 i32 1

# Leer los SMS (si la app de SMS permite lectura via content provider)
adb shell content query --uri content://sms/inbox

# Obtener todas las contraseñas WiFi guardadas (sin Root en Android <9)
adb shell cat /data/misc/wifi/wpa_supplicant.conf
```

> **El dato que sorprende a todos:** `adb pull /sdcard/` saca TODO el almacenamiento interno: fotos, videos, documentos, el directorio de WhatsApp con sus imágenes y videos recibidos. Todo en minutos. Sin Root. Sin contraseña. Solo necesitas que USB Debugging esté activo.

### Defensa
*   **Desactiva USB Debugging** cuando no lo uses activamente.
*   Nunca conectes tu teléfono a puertos USB públicos (aeropuertos, hoteles). Usan un ataque llamado **"Juice Jacking"** — el puerto USB tiene data lines activas, no solo carga.
*   Usa un **cable de solo carga** (data blocker) si necesitas cargar en público.

---

## 7. Bluetooth: BlueBorne y BLESA (Los Ataques Inalámbricos Olvidados)

Bluetooth es el vector de ataque más ignorado y potencialmente más peligroso en dispositivos móviles porque **siempre está activo**.

### BlueBorne (2017, pero el concepto persiste)
*   Descubierto por Armis Security. Afectó a **5.3 BILLONES de dispositivos** simultáneamente.
*   **No requería que la víctima aceptara nada.** Solo necesitaba que Bluetooth estuviera activado, aunque no estuvieras conectado a ningún dispositivo.
*   El atacante enviaba paquetes malformados durante el proceso de descubrimiento de Bluetooth, causando un buffer overflow y ejecutando código arbitrario.
*   Fue parchado, pero demostró que el protocolo Bluetooth tiene vulnerabilidades estructurales.

### BLESA (Bluetooth Low Energy Spoofing Attack, 2020)
*   Afecta especificamente a **BLE (Bluetooth Low Energy)** — el protocolo usado por auriculares, relojes inteligentes, llaves de auto, sensores de salud.
*   El ataque explota el proceso de **re-conexión** (no el de conexión inicial).
*   Cuando un dispositivo BLE intenta reconectarse a un dispositivo conocido, el atacante puede hacerse pasar por ese dispositivo sin autenticarse correctamente.
*   Resultado: el reloj inteligente de la víctima se conecta al dispositivo del atacante, que puede leer los datos de salud, ubicación, y notificaciones.

### Consejos Prácticos
*   **Desactiva Bluetooth cuando no lo uses.** Especialmente en lugares públicos.
*   Usa auriculares con cable en entornos de alta seguridad.
*   Las llaves de auto con BLE tienen su propio set de vulnerabilidades de relay attack — pero eso es otro documento.

---

## 8. Cuando el Atacante Tiene Acceso Físico al Teléfono (5 Minutos)

Este es el escenario más devastador. Con 5 minutos y el teléfono desbloqueado, un atacante no técnico puede hacerlo. Un técnico puede hacerlo todo.

### Lo que puede hacer alguien NO técnico en 5 minutos
*   **Agregar huella digital propia:** En Settings → Biometría → Agregar huella. Ahora puede desbloquear el teléfono cuando quiera.
*   **Agregar cuenta de Google/iCloud:** Permite sincronización de fotos y ubicación en tiempo real.
*   **Instalar apps de espionaje legales (Stalkerware):** Apps como mSpy, FlexiSPY se instalan en 2 minutos y se ocultan del launcher. Cuestan $30-60/mes.
*   **Activar "Compartir ubicación" en Google Maps/Find My Friends** con su propio número.
*   **Agregar su número a la cuenta de WhatsApp como dispositivo vinculado** (función multidispositivo).

### Lo que puede hacer alguien técnico en 5 minutos (con USB Debugging activo)
```bash
# Todo lo que vimos en la sección de ADB más:

# Instalar un RAT (Remote Access Trojan) como APK
adb install rat_disfrazado_de_actualizacion.apk
# El RAT da acceso remoto permanente: micrófono, cámara, GPS, pantalla

# Hacer backup de WhatsApp (si allowBackup=true en versiones antiguas)
adb backup -noapk com.whatsapp -f backup_wpp.ab

# Extraer tokens de autenticación de apps (sin Root, pero con acceso al directorio)
adb shell run-as com.app.objetivo cp databases/auth.db /sdcard/
adb pull /sdcard/auth.db
```

### El Ataque de los $5 (El más ignorado)
En ciberseguridad existe un dicho: **"Un ataque de $5 puede romper cualquier cifrado"**. Se refiere a la llave inglesa — si alguien te amenaza físicamente o te roba el teléfono desbloqueado, toda la criptografía del mundo no sirve de nada.

**La defensa real:** 
*   **Never leave your phone unlocked and unattended.** Período.
*   Configurar **auto-lock en 30 segundos o menos**.
*   En teléfonos de alto riesgo: configurar un **segundo PIN oculto** que activa un "modo de emergencia" que muestra un teléfono limpio (función disponible en algunos launchers de Android).

---

## 9. BGP Hijacking — Cuando Secuestran Internet Entero

Este es el ataque más macro de todos. SS7 secuestra el sistema telefónico. BGP Hijacking secuestra **el enrutamiento de internet a nivel mundial**.

### ¿Qué es BGP?
**BGP (Border Gateway Protocol)** es el protocolo que permite que los routers de internet sepan cómo llegar a cada bloque de IPs. Es la "tabla de mapas" de internet. Y como SS7, fue diseñado en una era de confianza mutua — sin autenticación.

### El Ataque
```
Google posee el bloque de IPs: 8.8.8.0/24 (su DNS 8.8.8.8)

Un atacante anuncia vía BGP: "Yo soy la ruta más corta a 8.8.8.0/24"

Los routers de internet le creen (BGP no verifica).

Durante minutos u horas, parte del tráfico de internet destinado
a Google pasa por los servidores del atacante.

El atacante puede: ver el tráfico, responder con datos falsos,
o simplemente descartarlo (Denial of Service a escala de internet).
```

### Casos Reales
*   **2010:** China Telecom "accidentalmente" anunció rutas BGP que redirigieron el 15% del tráfico de internet durante 18 minutos, incluyendo tráfico militar de EE.UU.
*   **2018:** Hackers norcoreanos usaron BGP Hijacking para robar $13.5M en cripto de MyEtherWallet — redirigieron el DNS de la plataforma a un servidor falso.
*   **2023:** Un error de configuración BGP en un ISP de América Latina dejó sin internet a miles de usuarios por 4 horas.

---

## 10. Resumen: El Mapa de Vectores por Proximidad al Atacante

| Vector | Acceso Requerido | Sofisticación | Impacto |
|---|---|---|---|
| **SIM Swap** | Solo un teléfono para llamar | Baja (ingeniería social) | Crítico (control de cuentas) |
| **SS7 Attack** | Acceso a red SS7 ($$$) | Alta | Crítico (intercepción total) |
| **IMSI Catcher** | Proximidad física (~500m) | Media-Alta | Alto (rastreo + intercepción) |
| **Evil Twin WiFi** | Misma área física | Media | Alto (credenciales) |
| **ADB WiFi** | Misma red WiFi | Baja | Crítico (control del dispositivo) |
| **ADB USB (5 min)** | Acceso físico al dispositivo | Baja | Crítico (extracción completa) |
| **Stalkerware** | Acceso físico (5 min) | Muy Baja | Crítico (monitoreo persistente) |
| **WhatsApp Mods** | Engañar a la víctima | Muy Baja | Alto (datos de chats) |
| **BlueBorne/BLESA** | Proximidad Bluetooth (~10m) | Alta | Medio-Alto |
| **BGP Hijacking** | Acceso a router BGP | Muy Alta | Masivo (internet) |
| **Pegasus (Zero-Click)** | Solo el número de teléfono | Extrema (estado-nación) | Total |

---

## 11. La Defensa Holística (Para Quien Ya Sabe Todo Esto)

Una vez que entiendes todos estos vectores, la defensa correcta no es una herramienta — es un **modelo mental**:

1.  **Threat Modeling:** Antes de protegerte, pregunta: ¿Quién querría atacarme? ¿Tienen recursos de gobierno o son ataques oportunistas? La respuesta define qué nivel de defensa necesitas.

2.  **Defense in Depth:** No hay una sola defensa. Capas. Si SS7 bypasea el 2FA por SMS, tienes TOTP como segunda capa. Si alguien accede a tu teléfono, el cifrado de disco es otra capa.

3.  **El Eslabón Más Débil:** La cadena de seguridad se rompe en su punto más débil. Puede que tengas cifrado militar, pero si usas la misma contraseña en todos lados, sobra.

4.  **La Regla del Mínimo Privilegio:** Dale a cada app solo los permisos que necesita. Un juego no necesita acceso a tus contactos ni a tu micrófono.

5.  **La Superficie de Ataque:** Cada app instalada, cada cuenta creada, cada dispositivo conectado es superficie de ataque potencial. Menos es más.
