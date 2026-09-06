// ---------------------------------------------------------------------------
// Small shared helpers used by every screen. Nothing app-specific here.
// ---------------------------------------------------------------------------

/**
 * Build a DOM element.
 *   h('div', { class: 'card' }, 'hello')
 *   h('button', { class: 'nav-btn', onClick: fn }, 'GO')
 */
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

/** Same as h() but for SVG, which needs a namespace. */
export function svg(tag, props = {}, ...children) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}

let toastTimer = null;
export function toast(message) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = h('div', { class: 'toast' });
    document.body.append(t);
  }
  t.textContent = message;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/** 60 -> "60", 32.5 -> "32.5" (no trailing ".0"). */
export function fmtWeight(n) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
}

/** "Today", "Yesterday", "3 days ago", "5 weeks ago". */
export function relDate(iso) {
  if (!iso) return 'Never';
  const then = new Date(iso);
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(then)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'Last week';
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export function shortDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Round to a sane number of decimals so 32.5 + 2.5 never becomes 35.000000004 */
export function tidy(n) {
  return Math.round(n * 100) / 100;
}

export function confirmDialog(message) {
  return window.confirm(message);
}

// --- Date <-> <input type="date"> helpers -----------------------------------
// A plain `new Date("2026-08-25")` parses as UTC midnight, which can render as
// the PREVIOUS day once converted back to local time. Building the Date from
// separate numeric parts (year, month, day) uses local time instead, so this
// pair is the safe way to move between an ISO string and a date-input value.

export function toDateInputValue(isoOrDate) {
  const d = isoOrDate instanceof Date ? isoOrDate : new Date(isoOrDate);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateInputValue(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0); // local noon: a safe mid-day anchor
}

export function isSameLocalDay(a, b) {
  const da = a instanceof Date ? a : new Date(a);
  const db = b instanceof Date ? b : new Date(b);
  return da.getFullYear() === db.getFullYear()
    && da.getMonth() === db.getMonth()
    && da.getDate() === db.getDate();
}

// --- Bottom sheet: pick one of a few options, or cancel ---------------------
// Used for "which workout are you logging?" from the calendar. Resolves with
// the chosen option's `value`, or null if the user cancels / taps the scrim.

export function openSheet(title, options) {
  return new Promise((resolve) => {
    let done = false;
    const overlay = h('div', { class: 'sheet-scrim' });

    function close(value) {
      if (done) return;
      done = true;
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      resolve(value);
    }

    const sheet = h('div', { class: 'sheet' },
      h('div', { class: 'sheet-title' }, title),
      ...options.map((opt) =>
        h('button', { class: 'nav-btn', onClick: () => close(opt.value) }, opt.label)),
      h('button', { class: 'nav-btn btn-danger', style: { marginTop: '14px' }, onClick: () => close(null) }, 'Cancel')
    );

    overlay.append(sheet);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  });
}

// --- Sparkline: a tiny weight-over-time line, reused by Progress and the ---
// exercise detail screen. Amber normally, green when a "ready" flag is on.
export function sparkline(values, ready, { width = 84, height = 30 } = {}) {
  const W = width, H = height, PAD = 3;
  const stroke = ready ? 'var(--green)' : 'var(--amber)';
  const node = svg('svg', { class: 'spark', viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true' });

  if (values.length === 0) {
    node.append(svg('line', {
      x1: PAD, y1: H / 2, x2: W - PAD, y2: H / 2,
      stroke: 'var(--border)', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-dasharray': '2 4',
    }));
    return node;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const pt = (v, i) => [
    PAD + i * stepX,
    H - PAD - ((v - min) / span) * (H - PAD * 2),
  ];
  const points = values.map(pt);

  if (values.length === 1) {
    // One data point: a flat baseline plus the dot, so it doesn't look broken.
    node.append(svg('line', {
      x1: PAD, y1: H / 2, x2: W - PAD, y2: H / 2,
      stroke: 'var(--border)', 'stroke-width': 2, 'stroke-linecap': 'round',
    }));
    node.append(svg('circle', { cx: W - PAD, cy: H / 2, r: 3, fill: stroke }));
    return node;
  }

  node.append(svg('polyline', {
    points: points.map((p) => p.join(',')).join(' '),
    fill: 'none', stroke, 'stroke-width': 2,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round',
  }));
  const lastPt = points[points.length - 1];
  node.append(svg('circle', { cx: lastPt[0], cy: lastPt[1], r: 3, fill: stroke }));
  return node;
}
