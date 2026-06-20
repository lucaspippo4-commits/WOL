// server.js — punto de entrada. Sirve la SPA + API REST en un solo puerto.
// Variables de entorno: local vía .env (flag --env-file-if-exists en npm scripts
// y/o loadEnvFile abajo); en Replit vía Secrets (ya están en process.env).
// payments.js lee el entorno de forma perezosa, así que el orden no importa.
try { process.loadEnvFile(); } catch { /* sin .env (ej. Replit con Secrets) */ }
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, initSchema } from './db.js';
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

// Auto-seed la primera vez (útil en Replit: arranca con un solo "Run").
// La base SQLite (wol.db) es persistente en disco: no se re-seedea en cada reinicio.
const hayProductos = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
if (!hayProductos) {
  console.log('\n⚙️  Base vacía: cargando datos iniciales (seed)…');
  await import('./seed.js');
}

const app = express();
app.use(express.json({ limit: '1mb' }));

// --- API ---------------------------------------------------------------------
app.use('/api', publicRoutes);
app.use('/api', orderRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/founder', founderRoutes);

// --- Vendor (librerías ESM servidas localmente, sin CDN ni build) ------------
const vendor = (rel) => express.static(path.join(ROOT, 'node_modules', rel));
app.use('/vendor/preact', vendor('preact/dist'));
app.use('/vendor/preact-hooks', vendor('preact/hooks/dist'));
app.use('/vendor/htm', vendor('htm/dist'));
app.use('/vendor/jsqr', vendor('jsqr/dist'));

// --- Estáticos del frontend --------------------------------------------------
app.use(express.static(path.join(ROOT, 'public')));

// --- Fallback SPA: cualquier ruta no-API devuelve index.html -----------------
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno', detalle: err.message });
});

app.listen(PORT, () => {
  console.log(`\n🍸  WOL corriendo en  http://localhost:${PORT}`);
  console.log(`    Consumidor → /        Bartender → /barra        Admin → /admin\n`);
});
