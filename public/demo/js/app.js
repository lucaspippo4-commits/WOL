// app.js (demo) — SPA router of the public WOL demo.
// Anything that doesn't match (including staff-only paths of the real app,
// like /wol-hq) falls back to the landing page.
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { html } from './ui.js';
import { Toaster } from './components.js';
import { Landing } from './views/landing.js';
import { CustomerApp, Cart, MPCheckout, OrderStatus, GiftRedeem } from './views/customer.js';
import { BartenderApp } from './views/bartender.js';
import { AdminApp } from './views/admin.js';

const ROUTES = [
  ['/', Landing],
  ['/customer', CustomerApp],
  ['/cart', Cart],
  ['/checkout/:token', MPCheckout],
  ['/order/:token', OrderStatus],
  ['/gift/:token', GiftRedeem],
  ['/bartender', BartenderApp],
  ['/admin', AdminApp],
];

function match(path) {
  for (const [pattern, Comp] of ROUTES) {
    const pp = pattern.split('/'), sp = path.split('/');
    if (pp.length !== sp.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(sp[i]);
      else if (pp[i] !== sp[i]) { ok = false; break; }
    }
    if (ok) return { Comp, params };
  }
  return { Comp: Landing, params: {} };
}

function Router() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => { setPath(location.pathname); window.scrollTo(0, 0); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const { Comp, params } = match(path);
  return html`<${Comp} params=${params} />`;
}

function App() {
  return html`<div><${Router} /><${Toaster} /></div>`;
}

render(html`<${App} />`, document.getElementById('app'));
