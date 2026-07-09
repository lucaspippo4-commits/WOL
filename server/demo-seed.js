// demo-seed.js — datos del MODO DEMO (showcase público en inglés).
// Solo se usa con DEMO_MODE=true, siempre sobre la base EN MEMORIA (efímera).
// Carga un catálogo en inglés + una "noche en curso" simulada y realista:
// historial de ventas, cola viva por barra, puntos del visitante, etc.
// Es idempotente: se puede re-ejecutar para "Reset demo data".
import { db, setConfig, CONFIG_DEFAULTS, DEMO } from './db.js';
import { hashPassword } from './auth.js';
import { randomCodigoRetiro, randomToken } from './util.js';

// Sesión fija del visitante de la demo (el front usa la misma) para que
// "My night" y "My orders" arranquen con historia y puntos.
export const DEMO_GUEST_SESSION = 'demo-guest';

// ── Catálogo (mismos productos reales de Hush, descripciones en inglés) ──────
// nombre, categoria, base, min, max, desc, icono, margen, es_combo, incluidos, permite_com, placeholder
const PRODUCTS = [
  ['Fernet con Coca', 'Drinks', 6000, 5000, 8000, "Argentina's iconic bitter, Fernet Branca, over ice with Coke", 'vaso_500', 'alto', 0, '', 1, 'e.g. easy on the ice'],
  ['Vodka Smirnoff con Speed', 'Drinks', 6500, 5500, 8500, 'Smirnoff vodka + Speed energy drink — the dancefloor classic', 'vaso_500', 'alto', 0, '', 1, 'e.g. light ice'],
  ["Gin Tonic Gordon's", 'Drinks', 7000, 6000, 9000, "Gordon's gin, tonic water and fresh lime", 'vaso_500', 'alto', 0, '', 1, 'e.g. no lime'],
  ['Campari con Naranja', 'Drinks', 5500, 4500, 7000, 'Campari with fresh orange juice', 'vaso_500', 'medio', 0, '', 1, 'e.g. extra orange'],
  ['Combo Fernet', 'Combos', 35000, 30000, 45000, 'Full bottle of Fernet Branca + 2 large Cokes + ice bucket', 'hielera', 'alto', 1, '1 Branca 750ml, 2 Coke 1.5L, ice bucket', 0, ''],
  ['Combo Vodka Smirnoff', 'Combos', 40000, 35000, 50000, 'Smirnoff bottle + 5 Speed cans + ice bucket', 'hielera', 'alto', 1, '1 Smirnoff, 5 Speed cans, ice bucket', 0, ''],
  ['Combo Champagne Baron B', 'Combos', 55000, 50000, 70000, 'Baron B champagne + 2 Speed cans + ice bucket', 'hielera', 'medio', 1, '1 Baron B, 2 Speed cans, ice bucket', 0, ''],
  ['Cerveza en Lata', 'Beer', 4000, 3500, 5500, 'Ice-cold lager, 473ml can', 'lata', 'bajo', 0, '', 0, ''],
  ['Agua Mineral 500ml', 'Zero proof', 3000, 2500, 4500, 'Still mineral water, 500ml bottle', 'botella', 'altisimo', 0, '', 0, ''],
  ['Speed Unlimited', 'Zero proof', 3500, 3000, 5000, 'Energy drink, single 250ml can', 'lata', 'medio', 0, '', 0, ''],
  ['Hielo extra en vaso', 'Extras', 500, 500, 1000, 'A cup packed with extra ice', 'vaso', 'altisimo', 0, '', 0, ''],
  ['Vaso Extra', 'Extras', 500, 500, 1000, 'An extra empty cup for sharing', 'vaso', 'altisimo', 0, '', 0, ''],
  ['Chicle Menta Topline', 'Kiosk', 1500, 1500, 2500, 'Mint chewing gum', 'kiosco', 'medio', 0, '', 0, ''],
];

const IMAGES = {
  'Fernet con Coca': '/productos/fernet-con-coca.jpg',
  'Vodka Smirnoff con Speed': '/productos/vodka-smirnoff-con-speed.jpg',
  "Gin Tonic Gordon's": '/productos/gin-tonic-gordons.jpg',
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

const BARS = [
  ['barra_1', 'Bar 1 — VIP', 'VIP lounge, upper left', 1],
  ['barra_2', 'Bar 2 — Main floor', 'Next to the dancefloor, upper right', 2],
  ['barra_3', 'Bar 3 — Entrance', 'Entrance / general area, lower left', 3],
  ['barra_4', 'Bar 4 — Patio', 'Open-air patio, right side', 4],
];

// Staff de la demo. El usuario `demo` (rol admin) existe SOLO para que el server
// auto-autentique las vistas de staff sin login; su contraseña es aleatoria y
// nunca se muestra. NO hay founders en la base demo (el rol no existe acá).
const STAFF = [
  ['Demo viewer', 'demo', 'admin', []],
  ['Nico — Bars 1 & 2', 'nico', 'bartender', ['barra_1', 'barra_2']],
  ['Cami — Bars 3 & 4', 'cami', 'bartender', ['barra_3', 'barra_4']],
  ['Sofi — Floor manager', 'sofi', 'encargado', []],
];

// ── Noche simulada ───────────────────────────────────────────────────────────
// Mezcla de ventas ponderada (aprox. una noche real de ~500 personas).
const MIX = [
  ['Fernet con Coca', 28], ['Vodka Smirnoff con Speed', 20], ["Gin Tonic Gordon's", 12],
  ['Campari con Naranja', 6], ['Cerveza en Lata', 11], ['Agua Mineral 500ml', 8],
  ['Speed Unlimited', 5], ['Combo Fernet', 4], ['Combo Vodka Smirnoff', 3],
  ['Combo Champagne Baron B', 1], ['Hielo extra en vaso', 1], ['Chicle Menta Topline', 1],
];
// Demanda por hora (de hace 7 h a ahora): sube hasta el pico y baja levemente.
const HOUR_WEIGHTS = [3, 7, 11, 16, 21, 19, 14, 9];
const BAR_MIX = [['barra_2', 34], ['barra_3', 26], ['barra_1', 22], ['barra_4', 18]];
const COMMENTS = ['no lime', 'light ice', 'extra cold please', 'two cups', 'no straw', 'lots of ice'];

const sqlTime = (minsAgo) =>
  new Date(Date.now() - minsAgo * 60000).toISOString().slice(0, 19).replace('T', ' ');

function pickWeighted(pairs) {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[0][0];
}

export function seedDemo() {
  if (!DEMO) throw new Error('seedDemo() solo puede ejecutarse con DEMO_MODE=true');

  db.exec(`DELETE FROM cross_sell; DELETE FROM offers; DELETE FROM order_items; DELETE FROM orders;
           DELETE FROM products; DELETE FROM staff_bars; DELETE FROM staff; DELETE FROM bars;
           DELETE FROM loyalty; DELETE FROM loyalty_redemptions; DELETE FROM surveys; DELETE FROM config;`);

  // Catálogo
  const insP = db.prepare(`INSERT INTO products
    (nombre,descripcion,categoria,precio_base,precio_min,precio_max,precio_actual,icono,margen,disponible,es_combo,productos_incluidos,permite_comentario,comentario_placeholder,orden,imagen_url)
    VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?)`);
  PRODUCTS.forEach((p, i) => {
    const [nombre, cat, base, min, max, desc, icono, margen, combo, incl, perm, ph] = p;
    insP.run(nombre, desc, cat, base, min, max, base, icono, margen, combo, incl, perm, ph, i + 1, IMAGES[nombre] || null);
  });
  const byName = {};
  for (const r of db.prepare('SELECT id, nombre, precio_actual FROM products').all()) byName[r.nombre] = r;

  // Barras y staff (contraseñas aleatorias: nadie loguea en la demo)
  const insB = db.prepare('INSERT INTO bars(id,nombre,ubicacion,orden) VALUES(?,?,?,?)');
  BARS.forEach(b => insB.run(...b));
  const insS = db.prepare('INSERT INTO staff(nombre,usuario,pass_hash,rol) VALUES(?,?,?,?)');
  const insSB = db.prepare('INSERT INTO staff_bars(staff_id,bar_id) VALUES(?,?)');
  STAFF.forEach(([nombre, usuario, rol, barras]) => {
    const r = insS.run(nombre, usuario, hashPassword(randomToken(18)), rol);
    barras.forEach(b => insSB.run(r.lastInsertRowid, b));
  });

  // Cross-sell + oferta happy hour (badge "Happy hour pricing" en la carta)
  const insCS = db.prepare('INSERT INTO cross_sell(trigger_product_id,suggested_product_id) VALUES(?,?)');
  const drinks = ['Fernet con Coca', 'Vodka Smirnoff con Speed', "Gin Tonic Gordon's", 'Campari con Naranja'];
  const combos = ['Combo Fernet', 'Combo Vodka Smirnoff', 'Combo Champagne Baron B'];
  drinks.forEach(t => { insCS.run(byName[t].id, byName['Hielo extra en vaso'].id); insCS.run(byName[t].id, byName['Vaso Extra'].id); });
  combos.forEach(c => { insCS.run(byName[c].id, byName['Speed Unlimited'].id); insCS.run(byName[c].id, byName['Agua Mineral 500ml'].id); });
  db.prepare(`INSERT INTO offers(nombre,descripcion,product_id,precio_especial,activo) VALUES(?,?,?,?,1)`)
    .run('Happy hour — Fernet combo', 'Combo Fernet at a special price for the early crowd', byName['Combo Fernet'].id, 30000);

  // Config (textos en inglés; nada de comisión en ninguna vista de la demo)
  for (const [k, v] of Object.entries(CONFIG_DEFAULTS)) setConfig(k, v);
  setConfig('nombre_noche', 'Hush Club — Saturday night');
  setConfig('loyalty_recompensa_texto', 'Reach 50 points to unlock 10% off your next order tonight');
  setConfig('contacto_wol', {
    titulo: 'Like what you see?',
    texto: 'WOL removes the line from the bar. If you want this in your venue, talk to us.',
    email: 'hola@wol.app',
    instagram: '@wol.app'
  });

  // ── Pedidos: historial + cola viva ─────────────────────────────────────────
  const usedCodes = new Set();
  const code = () => { let c; do { c = randomCodigoRetiro(5); } while (usedCodes.has(c)); usedCodes.add(c); return c; };
  const insO = db.prepare(`INSERT INTO orders
    (numero_orden,session_token,codigo_retiro,qr_token,bar_id,estado,tipo_pedido,en_cola,es_regalo,regalo_mensaje,
     monto_subtotal,descuento,monto_total,cupon,puntos_otorgados,created_at,paid_at,delivered_at)
    VALUES (?,?,?,?,?,?,?,?,0,'',?,0,?,NULL,?,?,?,?)`);
  const insI = db.prepare(`INSERT INTO order_items(order_id,product_id,nombre,icono,cantidad,precio_unit,comentario) VALUES(?,?,?,?,?,?,?)`);

  function buildItems(forceComment = '') {
    const items = [];
    // Si se fuerza comentario (cola de la demo), el ítem principal es un trago
    // (los tragos son los que admiten comentario).
    const main = byName[forceComment ? pickWeighted(MIX.slice(0, 4)) : pickWeighted(MIX)];
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(main.id);
    const qty = Math.random() < 0.22 ? 2 : 1;
    const comment = p.permite_comentario
      ? (forceComment || (Math.random() < 0.3 ? COMMENTS[Math.floor(Math.random() * COMMENTS.length)] : ''))
      : '';
    items.push({ p, qty, comment });
    if (Math.random() < 0.28) { // acompañamiento típico
      const side = byName[Math.random() < 0.6 ? 'Agua Mineral 500ml' : 'Hielo extra en vaso'];
      items.push({ p: db.prepare('SELECT * FROM products WHERE id = ?').get(side.id), qty: 1, comment: '' });
    }
    return items;
  }

  function insertOrder({ numero, session, bar, estado, enCola, paidMinsAgo, deliverAfterMin = 0, comment = '' }) {
    const items = buildItems(comment);
    const subtotal = items.reduce((a, it) => a + it.p.precio_actual * it.qty, 0);
    const puntos = Math.floor(subtotal / 1000);
    const paidAt = sqlTime(paidMinsAgo);
    const deliveredAt = estado === 'entregado' ? sqlTime(Math.max(0, paidMinsAgo - deliverAfterMin)) : null;
    const r = insO.run(numero, session, code(), randomToken(20), bar, estado, 'normal', enCola,
      subtotal, subtotal, puntos, sqlTime(paidMinsAgo + 2), paidAt, deliveredAt);
    for (const it of items) insI.run(r.lastInsertRowid, it.p.id, it.p.nombre, it.p.icono, it.qty, it.p.precio_actual, it.comment);
    return { id: r.lastInsertRowid, puntos, subtotal };
  }

  // Historial: ~210 pedidos entregados repartidos en las últimas 7 horas con
  // una curva de demanda creíble (sube hasta el pico, afloja al final).
  const TOTAL_HISTORY = 210;
  const slots = [];
  HOUR_WEIGHTS.forEach((w, hi) => {
    const n = Math.round(TOTAL_HISTORY * w / HOUR_WEIGHTS.reduce((a, b) => a + b, 0));
    for (let i = 0; i < n; i++) {
      const hoursAgo = (HOUR_WEIGHTS.length - 1 - hi); // 7h atrás → ahora
      slots.push(hoursAgo * 60 + 12 + Math.floor(Math.random() * 46)); // minutos atrás
    }
  });
  slots.sort((a, b) => b - a); // más viejo primero → numeración FIFO real
  let numero = 1;
  for (const minsAgo of slots) {
    insertOrder({
      numero: numero++, session: 'demo-crowd-' + Math.floor(Math.random() * 400),
      bar: pickWeighted(BAR_MIX), estado: 'entregado', enCola: 0,
      paidMinsAgo: minsAgo, deliverAfterMin: 3 + Math.floor(Math.random() * 6)
    });
  }

  // Historia del visitante (sesión demo-guest): pedidos ya entregados + puntos,
  // para que "My orders" y "My night" arranquen con contenido.
  for (const [minsAgo, barId] of [[190, 'barra_2'], [95, 'barra_1']]) {
    insertOrder({ numero: numero++, session: DEMO_GUEST_SESSION, bar: barId, estado: 'entregado', enCola: 0, paidMinsAgo: minsAgo, deliverAfterMin: 4 });
  }
  db.prepare(`INSERT INTO loyalty(session_token,puntos,updated_at) VALUES(?,?,datetime('now'))`)
    .run(DEMO_GUEST_SESSION, 41); // a un combo de distancia de la recompensa (50)

  // Cola viva: pedidos pagados esperando en barra (Bar 4 queda tranquilo a
  // propósito: es la historia del pricing dinámico / redistribución de demanda).
  const QUEUE = [
    ['barra_2', 2, 'no lime'], ['barra_2', 4, ''], ['barra_2', 7, 'light ice'],
    ['barra_1', 3, ''], ['barra_1', 9, 'two cups'], ['barra_3', 5, ''],
  ];
  for (const [barId, minsAgo, comment] of QUEUE) {
    insertOrder({ numero: numero++, session: 'demo-crowd-' + Math.floor(Math.random() * 400), bar: barId, estado: 'pagado', enCola: 1, paidMinsAgo: minsAgo, comment });
  }

  const n = db.prepare('SELECT COUNT(*) AS n FROM orders').get().n;
  console.log(`✓ Demo seed: ${PRODUCTS.length} products · ${BARS.length} bars · ${n} simulated orders (in-memory DB)`);
}
