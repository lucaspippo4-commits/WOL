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
