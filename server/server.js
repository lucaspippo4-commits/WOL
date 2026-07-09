// server.js — punto de entrada. Sirve la SPA + API REST en un solo puerto.
// Variables de entorno: local vía .env (flag --env-file-if-exists en npm scripts
// y/o loadEnvFile abajo); en Replit vía Secrets (ya están en process.env).
// payments.js lee el entorno de forma perezosa, así que el orden no importa.
try { process.loadEnvFile(); } catch { /* sin .env (ej. Replit con Secrets) */ }
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, DEMO, initSchema, backupDatabase } from './db.js';
import { ensureFounders } from './auth.js';
import publicRoutes from './routes/public.js';
import orderRoutes from './routes/orders.js';
import staffRoutes from './routes/staff.js';
import adminRoutes from './routes/admin.js';
import founderRoutes from './routes/founder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

// Red de seguridad: nunca tirar el proceso por un error async no manejado
// (ej. una falla puntual de red con Mercado Pago durante la noche).
process.on('unhandledRejection', (e) => console.error('unhandledRejection:', e?.message || e));
process.on('uncaughtException', (e) => console.error('uncaughtException:', e?.message || e));

initSchema();

// ── MODO DEMO (DEMO_MODE=true) ────────────────────────────────────────────────
// Base EN MEMORIA (jamás toca wol.db), datos simulados en inglés, sin logins,
// pagos siempre simulados y SIN panel de founders. Sin la variable, este bloque
// no existe y todo corre exactamente como siempre.
let demoRouter = null, demoAuthInject = null;
if (DEMO) {
  const seed = await import('./demo-seed.js');
  seed.seedDemo();
  const demo = await import('./routes/demo.js');
  demo.initPricingStory();
  demoRouter = demo.default;
  demoAuthInject = demo.demoAuthInject;
} else {
  // Producción (modo real): exigir TODOS los secretos críticos de seguridad antes
  // de servir nada. Con el repo público, ningún fallback débil puede quedar activo:
  // si falta cualquiera, la app NO arranca (nada de valores por defecto adivinables).
  assertProdSecrets();

  // Auto-seed la primera vez (útil en Replit: arranca con un solo "Run").
  // La base SQLite (wol.db) es persistente en disco: no se re-seedea en cada reinicio.
  const hayProductos = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (!hayProductos) {
    console.log('\n⚙️  Base vacía: cargando datos iniciales (seed)…');
    await import('./seed.js');
  }

  // Reconciliar founders en CADA arranque (idempotente): elimina el viejo `founder`
  // de prueba y asegura lucas/wenceslao con la contraseña de las variables de entorno,
  // también sobre bases ya existentes. No toca ningún otro dato.
  ensureFounders();
}

// Verifica que las variables críticas de seguridad estén presentes en modo real.
// Cada una, si falta, habilita un ataque concreto sobre un deployment público:
//   · Sin secreto de firma → se pueden FALSIFICAR tokens de staff/admin/founder.
//   · Sin contraseñas de founders → el login de founder queda adivinable.
//   · Sin MP_ACCESS_TOKEN → el endpoint /pay-sim queda abierto (pedidos gratis).
//   · Sin MP_WEBHOOK_SECRET → el webhook no valida la firma x-signature.
function assertProdSecrets() {
  const env = (n) => (process.env[n] || '').trim();
  const checks = [
    ['SESSION_SECRET', () => env('SESSION_SECRET') || env('WOL_SECRET'),
      'firma de los tokens de sesión de staff (acepta también WOL_SECRET)'],
    ['FOUNDER_LUCAS_PASS', () => env('FOUNDER_LUCAS_PASS'), 'contraseña del founder Lucas'],
    ['FOUNDER_WENCES_PASS', () => env('FOUNDER_WENCES_PASS'), 'contraseña del founder Wenceslao'],
    ['MP_ACCESS_TOKEN', () => env('MP_ACCESS_TOKEN'), 'access token de Mercado Pago (sin él, /pay-sim quedaría abierto)'],
    ['MP_WEBHOOK_SECRET', () => env('MP_WEBHOOK_SECRET'), 'clave del webhook de Mercado Pago (valida x-signature)'],
  ];
  const missing = checks.filter(([, get]) => !get());
  if (missing.length) {
    console.error('\n❌  WOL no puede arrancar: faltan variables de entorno críticas de seguridad.\n');
    for (const [name, , desc] of missing) console.error(`    • ${name} — ${desc}`);
    console.error('\n    Cargalas como Secrets (Replit) o en un .env local (git-ignored).');
    console.error('    ¿Solo querés ver la demo pública, sin credenciales? Arrancá con DEMO_MODE=true.\n');
    process.exit(1);
  }
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// --- API ---------------------------------------------------------------------
if (DEMO) {
  app.use('/api', demoRouter);                          // /demo/* + occupancy con historia
  app.use(['/api/staff', '/api/admin'], demoAuthInject); // vistas de staff sin login
}
app.use('/api', publicRoutes);
app.use('/api', orderRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);
// El panel de founders NO existe en la demo: ni la ruta, ni el rol en la base.
if (!DEMO) app.use('/api/founder', founderRoutes);

// --- Vendor (librerías ESM servidas localmente, sin CDN ni build) ------------
const vendor = (rel) => express.static(path.join(ROOT, 'node_modules', rel));
app.use('/vendor/preact', vendor('preact/dist'));
app.use('/vendor/preact-hooks', vendor('preact/hooks/dist'));
app.use('/vendor/htm', vendor('htm/dist'));
app.use('/vendor/jsqr', vendor('jsqr/dist'));

// --- Estáticos del frontend --------------------------------------------------
// En demo, el frontend REAL (público /js y /index.html) no se sirve: la demo tiene
// su propia app en /demo (en inglés, sin login, sin rastro del panel de founders).
if (DEMO) {
  app.use((req, res, next) => {
    if (req.path.startsWith('/js/') || req.path === '/index.html') return res.status(404).end();
    next();
  });
  // index:false → `/` NO devuelve el index.html real; cae al fallback SPA de la
  // demo (public/demo/index.html). Los estáticos compartidos (css, assets,
  // productos, vendor, /demo/*) siguen sirviéndose normal.
  app.use(express.static(path.join(ROOT, 'public'), { index: false }));
} else {
  app.use(express.static(path.join(ROOT, 'public')));
}

// --- Fallback SPA: cualquier ruta no-API devuelve el index correspondiente ---
const INDEX = DEMO ? path.join(ROOT, 'public', 'demo', 'index.html') : path.join(ROOT, 'public', 'index.html');
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(INDEX);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno', detalle: err.message });
});

app.listen(PORT, () => {
  if (DEMO) {
    console.log(`\n🍸  WOL — PUBLIC DEMO running at  http://localhost:${PORT}`);
    console.log(`    In-memory database · simulated payments · no logins · no founders panel\n`);
    return; // sin respaldos: la base demo es efímera a propósito
  }
  console.log(`\n🍸  WOL corriendo en  http://localhost:${PORT}`);
  console.log(`    Consumidor → /        Bartender → /barra        Admin → /admin\n`);
  // Respaldo automático del archivo de la base: al arrancar y cada 30 minutos.
  if (db.prepare('SELECT COUNT(*) AS n FROM products').get().n) backupDatabase();
  setInterval(() => backupDatabase(), 30 * 60 * 1000);
});
