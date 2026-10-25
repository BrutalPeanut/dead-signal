/**
 * Blood splatter decals. Each splat is pre-rendered once per colour/variant into a small canvas:
 * an irregular pooled blob, a darker clotted rim, a wet highlight, satellite droplets and
 * directional spray streaks thrown away from the shot (sprites face +x; rotated at draw time).
 */
const SIZE = 128;
const VARIANTS = 6;
const cache = new Map<string, HTMLCanvasElement[]>();

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/** Irregular closed blob path around (cx,cy). */
function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number, lumps = 14, rough = 0.28) {
  const pts: [number, number][] = [];
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2;
    const rr = r * (1 - rough + rand() * rough * 2);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.82]);
  }
  ctx.beginPath();
  for (let i = 0; i < lumps; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % lumps];
    const mx = (p[0] + q[0]) / 2;
    const my = (p[1] + q[1]) / 2;
    if (i === 0) ctx.moveTo(mx, my);
    ctx.quadraticCurveTo(q[0], q[1], (q[0] + pts[(i + 2) % lumps][0]) / 2, (q[1] + pts[(i + 2) % lumps][1]) / 2);
  }
  ctx.closePath();
}

function render(color: string, variant: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d')!;
  const rand = rng(variant * 7919 + color.length * 131);
  const cx = SIZE * 0.42;
  const cy = SIZE / 2;
  const R = SIZE * 0.2;
  const dark = shade(color, 0.55);
  const wet = shade(color, 1.35);

  // spray streaks thrown away from the shot (+x)
  for (let i = 0; i < 7; i++) {
    const a = (rand() - 0.5) * 1.3;
    const len = R * (1.1 + rand() * 1.5);
    const w = 1.2 + rand() * 2.6;
    const sx = cx + Math.cos(a) * R * 0.6;
    const sy = cy + Math.sin(a) * R * 0.6;
    const ex = sx + Math.cos(a) * len;
    const ey = sy + Math.sin(a) * len;
    x.strokeStyle = color;
    x.lineCap = 'round';
    x.lineWidth = w;
    x.beginPath();
    x.moveTo(sx, sy);
    x.lineTo(ex, ey);
    x.stroke();
    // teardrop at the end of each streak
    x.fillStyle = color;
    x.beginPath();
    x.arc(ex, ey, w * 0.9 + rand() * 1.2, 0, Math.PI * 2);
    x.fill();
  }
  // satellite droplets, denser on the thrown side
  for (let i = 0; i < 16; i++) {
    const a = rand() < 0.7 ? (rand() - 0.5) * 2 : rand() * Math.PI * 2;
    const d = R * (1.05 + rand() * 1.6);
    const r = 0.8 + rand() * (d < R * 1.6 ? 3.2 : 2);
    x.fillStyle = rand() < 0.3 ? dark : color;
    x.beginPath();
    x.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, r * 1.2, r, a, 0, Math.PI * 2);
    x.fill();
  }
  // main pool: dark clotted rim, body, wet sheen
  blob(x, cx, cy, R * 1.08, rand, 16, 0.3);
  x.fillStyle = dark;
  x.fill();
  const rs = rand;
  blob(x, cx - 1, cy - 1, R * 0.92, rs, 16, 0.26);
  const g = x.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 1, cx, cy, R);
  g.addColorStop(0, wet);
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, 0.75));
  x.fillStyle = g;
  x.fill();
  // secondary lobes so it's never a plain circle
  for (let i = 0; i < 3; i++) {
    const a = rand() * Math.PI * 2;
    const d = R * (0.55 + rand() * 0.35);
    blob(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, R * (0.35 + rand() * 0.25), rand, 10, 0.3);
    x.fillStyle = color;
    x.fill();
  }
  // glossy highlights
  x.fillStyle = 'rgba(255,220,220,0.22)';
  x.beginPath();
  x.ellipse(cx - R * 0.3, cy - R * 0.35, R * 0.28, R * 0.12, -0.5, 0, Math.PI * 2);
  x.fill();
  x.fillStyle = 'rgba(255,255,255,0.18)';
  x.beginPath();
  x.arc(cx - R * 0.12, cy - R * 0.42, R * 0.06, 0, Math.PI * 2);
  x.fill();
  return c;
}

export function splat(color: string, variant: number): HTMLCanvasElement {
  let list = cache.get(color);
  if (!list) {
    list = Array.from({ length: VARIANTS }, (_, i) => render(color, i));
    cache.set(color, list);
  }
  return list[((variant % VARIANTS) + VARIANTS) % VARIANTS];
}

/** Sprite pixels per world unit of decal radius (main pool radius is 0.2 of the sprite). */
export const SPLAT_SCALE = 1 / (0.2 * SIZE);
export const SPLAT_SIZE = SIZE;
