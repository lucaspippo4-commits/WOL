// auth.js — hashing de contraseñas (scrypt, sin deps nativas) y tokens de sesión staff.
import crypto from 'node:crypto';
import { db } from './db.js';

// Secreto para firmar tokens. En producción: mover a variable de entorno WOL_SECRET.
const SECRET = process.env.WOL_SECRET || 'wol-dev-secret-cambiar-en-produccion';

// --- Password hashing (scrypt) ----------------------------------------------
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 32).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  try {
    const [, salt, derived] = stored.split('$');
    const test = crypto.scryptSync(password, salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(test, 'hex'), Buffer.from(derived, 'hex'));
  } catch { return false; }
}

// --- Tokens de sesión de staff (JWT-like compacto, HMAC-SHA256) -------------
function sign(payloadB64) {
  return crypto.createHmac('sha256', SECRET).update(payloadB64).digest('base64url');
}

export function issueToken(staff) {
  const payload = { id: staff.id, rol: staff.rol, usuario: staff.usuario, t: Date.now() };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

export function verifyToken(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  if (sign(body) !== sig) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); }
  catch { return null; }
}

// --- Middlewares -------------------------------------------------------------
function getTokenFromReq(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

export function requireStaff(roles = null) {
  return (req, res, next) => {
    const payload = verifyToken(getTokenFromReq(req));
    if (!payload) return res.status(401).json({ error: 'No autenticado' });
    const staff = db.prepare('SELECT * FROM staff WHERE id = ? AND activo = 1').get(payload.id);
    if (!staff) return res.status(401).json({ error: 'Usuario inactivo o inexistente' });
    if (roles && !roles.includes(staff.rol)) {
      return res.status(403).json({ error: 'Permiso insuficiente' });
    }
    req.staff = staff;
    next();
  };
}

export const requireAdmin = requireStaff(['encargado', 'admin']);
export const requireFounder = requireStaff(['founder']);
export const requireAnyStaff = requireStaff(null);

// --- Reconciliación de founders (idempotente, corre en cada arranque) --------
// Garantiza que en CUALQUIER base (nueva o ya existente) los founders sean los
// correctos: elimina el viejo usuario de prueba `founder` y crea/actualiza a
// lucas y wenceslao con la contraseña de las variables de entorno. No toca
// ningún otro dato (productos, otros usuarios staff, pedidos, config).
export function ensureFounders() {
  const FOUNDERS = [
    { usuario: 'lucas', nombre: 'Lucas', pass: process.env.FOUNDER_LUCAS_PASS || 'dev-lucas' },
    { usuario: 'wenceslao', nombre: 'Wenceslao', pass: process.env.FOUNDER_WENCES_PASS || 'dev-wences' },
  ];
  // Eliminar el usuario de prueba viejo si quedó de una versión anterior.
  db.prepare("DELETE FROM staff WHERE usuario = 'founder'").run();

  const upd = db.prepare("UPDATE staff SET nombre = ?, pass_hash = ?, rol = 'founder', activo = 1 WHERE usuario = ?");
  const ins = db.prepare("INSERT INTO staff(nombre, usuario, pass_hash, rol) VALUES(?, ?, ?, 'founder')");
  for (const f of FOUNDERS) {
    const hash = hashPassword(f.pass);
    const r = upd.run(f.nombre, hash, f.usuario);   // si ya existe, actualiza su contraseña al valor del entorno
    if (r.changes === 0) ins.run(f.nombre, f.usuario, hash); // si no existe, lo crea
  }
}
