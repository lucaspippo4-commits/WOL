// app.js — router de la SPA. Monta la interfaz según la ruta.
import { render } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { html } from './ui.js';
import { Toaster } from './components.js';
import { Splash, ConsumerApp, Cart, CheckoutSim, OrderStatus, GiftRedeem, ContactWOL } from './views/consumer.js';
import { BartenderApp, AccesoApp } from './views/bartender.js';
import { AdminApp } from './views/admin.js';
import { FounderApp } from './views/founder.js';

// Rutas: patrón -> componente. ':x' captura un segmento.
const ROUTES = [
  ['/', Splash],
  ['/menu', ConsumerApp],
  ['/carrito', Cart],
  ['/checkout-simulado/:token', CheckoutSim],
  ['/pedido/:token', OrderStatus],
  ['/regalo/:token', GiftRedeem],
  ['/wol', ContactWOL],
  ['/acceso', AccesoApp],
  ['/barra', BartenderApp],
  ['/staff', BartenderApp],
  ['/admin', AdminApp],
  // Acceso oculto y separado de Founders (solo equipo WOL; no linkeado en ningún lado).
  ['/wol-hq', FounderApp],
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
  return { Comp: Splash, params: {} };
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
