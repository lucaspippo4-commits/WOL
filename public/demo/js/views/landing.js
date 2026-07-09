// views/landing.js — public presentation page of the WOL demo.
import { useState } from 'preact/hooks';
import { html, toast } from '../ui.js';
import { nav } from '../components.js';
import { api } from '../api.js';

const GITHUB_URL = 'https://github.com/lucaspippo4-commits/WOL';
const BUILT_BY = 'Built by Lucas, Wenceslao & Francisco — Argentina 🇦🇷';

const STEPS = [
  { n: '1', icon: '📱', t: 'Scan the QR', d: 'Every table and wall sticker opens the club\'s live menu. No app, no account.' },
  { n: '2', icon: '🍸', t: 'Order & pay', d: 'Pick your drinks, choose a pickup bar, pay with Mercado Pago in seconds.' },
  { n: '3', icon: '🎟️', t: 'Get your pickup code', d: 'A single-use code + QR is issued only after the payment is confirmed.' },
  { n: '4', icon: '⚡', t: 'Skip the line', d: 'The bartender scans it, hands over the drinks, and the code dies on the spot.' },
];

const VIEWS = [
  {
    path: '/customer', icon: '🍸', title: 'Customer view',
    d: 'Browse the menu, order a drink, and get your pickup QR.',
    hint: 'Try it: add a Fernet, pay at the simulated checkout, watch your code appear.',
    cls: 'v-customer',
  },
  {
    path: '/bartender', icon: '🧑‍🍳', title: 'Bartender view',
    d: 'Live order queue and pickup-code verification.',
    hint: 'Try it: deliver the order you just placed by typing its code.',
    cls: 'v-bartender',
  },
  {
    path: '/admin', icon: '📊', title: 'Club owner view',
    d: 'Menu, pricing, staff and live analytics.',
    hint: 'Try it: hit “Simulate demand spike” and watch prices react live.',
    cls: 'v-admin',
  },
];

const FEATURES = [
  { icon: '📈', t: 'Dynamic pricing', d: 'Prices move inside owner-set limits to balance demand across bars and hours.' },
  { icon: '🛡️', t: 'Anti-fraud pickup codes', d: 'Single-use, collision-checked QR codes — invalidated the moment they\'re redeemed.' },
  { icon: '🎁', t: 'Gift a drink', d: 'Pay for a friend\'s drink and send them a link; they choose the bar and redeem it.' },
  { icon: '⭐', t: 'Loyalty points', d: 'Every peso spent earns points; rewards unlock automatically during the night.' },
  { icon: '🗺️', t: 'Per-bar demand balancing', d: 'Guests see which bar is quiet; the venue reroutes crowds with price nudges.' },
  { icon: '📊', t: 'Live analytics', d: 'Sales, average ticket, top products and per-bar demand — updating in real time.' },
];

const UNDER_HOOD = [
  ['Live Mercado Pago Checkout Pro', 'server-side preference creation; the customer never sees a price the server didn\'t set.'],
  ['Webhook with x-signature HMAC validation', 'payments are never trusted from the client redirect — only from Mercado Pago\'s signed notification.'],
  ['Server-side payment reconciliation', 'order state lives in the database and is re-verified against Mercado Pago\'s API on every read.'],
  ['Single-use pickup codes & QR tokens', 'collision-checked at issue time, invalidated at redemption, with double-delivery protection.'],
];

export function Landing() {
  const [resetting, setResetting] = useState(false);
  const scrollToViews = () => document.getElementById('views')?.scrollIntoView({ behavior: 'smooth' });
  const reset = async () => {
    setResetting(true);
    try {
      await api.post('/demo/reset');
      localStorage.removeItem('wol_demo_cart');
      toast('Demo data reset ✓');
    } catch { toast('Could not reset', 'err'); }
    setResetting(false);
  };

  return html`<div class="landing">
    <nav class="l-nav">
      <div class="l-wordmark">WOL<span class="l-live">LIVE DEMO</span></div>
      <a class="l-gh" href=${GITHUB_URL} target="_blank" rel="noopener noreferrer">View source ↗</a>
    </nav>

    <!-- Hero -->
    <header class="l-hero">
      <div class="l-hero-copy">
        <div class="l-eyebrow">Public demo · running in production at Hush Club, Argentina</div>
        <h1>The ordering layer for <span class="l-neon">nightclubs</span>.</h1>
        <p class="l-sub">
          Skip the bar line: guests scan a QR, order and pay from their phone, and pick up
          with a single-use code. WOL runs the menu, the payments, the bar queues and the
          live analytics — everything you're about to click is the real product on simulated data.
        </p>
        <div class="l-cta">
          <button class="btn primary lg" onClick=${scrollToViews}>Explore the three views</button>
          <button class="btn ghost lg" onClick=${() => nav('/customer')}>Start as a customer →</button>
        </div>
        <div class="l-meta">No login · no account · nothing to install — a 2-minute walkthrough</div>
      </div>

      <!-- Signature: the pickup-code card, WOL's most iconic artifact -->
      <div class="l-hero-card" aria-hidden="true">
        <div class="ticket">
          <div class="ticket-top">ORDER <b>#212</b> · Bar 2 — Main floor</div>
          <div class="ticket-code">7KQ4M</div>
          <div class="ticket-qr">
            ${[...Array(25)].map((_, i) => html`<i key=${i} class=${'q' + ((i * 7 + 3) % 4)}></i>`)}
          </div>
          <div class="ticket-state"><span class="pulse"></span> Ready — pick it up</div>
        </div>
      </div>
    </header>

    <!-- How it works -->
    <section class="l-section">
      <h2 class="l-h2">How a night with WOL works</h2>
      <div class="l-steps">
        ${STEPS.map(s => html`<div key=${s.n} class="l-step">
          <div class="l-step-icon">${s.icon}</div>
          <div class="l-step-n">${s.n}</div>
          <h3>${s.t}</h3>
          <p>${s.d}</p>
        </div>`)}
      </div>
    </section>

    <!-- View selector -->
    <section class="l-section" id="views">
      <h2 class="l-h2">Walk the product from all three sides</h2>
      <p class="l-section-sub">Everything is live and connected: an order you place as a customer shows up in the bartender's queue and in the owner's dashboard.</p>
      <div class="l-views">
        ${VIEWS.map(v => html`<button key=${v.path} class=${'l-view ' + v.cls} onClick=${() => nav(v.path)}>
          <div class="l-view-icon">${v.icon}</div>
          <h3>${v.title}</h3>
          <p>${v.d}</p>
          <div class="l-view-hint">${v.hint}</div>
          <div class="l-view-enter">Enter without login →</div>
        </button>`)}
      </div>
    </section>

    <!-- Features -->
    <section class="l-section">
      <h2 class="l-h2">What's inside</h2>
      <div class="l-features">
        ${FEATURES.map(f => html`<div key=${f.t} class="l-feature">
          <div class="l-feature-icon">${f.icon}</div>
          <div><h3>${f.t}</h3><p>${f.d}</p></div>
        </div>`)}
      </div>
    </section>

    <!-- Under the hood -->
    <section class="l-section">
      <div class="l-hood">
        <div class="l-hood-head">
          <h2 class="l-h2" style="margin:0">Under the hood</h2>
          <p class="l-section-sub" style="margin:8px 0 0">
            This demo simulates the checkout so you can walk the whole flow without a Mercado Pago
            account. The production build — live at Hush Club — runs the real integration:
          </p>
        </div>
        <ul class="l-hood-list">
          ${UNDER_HOOD.map(([t, d]) => html`<li key=${t}><b>${t}</b> — ${d}</li>`)}
        </ul>
        <a class="l-hood-gh" href=${GITHUB_URL} target="_blank" rel="noopener noreferrer">
          <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>
          View the source on GitHub<span class="l-hood-repo">lucaspippo4-commits/WOL</span><span class="l-hood-arrow">↗</span>
        </a>
      </div>
    </section>

    <footer class="l-footer">
      <div>${BUILT_BY}</div>
      <div class="l-footer-tools">
        <span>Demo data is simulated and resets on every restart.</span>
        <button class="l-reset" disabled=${resetting} onClick=${reset}>${resetting ? 'Resetting…' : 'Reset demo data'}</button>
      </div>
    </footer>
  </div>`;
}
