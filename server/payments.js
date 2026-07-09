// payments.js — Integración de pagos con Mercado Pago (Checkout Pro).
//
// Modo de operación:
//   - Si está definido MP_ACCESS_TOKEN en el entorno → usa Mercado Pago REAL.
//   - Si NO está definido → usa un mock local (botón "Simular pago aprobado")
//     para poder desarrollar/demostrar sin credenciales.
//
// SIN SPLIT: el 100% del pago va a la cuenta dueña de MP_ACCESS_TOKEN
// (cuenta de prueba ahora; la del boliche en producción — solo se cambia el .env).
// El lugar EXACTO donde se activaría el split/comisión está marcado más abajo.

import crypto from 'node:crypto';
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { getConfig, DEMO } from './db.js';
import { randomToken } from './util.js';

// Lectura perezosa del entorno: funciona sin importar cuándo se cargue el .env
// (local) o los Secrets (Replit), evitando problemas de orden de import en ESM.
// En DEMO_MODE los pagos son SIEMPRE simulados: nunca se llama a la API de
// Mercado Pago, aunque alguien deje un access token configurado por error.
const accessToken = () => (DEMO ? '' : process.env.MP_ACCESS_TOKEN || '');
const webhookSecret = () => process.env.MP_WEBHOOK_SECRET || '';
export const mpEnabled = () => !!accessToken();

let _mpClient = null;
function mpClientFor() {
  if (!accessToken()) return null;
  if (!_mpClient) _mpClient = new MercadoPagoConfig({ accessToken: accessToken() });
  return _mpClient;
}

// Comisión WOL (solo informativa para el dashboard; NO se cobra todavía).
export function getCommission(total) {
  return Math.round(total * (getConfig('comision_wol') || 0));
}

// Crea la preferencia de pago. `order` trae items, qr_token, id, monto_total.
// `baseUrl` es el dominio público (APP_BASE_URL) para back_urls y webhook.
export async function createPreference(order, baseUrl) {
  const client = mpClientFor();
  if (!client) {
    // --- MOCK (sin credenciales) ---
    return {
      preferenceId: 'MOCK-PREF-' + randomToken(8),
      initPoint: `/checkout-simulado/${order.qr_token}`,
      mock: true
    };
  }

  const pref = new Preference(client);
  const backUrl = `${baseUrl}/pedido/${order.qr_token}`;
  // MP exige URLs públicas (https) para `auto_return`. En localhost lo omitimos
  // para no romper el desarrollo; en producción (APP_BASE_URL público) se activa.
  const esPublica = /^https:\/\//.test(baseUrl) && !/localhost|127\.0\.0\.1/.test(baseUrl);
  const body = {
    items: order.items.map(it => ({
      id: String(it.product_id || 'item'),
      title: it.nombre,
      quantity: it.cantidad,
      unit_price: it.precio_unit,
      currency_id: 'ARS'
    })),
    external_reference: String(order.id),
    back_urls: { success: backUrl, failure: backUrl, pending: backUrl },
    notification_url: `${baseUrl}/api/webhooks/mercadopago`,
    statement_descriptor: 'HUSH CLUB'
    // ─── FUTURO: SPLIT / COMISIÓN ──────────────────────────────────────────
    // Para activar la comisión de WOL (modo Marketplace), agregar acá:
    //   marketplace_fee: getCommission(order.monto_total)
    // y usar el access_token del VENDEDOR (Hush Club, vía OAuth) en vez del propio.
    // Hoy queda SIN split: el total va a la cuenta de MP_ACCESS_TOKEN.
  };
  if (esPublica) body.auto_return = 'approved';
  const result = await pref.create({ body });
  return {
    preferenceId: result.id,
    initPoint: result.init_point,
    sandboxInitPoint: result.sandbox_init_point,
    mock: false
  };
}

// Consulta el estado real de un pago en la API de MP.
export async function getPaymentStatus(paymentId) {
  const client = mpClientFor();
  if (!client) return null;
  const payment = new Payment(client);
  const p = await payment.get({ id: paymentId });
  return { status: p.status, externalReference: p.external_reference, id: p.id };
}

// Busca en MP si existe un pago APROBADO para un pedido (por external_reference).
// Permite confirmar el pago aunque no tengamos el payment_id (robusto, server-side).
export async function findApprovedPayment(orderId) {
  const client = mpClientFor();
  if (!client) return null;
  try {
    const payment = new Payment(client);
    const r = await payment.search({ options: { external_reference: String(orderId) } });
    const results = r?.results || r?.body?.results || [];
    const approved = results.find(p => p.status === 'approved');
    return approved ? { status: 'approved', id: approved.id, externalReference: String(orderId) } : null;
  } catch {
    return null;
  }
}

// Valida la firma `x-signature` del webhook de Mercado Pago.
// Formato del header: "ts=<timestamp>,v1=<hmac_sha256_hex>".
// Manifest: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
export function verifyWebhookSignature(req) {
  const secret = webhookSecret();
  if (!secret) return true; // sin secreto configurado → no se valida (dev)
  try {
    const signature = req.headers['x-signature'] || '';
    const requestId = req.headers['x-request-id'] || '';
    const dataId = (req.query['data.id'] || req.query.id || '').toString().toLowerCase();
    const parts = Object.fromEntries(
      signature.split(',').map(kv => kv.split('=').map(s => s.trim()))
    );
    const ts = parts.ts, v1 = parts.v1;
    if (!ts || !v1) return false;
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}
