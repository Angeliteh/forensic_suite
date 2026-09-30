# Guía: Evidencia Digital Legal y Cadena de Custodia

Este documento explica qué hace que una evidencia digital sea aceptada en un tribunal (o sea rechazada), y cómo estructurar tu sistema de auditoría para que los entregables sean legalmente válidos.

> **Advertencia legal:** Este documento es de carácter educativo e informativo. Las leyes sobre evidencia digital varían por país y jurisdicción. Consulta a un abogado especialista en derecho informático de tu país antes de presentar cualquier evidencia en un proceso legal.

---

## 1. ¿Qué Hace Válida una Evidencia Digital?

En la mayoría de sistemas legales modernos (incluido México y LATAM), una evidencia digital es válida si puede demostrar tres propiedades:

### 1. Autenticidad
La evidencia debe ser lo que dice ser. Nadie la fabricó.
*   **¿Cómo se prueba?** Con el hash criptográfico (SHA-256). Si el hash del archivo presentado en tribunal coincide con el hash generado el día de la captura (registrado en el manifiesto), el archivo no ha sido modificado.

### 2. Integridad
La evidencia no fue alterada desde que fue recolectada.
*   **¿Cómo se prueba?** Con la cadena de custodia: un registro documentado de quién tuvo acceso al archivo, cuándo, y qué hizo con él.

### 3. Admisibilidad
La evidencia fue obtenida de forma lícita, no viola derechos fundamentales.
*   **¿Cómo se prueba?** Documentando que quien realizó la auditoría tenía el consentimiento o la autoridad legal para acceder a esa información.

---

## 2. SHA-256: El Sello Notarial Digital Explicado

### ¿Por qué SHA-256 y no MD5?
*   **MD5** (el más antiguo) es vulnerable a colisiones: dos archivos diferentes pueden tener el mismo hash MD5. En tribunal esto es un punto de ataque del abogado contrario.
*   **SHA-256** no tiene colisiones conocidas practicables. Es el estándar actual de la industria forense y el FBI.

### El Flujo Correcto de Hashing
```
1. Se captura el video/datos (MOMENTO CERO)
2. INMEDIATAMENTE se genera el hash SHA-256
3. El hash se registra en el manifiesto con timestamp
4. El manifiesto se firma (opcional: con timestamp de un tercero)
5. Cualquier verificación posterior compara contra ESE hash
```

**Lo que NO se debe hacer:**
*   Generar el hash días después de la captura (el archivo pudo haber sido modificado).
*   Guardar el hash en el mismo disco que el archivo (si hackean el disco, pueden cambiar ambos).

### El Timestamp de Tercero (Nivel Avanzado)
Para evidencia de alto valor, puedes registrar el hash en un servicio de **Trusted Timestamping** (RFC 3161). El servicio emite un certificado firmado criptográficamente que dice "El hash X existía en la fecha Y". Algunos servicios gratuitos:
*   `freetsa.org` — Autoridad de timestamp gratuita.
*   Blockchain Anchoring — Registrar el hash en la blockchain de Bitcoin (permanente e inmutable).

---

## 3. La Cadena de Custodia Digital

Este concepto viene de la investigación criminal física (la evidencia de una escena del crimen debe tener un registro de cada persona que la tocó). En digital aplica igual.

### Plantilla de Documento de Cadena de Custodia
```
REGISTRO DE CADENA DE CUSTODIA — EVIDENCIA DIGITAL
=====================================================
Caso/Expediente: [ID del caso]
Tipo de evidencia: Video de auditoría de WhatsApp Web
Descripción: Historial de conversaciones entre [Persona A] y [Persona B]

RECOLECCIÓN INICIAL:
  Fecha y hora: 2024-05-03T08:15:30 UTC
  Recolectado por: [Nombre / Empresa]
  Método: Script automatizado Playwright v1.43 sobre Google Chrome 124
  Hash SHA-256: e3b0c44298fc1c149afbf4c8996fb924...

TRANSFERENCIAS:
  [Fecha] - [Nombre] → [Nombre]: Motivo: [envío al abogado X]
  [Fecha] - [Nombre] → [Nombre]: Motivo: [presentación en tribunal]

ESTADO ACTUAL:
  Ubicación: [Servidor cifrado / USB en caja fuerte]
  Responsable actual: [Nombre]
```

---

## 4. La Ley en México (y LATAM General)

### Marco Legal Aplicable en México

**Código Nacional de Procedimientos Penales (CNPP) — Artículo 380:**
Reconoce los documentos electrónicos como evidencia, siempre que se pueda determinar su autoría e integridad.

**NOM-151-SCFI-2016:**
Norma Oficial Mexicana que establece los requisitos para la conservación de mensajes de datos con valor legal en México. Exige el uso de sellos de tiempo certificados.

**Ley Federal de Telecomunicaciones:**
Establece que los proveedores de servicio (como Meta/WhatsApp) deben conservar ciertos metadatos por 24 meses. Esto significa que en un proceso legal, un juez puede ordenar a WhatsApp que entregue los metadatos aunque el usuario haya borrado los mensajes.

### La Diferencia Clave: Auditoría Propia vs. Espionaje
| Tipo | Legalidad | Ejemplo |
|---|---|---|
| Auditar tus propias conversaciones | ✅ Legal | "Quiero un respaldo visual de mis chats" |
| Auditar conversaciones donde eres parte | ✅ Legal en la mayoría de casos | "Tengo pruebas de un acuerdo verbal" |
| Auditar conversaciones de terceros sin permiso | ❌ Ilegal | "Espiar el celular de alguien" |
| Instalar spyware sin consentimiento | ❌ Delito federal | Violación a la privacidad (Art. 211 bis CP) |

> **La regla práctica:** Si eres parte de la conversación, puedes auditarla. Si NO eres parte, necesitas orden judicial.

---

## 5. Limitaciones Técnicas de la Evidencia de WhatsApp Web

### Por qué el DOM de WhatsApp Web NO es evidencia perfecta
1.  **Es renderizado por JavaScript:** Un abogado técnico podría argumentar que cualquier script de JS puede modificar el DOM antes de que se capture. Esto no aplica si tienes el VIDEO grabado en tiempo real con FFmpeg (que graba a nivel del sistema operativo, no del DOM).

2.  **Las fechas son locales:** Las fechas que muestra WhatsApp Web son en la zona horaria del dispositivo. Si el reloj del sistema fue manipulado antes de la auditoría, las fechas se verán afectadas.

3.  **No hay firma de Meta:** WhatsApp no firma criptográficamente los mensajes individuales (a diferencia de Signal). Esto significa que no hay una prueba matemática de que el mensaje provino del servidor real de Meta.

### Por qué el VIDEO + HASH es la evidencia más fuerte disponible sin acceso judicial
*   El video muestra visualmente el proceso de scroll en tiempo real (difícil de fabricar en tiempo real).
*   El hash SHA-256 generado inmediatamente después prueba que el video no fue editado.
*   El manifiesto JSON documenta los metadatos de la sesión.
*   Combinado con los logs de Playwright, forma un conjunto de evidencia multi-capa.

---

## 6. La Evidencia Más Fuerte (Con Root + Frida)

Si se tiene acceso root al teléfono donde existe la conversación:

```
1. Extraer msgstore.db.crypt15 de /data/data/com.whatsapp/databases/
2. Extraer la llave de /data/data/com.whatsapp/files/key
3. Desencriptar la base de datos con: wa-crypt-tools (herramienta open source)
4. Generar hash SHA-256 de la base de datos ANTES de abrir
5. El resultado es texto plano SQL con TODOS los mensajes, metadatos, y timestamps del servidor
```

Esta evidencia es **estructuralmente superior** al video porque:
*   Los timestamps son los del servidor de WhatsApp (no del dispositivo local).
*   Los mensajes eliminados a veces permanecen en la base de datos como registros "tombstone".
*   El mensaje ID de WhatsApp es un identificador único que puede corroborarse con los servidores de Meta si hay una orden judicial.

---

## 7. Checklist Final: Auditoría Forense Correcta

Antes de presentar cualquier evidencia digital:

- [ ] ¿Se generó el hash SHA-256 **inmediatamente** después de la captura?
- [ ] ¿El hash está guardado en un lugar **separado** del archivo (otro disco/nube)?
- [ ] ¿El manifiesto JSON incluye fecha/hora en UTC, herramienta usada, y número de mensajes?
- [ ] ¿El video fue grabado con FFmpeg externo (no grabación interna de Playwright)?
- [ ] ¿Se documentó quién realizó la auditoría y con qué autorización?
- [ ] ¿Los archivos están almacenados en un medio con control de acceso (no solo en una carpeta local sin contraseña)?
- [ ] ¿Se tiene copia de seguridad en al menos 2 ubicaciones físicas distintas?
