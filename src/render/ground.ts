import { Rng } from '../sim/math';
import type { Biome } from '../sim/chapters';
import { makeCanvas } from './sprites';

export const CHUNK = 256;

/**
 * Infinite procedural floor, generated per 256-unit chunk from a seeded RNG and cached as canvases.
 * Same coordinates always produce the same chunk, so the world is consistent as you run around.
 */
export class Ground {
  private cache = new Map<string, HTMLCanvasElement>();
  private order: string[] = [];
  private scale = 0;
  constructor(public biome: Biome) {}

  setScale(s: number) {
    if (Math.abs(s - this.scale) > 0.01) {
      this.scale = s;
      this.cache.clear();
      this.order = [];
    }
  }

  draw(ctx: CanvasRenderingContext2D, camX: number, camY: number, halfW: number, halfH: number) {
    const x0 = Math.floor((camX - halfW) / CHUNK);
    const x1 = Math.floor((camX + halfW) / CHUNK);
    const y0 = Math.floor((camY - halfH) / CHUNK);
    const y1 = Math.floor((camY + halfH) / CHUNK);
    for (let cx = x0; cx <= x1; cx++)
      for (let cy = y0; cy <= y1; cy++) {
        const c = this.chunk(cx, cy);
        ctx.drawImage(c, cx * CHUNK, cy * CHUNK, CHUNK + 0.5, CHUNK + 0.5);
      }
  }

  private chunk(cx: number, cy: number) {
    const k = `${cx},${cy}`;
    let c = this.cache.get(k);
    if (c) return c;
    const s = Math.min(this.scale, 3);
    c = makeCanvas(CHUNK * s, CHUNK * s);
    const ctx = c.getContext('2d')!;
    ctx.scale(s, s);
    const rng = new Rng(((cx * 73856093) ^ (cy * 19349663) ^ BIOME_SEED[this.biome]) >>> 0);
    PAINT[this.biome](ctx, rng, cx, cy);
    this.cache.set(k, c);
    this.order.push(k);
    if (this.order.length > 40) this.cache.delete(this.order.shift()!);
    return c;
  }
}

const BIOME_SEED: Record<Biome, number> = { downtown: 11, biolab: 23, spaceport: 37 };

type C = CanvasRenderingContext2D;

function speckle(ctx: C, rng: Rng, n: number, colors: string[], size: [number, number]) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rng.pick(colors);
    const r = rng.range(size[0], size[1]);
    ctx.fillRect(rng.range(0, CHUNK), rng.range(0, CHUNK), r, r);
  }
}

function crack(ctx: C, rng: Rng, color: string, w: number) {
  let x = rng.range(0, CHUNK);
  let y = rng.range(0, CHUNK);
  let a = rng.range(0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  const n = rng.int(4, 9);
  for (let i = 0; i < n; i++) {
    a += rng.range(-0.8, 0.8);
    const l = rng.range(6, 18);
    x += Math.cos(a) * l;
    y += Math.sin(a) * l;
    ctx.lineTo(x, y);
    if (rng.chance(0.25)) {
      // branch
      ctx.moveTo(x, y);
      const ba = a + rng.range(-1.4, 1.4);
      ctx.lineTo(x + Math.cos(ba) * l * 0.7, y + Math.sin(ba) * l * 0.7);
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

function goo(ctx: C, rng: Rng, color: string, glow: string) {
  const x = rng.range(20, CHUNK - 20);
  const y = rng.range(20, CHUNK - 20);
  const r = rng.range(8, 20);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rr = r * rng.range(0.6, 1.2);
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.7;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = glow;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.arc(x + rng.range(-r, r), y + rng.range(-r, r) * 0.6, rng.range(1, 2.5), 0, Math.PI * 2);
    ctx.fill();
  }
}

const PAINT: Record<Biome, (ctx: C, rng: Rng, cx: number, cy: number) => void> = {
  downtown(ctx, rng, cx, cy) {
    ctx.fillStyle = '#2b2e35';
    ctx.fillRect(0, 0, CHUNK, CHUNK);
    speckle(ctx, rng, 900, ['#32363e', '#262930', '#363a43', '#24272d'], [1, 2.6]);
    // patched asphalt
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = rng.chance(0.5) ? '#30343c' : '#272a31';
      ctx.fillRect(rng.range(0, CHUNK - 60), rng.range(0, CHUNK - 40), rng.range(30, 70), rng.range(20, 40));
    }
    // road markings: every 3rd row of chunks has a lane line, every 4th column a crosswalk
    if (((cy % 3) + 3) % 3 === 0) {
      ctx.fillStyle = 'rgba(255,207,64,0.75)';
      for (let x = 0; x < CHUNK; x += 40) ctx.fillRect(x + 6, CHUNK / 2 - 2, 22, 4);
    }
    if (((cx % 4) + 4) % 4 === 1) {
      ctx.fillStyle = 'rgba(230,233,240,0.55)';
      for (let y = 8; y < CHUNK; y += 22) ctx.fillRect(CHUNK / 2 - 30, y, 60, 9);
    }
    for (let i = 0; i < 4; i++) crack(ctx, rng, 'rgba(10,10,14,0.65)', rng.range(0.8, 1.6));
    if (rng.chance(0.35)) {
      // manhole
      const x = rng.range(30, CHUNK - 30);
      const y = rng.range(30, CHUNK - 30);
      ctx.fillStyle = '#1d1f24';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3b3f48';
      ctx.lineWidth = 1.2;
      for (let r = 4; r < 11; r += 3) {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // oil stains
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = 'rgba(12,12,18,0.35)';
      ctx.beginPath();
      ctx.ellipse(rng.range(0, CHUNK), rng.range(0, CHUNK), rng.range(8, 18), rng.range(5, 10), rng.range(0, 3), 0, Math.PI * 2);
      ctx.fill();
    }
    // debris: paper, cans, bricks
    for (let i = 0; i < 7; i++) {
      ctx.save();
      ctx.translate(rng.range(0, CHUNK), rng.range(0, CHUNK));
      ctx.rotate(rng.range(0, Math.PI));
      const k = rng.int(0, 2);
      if (k === 0) {
        ctx.fillStyle = 'rgba(210,205,190,0.55)';
        ctx.fillRect(-4, -3, 8, 6);
      } else if (k === 1) {
        ctx.fillStyle = rng.pick(['#b2303f', '#3a7bd5', '#c9c9c9']);
        ctx.fillRect(-3, -1.5, 6, 3);
      } else {
        ctx.fillStyle = '#5a3a32';
        ctx.fillRect(-4, -2, 8, 4);
      }
      ctx.restore();
    }
    if (rng.chance(0.4)) goo(ctx, rng, 'rgba(120,20,100,0.35)', 'rgba(255,59,212,0.55)');
  },

  biolab(ctx, rng) {
    ctx.fillStyle = '#c3cbd3';
    ctx.fillRect(0, 0, CHUNK, CHUNK);
    const T = 32;
    for (let x = 0; x < CHUNK; x += T)
      for (let y = 0; y < CHUNK; y += T) {
        const v = rng.range(-8, 8);
        ctx.fillStyle = `rgb(${190 + v},${199 + v},${208 + v})`;
        ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
        if (rng.chance(0.06)) {
          ctx.fillStyle = 'rgba(60,70,80,0.18)';
          ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
        }
      }
    ctx.strokeStyle = 'rgba(80,92,104,0.5)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= CHUNK; i += T) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, CHUNK);
      ctx.moveTo(0, i);
      ctx.lineTo(CHUNK, i);
      ctx.stroke();
    }
    // hazard stripe band
    if (rng.chance(0.35)) {
      const y = Math.floor(rng.range(1, 7)) * T;
      for (let x = 0; x < CHUNK; x += 12) {
        ctx.fillStyle = (x / 12) % 2 ? '#1d1d1d' : '#f2c018';
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + 12, y);
        ctx.lineTo(x + 6, y + 8);
        ctx.lineTo(x - 6, y + 8);
        ctx.fill();
      }
    }
    for (let i = 0; i < 3; i++) crack(ctx, rng, 'rgba(60,70,80,0.55)', 0.8);
    for (let i = 0; i < 2; i++) goo(ctx, rng, 'rgba(90,170,40,0.5)', 'rgba(200,255,120,0.8)');
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(rng.range(0, CHUNK), rng.range(0, CHUNK));
      ctx.rotate(rng.range(0, Math.PI));
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-5, -3.5, 10, 7);
      ctx.fillStyle = 'rgba(80,90,110,0.6)';
      for (let l = 0; l < 3; l++) ctx.fillRect(-3.5, -2 + l * 1.6, 7, 0.6);
      ctx.restore();
    }
  },

  spaceport(ctx, rng) {
    ctx.fillStyle = '#20252e';
    ctx.fillRect(0, 0, CHUNK, CHUNK);
    const T = 64;
    for (let x = 0; x < CHUNK; x += T)
      for (let y = 0; y < CHUNK; y += T) {
        const v = rng.range(-6, 6);
        const g = ctx.createLinearGradient(x, y, x + T, y + T);
        g.addColorStop(0, `rgb(${52 + v},${59 + v},${70 + v})`);
        g.addColorStop(1, `rgb(${38 + v},${44 + v},${54 + v})`);
        ctx.fillStyle = g;
        ctx.fillRect(x + 1.5, y + 1.5, T - 3, T - 3);
        ctx.fillStyle = '#6b7484';
        for (const [rx, ry] of [[5, 5], [T - 5, 5], [5, T - 5], [T - 5, T - 5]]) {
          ctx.beginPath();
          ctx.arc(x + rx, y + ry, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
        if (rng.chance(0.15)) {
          // vent grille
          ctx.fillStyle = '#15181e';
          ctx.fillRect(x + 16, y + 16, T - 32, T - 32);
          ctx.fillStyle = '#3a414e';
          for (let k = 0; k < 5; k++) ctx.fillRect(x + 18, y + 19 + k * 6, T - 36, 2);
        }
      }
    // landing markings
    if (rng.chance(0.4)) {
      ctx.strokeStyle = 'rgba(255,207,64,0.7)';
      ctx.lineWidth = 3;
      ctx.setLineDash([14, 10]);
      ctx.beginPath();
      ctx.arc(CHUNK / 2, CHUNK / 2, rng.range(60, 100), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // floor lights
    for (let i = 0; i < 3; i++) {
      const x = Math.floor(rng.range(0, 4)) * T + T / 2;
      const y = Math.floor(rng.range(0, 4)) * T;
      const g = ctx.createRadialGradient(x, y, 0, x, y, 14);
      g.addColorStop(0, 'rgba(94,242,255,0.8)');
      g.addColorStop(1, 'rgba(94,242,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 14, y - 14, 28, 28);
    }
    for (let i = 0; i < 3; i++) crack(ctx, rng, 'rgba(0,0,0,0.45)', 1);
    if (rng.chance(0.5)) goo(ctx, rng, 'rgba(120,20,100,0.35)', 'rgba(255,59,212,0.6)');
  },
};
