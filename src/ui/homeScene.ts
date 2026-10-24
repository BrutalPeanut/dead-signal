import { BOSS_DRAW, ENEMY_DRAW, drawHero } from '../render/art';
import { Ground } from '../render/ground';
import { getChapter } from '../sim/chapters';

/**
 * The hero banner on the home screen: a small, endlessly looping diorama of the selected sector.
 * The courier holds the line in front of the sector's final boss while infected shamble in from
 * both sides and get dropped. Pure eye candy, drawn with the same art code as the game.
 */
interface Walker {
  kind: string;
  x: number;
  y: number;
  dir: number;
  ph: number;
  speed: number;
  hp: number;
  flash: number;
  dying: number;
}

interface Bolt {
  x: number;
  y: number;
  tx: number;
  ty: number;
  t: number;
}

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  c: string;
}

const W = 230; // stage width in world units; the stage keeps a W:H aspect ratio
const H = 150;

export class HomeScene {
  canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private sector = -1;
  private ground: Ground | null = null;
  private walkers: Walker[] = [];
  private bolts: Bolt[] = [];
  private puffs: Puff[] = [];
  private rain: { x: number; y: number; s: number }[] = [];
  private t = 0;
  private shootT = 0;
  private aim = 0;
  private boss: 'warden' | 'hive' | 'colossus' = 'warden';
  private dpr = Math.min(window.devicePixelRatio || 1, 2);

  constructor() {
    this.canvas.className = 'home-scene';
    for (let i = 0; i < 70; i++) this.rain.push({ x: Math.random() * W, y: Math.random() * H, s: 0.6 + Math.random() * 0.8 });
  }

  setSector(i: number) {
    if (i === this.sector) return;
    this.sector = i;
    const ch = getChapter(i);
    this.ground = new Ground(ch.biome);
    this.boss = ch.finalBoss;
    this.walkers = [];
    for (let k = 0; k < 6; k++) this.spawn(true);
  }

  private spawn(scatter = false) {
    const kinds = Object.keys(ENEMY_DRAW);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const startX = dir > 0 ? -20 : W + 20;
    this.walkers.push({
      kind: kinds[Math.floor(Math.random() * kinds.length)],
      x: scatter ? (dir > 0 ? 10 + Math.random() * 70 : W - 10 - Math.random() * 70) : startX,
      y: 96 + Math.random() * 44,
      dir,
      ph: Math.random() * 6,
      speed: 14 + Math.random() * 10,
      hp: 2 + Math.floor(Math.random() * 3),
      flash: 0,
      dying: 0,
    });
  }

  tick(dt: number) {
    const c = this.canvas;
    if (!c.isConnected) return;
    const cw = c.clientWidth;
    const ch = c.clientHeight;
    if (!cw || !ch) return;
    if (c.width !== Math.round(cw * this.dpr) || c.height !== Math.round(ch * this.dpr)) {
      c.width = Math.round(cw * this.dpr);
      c.height = Math.round(ch * this.dpr);
    }
    this.t += dt;
    const k = Math.min((ch * this.dpr) / H, (cw * this.dpr) / W); // fit the whole stage
    const ox = (c.width / k - W) / 2; // centre the stage on any aspect
    const x = this.ctx;
    const oy = c.height / k - H; // extra height goes above (sky)
    x.setTransform(k, 0, 0, k, ox * k, oy * k);
    this.ground?.setScale(k);
    const left = -ox;
    const right = W + ox;
    this.ground?.draw(x, (left + right) / 2, (H - oy) / 2, (right - left) / 2 + 4, (H + oy) / 2 + 4);

    // sky fade at the top so the scene melts into the page
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, 'rgba(11,13,18,0.97)');
    sky.addColorStop(0.3, 'rgba(11,13,18,0.6)');
    sky.addColorStop(0.5, 'rgba(11,13,18,0.25)');
    sky.addColorStop(0.7, 'rgba(11,13,18,0.05)');
    sky.addColorStop(1, 'rgba(11,13,18,0.75)');
    x.fillStyle = sky;
    x.fillRect(left, -oy, right - left, H + oy);

    // looming boss in the haze
    const bx = W * 0.79;
    const by = 90;
    x.save();
    x.translate(bx, by);
    const breathe = 1 + Math.sin(this.t * 1.3) * 0.015;
    x.scale(-0.92 * breathe, 0.92 * breathe);
    x.globalAlpha = 0.92;
    BOSS_DRAW[this.boss](x, { t: this.t, state: 0, phase2: false });
    x.restore();
    x.globalAlpha = 1;
    // haze over the boss for depth
    const haze = x.createLinearGradient(0, 40, 0, 120);
    haze.addColorStop(0, 'rgba(20,10,30,0.15)');
    haze.addColorStop(1, 'rgba(20,10,30,0.55)');
    x.fillStyle = haze;
    x.fillRect(W * 0.5, 0, W * 0.5 + ox, 125);
    // signal rings from the boss
    x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const r = ((this.t * 0.5 + i / 3) % 1) * 90;
      x.strokeStyle = `rgba(255,59,212,${0.35 * (1 - r / 90)})`;
      x.lineWidth = 1.5;
      x.beginPath();
      x.arc(bx, by - 20, r, 0, Math.PI * 2);
      x.stroke();
    }
    x.globalCompositeOperation = 'source-over';

    // walkers
    const hx = W * 0.4;
    const hy = 116;
    for (const w of this.walkers) {
      if (w.dying > 0) continue;
      w.ph += dt * (w.speed / 7);
      w.x += w.dir * w.speed * dt;
      if (w.flash > 0) w.flash -= dt;
    }
    // courier shoots the closest walker
    this.shootT -= dt;
    let target: Walker | null = null;
    let bd = 1e9;
    for (const w of this.walkers) {
      if (w.dying > 0) continue;
      const d = Math.abs(w.x - hx);
      if (d < bd && d < 120) {
        bd = d;
        target = w;
      }
    }
    if (target) {
      const ta = Math.atan2(target.y - 6 - (hy - 7), target.x - hx);
      this.aim += Math.atan2(Math.sin(ta - this.aim), Math.cos(ta - this.aim)) * Math.min(1, dt * 12);
      if (this.shootT <= 0) {
        this.shootT = 0.32;
        this.bolts.push({ x: hx + Math.cos(this.aim) * 14, y: hy - 7 + Math.sin(this.aim) * 14, tx: target.x, ty: target.y - 6, t: 0 });
      }
    }
    for (const b of this.bolts) {
      b.t += dt * 6;
      if (b.t >= 1) {
        const hit = this.walkers.find((w) => w.dying <= 0 && Math.abs(w.x - b.tx) < 14 && Math.abs(w.y - 6 - b.ty) < 14);
        if (hit) {
          hit.hp--;
          hit.flash = 0.08;
          hit.x -= hit.dir * 3;
          if (hit.hp <= 0) {
            hit.dying = 1;
            for (let i = 0; i < 12; i++) {
              const a = Math.random() * Math.PI * 2;
              const s = 20 + Math.random() * 50;
              this.puffs.push({ x: hit.x, y: hit.y - 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.6, c: i % 3 ? '#6b2350' : '#3dffa0' });
            }
          }
        }
      }
    }
    this.bolts = this.bolts.filter((b) => b.t < 1);
    this.walkers = this.walkers.filter((w) => w.dying === 0 && w.x > -40 && w.x < W + 40 && !(w.dir > 0 ? w.x > hx - 8 : w.x < hx + 8));
    while (this.walkers.length < 6) this.spawn();

    // draw actors sorted by depth, hero included
    const actors: { y: number; draw: () => void }[] = this.walkers.map((w) => ({
      y: w.y,
      draw: () => {
        x.fillStyle = 'rgba(0,0,0,0.35)';
        x.beginPath();
        x.ellipse(w.x, w.y + 11, 9, 3, 0, 0, Math.PI * 2);
        x.fill();
        x.save();
        x.translate(w.x, w.y);
        x.scale(w.dir, 1);
        ENEMY_DRAW[w.kind](x, w.ph);
        x.restore();
        if (w.flash > 0) {
          x.globalCompositeOperation = 'lighter';
          x.fillStyle = 'rgba(255,255,255,0.35)';
          x.beginPath();
          x.arc(w.x, w.y - 6, 12, 0, Math.PI * 2);
          x.fill();
          x.globalCompositeOperation = 'source-over';
        }
      },
    }));
    actors.push({
      y: hy,
      draw: () => {
        // glow ring under the courier
        const g = x.createRadialGradient(hx, hy + 12, 2, hx, hy + 12, 26);
        g.addColorStop(0, 'rgba(94,242,255,0.45)');
        g.addColorStop(1, 'rgba(94,242,255,0)');
        x.fillStyle = g;
        x.beginPath();
        x.ellipse(hx, hy + 12, 26, 9, 0, 0, Math.PI * 2);
        x.fill();
        x.fillStyle = 'rgba(0,0,0,0.4)';
        x.beginPath();
        x.ellipse(hx, hy + 12, 10, 3.5, 0, 0, Math.PI * 2);
        x.fill();
        x.save();
        x.translate(hx, hy);
        x.scale(1.25, 1.25);
        drawHero(x, { t: this.t, moving: false, aim: this.aim });
        x.restore();
      },
    });
    actors.sort((a, b) => a.y - b.y);
    for (const a of actors) a.draw();

    // bolts + puffs (additive)
    x.globalCompositeOperation = 'lighter';
    for (const b of this.bolts) {
      const px = b.x + (b.tx - b.x) * b.t;
      const py = b.y + (b.ty - b.y) * b.t;
      const ang = Math.atan2(b.ty - b.y, b.tx - b.x);
      x.strokeStyle = '#bffbff';
      x.lineWidth = 2.2;
      x.lineCap = 'round';
      x.beginPath();
      x.moveTo(px, py);
      x.lineTo(px - Math.cos(ang) * 9, py - Math.sin(ang) * 9);
      x.stroke();
      x.fillStyle = 'rgba(94,242,255,0.35)';
      x.beginPath();
      x.arc(px, py, 4, 0, Math.PI * 2);
      x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    for (const p of this.puffs) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 80 * dt;
      x.globalAlpha = Math.max(0, p.life / 0.6);
      x.fillStyle = p.c;
      x.beginPath();
      x.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      x.fill();
    }
    x.globalAlpha = 1;
    this.puffs = this.puffs.filter((p) => p.life > 0);

    // rain
    x.strokeStyle = 'rgba(180,210,255,0.18)';
    x.lineWidth = 0.6;
    x.beginPath();
    for (const r of this.rain) {
      r.y += 160 * r.s * dt;
      r.x -= 30 * r.s * dt;
      if (r.y > H) {
        r.y = -4;
        r.x = left + Math.random() * (right - left + 40);
      }
      x.moveTo(r.x, r.y);
      x.lineTo(r.x + 2, r.y - 7 * r.s);
    }
    x.stroke();

    // bottom fade into the page
    const fade = x.createLinearGradient(0, H * 0.82, 0, H);
    fade.addColorStop(0, 'rgba(11,13,18,0)');
    fade.addColorStop(1, 'rgba(11,13,18,1)');
    x.fillStyle = fade;
    x.fillRect(left, H * 0.82, right - left, H * 0.18 + 1);
  }
}
