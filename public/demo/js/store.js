// store.js (demo) — cart + fixed demo session.
// Every visitor shares the 'demo-guest' session: it comes pre-loaded with
// loyalty points and order history so the app never looks empty.
const CART_KEY = 'wol_demo_cart';

export const DEMO_SESSION = 'demo-guest';
export function sessionToken() { return DEMO_SESSION; }

// --- Cart ---------------------------------------------------------------
let listeners = new Set();
export function onCartChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(getCart()); }

export function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch { return []; }
}
function save(cart) { localStorage.setItem(CART_KEY, JSON.stringify(cart)); emit(); }

export function addToCart(product, comentario = '') {
  const cart = getCart();
  const existing = cart.find(i => i.product_id === product.id && i.comentario === comentario);
  if (existing) existing.cantidad += 1;
  else cart.push({
    product_id: product.id, nombre: product.nombre, icono: product.icono,
    precio_unit: product.precio_actual, cantidad: 1, comentario,
    permite_comentario: product.permite_comentario, comentario_placeholder: product.comentario_placeholder
  });
  save(cart);
}
export function setQty(index, qty) {
  const cart = getCart();
  if (!cart[index]) return;
  cart[index].cantidad = Math.max(0, qty);
  if (cart[index].cantidad === 0) cart.splice(index, 1);
  save(cart);
}
export function setComment(index, comentario) {
  const cart = getCart();
  if (cart[index]) { cart[index].comentario = comentario.slice(0, 60); save(cart); }
}
export function clearCart() { save([]); }
export function cartCount() { return getCart().reduce((a, i) => a + i.cantidad, 0); }
export function cartSubtotal() { return getCart().reduce((a, i) => a + i.cantidad * i.precio_unit, 0); }
export function cartProductIds() { return [...new Set(getCart().map(i => i.product_id))]; }
