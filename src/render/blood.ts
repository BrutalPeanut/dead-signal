/**
 * Blood splatter decals. Splats are pre-rendered once per colour into a pool of varied sprites
 * (sprites face +x = the direction the shot travelled; rotated at draw time). Four families,
 * each with randomised proportions, so a field of kills never shows a repeating stamp:
 *   - pool:    a lumpy puddle with a clotted rim, a few lobes and droplets
 *   - spray:   a small puddle with a cone of streaks and fine mist thrown forward
 *   - smear:   an elongated drag mark that thins out, with a ragged leading edge
 *   - spatter: no puddle, just a scatter of drops of very different sizes
 * Each sprite also gets its own shade (fresh vs darker/older blood).
 */
const SIZE = 160;
const PER_COLOR = 24;
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

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function shade([r, g, b]: [number, number, number], f: number, a = 1) {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgba(${c(r)},${c(g)},${c(b)},${a})`;
}

/** Irregular closed blob, optionally stretched along x. */
function blob(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, rand: () => number, lumps: number, rough: number, stretch = 1) {
  const pts: [number, number][] = [];
  for (let i = 0; i < lumps; i++) {
    const a = (i / lumps) * Math.PI * 2;
    const rr = r * (1 - rough + rand() * rough * 2);
    pts.push([cx + Math.cos(a) * rr * stretch, cy + Math.sin(a) * rr * 0.85]);
  }
  x.beginPath();
  for (let i = 0; i < lumps; i++) {
    const q = pts[(i + 1) % lumps];
    const n = pts[(i + 2) % lumps];
    if (i === 0) x.moveTo((pts[0][0] + q[0]) / 2, (pts[0][1] + q[1]) / 2);
    x.quadraticCurveTo(q[0], q[1], (q[0] + n[0]) / 2, (q[1] + n[1]) / 2);
  }
  x.closePath();
}

function drop(x: CanvasRenderingContext2D, px: number, py: number, r: number, ang: number, elong: number) {
  x.beginPath();
  x.ellipse(px, py, r * elong, r, ang, 0, Math.PI * 2);
  x.fill();
}

function streak(x: CanvasRenderingContext2D, sx: number, sy: number, a: number, len: number, w: number) {
  const ex = sx + Math.cos(a) * len;
  const ey = sy + Math.sin(a) * len;
  // tapered: thick at the root, thin before the end drop
  x.beginPath();
  const px = Math.cos(a + Math.PI / 2);
  const py = Math.sin(a + Math.PI / 2);
  x.moveTo(sx + px * w, sy + py * w);
  x.lineTo(ex - Math.cos(a) * w + px * w * 0.25, ey - Math.sin(a) * w + py * w * 0.25);
  x.lineTo(ex - Math.cos(a) * w - px * w * 0.25, ey - Math.sin(a) * w - py * w * 0.25);
  x.lineTo(sx - px * w, sy - py * w);
  x.closePath();
  x.fill();
  x.beginPath();
  x.arc(ex, ey, w * (0.7 + Math.random() * 0.5), 0, Math.PI * 2);
  x.fill();
}

/** Puddle body: dark rim, wet gradient, a highlight. */
function puddle(x: CanvasRenderingContext2D, base: [number, number, number], cx: number, cy: number, r: number, rand: () => number, stretch: number) {
  const lumps = 10 + Math.floor(rand() * 10);
  const rough = 0.15 + rand() * 0.25;
  const seed = rand() * 1e9;
  const r1 = rng(seed);
  blob(x, cx, cy, r * 1.08, r1, lumps, rough, stretch);
  x.fillStyle = shade(base, 0.5);
  x.fill();
  const r2 = rng(seed);
  blob(x, cx - 0.8, cy - 0.8, r * 0.93, r2, lumps, rough, stretch);
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.35, 1, cx, cy, r * stretch);
  g.addColorStop(0, shade(base, 1.18));
  g.addColorStop(0.5, shade(base, 1));
  g.addColorStop(1, shade(base, 0.72));
  x.fillStyle = g;
  x.fill();
  // lobes
  const lobes = Math.floor(rand() * 4);
  x.fillStyle = shade(base, 0.92);
  for (let i = 0; i < lobes; i++) {
    const a = rand() * Math.PI * 2;
    const d = r * (0.6 + rand() * 0.45);
    blob(x, cx + Math.cos(a) * d * stretch, cy + Math.sin(a) * d * 0.8, r * (0.22 + rand() * 0.3), rand, 8, 0.3);
    x.fill();
  }
  // wet highlight (only on fresh-looking splats)
  if (rand() < 0.5) {
    x.fillStyle = `rgba(255,215,215,${0.05 + rand() * 0.08})`;
    x.beginPath();
    x.ellipse(cx - r * 0.3, cy - r * 0.32, r * (0.18 + rand() * 0.14), r * 0.09, -0.5, 0, Math.PI * 2);
    x.fill();
  }
}

function render(color: string, idx: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const x = c.getContext('2d')!;
  const rand = rng(idx * 7919 + color.charCodeAt(1) * 131 + color.charCodeAt(3) * 17);
  // per-sprite shade: some fresh and bright, some darker, some nearly black-brown
  const base0 = rgb(color);
  const tone = 0.7 + rand() * 0.55;
  const base: [number, number, number] = [base0[0] * tone, base0[1] * tone * (0.9 + rand() * 0.2), base0[2] * tone];
  const cx = SIZE * 0.4;
  const cy = SIZE / 2;
  const R = SIZE * 0.16;
  const family = ['pool', 'spray', 'spray', 'smear', 'spatter', 'pool'][idx % 6];
  x.fillStyle = shade(base, 1);

  if (family === 'spray' || family === 'pool') {
    const cone = family === 'spray' ? 0.5 + rand() * 0.9 : 1.6 + rand() * 1.5;
    const n = family === 'spray' ? 6 + Math.floor(rand() * 9) : Math.floor(rand() * 5);
    for (let i = 0; i < n; i++) {
      const a = (rand() - 0.5) * cone;
      x.fillStyle = shade(base, 0.8 + rand() * 0.4);
      streak(x, cx + Math.cos(a) * R * 0.5, cy + Math.sin(a) * R * 0.5, a, R * (0.9 + rand() * (family === 'spray' ? 2.6 : 1.2)), 0.8 + rand() * 2.4);
    }
    // fine mist on the thrown side
    const mist = family === 'spray' ? 20 + Math.floor(rand() * 30) : 6 + Math.floor(rand() * 10);
    for (let i = 0; i < mist; i++) {
      const a = (rand() - 0.5) * cone * 1.3;
      const d = R * (1 + rand() * 2.8);
      x.fillStyle = shade(base, 0.7 + rand() * 0.5, 0.6 + rand() * 0.4);
      drop(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d, 0.5 + rand() * 1.6, a, 1 + rand() * 1.5);
    }
    puddle(x, base, cx, cy, R * (family === 'spray' ? 0.55 + rand() * 0.35 : 0.85 + rand() * 0.35), rand, 1 + rand() * 0.3);
  } else if (family === 'smear') {
    // a drag mark: overlapping blobs shrinking toward +x
    const len = R * (2 + rand() * 1.8);
    const steps = 9;
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const w = R * (0.75 - t * 0.55) * (0.85 + rand() * 0.3);
      x.fillStyle = shade(base, 0.85 + (1 - t) * 0.2);
      blob(x, cx - R * 0.6 + t * len, cy + Math.sin(t * 3 + rand()) * R * 0.15, w, rand, 9, 0.25, 1.3);
      x.fill();
    }
    // ragged streak lines along the drag
    for (let i = 0; i < 4; i++) {
      x.fillStyle = shade(base, 0.6 + rand() * 0.3);
      streak(x, cx - R * 0.4, cy + (rand() - 0.5) * R * 0.9, (rand() - 0.5) * 0.15, len * (0.6 + rand() * 0.5), 0.6 + rand() * 1.2);
    }
    puddle(x, base, cx - R * 0.5, cy, R * (0.55 + rand() * 0.25), rand, 1.15);
  } else {
    // spatter: drops of very different sizes, a couple of medium splotches
    const n = 14 + Math.floor(rand() * 18);
    for (let i = 0; i < n; i++) {
      const a = (rand() - 0.5) * 2.6;
      const d = R * rand() * 2.6;
      const r = rand() < 0.15 ? 3 + rand() * 4 : 0.7 + rand() * 2.2;
      x.fillStyle = shade(base, 0.7 + rand() * 0.5);
      if (r > 3) {
        blob(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, rand, 8, 0.3, 1 + rand() * 0.4);
        x.fill();
      } else drop(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d, r, a, 1 + rand() * 1.8);
    }
  }
  // a few far-flung droplets on every family
  for (let i = 0; i < 4 + Math.floor(rand() * 6); i++) {
    const a = rand() * Math.PI * 2;
    const d = R * (1.6 + rand() * 1.6);
    x.fillStyle = shade(base, 0.75 + rand() * 0.4);
    drop(x, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, 0.5 + rand() * 1.4, a, 1 + rand());
  }
  return c;
}

/** A splat sprite for this colour; `variant` is any integer (wrapped into the pool). */
export function splat(color: string, variant: number): HTMLCanvasElement {
  let list = cache.get(color);
  if (!list) {
    list = Array.from({ length: PER_COLOR }, (_, i) => render(color, i));
    cache.set(color, list);
  }
  return list[((variant % PER_COLOR) + PER_COLOR) % PER_COLOR];
}

/** Sprite pixels per world unit of decal radius (main pool radius is ~0.16 of the sprite). */
export const SPLAT_SCALE = 1 / (0.16 * SIZE);
export const SPLAT_SIZE = SIZE;
export const SPLAT_VARIANTS = PER_COLOR;
