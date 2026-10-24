import type { Game } from '../sim/game';
import { WEAPONS } from '../sim/data';
import type { FxEvent } from '../sim/types';
import type { SpriteCache } from './sprites';

const enum PK {
  Spark,
  Goo,
  Ring,
  Smoke,
  Flash,
  Chunk,
}

interface Particle {
  k: PK;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  drag: number;
}

interface Floater {
  x: number;
  y: number;
  v: string;
  crit: boolean;
  life: number;
}

interface Arc {
  pts: number[];
  life: number;
  color: string;
}

interface Decal {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  rot: number;
}

export interface Banner {
  text: string;
  sub: string;
  color: string;
  t: number;
}

const GOO: Record<string, string> = {
  shambler: '#6fbf3a',
  runner: '#9b2a3a',
  crawler: '#8a5cc2',
  brute: '#6fbf3a',
  spitter: '#9dff4a',
  bloater: '#c4e64a',
  warden: '#ff3bd4',
  hive: '#c6ff4a',
  colossus: '#ff3bd4',
};

export class Fx {
  parts: Particle[] = [];
  floaters: Floater[] = [];
  arcs: Arc[] = [];
  decals: Decal[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#ffffff';
  banners: Banner[] = [];
  hurtPulse = 0;
  levelPulse = 0;

  private add(p: Partial<Particle> & { k: PK; x: number; y: number }) {
    if (this.parts.length > 1400) return;
    this.parts.push({ vx: 0, vy: 0, life: 0.4, size: 3, color: '#fff', drag: 4, ...p, max: p.life ?? 0.4 });
  }

  burst(x: number, y: number, n: number, color: string, speed: number, k = PK.Spark, life = 0.35, size = 2.2) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      this.add({ k, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.7), size: size * (0.6 + Math.random() * 0.8), color, drag: 5 });
    }
  }

  consume(events: FxEvent[], g: Game) {
    let dmgBudget = 14; // cap new damage numbers per frame so the screen stays readable
    for (const e of events) {
      switch (e.t) {
        case 'hit':
          if (this.parts.length < 900) this.burst(e.x, e.y, 2, e.color, 120, PK.Spark, 0.18, 1.6);
          break;
        case 'dmg':
          if (dmgBudget-- > 0 && this.floaters.length < 70)
            this.floaters.push({ x: e.x + (Math.random() - 0.5) * 8, y: e.y, v: fmt(e.v), crit: e.crit, life: e.crit ? 0.8 : 0.55 });
          break;
        case 'death': {
          const c = GOO[e.kind] ?? '#6fbf3a';
          const big = e.elite || e.r > 25;
          this.decals.push({ x: e.x, y: e.y + e.r * 0.5, r: e.r * (big ? 1.6 : 1.1) * (0.8 + Math.random() * 0.4), color: c, life: 9, rot: Math.random() * 3 });
          if (this.decals.length > 140) this.decals.shift();
          this.burst(e.x, e.y, big ? 22 : 7, c, big ? 220 : 130, PK.Goo, 0.45, big ? 4 : 2.6);
          this.burst(e.x, e.y - 6, big ? 8 : 3, '#3a2a35', 160, PK.Chunk, 0.5, 2.4);
          if (e.elite) {
            this.burst(e.x, e.y, 26, '#ffd34d', 260, PK.Spark, 0.6, 2.5);
            this.add({ k: PK.Ring, x: e.x, y: e.y, size: 70, life: 0.45, color: '#ffd34d' });
          }
          break;
        }
        case 'explode':
          this.add({ k: PK.Flash, x: e.x, y: e.y, size: e.r * 0.9, life: 0.12, color: e.color });
          this.add({ k: PK.Ring, x: e.x, y: e.y, size: e.r, life: 0.28, color: e.color });
          this.burst(e.x, e.y, 10, e.color, e.r * 5, PK.Spark, 0.35, 2.4);
          for (let i = 0; i < 4; i++)
            this.add({ k: PK.Smoke, x: e.x + (Math.random() - 0.5) * e.r, y: e.y + (Math.random() - 0.5) * e.r, vy: -20, size: e.r * 0.4, life: 0.7, color: 'rgba(40,36,44,0.5)', drag: 1 });
          this.decals.push({ x: e.x, y: e.y, r: e.r * 0.7, color: '#1a1416', life: 5, rot: 0 });
          break;
        case 'arc':
          this.arcs.push({ pts: jitter(e.pts), life: 0.16, color: e.color });
          for (let i = 2; i < e.pts.length; i += 2) this.burst(e.pts[i], e.pts[i + 1], 3, e.color, 140, PK.Spark, 0.2, 1.8);
          break;
        case 'shake':
          this.shake = Math.max(this.shake, e.amt);
          break;
        case 'levelup':
          this.levelPulse = 0.6;
          this.add({ k: PK.Ring, x: g.px, y: g.py, size: 90, life: 0.5, color: '#5ef2ff' });
          this.burst(g.px, g.py, 24, '#5ef2ff', 240, PK.Spark, 0.5, 2.2);
          break;
        case 'pickup':
          if (e.kind === 'xp') this.add({ k: PK.Flash, x: e.x, y: e.y, size: 6, life: 0.1, color: '#7dffb0' });
          else this.burst(e.x, e.y, 10, e.kind === 'gold' ? '#ffd34d' : '#ffffff', 140, PK.Spark, 0.35, 2);
          break;
        case 'playerHit':
          this.hurtPulse = 0.35;
          this.shake = Math.max(this.shake, 3);
          this.burst(g.px, g.py - 6, 5, '#ff3b5c', 140, PK.Spark, 0.25, 2);
          break;
        case 'banner':
          this.banners.push({ text: e.text, sub: e.sub, color: e.color, t: 2.6 });
          break;
        case 'emp':
          this.flash = 0.5;
          this.flashColor = '#bffbff';
          this.add({ k: PK.Ring, x: e.x, y: e.y, size: 700, life: 0.6, color: '#5ef2ff' });
          break;
        case 'heal':
          this.burst(g.px, g.py, 16, '#43ffa4', 120, PK.Spark, 0.6, 2.2);
          break;
        case 'evolve':
          this.flash = 0.35;
          this.flashColor = WEAPONS[e.weapon].color;
          this.banners.push({ text: 'EVOLVED', sub: WEAPONS[e.weapon].evoName, color: WEAPONS[e.weapon].color, t: 2.6 });
          break;
        case 'bossDown':
          this.flash = 0.6;
          this.flashColor = '#ffffff';
          this.burst(e.x, e.y, 60, '#ff3bd4', 360, PK.Goo, 0.9, 5);
          this.burst(e.x, e.y, 40, '#ffd34d', 400, PK.Spark, 0.8, 3);
          this.add({ k: PK.Ring, x: e.x, y: e.y, size: 260, life: 0.8, color: '#ff3bd4' });
          break;
        case 'airdrop':
          this.banners.push({ text: '', sub: 'Supply drop inbound', color: '#5ef2ff', t: 1.8 });
          break;
        case 'shoot':
          break;
      }
    }
  }

  update(dt: number) {
    for (const p of this.parts) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f;
      p.vy *= f;
    }
    this.parts = this.parts.filter((p) => p.life > 0);
    for (const f of this.floaters) {
      f.life -= dt;
      f.y -= 38 * dt;
    }
    this.floaters = this.floaters.filter((f) => f.life > 0);
    for (const a of this.arcs) a.life -= dt;
    this.arcs = this.arcs.filter((a) => a.life > 0);
    for (const d of this.decals) d.life -= dt;
    this.decals = this.decals.filter((d) => d.life > 0);
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.hurtPulse = Math.max(0, this.hurtPulse - dt);
    this.levelPulse = Math.max(0, this.levelPulse - dt);
    for (const b of this.banners) b.t -= dt;
    this.banners = this.banners.filter((b) => b.t > 0);
  }

  drawDecals(ctx: CanvasRenderingContext2D) {
    for (const d of this.decals) {
      ctx.globalAlpha = Math.min(1, d.life / 2) * 0.55;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 0.6, d.rot, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx: CanvasRenderingContext2D, sprites: SpriteCache) {
    // non-additive first
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      if (p.k === PK.Goo || p.k === PK.Chunk) {
        ctx.globalAlpha = Math.min(1, a * 1.6);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.k === PK.Smoke) {
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const a = Math.max(0, p.life / p.max);
      if (p.k === PK.Spark) {
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.k === PK.Ring) {
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 + a * 5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - a * a), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.k === PK.Flash) {
        ctx.globalAlpha = a;
        const g = sprites.glow(p.color);
        const s = p.size * 2.6;
        ctx.drawImage(g, p.x - s, p.y - s, s * 2, s * 2);
      }
    }
    for (const arc of this.arcs) {
      const a = arc.life / 0.16;
      ctx.globalAlpha = a;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = arc.color;
      ctx.lineWidth = 5;
      strokePts(ctx, arc.pts);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.8;
      strokePts(ctx, arc.pts);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  drawFloaters(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const f of this.floaters) {
      const a = Math.min(1, f.life * 4);
      const pop = f.crit ? 1 + Math.max(0, f.life - 0.6) * 3 : 1;
      ctx.globalAlpha = a;
      ctx.font = `800 ${(f.crit ? 13 : 9) * pop}px "Chakra Petch", system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,6,12,0.9)';
      ctx.strokeText(f.v, f.x, f.y);
      ctx.fillStyle = f.crit ? '#ffd34d' : '#ffffff';
      ctx.fillText(f.v, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

function strokePts(ctx: CanvasRenderingContext2D, pts: number[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

/** Turn a polyline into a crackly lightning bolt. */
function jitter(pts: number[]): number[] {
  const out: number[] = [pts[0], pts[1]];
  for (let i = 2; i < pts.length; i += 2) {
    const x0 = pts[i - 2];
    const y0 = pts[i - 1];
    const x1 = pts[i];
    const y1 = pts[i + 1];
    const n = Math.max(2, Math.floor(Math.hypot(x1 - x0, y1 - y0) / 14));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const off = k === n ? 0 : (Math.random() - 0.5) * 16;
      const nx = -(y1 - y0);
      const ny = x1 - x0;
      const l = Math.hypot(nx, ny) || 1;
      out.push(x0 + (x1 - x0) * t + (nx / l) * off, y0 + (y1 - y0) * t + (ny / l) * off);
    }
  }
  return out;
}

export function fmt(v: number): string {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e4) return (v / 1e3).toFixed(0) + 'K';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return Math.round(v).toString();
}
