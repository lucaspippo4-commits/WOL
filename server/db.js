// db.js — Capa de base de datos sobre node:sqlite (SQLite nativo de Node >=22.5)
// No requiere compilar módulos nativos: ideal para levantar el MVP en cualquier máquina.
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '..', 'wol.db');
const BACKUP_DIR = path.join(__dirname, '..', 'backups');

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// --- Esquema -----------------------------------------------------------------
export function initSchema() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    categoria TEXT NOT NULL,
    precio_base INTEGER NOT NULL,
    precio_min INTEGER NOT NULL,
    precio_max INTEGER NOT NULL,
    precio_actual INTEGER NOT NULL,
    icono TEXT NOT NULL,
    margen TEXT NOT NULL DEFAULT 'medio',          -- bajo | medio | alto | altisimo
    disponible INTEGER NOT NULL DEFAULT 1,
    es_combo INTEGER NOT NULL DEFAULT 0,
    productos_incluidos TEXT DEFAULT '',
    permite_comentario INTEGER NOT NULL DEFAULT 0,
    comentario_placeholder TEXT DEFAULT '',
    orden INTEGER NOT NULL DEFAULT 0,
    imagen_url TEXT DEFAULT NULL,                   -- foto real del producto (public/productos/*.jpg)
    imagen_botella_url TEXT DEFAULT NULL,           -- opcional, para futuras fotos reales
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bars (
    id TEXT PRIMARY KEY,                            -- barra_1 .. barra_4 (fijo)
    nombre TEXT NOT NULL,                           -- nombre visible, editable por admin
    ubicacion TEXT DEFAULT '',
    orden INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    pass_hash TEXT NOT NULL,
    rol TEXT NOT NULL,                              -- bartender | encargado | admin
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS staff_bars (
    staff_id INTEGER NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    bar_id TEXT NOT NULL REFERENCES bars(id) ON DELETE CASCADE,
    PRIMARY KEY (staff_id, bar_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero_orden INTEGER,                           -- número incremental visible, asignado al pagar
    session_token TEXT NOT NULL,
    codigo_retiro TEXT NOT NULL UNIQUE,
    qr_token TEXT NOT NULL UNIQUE,
    bar_id TEXT REFERENCES bars(id),                -- NULL en regalos hasta que se canjean
    estado TEXT NOT NULL DEFAULT 'creado',          -- creado|pagado|listo|entregado|cancelado|regalo_pendiente
    tipo_pedido TEXT NOT NULL DEFAULT 'normal',     -- normal | pre-pedido | regalo
    en_cola INTEGER NOT NULL DEFAULT 0,             -- 1 = visible en la cola de la barra
    es_regalo INTEGER NOT NULL DEFAULT 0,
    regalo_mensaje TEXT DEFAULT '',
    monto_subtotal INTEGER NOT NULL DEFAULT 0,
    descuento INTEGER NOT NULL DEFAULT 0,
    monto_total INTEGER NOT NULL DEFAULT 0,
    cupon TEXT DEFAULT NULL,
    mesa_origen TEXT DEFAULT NULL,
    payment_pref_id TEXT DEFAULT NULL,
    puntos_otorgados INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    paid_at TEXT, prep_at TEXT, ready_at TEXT, delivered_at TEXT, cancelled_at TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id),
    nombre TEXT NOT NULL,                           -- snapshot del nombre
    icono TEXT DEFAULT '',
    cantidad INTEGER NOT NULL DEFAULT 1,
    precio_unit INTEGER NOT NULL,                   -- precio cobrado en el momento
    comentario TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    product_id INTEGER REFERENCES products(id),
    precio_especial INTEGER,
    activo INTEGER NOT NULL DEFAULT 1,
    hora_inicio TEXT DEFAULT NULL,                  -- 'HH:MM' opcional
    hora_fin TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cross_sell (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    suggested_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS loyalty (
    session_token TEXT PRIMARY KEY,
    puntos INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS loyalty_redemptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL,
    cupon TEXT NOT NULL UNIQUE,
    descripcion TEXT NOT NULL,
    descuento_pct REAL NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_token TEXT NOT NULL,
    rating INTEGER,                                 -- 1..5
    nps TEXT,                                       -- si | no | tal_vez
    sugerencia_trago TEXT DEFAULT '',
    comentario TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  -- Respaldo de noches reiniciadas: snapshot JSON para poder deshacer un reset.
  CREATE TABLE IF NOT EXISTS night_backups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    label TEXT DEFAULT '',
    pedidos INTEGER NOT NULL DEFAULT 0,
    ventas INTEGER NOT NULL DEFAULT 0,
    payload TEXT NOT NULL,
    restored_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_orders_bar ON orders(bar_id);
  CREATE INDEX IF NOT EXISTS idx_orders_session ON orders(session_token);
  CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
  `);

  // Migraciones suaves (para bases ya existentes, ej. en Replit): agregan columnas
  // nuevas sin recrear la tabla. SQLite no tiene "ADD COLUMN IF NOT EXISTS".
  const orderCols = db.prepare('PRAGMA table_info(orders)').all().map(c => c.name);
  if (!orderCols.includes('nota_admin')) {
    db.exec("ALTER TABLE orders ADD COLUMN nota_admin TEXT DEFAULT ''");
  }
}

// --- Backup automático del archivo de la base (copia consistente) -----------
// VACUUM INTO crea una copia íntegra aunque haya escrituras (WAL). Se conservan
// las últimas N copias en /backups. Protege ante borrados/corrupción accidental.
export function backupDatabase(keep = 12) {
  try {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(BACKUP_DIR, `wol-${ts}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('wol-') && f.endsWith('.db')).sort();
    while (files.length > keep) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    return file;
  } catch (e) { console.error('backupDatabase:', e.message); return null; }
}

// --- Config (clave/valor en JSON) -------------------------------------------
export const CONFIG_DEFAULTS = {
  comision_wol: 0.05,                 // 5% — COMISION_WOL (split de Mercado Pago)
  loyalty_pesos_por_punto: 1000,      // 1 punto por cada $1.000 gastados
  loyalty_umbral: 50,                 // puntos para desbloquear recompensa
  loyalty_recompensa_pct: 0.10,       // 10% off en el próximo pedido
  loyalty_recompensa_texto: 'Llegá a 50 puntos y desbloqueás 10% OFF en tu próximo pedido de la noche',
  time_slot: 'auto',                  // auto | temprano | tarde  (antes/después de la 1am)
  occupancy_window_min: 15,           // ventana para calcular demanda por barra
  precompra_habilitada: true,         // toggle manual de pre-compras (pre-pedido)
  precompra_cierre_dt: null,          // ISO 'YYYY-MM-DDTHH:MM' — cierre automático (o null)
  reglas: { margen: true, momento: true, crosssell: true, ranking: true, stock: true },
  nombre_noche: 'Hush Club — Noche WOL',
  contacto_wol: {
    titulo: '¿Te gustó WOL?',
    texto: 'WOL elimina las filas de las barras. Si querés llevar esta experiencia a tu local, escribinos.',
    email: 'hola@wol.app',           // EDITAR
    instagram: '@wol.app'            // EDITAR
  }
};

export function getConfig(key) {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  if (row) { try { return JSON.parse(row.value); } catch { return row.value; } }
  return CONFIG_DEFAULTS[key];
}

export function getAllConfig() {
  const out = { ...CONFIG_DEFAULTS };
  for (const r of db.prepare('SELECT key, value FROM config').all()) {
    try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; }
  }
  return out;
}

export function setConfig(key, value) {
  db.prepare(`INSERT INTO config(key, value) VALUES(?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
    .run(key, JSON.stringify(value));
}
