// api.js — cliente HTTP. Tolerante a caídas de red (no rompe el estado del front).
const TOKEN_KEY = 'wol_staff_token';

export function getStaffToken() { return localStorage.getItem(TOKEN_KEY); }
export function setStaffToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

async function request(method, url, body, { auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getStaffToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  let res;
  try {
    res = await fetch('/api' + url, {
      method, headers,
      body: body != null ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    // Sin conexión: lanzamos un error tipado para que la UI muestre "reintentando".
    const err = new Error('offline'); err.offline = true; throw err;
  }
  let data = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { data = text; } }
  if (!res.ok) {
    const err = new Error((data && data.error) || res.statusText);
    err.status = res.status; err.data = data; throw err;
  }
  return data;
}

export const api = {
  get: (u, o) => request('GET', u, null, o),
  post: (u, b, o) => request('POST', u, b, o),
  put: (u, b, o) => request('PUT', u, b, o),
  patch: (u, b, o) => request('PATCH', u, b, o),
  del: (u, o) => request('DELETE', u, null, o),
};
