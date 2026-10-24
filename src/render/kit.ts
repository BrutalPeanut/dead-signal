/**
 * Character art toolkit. Characters are designed in a 100-unit-tall "design space" (feet at y=0,
 * facing +x) and painted with a consistent lighting model:
 *   - key light from the upper left  → 3-tone form shading (highlight / base / shadow)
 *   - cool rim light from behind     → a thin bright edge on the right/back of each form
 *   - dark ink outline               → readability against any floor at small sizes
 * Shapes are built by path functions so each can be filled, clipped and stroked repeatedly.
 */
export type C = CanvasRenderingContext2D;
export type Build = (ctx: C) => void;

export const INK = '#0f0a12';
export const RIM = 'rgba(150,235,255,0.75)';
export const SIGNAL = '#ff3bd4';

export interface Mat {
  base: string;
  dark: string;
  light: string;
  rim?: string | null;
  ink?: number; // outline width in design units (0 = none)
}

export function mat(base: string, dark: string, light: string, rim: string | null = RIM, ink = 3): Mat {
  return { base, dark, light, rim, ink };
}

/** Paint a closed form with 3-tone shading, optional rim light, and an ink outline. */
export function paint(ctx: C, build: Build, m: Mat, bx: number, by: number, bw: number, bh: number) {
  ctx.beginPath();
  build(ctx);
  const g = ctx.createLinearGradient(bx, by, bx + bw * 0.85, by + bh);
  g.addColorStop(0, m.light);
  g.addColorStop(0.42, m.base);
  g.addColorStop(1, m.dark);
  ctx.fillStyle = g;
  ctx.fill();
  if (m.rim) {
    ctx.save();
    ctx.beginPath();
    build(ctx);
    ctx.clip();
    ctx.translate(-2.4, 1.6);
    ctx.beginPath();
    build(ctx);
    ctx.lineWidth = 4;
    ctx.strokeStyle = m.rim;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.restore();
  }
  if ((m.ink ?? 3) > 0) {
    ctx.beginPath();
    build(ctx);
    ctx.lineWidth = m.ink ?? 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

/** Sphere-shaded ellipse (heads, bellies, joints). */
export function ball(ctx: C, x: number, y: number, rx: number, ry: number, m: Mat, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  const g = ctx.createRadialGradient(x - rx * 0.35, y - ry * 0.4, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry) * 1.05);
  g.addColorStop(0, m.light);
  g.addColorStop(0.55, m.base);
  g.addColorStop(1, m.dark);
  ctx.fillStyle = g;
  ctx.fill();
  if (m.rim) {
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(x - 2.4, y + 1.6, rx, ry, rot, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = m.rim;
    ctx.stroke();
    ctx.restore();
  }
  if ((m.ink ?? 3) > 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
    ctx.lineWidth = m.ink ?? 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
}

/** A tapered capsule from (x1,y1,r1) to (x2,y2,r2): the building block for limbs. */
export function taper(x1: number, y1: number, r1: number, x2: number, y2: number, r2: number): Build {
  return (ctx) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const px = Math.cos(a + Math.PI / 2);
    const py = Math.sin(a + Math.PI / 2);
    ctx.moveTo(x1 + px * r1, y1 + py * r1);
    ctx.lineTo(x2 + px * r2, y2 + py * r2);
    ctx.arc(x2, y2, r2, a + Math.PI / 2, a - Math.PI / 2, true);
    ctx.lineTo(x1 - px * r1, y1 - py * r1);
    ctx.arc(x1, y1, r1, a - Math.PI / 2, a + Math.PI / 2, true);
    ctx.closePath();
  };
}

/** Paint a two-segment limb (upper + lower) with a joint. */
export function limb(
  ctx: C,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  r: [number, number, number],
  m: Mat,
) {
  const minx = Math.min(ax, bx, cx) - r[0];
  const miny = Math.min(ay, by, cy) - r[0];
  const w = Math.max(ax, bx, cx) + r[0] - minx;
  const hh = Math.max(ay, by, cy) + r[0] - miny;
  paint(ctx, taper(bx, by, r[1], cx, cy, r[2]), m, minx, miny, w, hh);
  paint(ctx, taper(ax, ay, r[0], bx, by, r[1]), m, minx, miny, w, hh);
}

/** A glowing eye / light with bloom. */
export function glow(ctx: C, x: number, y: number, r: number, color = SIGNAL, core = '#ffffff') {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
  g.addColorStop(0, color);
  g.addColorStop(0.3, hexA(color, 0.45));
  g.addColorStop(1, hexA(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x - r * 0.15, y - r * 0.15, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Ink line detail (seams, cracks, stitches). */
export function line(ctx: C, pts: number[], w = 1.6, color = INK, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

/** Jagged torn edge path along y from x0..x1 (for ragged clothes), returned as a builder. */
export function ragged(x0: number, x1: number, y: number, depth: number, seed: number, n = 7): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const d = ((Math.sin(seed * 12.9898 + i * 4.1414) * 43758.5453) % 1 + 1) % 1;
    pts.push(x, y + (i % 2 ? d * depth : d * depth * 0.3));
  }
  return pts;
}

/** Signal veins: glowing branching cracks. */
export function veins(ctx: C, x: number, y: number, len: number, ang: number, seed: number) {
  ctx.save();
  ctx.strokeStyle = SIGNAL;
  ctx.shadowColor = SIGNAL;
  ctx.shadowBlur = 5;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  let px = x;
  let py = y;
  ctx.moveTo(px, py);
  for (let i = 0; i < 4; i++) {
    const a = ang + Math.sin(seed * 7 + i * 2.3) * 0.7;
    px += Math.cos(a) * (len / 4);
    py += Math.sin(a) * (len / 4);
    ctx.lineTo(px, py);
    if (i === 1) {
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a + 1.2) * len * 0.25, py + Math.sin(a + 1.2) * len * 0.25);
      ctx.moveTo(px, py);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function hexA(hex: string, a: number) {
  if (hex.startsWith('rgba')) return hex;
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

/** Soft contact shadow under a form (ambient occlusion), drawn in design space. */
export function ao(ctx: C, x: number, y: number, rx: number, ry: number, a = 0.35) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(0,0,0,${a})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
