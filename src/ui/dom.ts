type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, any>;

/** Tiny hyperscript helper: h('div.card.big', {onclick}, children). */
export function h(sel: string, attrs: Attrs | Child | Child[] = {}, ...children: (Child | Child[])[]): HTMLElement {
  if (attrs === null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
    children.unshift(attrs as Child);
    attrs = {};
  }
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  for (const [k, v] of Object.entries(attrs as Attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  const add = (c: Child | Child[]) => {
    if (Array.isArray(c)) c.forEach(add);
    else if (c !== null && c !== undefined && c !== false) el.append(c instanceof Node ? c : String(c));
  };
  children.forEach(add);
  return el;
}

export function clear(el: HTMLElement) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function fmtNum(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e4) return Math.round(v / 1e3) + 'K';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Math.round(v).toString();
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let toastEl: HTMLElement | null = null;
export function toast(msg: string, color = '#5ef2ff') {
  if (!toastEl) {
    toastEl = h('div.toast');
    document.body.append(toastEl);
  }
  const t = h('div.toast-item', { style: { borderColor: color } }, msg);
  toastEl.append(t);
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2300);
}

let hapticsOn = true;
export function setHaptics(on: boolean) {
  hapticsOn = on;
}

export function haptic(ms = 12) {
  if (!hapticsOn) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

/** Simple SVG-free currency glyphs drawn with CSS. */
export function coin(kind: 'gold' | 'scrap' | 'key' | 'xp' | 'power'): HTMLElement {
  return h(`i.cur.cur-${kind}`);
}
