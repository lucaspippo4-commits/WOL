# WOL — MVP para Hush Club 🍸

**WOL** es una webapp mobile-first que elimina las filas de las barras: el cliente
escanea un QR, ve la carta digital de Hush Club (con fotos reales), paga con
**Mercado Pago**, elige a qué barra retirar y recibe un **código + QR de retiro**.
El bartender lo escanea y lo entrega de un toque. El encargado ve todo en vivo desde
un panel de administración.

---

## 🚀 Cómo correrlo en local (un solo comando)

Requisitos: **Node.js 22.5+** (usa el SQLite nativo de Node, no compila nada).

```bash
npm run setup     # instala dependencias + crea y carga la base de datos
npm start         # levanta el servidor en http://localhost:3000
```

> Si ya instalaste, alcanza con `npm start`. La base se **auto-carga** la primera vez.
> Para resetear la base con los datos de ejemplo: `npm run seed`.

**Una sola app, una sola URL.** El consumidor entra directo (sin login). El personal
del boliche entra por un **acceso discreto del boliche** (`/acceso`, o el link
"· acceso ·" del footer) que ofrece Consumidor / Administración / Barra. El **equipo
WOL (founders)** entra por un **acceso aparte y secreto, NO linkeado en ningún lado:
la ruta `/wol-hq`** (ver abajo).

| Interfaz | Cómo se llega | Acceso |
|---|---|---|
| **Consumidor** | `/` | sin login |
| **Acceso staff del boliche** | `/acceso` (Consumidor / Admin / Barra) | login |
| **Bartender** | `/acceso` → Barra → login | rol bartender |
| **Admin / Encargado** | `/acceso` → Administración → login | rol encargado/admin |
| **Founders (equipo WOL)** | **`/wol-hq`** (acceso secreto, separado) | rol founder |

> 🔒 **Acceso de Founders:** `https://<tu-dominio>/wol-hq`. No está enlazado en ninguna
> pantalla; solo lo conoce el equipo WOL. Lleva directo al login de Founder. Desde el
> panel de Founder se controla la comisión, las métricas de WOL y el **"Reiniciar noche"**.

---

## 🔑 Credenciales de prueba

| Usuario | Contraseña | Rol | Barras |
|---|---|---|---|
| `admin` | `admin123` | admin | todas |
| `encargada` | `encargada123` | encargado | todas |
| `barra12` | `barra123` | bartender | Barra 1 (VIP) y Barra 2 |
| `barra34` | `barra123` | bartender | Barra 3 y Barra 4 (Patio) |
| `founder` | `founder123` | **founder** (solo equipo WOL) | — |

> El **rol** de cada usuario está en la base de datos: el login los manda a su panel.
> El dueño/admin crea y gestiona los usuarios de barra desde su panel.

---

## 👀 Roles y qué ve cada uno

- **Consumidor**: carta, mapa, carrito, pago, sus pedidos, fidelización. No sabe que existen los demás paneles.
- **Bartender**: cola de su(s) barra(s), escaneo, entregar.
- **Admin / Encargado (dueño)**: dashboard de SUS ventas (ventas, ticket, barras, top productos), carta, ofertas, barras, staff, encuestas, config. **No ve la comisión de WOL ni puede cambiarla.**
- **Founder (equipo WOL)**: panel exclusivo con la **comisión generada**, el **control del % de comisión**, métricas de negocio (volumen, adopción, horarios pico) y el **"Reiniciar noche"** (con confirmación reforzada y respaldo para deshacer). Nadie del boliche accede a esto — el admin/encargado **no** puede ver ni gestionar usuarios founder, ni reiniciar la noche.

---

## 💾 Base de datos y respaldos

- **Motor:** SQLite (`node:sqlite`, archivo `wol.db`). En **Replit Reserved VM** el disco es
  **persistente**, así que la base sobrevive reinicios y redeploys. (No se usa Cloud Run/Autoscale
  para el deploy porque su disco es efímero y reiniciaría la base.)
- **Respaldo automático del archivo:** al arrancar y cada 30 min se hace una copia íntegra
  (`VACUUM INTO`) en `backups/` (se conservan las últimas 12). Protege ante borrado o corrupción.
- **Respaldo para deshacer "Reiniciar noche":** antes de borrar, se guarda un snapshot completo
  (pedidos, ítems, encuestas, puntos) en la tabla `night_backups`. Desde el panel de Founder se
  puede **restaurar** ese respaldo (se conservan 48 h). El reset y el restore corren en transacción.
- **Migración a Postgres:** no se hizo para esta etapa (un boliche, una noche). SQLite en Reserved VM
  + estos respaldos cubren la persistencia con bajo riesgo. Cuando haya varios boliches conviene
  migrar a la *Production database* (Postgres) de Replit por sus backups gestionados.

---

## 💳 Mercado Pago (Checkout Pro)

La integración es **real** vía el SDK oficial `mercadopago`. Si no hay credenciales,
la app cae automáticamente a un **modo mock** (botón "Simular pago aprobado") para
poder desarrollar/demostrar sin plata.

### Variables de entorno (`.env`)

Copiá `.env.example` a `.env` y completá:

| Variable | Qué es | Dónde se obtiene |
|---|---|---|
| `MP_ACCESS_TOKEN` | Access Token de la app | MP Developers → Tus integraciones → Credenciales |
| `MP_PUBLIC_KEY` | Public Key | ídem |
| `MP_WEBHOOK_SECRET` | Clave secreta del webhook | MP Developers → Webhooks (al configurar la notificación) |
| `APP_BASE_URL` | URL pública de la app (para QR, links y webhook) | tu dominio / URL de Replit |
| `PORT` | Puerto (opcional, default 3000) | — |

> **`.env` está en `.gitignore` y NUNCA se sube al repo.** Las credenciales solo
> viven en el `.env` local y en los **Secrets** de Replit.

### Flujo de pago

1. El consumidor confirma el carrito → se crea una **preferencia de Checkout Pro**
   con los ítems (nombre, cantidad, `precio_actual`) y `back_urls` a `/pedido/{token}`.
2. Es redirigido al checkout de Mercado Pago.
3. MP notifica el pago al **webhook** `POST /api/webhooks/mercadopago`, que **valida
   la firma `x-signature`** contra `MP_WEBHOOK_SECRET`, **consulta el estado real**
   del pago vía la API de MP, y recién ahí marca el pedido como `pagado`.
   Nunca se confía solo en el redirect del cliente.
4. Al volver del checkout (`back_url`), si el webhook todavía no llegó, la app
   confirma el pago consultando la API antes de mostrar el código + QR.

> `auto_return` solo se activa cuando `APP_BASE_URL` es una URL pública `https`
> (MP no lo acepta con `localhost`). En local el redirect funciona igual, sin auto-return.

### Tarjetas de prueba (Mercado Pago Argentina)

Usá credenciales de **prueba** (`TEST-...`) y estas tarjetas:

| Tarjeta | Número | CVV | Vto | Resultado |
|---|---|---|---|---|
| Mastercard | 5031 7557 3453 0604 | 123 | 11/30 | según titular |
| Visa | 4509 9535 6623 3704 | 123 | 11/30 | según titular |
| Amex | 3711 803032 57522 | 1234 | 11/30 | según titular |

Para forzar el resultado, en **nombre del titular** poné:
- `APRO` → pago **aprobado**
- `OTHE` → **rechazado** por error general
- `CONT` → pago **pendiente**

(DNI de prueba: `12345678`.)

### Pasar de prueba a producción

Solo se **cambian las variables de entorno** (las `TEST-...` por las `APP_USR-...`
de la cuenta del boliche). **No hay que tocar código.**

### Sin split (todavía)

El 100 % del pago va a la cuenta dueña de `MP_ACCESS_TOKEN`. En `server/payments.js`
está marcado y comentado **dónde** se agregaría el `marketplace_fee` (comisión WOL /
split) en el futuro, sin activarlo ahora. La comisión generada se calcula y se muestra
**solo en el panel de Founders** (nunca al dueño/admin).

---

## 🎁 Funcionalidades destacadas

- **Fotos reales de productos** en la carta, carrito y upsell (con fallback a ícono
  SVG si un producto no tiene foto). Están en `public/productos/` (optimizadas).
- **Mapa del local** con la **imagen real del plano** (`public/assets/plano-local.jpeg`)
  y selección de barra; en el carrito se elige la barra directamente con botones.
- **Panel de Founders** (rol `founder`): comisión generada, control del % de comisión,
  y métricas de negocio de WOL. Aislado del dueño y del staff.
- **Códigos de descuento**: al llegar al umbral de puntos se genera un cupón único; se
  ingresa en el carrito; es de **un solo uso** y se invalida al pagarse (validado en el server).
- **Regalá un trago**: en el checkout elegís "Lo regalo", dejás un mensaje y pagás.
  Recibís un **link compartible** (`/regalo/{token}`) con botón de **WhatsApp**. Tu
  amigo lo abre, elige la barra y lo canjea. Mientras no se canjea queda en estado
  `regalo_pendiente` y **no** aparece en la cola del bartender.
- **Puntos automáticos**: cada compra suma puntos proporcionales al precio
  (1 punto cada $1.000, configurable). El dueño solo edita el ratio global y el
  umbral/descuento de la recompensa.
- **Flujo simplificado del bartender**: un solo botón **"Entregar"** (sin "en
  preparación"). Se puede revertir una entrega por error.
- **Numeración de pedidos**: cada pedido pagado recibe un **número incremental**
  visible para consumidor y bartender; la cola es **FIFO** (el que pagó primero, primero).
- **QR/códigos únicos** (verificados contra la base) y **no reutilizables**: una vez
  entregado, escanearlo de nuevo avisa "ya fue entregado".
- **Cierre de pre-compras**: el admin puede cerrar la venta anticipada (toggle manual
  o fecha/hora de cierre automático); el consumidor deja de ver la opción "para más tarde".
- **Reiniciar noche**: botón en Admin → Config que borra pedidos, ventas, encuestas y
  puntos (conserva carta, usuarios y configuración) para arrancar limpio antes de cada evento.

---

## ☁️ Deploy en Replit

1. **Subí el proyecto** a Replit (importá el repo o subí los archivos).
2. En **Tools → Secrets**, cargá estas variables (no como archivo, como Secrets):
   - `MP_ACCESS_TOKEN`
   - `MP_PUBLIC_KEY`
   - `MP_WEBHOOK_SECRET`
   - `APP_BASE_URL` → la **URL pública** de tu Repl (ej. `https://wol.tu-usuario.repl.co`).
     Es clave para que los **QR, links de pedido/regalo y el webhook** apunten al
     dominio público y no a `localhost`.
3. Apretá **Run**. El `.replit` ya está configurado: instala dependencias y arranca el
   servidor (`node server/server.js`). La base SQLite (`wol.db`) queda **persistente en
   disco** (no se borra entre reinicios) y se auto-carga la primera vez.
4. Abrí la URL pública del Repl. Verificá que el flujo funcione (carta → pago → QR).
5. **Webhook de MP**: en MP Developers → Webhooks, configurá la URL
   `https://<tu-url-replit>/api/webhooks/mercadopago` y copiá la clave secreta en
   `MP_WEBHOOK_SECRET`.

> Para producción real (deploy estable), usá **Deploy** en Replit (config ya incluida
> en `.replit`, target `cloudrun`).

---

## 🧱 Stack y estructura

- **Backend:** Node + Express. **DB:** SQLite vía `node:sqlite` (sin módulos nativos),
  archivo `wol.db`. **Frontend:** Preact + htm vía import maps (**sin build**, carga
  rápido y offline-friendly). **Realtime:** polling cada 3 s. **Pagos:** SDK `mercadopago`.

```
server/
  server.js     entrada (SPA + API + auto-seed)
  db.js         esquema + config
  models.js     consultas + serialización + recomendaciones
  seed.js       carta, barras, staff, imágenes, cross-sell, ofertas
  auth.js       scrypt + tokens + roles
  payments.js   Mercado Pago (real) + mock + validación de webhook
  routes/       public · orders · staff · admin
public/
  index.html · css/styles.css
  js/ (api, store, ui, icons, components, app) · js/views (consumer, bartender, admin)
  productos/    12 fotos de productos optimizadas
  assets/       hush-logo.jpeg, plano-local.jpeg
```

### Assets reemplazables
- **Logo Hush:** `public/assets/hush-logo.jpeg` (pisá el archivo para cambiarlo).
- **Fotos de productos:** `public/productos/<slug>.jpg`. Cada producto tiene un campo
  `imagen_url` (editable desde el admin) — si está vacío, se usa el ícono SVG.

---

## ⚙️ Configuración (Admin → Config)

Comisión WOL · ratio de puntos · umbral/descuento de recompensa · franja de la noche ·
ventana de ocupación · reglas de recomendación · **cierre de pre-compras** ·
**Reiniciar noche**. Todo editable en vivo, con valores por defecto sensatos.

Powered by **WOL**.
