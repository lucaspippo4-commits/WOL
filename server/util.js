// util.js — helpers varios (códigos de retiro, tokens, formato)
import crypto from 'node:crypto';

// Charset sin caracteres ambiguos (no 0/O, 1/I/L).
const SAFE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomCodigoRetiro(len = 5) {
  let s = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) s += SAFE_CHARS[bytes[i] % SAFE_CHARS.length];
  return s;
}

export function randomToken(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomCupon() {
  return 'WOL-' + randomCodigoRetiro(6);
}

// Franja horaria: "temprano" (antes de la 1am) / "tarde" (después).
// Admin puede forzar una franja para poder demostrar sin esperar a la madrugada.
export function franjaActual(timeSlotConfig) {
  if (timeSlotConfig === 'temprano' || timeSlotConfig === 'tarde') return timeSlotConfig;
  const h = new Date().getHours();
  // De 01:00 a 06:59 se considera "tarde"; el resto "temprano".
  return (h >= 1 && h < 7) ? 'tarde' : 'temprano';
}
