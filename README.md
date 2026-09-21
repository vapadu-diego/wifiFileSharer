# 📡 WiFi LAN Link (wifi-file-sharer)

[**English**](#english) | [**Español**](#español)

---

<a name="english"></a>

## 🇺🇸 English

**WiFi LAN Link** is a modern, ultra-fast web application designed to share files and messages in real-time between devices connected to the same local network (WiFi or Ethernet). No complicated configurations, no internet required, and no login.

Created by [Isaias Fernandez](https://github.com/isaiasfer).

### ✨ Key Features

- **Local Network Speed**: Transfers occur at your router's maximum speed, without passing through external servers.
- **Ephemeral Rooms**: No database required. Everything lives in RAM, and files are automatically deleted when the room is closed.
- **Real-Time Chat**: Communicate instantly with other members in the room.
- **Multi-Device**: Works on Windows, macOS, Linux, Android, and iOS via browser.
- **Advanced Moderation**: The room host can kick, IP-ban, and delete messages or files.
- **Admin Dashboard**: Exclusive access for the server admin (localhost) to monitor all rooms in "Ghost Mode".
- **No Login Required**: Start sharing immediately without creating an account or logging in.
- **Identity Tokens**: The server issues a signed token per browser, so participants cannot impersonate each other. Opening the same identity on another tab/device takes over the session and leaves the previous window inactive.
- **Editable Nickname**: Change your display name anytime from the sidebar. It must be unique across the network (case-insensitive) and updates live for contacts and active rooms; your identity and history stay untouched.
- **Persistent Private Chat**: Private conversations and identities live in a local SQLite database (`data.db`), so history survives server restarts and is paginated on demand. Rooms remain ephemeral.
- **Optional HTTPS**: Enable TLS with `--https` (auto self-signed) or provide your own certificate with `--tls-cert/--tls-key`.
- **Same-Origin Only**: Socket connections and API endpoints reject requests coming from other origins.

### 🚀 Installation and Usage

#### Option 1: Instant Usage (Recommended)
If you have Node.js installed, you can run the app without installing anything permanently:
```bash
npx wifi-file-sharer
```

#### Option 2: Global Installation
To have the command always available:
```bash
npm install -g wifi-file-sharer
# Then simply run:
wifi-file-sharer
```

### ⚙️ Advanced Options
The command accepts parameters for custom execution:
```bash
wifi-file-sharer --port 4000 --host 0.0.0.0
```

| Flag | Description | Default |
|------|-------------|---------|
| `-p, --port` | Port to run the server on. If busy, it will try the next available (+1). | `3000` |
| `-h, --host` | Host/IP to bind the server to. Use `0.0.0.0` for all interfaces. | `0.0.0.0` |
| `--https` | Enable HTTPS (auto self-signed certificate if none provided). | off |
| `--tls-cert` / `--tls-key` | Paths to your own TLS certificate and key (implies HTTPS). | – |
| `--data-dir` | Directory for the database, uploads and certificates. | see below |

**Data directory:** `WFS_DATA_DIR` → legacy `./wifi-sharer-uploads` (if it exists) → `~/.wifi-file-sharer`.
**Environment variables:** `FILE_RETENTION_DAYS` (default 7, `0` = keep forever), `WFS_PURGE_INTERVAL_MS` (default 1 h), `WFS_HTTPS`, `WFS_TLS_CERT`, `WFS_TLS_KEY`, `WFS_DATA_DIR`, `WFS_MAX_ROOM_TEXTS`.

> Requires **Node.js >= 23.4** (built-in `node:sqlite`).

#### How to access from other devices
1. The server will display your local IP in the terminal, e.g., `http://192.168.1.15:3000`.
2. Type that address into the browser of your mobile, tablet, or another PC.
3. Ensure all devices are on the **same WiFi network**.

---

### ❓ Frequently Asked Questions (FAQ)

**What is the transfer speed?**
The speed is limited solely by your local network hardware (Router, WiFi standard, or Ethernet). Since data doesn't leave your LAN, you can expect speeds between 10MB/s and 100MB/s depending on your connection quality.

**Where are the files stored?**
Files are stored on the **host machine's disk** (the one running the command). Private chat history and identities live in a local SQLite database (`data.db`), so private conversations survive restarts and are loaded by pages. Rooms, their messages and their files remain in RAM (ephemeral). Everything lives in the data directory (see the table above).

**Is it secure?**
This tool is designed for **trusted, private networks**. It uses HTTP (unencrypted), meaning anyone on the same network with advanced tools could potentially intercept traffic. For enterprise use, ensure you are on a password-protected, secure WiFi. Application-level protections: each browser receives a signed identity token (impersonation and identity takeover are detected), room/file mutations verify ownership and membership, room payloads never expose passwords or member IPs, and only same-origin clients can connect.

**Does it clean up automatically?**
Yes. Room files are deleted when the room is closed. Private files expire after **7 days** (`FILE_RETENTION_DAYS`, `0` = keep forever) and a background job purges them (row + disk) on an interval (`WFS_PURGE_INTERVAL_MS`, default 1 h) and at startup. Orphan files from previous crashes are also cleared at startup. Expired files show as "Archivo expirado" and can be removed from the chat.

**Can I enable HTTPS?**
Yes: run with `--https` to auto-generate a self-signed certificate (stored in the data dir) or pass `--tls-cert`/`--tls-key` (or `WFS_TLS_CERT`/`WFS_TLS_KEY`) to use your company's certificate. With a valid certificate, desktop notifications and clipboard work in secure context.

**What is the ideal use case?**
Fast, "one-and-done" file or text sharing in an office or home environment where you want to avoid the friction of logging into WhatsApp, Cloud Drives, or Slack just to pass a single file.

---

<a name="español"></a>

## 🇲🇽 Español

**WiFi LAN Link** es una aplicación web moderna y ultrarrápida diseñada para compartir archivos y mensajes en tiempo real entre dispositivos conectados a la misma red local (WiFi o Ethernet). Sin configuraciones complicadas, sin necesidad de internet y sin inicio de sesión.

Creado por [Isaias Fernandez](https://github.com/isaiasfer).

### ✨ Características Principales

- **Velocidad de Red Local**: Las transferencias ocurren a la máxima velocidad de tu router, sin pasar por servidores externos.
- **Salas Temporales (Efímeras)**: No requiere base de datos. Todo vive en la memoria RAM y los archivos se borran automáticamente al cerrar la sala.
- **Chat en Tiempo Real**: Comunícate instantáneamente con los demás miembros de la sala.
- **Multidispositivo**: Funciona en Windows, macOS, Linux, Android e iOS a través del navegador.
- **Moderación Avanzada**: El host de la sala puede expulsar (`kick`), bloquear por IP (`ban`), y borrar mensajes o archivos.
- **Panel de Administración**: Acceso exclusivo para el administrador del servidor (localhost) para supervisar todas las salas en "Modo Fantasma".
- **Sin Registro (No Login)**: Empieza a compartir al instante sin crear cuentas ni iniciar sesión.
- **Tokens de Identidad**: El servidor emite un token firmado por navegador, así nadie puede suplantar a otro usuario. Abrir la misma identidad en otra pestaña/dispositivo toma el control de la sesión y deja la ventana anterior inactiva.
- **Nombre Editable**: Cambia tu nombre visible cuando quieras desde la barra lateral. Debe ser único en la red (sin distinguir mayúsculas) y se actualiza en vivo para contactos y salas activas; tu identidad e historial no cambian.
- **Chat Privado Persistente**: Las conversaciones privadas y las identidades viven en una base SQLite local (`data.db`), por lo que el historial sobrevive reinicios y se carga por páginas. Las salas siguen siendo efímeras.
- **HTTPS Opcional**: Activa TLS con `--https` (autofirmado automático) o usa tu propio certificado con `--tls-cert/--tls-key`.
- **Solo Mismo Origen**: Las conexiones de socket y los endpoints de la API rechazan pedidos provenientes de otros orígenes.

### 🚀 Instalación y Uso

#### Opción 1: Uso instantáneo (Recomendado)
Si tienes Node.js instalado, puedes ejecutar la aplicación sin instalar nada permanentemente:
```bash
npx wifi-file-sharer
```

#### Opción 2: Instalación Global
Para tener el comando siempre disponible:
```bash
npm install -g wifi-file-sharer
# Luego simplemente ejecuta:
wifi-file-sharer
```

### ⚙️ Opciones avanzadas
El comando acepta parámetros para personalizar la ejecución:
```bash
wifi-file-sharer --port 4000 --host 0.0.0.0
```

| Parámetro | Descripción | Predeterminado |
|-----------|-------------|----------------|
| `-p, --port` | Puerto donde correrá el servidor. Si está ocupado, buscará el siguiente (+1). | `3000` |
| `-h, --host` | Dirección IP a la que se vinculará. Usa `0.0.0.0` para todas. | `0.0.0.0` |
| `--https` | Activa HTTPS (autofirmado automático si no hay certificado). | apagado |
| `--tls-cert` / `--tls-key` | Rutas a tu certificado y clave TLS (implica HTTPS). | – |
| `--data-dir` | Directorio para la base de datos, archivos y certificados. | ver abajo |

**Directorio de datos:** `WFS_DATA_DIR` → legacy `./wifi-sharer-uploads` (si existe) → `~/.wifi-file-sharer`.
**Variables de entorno:** `FILE_RETENTION_DAYS` (7 por defecto, `0` = conservar siempre), `WFS_PURGE_INTERVAL_MS` (1 h por defecto), `WFS_HTTPS`, `WFS_TLS_CERT`, `WFS_TLS_KEY`, `WFS_DATA_DIR`, `WFS_MAX_ROOM_TEXTS`.

> Requiere **Node.js >= 23.4** (`node:sqlite` incluido).

#### Cómo acceder desde otros dispositivos
1. El servidor te indicará tu IP local en la terminal, por ejemplo: `http://192.168.1.15:3000`.
2. Escribe esa dirección en el navegador de tu móvil, tablet u otro PC.
3. Asegúrate de que todos los dispositivos estén en la **misma red WiFi**.

---

### ❓ Preguntas Frecuentes (FAQ)

**¿Cuál es la velocidad de transferencia?**
La velocidad está limitada únicamente por tu hardware de red local (Router, estándar de WiFi o Ethernet). Como los datos no salen de tu red local, puedes esperar velocidades de entre 10MB/s y 100MB/s según tu conexión.

**¿Dónde se alojan los archivos?**
Los archivos se guardan en el **disco de la computadora host** (la que ejecuta el comando). El historial de chats privados y las identidades viven en una base SQLite local (`data.db`), por lo que las conversaciones privadas sobreviven reinicios y se cargan por páginas. Las salas, sus mensajes y archivos siguen en RAM (efímeros). Todo vive en el directorio de datos (ver tabla arriba).

**¿Es seguro?**
Esta herramienta está diseñada para **redes privadas y de confianza**. Utiliza HTTP (sin cifrar), por lo que alguien en la misma red con herramientas avanzadas podría interceptar el tráfico. Para uso empresarial, asegúrate de estar en una red WiFi segura con contraseña. Protecciones a nivel de aplicación: cada navegador recibe un token de identidad firmado (se detecta suplantación y toma de sesión), las mutaciones de mensajes/archivos verifican autoría y pertenencia, los payloads de sala nunca exponen contraseñas ni IPs de los miembros, y solo clientes del mismo origen pueden conectarse.

**¿Se limpia automáticamente?**
Sí. Los archivos de las salas se borran cuando el host cierra la sala. Los archivos de los chats privados duran **7 días** por defecto (configurable con `FILE_RETENTION_DAYS`; `0` = conservar para siempre) y un job de fondo los purga (fila + disco) cada `WFS_PURGE_INTERVAL_MS` (1 h por defecto) y al arrancar. Además, cualquier archivo "huérfano" de sesiones anteriores se elimina al iniciar la aplicación. Los archivos expirados se muestran en el historial como "Archivo expirado" y se pueden quitar del chat.

**¿Puedo activar HTTPS?**
Sí: ejecuta con `--https` para autogenerar un certificado autofirmado (guardado en el directorio de datos) o pasa `--tls-cert`/`--tls-key` (o `WFS_TLS_CERT`/`WFS_TLS_KEY`) para usar el certificado de tu empresa. Con un certificado válido, las notificaciones nativas y el portapapeles funcionan en contexto seguro.

**¿Cuál es el caso de uso ideal?**
Intercambio rápido de archivos o texto en entornos de oficina o casa donde quieres evitar la fricción de iniciar sesión en WhatsApp, Drive o Slack solo para pasar un archivo puntual.

---

### ☕ Support the Project / Donaciones

If this tool helped you, consider supporting its development! / ¡Si esta herramienta te sirvió, considera apoyar su desarrollo!

- **PayPal**: [paypal.me/isaiasfer4](https://paypal.me/isaiasfer4)
- **Mercado Pago (Argentina)**: [link.mercadopago.com.ar/isaiasfer4](https://link.mercadopago.com.ar/isaiasfer4)

---

### 🛠️ Technical Stack / Tecnologías

- **Frontend**: [Next.js](https://nextjs.org/) (React, TypeScript)
- **Server**: [Express](https://expressjs.com/) & [Node.js](https://nodejs.org/)
- **Communication**: [Socket.io](https://socket.io/)
- **Styles**: Vanilla CSS (**Cyberpunk/Dark Mode**)

### 🤝 Contributions
Feel free to open a **Pull Request** or an **Issue** on GitHub!
[https://github.com/isaiasfer/wifiFileSharer](https://github.com/isaiasfer/wifiFileSharer)

Desarrollado con ❤️ para facilitar el intercambio de archivos libre y rápido.
