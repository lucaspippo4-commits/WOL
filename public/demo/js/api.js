// api.js (demo) — HTTP client. The demo server auto-authenticates staff views,
// so no tokens are stored client-side and there is no login anywhere.
async function request(method, url, body) {
  let res;
  try {
    res = await fetch('/api' + url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body != null ? JSON.stringify(body) : undefined
    });
  } catch (e) {
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
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  patch: (u, b) => request('PATCH', u, b),
  del: (u) => request('DELETE', u),
};
