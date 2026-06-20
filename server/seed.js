// seed.js — Carga datos iniciales (idempotente: borra y recarga catálogo/staff/barras).
import { db, initSchema, setConfig, CONFIG_DEFAULTS } from './db.js';
import { hashPassword } from './auth.js';

initSchema();

// ── Productos (carta de Hush Club, sección 13 del prompt) ───────────────────
// margen: 'altisimo' sin tilde para mantener llaves simples.
const PRODUCTS = [
  // nombre, categoria, base, min, max, desc, icono, margen, es_combo, incluidos, permite_com, placeholder
  ['Fernet con Coca', 'Tragos', 6000, 5000, 8000, 'Branca + Gaseosa Cola', 'vaso_500', 'alto', 0, '', 1, 'Ej: proporción'],
  ['Vodka Smirnoff con Speed', 'Tragos', 6500, 5500, 8500, 'Smirnoff + Speed', 'vaso_500', 'alto', 0, '', 1, 'Ej: poco hielo'],
  ['Gin Tonic Gordon\'s', 'Tragos', 7000, 6000, 9000, 'Gordon\'s + Agua Tónica + Limón', 'vaso_500', 'alto', 0, '', 1, 'Ej: sin limón'],
  ['Campari con Naranja', 'Tragos', 5500, 4500, 7000, 'Campari + Jugo Baggio', 'vaso_500', 'medio', 0, '', 1, 'Ej: proporción'],
  ['Combo Fernet', 'Combos', 35000, 30000, 45000, '1 Branca 750ml + 2 Gaseosas Cola 1.5L + Hielo', 'hielera', 'alto', 1, '1 Branca 750ml, 2 Gaseosas Cola 1.5L, Hielo', 0, ''],
  ['Combo Vodka Smirnoff', 'Combos', 40000, 35000, 50000, '1 Smirnoff + 5 Latas Speed + Hielo', 'hielera', 'alto', 1, '1 Smirnoff, 5 Latas Speed, Hielo', 0, ''],
  ['Combo Champagne Baron B', 'Combos', 55000, 50000, 70000, '1 Baron B + 2 Latas Speed + Hielo', 'hielera', 'medio', 1, '1 Baron B, 2 Latas Speed, Hielo', 0, ''],
  ['Cerveza en Lata', 'Cervezas', 4000, 3500, 5500, 'Quilmes/Brahma 473ml bien fría', 'lata', 'bajo', 0, '', 0, ''],
  ['Agua Mineral 500ml', 'Sin alcohol', 3000, 2500, 4500, 'Botella 500ml (entregada sin tapa)', 'botella', 'altisimo', 0, '', 0, ''],
  ['Speed Unlimited', 'Sin alcohol', 3500, 3000, 5000, 'Lata individual 250ml', 'lata', 'medio', 0, '', 0, ''],
  ['Hielo extra en vaso', 'Extras', 500, 500, 1000, 'Vaso plástico lleno de hielo', 'vaso', 'altisimo', 0, '', 0, ''],
  ['Vaso Extra', 'Extras', 500, 500, 1000, 'Vaso plástico adicional vacío', 'vaso', 'altisimo', 0, '', 0, ''],
  ['Chicle Menta Topline', 'Kiosco', 1500, 1500, 2500, 'Paquete de chicles Topline Menta', 'kiosco', 'medio', 0, '', 0, ''],
];

// Fotos reales por producto (optimizadas en public/productos/). 'Vaso Extra' no
// tiene foto propia y cae al ícono SVG.
const IMAGENES = {
  'Fernet con Coca': '/productos/fernet-con-coca.jpg',
  'Vodka Smirnoff con Speed': '/productos/vodka-smirnoff-con-speed.jpg',
  'Gin Tonic Gordon\'s': '/productos/gin-tonic-gordons.jpg',
  'Campari con Naranja': '/productos/campari-con-naranja.jpg',
  'Combo Fernet': '/productos/combo-fernet.jpg',
  'Combo Vodka Smirnoff': '/productos/combo-vodka-smirnoff.jpg',
  'Combo Champagne Baron B': '/productos/combo-champagne-baron-b.jpg',
  'Cerveza en Lata': '/productos/cerveza-en-lata.jpg',
  'Agua Mineral 500ml': '/productos/agua-mineral-500ml.jpg',
  'Speed Unlimited': '/productos/speed-unlimited.jpg',
  'Hielo extra en vaso': '/productos/hielo-extra-en-vaso.jpg',
  'Chicle Menta Topline': '/productos/chicle-menta-topline.jpg',
};

// ── Barras (ids fijos, nombres por defecto del prompt sección 6) ────────────
const BARS = [
  ['barra_1', 'Barra 1 (VIP)', 'Zona VIP — esquina superior izquierda', 1],
  ['barra_2', 'Barra 2', 'Superior derecha — junto a la pista', 2],
  ['barra_3', 'Barra 3', 'Inferior izquierda — entrada / zona general', 3],
  ['barra_4', 'Barra 4 (Patio)', 'Patio — derecha del local', 4],
];

// ── Staff de demo ───────────────────────────────────────────────────────────
const STAFF = [
  // nombre, usuario, pass, rol, barras_asignadas
  ['Admin Hush', 'admin', 'admin123', 'admin', []],
  ['Encargada Noche', 'encargada', 'encargada123', 'encargado', []],
  ['Bautista (Barras 1 y 2)', 'barra12', 'barra123', 'bartender', ['barra_1', 'barra_2']],
  ['Camila (Barras 3 y 4)', 'barra34', 'barra123', 'bartender', ['barra_3', 'barra_4']],
  // Founders reales (equipo WOL) — acceso exclusivo por /wol-hq.
  // Las contraseñas REALES NO van en el código: se leen de variables de entorno
  // (FOUNDER_LUCAS_PASS / FOUNDER_WENCES_PASS), que se cargan desde .env (local, ignorado
  // por git) o desde los Secrets de Replit (producción). El valor por defecto de acá es
  // solo un placeholder débil para que el desarrollo local funcione si no se setea la variable.
  ['Lucas', 'lucas', process.env.FOUNDER_LUCAS_PASS || 'dev-lucas', 'founder', []],
  ['Wenceslao', 'wenceslao', process.env.FOUNDER_WENCES_PASS || 'dev-wences', 'founder', []],
];

function run() {
  // Catálogo
  db.exec('DELETE FROM cross_sell; DELETE FROM offers; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products;');
  db.exec('DELETE FROM staff_bars; DELETE FROM staff; DELETE FROM bars;');
  db.exec('DELETE FROM loyalty; DELETE FROM loyalty_redemptions; DELETE FROM surveys;');

  const insP = db.prepare(`INSERT INTO products
    (nombre,descripcion,categoria,precio_base,precio_min,precio_max,precio_actual,icono,margen,disponible,es_combo,productos_incluidos,permite_comentario,comentario_placeholder,orden,imagen_url)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)`);
  PRODUCTS.forEach((p, i) => {
    const [nombre, cat, base, min, max, desc, icono, margen, combo, incl, perm, ph] = p;
    insP.run(nombre, desc, cat, base, min, max, base /* precio_actual=base */, icono, margen, combo, incl, perm, ph, i + 1, IMAGENES[nombre] || null);
  });

  const insB = db.prepare('INSERT INTO bars(id,nombre,ubicacion,orden) VALUES(?,?,?,?)');
  BARS.forEach(b => insB.run(...b));

  const insS = db.prepare('INSERT INTO staff(nombre,usuario,pass_hash,rol) VALUES(?,?,?,?)');
  const insSB = db.prepare('INSERT INTO staff_bars(staff_id,bar_id) VALUES(?,?)');
  STAFF.forEach(([nombre, usuario, pass, rol, barras]) => {
    const r = insS.run(nombre, usuario, hashPassword(pass), rol);
    const id = r.lastInsertRowid;
    barras.forEach(b => insSB.run(id, b));
  });

  // Cross-sell (sección 5.3 / 13): tragos -> hielo o vaso; combos -> speed o agua.
  const pid = (nombre) => db.prepare('SELECT id FROM products WHERE nombre = ?').get(nombre)?.id;
  const insCS = db.prepare('INSERT INTO cross_sell(trigger_product_id,suggested_product_id) VALUES(?,?)');
  const tragos = ['Fernet con Coca', 'Vodka Smirnoff con Speed', 'Gin Tonic Gordon\'s', 'Campari con Naranja'];
  const combos = ['Combo Fernet', 'Combo Vodka Smirnoff', 'Combo Champagne Baron B'];
  tragos.forEach(t => { insCS.run(pid(t), pid('Hielo extra en vaso')); insCS.run(pid(t), pid('Vaso Extra')); });
  combos.forEach(c => { insCS.run(pid(c), pid('Speed Unlimited')); insCS.run(pid(c), pid('Agua Mineral 500ml')); });

  // Oferta de ejemplo
  db.prepare(`INSERT INTO offers(nombre,descripcion,product_id,precio_especial,activo)
              VALUES(?,?,?,?,1)`)
    .run('Happy Hour Fernet', 'Combo Fernet a precio especial hasta la 1am', pid('Combo Fernet'), 30000);

  // Config por defecto
  for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) setConfig(k, v);

  console.log('✓ Seed completado.');
  console.log('  Productos:', PRODUCTS.length, '| Barras:', BARS.length, '| Staff:', STAFF.length);
  console.log('  Credenciales demo → admin/admin123 · encargada/encargada123 · barra12/barra123 · barra34/barra123');
  console.log('  Founders (privado) → lucas / wenceslao (ver contraseñas con el equipo)');
}

run();
