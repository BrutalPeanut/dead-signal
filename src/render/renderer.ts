import type { Game } from '../sim/game';
import type { Enemy, Pickup } from '../sim/types';
import { bladePositions, bladesActive, weaponStats } from '../sim/weapons';
import { BOSS_DRAW, drawHero, SIGNAL } from './art';
import { Fx } from './fx';
import { Ground } from './ground';
import { SpriteCache, hexA, makeCanvas } from './sprites';

/** Target visible width (world units) on a portrait phone. Smaller = more zoomed in. */
const TARGET_VIEW = 360;

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  readonly sprites = new SpriteCache();
  readonly fx = new Fx();
  ground: Ground;
  dpr = 1;
  zoom = 1;
  cssW = 0;
  cssH = 0;
  camX = 0;
  camY = 0;
  time = 0;
  private scratch = makeCanvas(256, 256);
  private sctx = this.scratch.getContext('2d')!;
  private vignette: HTMLCanvasElement | null = null;
  joystick: { ox: number; oy: number; x: number; y: number } | null = null;
  /** Upper bound on pixel density; lowered automatically when frames run long. */
  dprCap = 2;
  private slowT = 0;
  private fastT = 0;

  /** Adaptive resolution: drop density after ~1.5s of slow frames, recover after ~8s of fast ones. */
  adapt(frameMs: number) {
    if (frameMs > 22) {
      this.slowT += frameMs / 1000;
      this.fastT = 0;
    } else if (frameMs < 15) {
      this.fastT += frameMs / 1000;
      this.slowT = Math.max(0, this.slowT - frameMs / 2000);
    }
    const native = Math.min(window.devicePixelRatio || 1, 2);
    if (this.slowT > 1.5 && this.dprCap > 1) {
      this.dprCap = Math.max(1, this.dprCap - 0.5);
      this.slowT = 0;
      this.resize();
    } else if (this.fastT > 8 && this.dprCap < native) {
      this.dprCap = Math.min(native, this.dprCap + 0.5);
      this.fastT = 0;
      this.resize();
    }
  }

  constructor(readonly canvas: HTMLCanvasElement, private game: Game) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.ground = new Ground(game.chapter.biome);
    this.camX = game.px;
    this.camY = game.py;
    this.resize();
  }

  setGame(g: Game) {
    this.game = g;
    this.ground = new Ground(g.chapter.biome);
    this.ground.setScale(this.zoom * this.dpr);
    this.camX = g.px;
    this.camY = g.py;
    this.applyView();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    // Fit TARGET_VIEW world units across the short axis, but never zoom out so far on wide
    // desktop screens that the hero becomes tiny.
    this.zoom = Math.max(Math.min(w, h) / TARGET_VIEW, 0.75);
    if (h > w) this.zoom = w / TARGET_VIEW;
    this.zoom = Math.min(this.zoom, 2.4);
    this.sprites.ensure(this.zoom * dpr);
    this.ground.setScale(this.zoom * dpr);
    this.vignette = null;
    this.applyView();
  }

  private applyView() {
    this.game.viewW = this.cssW / (2 * this.zoom);
    this.game.viewH = this.cssH / (2 * this.zoom);
  }

  render(dt: number) {
    const g = this.game;
    const ctx = this.ctx;
    this.time += dt;
    this.fx.consume(g.fx, g);
    g.fx.length = 0;
    this.fx.update(dt);

    // camera: snappy follow
    const k = 1 - Math.pow(0.0001, dt);
    this.camX += (g.px - this.camX) * k;
    this.camY += (g.py - this.camY) * k;
    const sh = this.fx.shake;
    const sx = sh ? (Math.random() - 0.5) * sh : 0;
    const sy = sh ? (Math.random() - 0.5) * sh : 0;

    const S = this.zoom * this.dpr;
    const halfW = this.cssW / (2 * this.zoom);
    const halfH = this.cssH / (2 * this.zoom);
    ctx.setTransform(S, 0, 0, S, this.canvas.width / 2 - (this.camX + sx) * S, this.canvas.height / 2 - (this.camY + sy) * S);
    ctx.imageSmoothingEnabled = true;

    this.ground.draw(ctx, this.camX, this.camY, halfW + 20, halfH + 20);
    this.fx.drawDecals(ctx);
    this.drawPools(ctx);
    this.drawField(ctx);
    this.drawTelegraphs(ctx);
    this.drawCage(ctx, false);
    this.drawPickups(ctx);
    this.drawShadows(ctx, halfW, halfH);
    this.drawActors(ctx, halfW, halfH);
    this.drawCage(ctx, true);
    this.drawProjectiles(ctx);
    this.drawEnemyShots(ctx);
    this.fx.drawParticles(ctx, this.sprites);
    this.drawPlayerBar(ctx);
    this.fx.drawFloaters(ctx);

    // screen space
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawIndicators(ctx);
    this.drawScreenFx(ctx);
    this.drawJoystick(ctx);
  }

  // ------------------------------------------------------------------ world layers

  private drawPools(ctx: CanvasRenderingContext2D) {
    const t = this.time;
    for (const p of this.game.pools) {
      const a = Math.min(1, p.life / 0.4) * Math.min(1, (p.maxLife - p.life) / 0.15 + 0.2);
      ctx.globalAlpha = a * (p.evo || this.game.pools.length > 14 ? 0.55 : 0.85);
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, p.evo ? '#fff2a8' : '#ffd36a');
      g.addColorStop(0.5, p.evo ? 'rgba(255,90,30,0.75)' : 'rgba(255,120,30,0.6)');
      g.addColorStop(1, 'rgba(255,60,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r, p.r * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      // licking flames
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const a2 = i * 1.26 + t * 2;
        const fx = p.x + Math.cos(a2) * p.r * 0.5;
        const fy = p.y + Math.sin(a2) * p.r * 0.4;
        const fl = (Math.sin(t * 13 + i * 3) + 1.5) * 3.5;
        ctx.fillStyle = 'rgba(255,170,60,0.55)';
        ctx.beginPath();
        ctx.moveTo(fx - 3, fy);
        ctx.quadraticCurveTo(fx, fy - fl * 2.4, fx + 3, fy);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  private drawField(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const w = g.weapons.find((x) => x.id === 'field');
    if (!w) return;
    const s = weaponStats(w);
    const r = s.area * g.areaMul;
    const t = this.time;
    const col = w.evolved ? '#b06bff' : '#43ffa4';
    const grad = ctx.createRadialGradient(g.px, g.py, r * 0.2, g.px, g.py, r);
    grad.addColorStop(0, hexA(col, 0));
    grad.addColorStop(0.75, hexA(col, 0.14));
    grad.addColorStop(1, hexA(col, 0.38));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(g.px, g.py, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = hexA(col, 0.6);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -t * 30 * (w.evolved ? -1 : 1);
    ctx.stroke();
    ctx.setLineDash([]);
    if (w.evolved) {
      // swirling accretion arms
      ctx.strokeStyle = hexA(col, 0.35);
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let k = 0; k <= 20; k++) {
          const f = k / 20;
          const a = t * 1.5 + i * 2.09 + f * 2.5;
          const rr = r * (1 - f * 0.85);
          const x = g.px + Math.cos(a) * rr;
          const y = g.py + Math.sin(a) * rr;
          if (k === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    }
  }

  private drawTelegraphs(ctx: CanvasRenderingContext2D) {
    for (const tg of this.game.telegraphs) {
      const prog = tg.total > 0 ? 1 - Math.max(0, tg.t) / tg.total : 1;
      if (tg.kind === 'circle') {
        ctx.fillStyle = 'rgba(255,40,80,0.16)';
        ctx.strokeStyle = 'rgba(255,60,90,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, tg.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,40,80,0.35)';
        ctx.beginPath();
        ctx.arc(tg.x, tg.y, Math.max(0, tg.r * prog), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(tg.x, tg.y);
        ctx.rotate(tg.a);
        if (tg.t > 0) {
          ctx.fillStyle = 'rgba(255,40,80,0.14)';
          ctx.fillRect(0, -tg.r, tg.len, tg.r * 2);
          ctx.fillStyle = 'rgba(255,40,80,0.32)';
          ctx.fillRect(0, -tg.r, tg.len * prog, tg.r * 2);
          ctx.strokeStyle = 'rgba(255,60,90,0.8)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(0, -tg.r, tg.len, tg.r * 2);
          if (tg.sweep !== 0) {
            // show sweep arc
            ctx.strokeStyle = 'rgba(255,60,90,0.4)';
            ctx.setLineDash([6, 6]);
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(0, tg.len * 0.6), 0, tg.sweep * tg.active, tg.sweep < 0);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        } else if (tg.active > 0) {
          ctx.globalCompositeOperation = 'lighter';
          const w = tg.r * (1 + Math.sin(this.time * 50) * 0.15);
          ctx.fillStyle = hexA(SIGNAL, 0.45);
          ctx.fillRect(0, -w * 1.6, tg.len, w * 3.2);
          ctx.fillStyle = '#ffd6f6';
          ctx.fillRect(0, -w * 0.5, tg.len, w);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.restore();
      }
    }
  }

  private drawCage(ctx: CanvasRenderingContext2D, front: boolean) {
    const c = this.game.cage;
    if (!c) return;
    const t = this.time;
    if (!front) {
      ctx.fillStyle = 'rgba(10,0,10,0.25)';
      ctx.beginPath();
      ctx.rect(c.x - 2000, c.y - 2000, 4000, 4000);
      ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2, true);
      ctx.fill();
      return;
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(SIGNAL, 0.35);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#ff9cec';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const rr = c.r + Math.sin(a * 17 + t * 9) * 2 + Math.sin(a * 5 - t * 4) * 1.5;
      const x = c.x + Math.cos(a) * rr;
      const y = c.y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // pylons
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = c.x + Math.cos(a) * c.r;
      const y = c.y + Math.sin(a) * c.r;
      ctx.fillStyle = '#2a2d35';
      ctx.fillRect(x - 3, y - 10, 6, 12);
      ctx.fillStyle = SIGNAL;
      ctx.fillRect(x - 2, y - 9, 4, 3);
    }
  }

  private drawPickups(ctx: CanvasRenderingContext2D) {
    const t = this.time;
    for (const p of this.game.pickups) {
      if (p.drop > 0) {
        this.drawAirdrop(ctx, p);
        continue;
      }
      switch (p.kind) {
        case 'xp': {
          // XP shards: the most important pickup, so they get the brightest, most distinct treatment:
          // saturated mint/cyan/violet with a dark outline, a white core, a halo and a twinkle.
          const tier = p.value >= 25 ? 2 : p.value >= 5 ? 1 : 0;
          const col = ['#3dffa0', '#38d6ff', '#c77dff'][tier];
          const s = [4.6, 5.6, 7][tier] + (tier === 2 ? Math.min(4, Math.log10(p.value + 1) * 1.5) : 0);
          const tw = 0.75 + 0.25 * Math.sin(t * 6 + p.x * 0.37 + p.y * 0.21);
          const y = p.y + Math.sin(t * 3 + p.x) * 0.8;
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = 0.75 * tw;
          const gl = this.sprites.glow(col);
          ctx.drawImage(gl, p.x - s * 2.6, y - s * 2.6, s * 5.2, s * 5.2);
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          ctx.beginPath();
          ctx.moveTo(p.x, y - s);
          ctx.lineTo(p.x + s * 0.68, y);
          ctx.lineTo(p.x, y + s);
          ctx.lineTo(p.x - s * 0.68, y);
          ctx.closePath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#05140c';
          ctx.stroke();
          ctx.fillStyle = col;
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.beginPath();
          ctx.moveTo(p.x, y - s * 0.8);
          ctx.lineTo(p.x + s * 0.3, y - s * 0.1);
          ctx.lineTo(p.x, y + s * 0.2);
          ctx.lineTo(p.x - s * 0.22, y - s * 0.1);
          ctx.closePath();
          ctx.fill();
          if (tw > 0.97) {
            // occasional sparkle
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(p.x - s * 1.4, y - s * 0.6);
            ctx.lineTo(p.x - s * 0.6, y - s * 0.6);
            ctx.moveTo(p.x - s, y - s);
            ctx.lineTo(p.x - s, y - s * 0.2);
            ctx.stroke();
          }
          break;
        }
        case 'gold': {
          const bob = Math.sin(t * 4 + p.x) * 1;
          ctx.fillStyle = '#b8841c';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + bob + 1, 4.5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffd34d';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + bob, 4.5, 4, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#8a5d10';
          ctx.lineWidth = 0.9;
          ctx.stroke();
          ctx.fillStyle = '#fff4b8';
          ctx.fillRect(p.x - 1.5, p.y + bob - 2.2, 1.4, 3.6);
          break;
        }
        case 'ration':
        case 'magnet':
        case 'emp':
          this.drawPowerup(ctx, p, t);
          break;
        case 'chest':
          this.drawChest(ctx, p.x, p.y, p.big, t);
          break;
      }
    }
  }

  private drawPowerup(ctx: CanvasRenderingContext2D, p: Pickup, t: number) {
    const bob = Math.sin(t * 3 + p.x) * 2;
    const col = p.kind === 'ration' ? '#43ffa4' : p.kind === 'magnet' ? '#ff4fd8' : '#ff8a2a';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6 + Math.sin(t * 5) * 0.2;
    ctx.drawImage(this.sprites.glow(col), p.x - 20, p.y - 20 + bob, 40, 40);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#120d14';
    if (p.kind === 'ration') {
      // tin can with green label + cross
      ctx.fillStyle = '#c9ced6';
      ctx.beginPath();
      ctx.roundRect(-6, -7, 12, 14, 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#2fbf75';
      ctx.fillRect(-6, -3, 12, 7);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -2.5, 2, 6);
      ctx.fillRect(-3, -0.5, 6, 2);
    } else if (p.kind === 'magnet') {
      ctx.lineWidth = 5.5;
      ctx.strokeStyle = '#120d14';
      ctx.beginPath();
      ctx.arc(0, 0, 5.5, Math.PI, 0, true);
      ctx.stroke();
      ctx.lineWidth = 3.6;
      ctx.strokeStyle = '#e8304f';
      ctx.stroke();
      ctx.fillStyle = '#e6e9ef';
      ctx.fillRect(-7.3, -2.5, 3.6, 3);
      ctx.fillRect(3.7, -2.5, 3.6, 3);
    } else {
      // Bomb: classic round black bomb with a fuse cap, curling fuse and a flickering spark.
      const body = ctx.createRadialGradient(-2.4, -1.6, 0.6, 0, 1, 8);
      body.addColorStop(0, '#6a6e78');
      body.addColorStop(0.45, '#2a2c33');
      body.addColorStop(1, '#0c0d10');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(0, 1, 7.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.ellipse(-2.6, -1.8, 1.6, 1, -0.6, 0, Math.PI * 2);
      ctx.fill();
      // fuse cap
      ctx.fillStyle = '#4a4e58';
      ctx.beginPath();
      ctx.roundRect(1.6, -7.6, 4.4, 3.4, 1);
      ctx.fill();
      ctx.stroke();
      // fuse
      ctx.strokeStyle = '#c8a46a';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(4, -7.6);
      ctx.quadraticCurveTo(6.5, -11, 4.6, -12.4);
      ctx.stroke();
      // spark
      const fl = 0.7 + 0.3 * Math.sin(t * 30 + p.x);
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,190,60,${0.9 * fl})`;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 6;
        const r = i % 2 ? 1.2 : 3.2 * fl;
        ctx.lineTo(4.6 + Math.cos(a) * r, -12.6 + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(4.6, -12.6, 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  private drawChest(ctx: CanvasRenderingContext2D, x: number, y: number, big: boolean, t: number) {
    const col = big ? '#ffd34d' : '#5ef2ff';
    const bob = Math.sin(t * 3) * 1.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7;
    ctx.drawImage(this.sprites.glow(col), x - 34, y - 34 + bob, 68, 68);
    // light beam
    const g = ctx.createLinearGradient(x, y - 90, x, y);
    g.addColorStop(0, hexA(col, 0));
    g.addColorStop(1, hexA(col, 0.4));
    ctx.fillStyle = g;
    ctx.fillRect(x - 6, y - 90, 12, 90);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.strokeStyle = '#120d14';
    ctx.lineWidth = 1.6;
    ctx.fillStyle = big ? '#7a4a12' : '#24324a';
    ctx.beginPath();
    ctx.roundRect(-11, -6, 22, 14, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = big ? '#a8661c' : '#35496a';
    ctx.beginPath();
    ctx.roundRect(-12, -12, 24, 8, 3);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(-11, -5, 22, 2);
    ctx.fillRect(-2.5, -8, 5, 7);
    ctx.restore();
  }

  private drawAirdrop(ctx: CanvasRenderingContext2D, p: Pickup) {
    const h = p.drop * 140;
    // landing marker
    ctx.strokeStyle = 'rgba(94,242,255,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, Math.max(0, 10 + p.drop * 6), 0, Math.PI * 2);
    ctx.stroke();
    // parachute + crate
    ctx.save();
    ctx.translate(p.x, p.y - h);
    ctx.fillStyle = '#e8eef5';
    ctx.strokeStyle = '#120d14';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -22, 16, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff7a1a';
    ctx.beginPath();
    ctx.arc(0, -22, 16, Math.PI * 1.33, Math.PI * 1.66);
    ctx.lineTo(0, -22);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-15, -22);
    ctx.lineTo(-4, -6);
    ctx.moveTo(15, -22);
    ctx.lineTo(4, -6);
    ctx.stroke();
    ctx.fillStyle = '#4a5468';
    ctx.fillRect(-6, -6, 12, 10);
    ctx.strokeRect(-6, -6, 12, 10);
    ctx.restore();
  }

  private drawShadows(ctx: CanvasRenderingContext2D, halfW: number, halfH: number) {
    const g = this.game;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath();
    for (const e of g.enemies) {
      if (Math.abs(e.x - this.camX) > halfW + 40 || Math.abs(e.y - this.camY) > halfH + 60) continue;
      const r = e.kind === 'boss' ? e.r * 1.1 : e.r * (e.elite ? 1.3 : 1);
      const fy = e.y + (e.kind === 'boss' ? e.r * 1.0 : e.kind === 'crawler' ? 6 : e.r * 1.05) * (e.elite ? 1.5 : 1);
      ctx.moveTo(e.x + r, fy);
      ctx.ellipse(e.x, fy, r, r * 0.38, 0, 0, Math.PI * 2);
    }
    ctx.moveTo(g.px + 10, g.py + 13);
    ctx.ellipse(g.px, g.py + 13, 10, 3.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private actorList: Enemy[] = [];

  private drawActors(ctx: CanvasRenderingContext2D, halfW: number, halfH: number) {
    const g = this.game;
    const list = this.actorList;
    list.length = 0;
    for (const e of g.enemies) {
      if (Math.abs(e.x - this.camX) > halfW + 50 || Math.abs(e.y - this.camY) > halfH + 70) continue;
      list.push(e);
    }
    list.sort((a, b) => a.y - b.y);
    let heroDrawn = false;
    for (const e of list) {
      if (!heroDrawn && e.y > g.py) {
        this.drawPlayer(ctx);
        heroDrawn = true;
      }
      this.drawEnemy(ctx, e);
    }
    if (!heroDrawn) this.drawPlayer(ctx);
    this.drawBlades(ctx);
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
    if (e.kind === 'boss') {
      this.drawBoss(ctx, e);
      return;
    }
    const sp = this.sprites.get(e.kind, e.anim);
    const sc = e.elite ? 1.3 : 1;
    if (e.elite) {
      const pulse = (Math.sin(this.time * 5 + e.id) + 1) / 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45 + pulse * 0.25;
      const s = e.r * 3.2;
      ctx.drawImage(this.sprites.glow('#ffc94d'), e.x - s, e.y - s - 4, s * 2, s * 2);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(e.face * sc, sc);
    ctx.drawImage(sp.img, sp.ox, sp.oy, sp.w, sp.h);
    if (e.flash > 0) {
      // translucent white overlay: readable hit feedback without turning tanky targets into blobs
      ctx.globalAlpha = e.elite ? 0.25 : 0.7;
      ctx.drawImage(sp.white, sp.ox, sp.oy, sp.w, sp.h);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (e.burn > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.6;
      ctx.drawImage(this.sprites.glow('#ff8a1f'), e.x - 10, e.y - 18, 20, 20);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    if (e.elite) this.bar(ctx, e.x, e.y - e.r * 2.2 - 6, 30, e.hp / e.maxHp, '#ffc94d');
  }

  private drawBoss(ctx: CanvasRenderingContext2D, b: Enemy) {
    const draw = BOSS_DRAW[b.boss!];
    const flash = b.flash > 0;
    // telegraph pre-glow when winding up
    this.drawTinted(ctx, b.x, b.y, 190, 210, b.face, flash ? 'rgba(255,255,255,0.75)' : null, (c) =>
      draw(c, { t: b.anim, state: b.state, phase2: b.phase2 }),
    );
  }

  private drawPlayer(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const hurt = g.hurtT > 0;
    if (this.fx.levelPulse > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.fx.levelPulse;
      ctx.drawImage(this.sprites.glow('#5ef2ff'), g.px - 40, g.py - 50, 80, 80);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // ground ring so the courier never gets lost in a swarm
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const rg = ctx.createRadialGradient(g.px, g.py + 13, 4, g.px, g.py + 13, 22);
    rg.addColorStop(0, 'rgba(94,242,255,0.28)');
    rg.addColorStop(1, 'rgba(94,242,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.ellipse(g.px, g.py + 13, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94,242,255,0.55)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(g.px, g.py + 13, 15, 5.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    const pose = { t: this.time, moving: g.moving, aim: g.aim };
    if (hurt) {
      this.drawTinted(ctx, g.px, g.py, 100, 96, 1, 'rgba(255,50,70,0.5)', (c) => drawHero(c, pose));
    } else {
      ctx.save();
      ctx.translate(g.px, g.py);
      drawHero(ctx, pose);
      ctx.restore();
    }
  }

  /** Draw via the scratch canvas so a colour tint only touches the character. */
  private drawTinted(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    face: number,
    tint: string | null,
    fn: (c: CanvasRenderingContext2D) => void,
  ) {
    if (!tint) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(face, 1);
      fn(ctx);
      ctx.restore();
      return;
    }
    const S = this.zoom * this.dpr;
    const pw = Math.ceil(w * S);
    const ph = Math.ceil(h * S);
    if (this.scratch.width < pw || this.scratch.height < ph) {
      this.scratch.width = Math.max(this.scratch.width, pw);
      this.scratch.height = Math.max(this.scratch.height, ph);
    }
    const c = this.sctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, pw, ph);
    c.setTransform(S * face, 0, 0, S, pw / 2, ph * 0.55);
    fn(c);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalCompositeOperation = 'source-atop';
    c.fillStyle = tint;
    c.fillRect(0, 0, pw, ph);
    c.globalCompositeOperation = 'source-over';
    ctx.drawImage(this.scratch, 0, 0, pw, ph, x - w / 2, y - h * 0.55, w, h);
  }

  private drawBlades(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const w = g.weapons.find((x) => x.id === 'blades');
    if (!w || !bladesActive(w)) return;
    const pos = bladePositions(g, w, []);
    const r = 14 * (w.evolved ? 1.3 : 1) * Math.sqrt(g.areaMul);
    const col = w.evolved ? '#ffe9a8' : '#ffb84d';
    for (let k = 0; k < pos.length; k += 2) {
      const x = pos[k];
      const y = pos[k + 1];
      const a = Math.atan2(y - g.py, x - g.px) + Math.PI / 2;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(this.sprites.glow(col), x - r * 2, y - r * 2, r * 4, r * 4);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a + this.time * (w.evolved ? 20 : 0));
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = '#2a1600';
      ctx.beginPath();
      if (w.evolved) {
        // saw disc: toothed steel ring with a hot core
        for (let i = 0; i < 16; i++) {
          const aa = (i / 16) * Math.PI * 2;
          const rr = i % 2 ? r * 0.72 : r;
          ctx.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = '#ffb84d';
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff2c8';
        ctx.beginPath();
        ctx.arc(0, 0, Math.max(0, r * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.moveTo(-r, 0);
        ctx.quadraticCurveTo(0, -r * 1.1, r, 0);
        ctx.quadraticCurveTo(0, -r * 0.4, -r, 0);
        ctx.fillStyle = col;
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    ctx.globalCompositeOperation = 'lighter';
    for (const p of g.projectiles) {
      switch (p.kind) {
        case 'bolt': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const l = 14;
          ctx.drawImage(this.sprites.glow('#5ef2ff'), p.x - 9, p.y - 9, 18, 18);
          ctx.strokeStyle = '#bffbff';
          ctx.lineWidth = p.r * 0.9;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * l, p.y - (p.vy / sp) * l);
          ctx.stroke();
          break;
        }
        case 'rail': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const l = 46;
          ctx.strokeStyle = 'rgba(94,242,255,0.5)';
          ctx.lineWidth = p.r * 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - (p.vx / sp) * l, p.y - (p.vy / sp) * l);
          ctx.stroke();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = p.r * 0.7;
          ctx.stroke();
          break;
        }
        case 'shell':
        case 'canister': {
          const k = 1 - Math.max(0, p.life) / p.maxLife;
          const z = Math.sin(k * Math.PI) * 46;
          const col = p.kind === 'shell' ? '#ff6a3d' : '#ff9a1f';
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + 4, 4, 1.6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.save();
          ctx.translate(p.x, p.y - z);
          ctx.rotate(p.spin);
          ctx.fillStyle = p.kind === 'shell' ? '#3a3f4a' : '#9a3b14';
          ctx.strokeStyle = '#120d14';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(-5, -3, 10, 6, 2.5);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(this.sprites.glow(col), p.x - 8, p.y - z - 8, 16, 16);
          break;
        }
        case 'bomblet':
          ctx.drawImage(this.sprites.glow('#ffb03d'), p.x - 8, p.y - 8, 16, 16);
          break;
        case 'disc': {
          const r = p.r;
          const col = p.evo ? '#ff8ff0' : '#ff4fd8';
          ctx.drawImage(this.sprites.glow(col), p.x - r * 2.4, p.y - r * 2.4, r * 4.8, r * 4.8);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.spin);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0, r * 0.75), 0, Math.PI * 1.4);
          ctx.stroke();
          ctx.strokeStyle = col;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(0, r * 0.75), Math.PI * 1.5, Math.PI * 1.9);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'drill': {
          const a = Math.atan2(p.vy, p.vx);
          const r = p.r;
          ctx.drawImage(this.sprites.glow('#ffe14d'), p.x - r * 2.2, p.y - r * 2.2, r * 4.4, r * 4.4);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(a);
          ctx.globalCompositeOperation = 'source-over';
          ctx.fillStyle = '#c9a21c';
          ctx.strokeStyle = '#120d14';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(r * 1.4, 0);
          ctx.lineTo(-r * 0.6, -r * 0.7);
          ctx.lineTo(-r * 0.6, r * 0.7);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = '#fff4b8';
          for (let i = 0; i < 3; i++) {
            const o = ((p.spin * 0.3 + i / 3) % 1) * r * 1.8 - r * 0.5;
            ctx.beginPath();
            ctx.moveTo(o, -r * 0.6 * (1 - (o + r * 0.6) / (r * 2)));
            ctx.lineTo(o + 2, r * 0.6 * (1 - (o + r * 0.6) / (r * 2)));
            ctx.stroke();
          }
          ctx.restore();
          ctx.globalCompositeOperation = 'lighter';
          break;
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawEnemyShots(ctx: CanvasRenderingContext2D) {
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.game.shots) {
      const col = s.kind === 'acid' ? '#9dff4a' : '#ff4fd8';
      ctx.drawImage(this.sprites.glow(col), s.x - s.r * 2.6, s.y - s.r * 2.6, s.r * 5.2, s.r * 5.2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const s of this.game.shots) {
      ctx.fillStyle = s.kind === 'acid' ? '#d4ff8a' : '#ffc4f3';
      ctx.strokeStyle = '#120d14';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(0, s.r * 0.7), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  private bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, col: string) {
    ctx.fillStyle = 'rgba(10,6,12,0.8)';
    ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
    ctx.fillStyle = col;
    ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), 3);
  }

  private drawPlayerBar(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const f = g.hp / g.maxHp;
    this.bar(ctx, g.px, g.py + 18, 26, f, f > 0.5 ? '#43ffa4' : f > 0.25 ? '#ffc94d' : '#ff3b5c');
  }

  // ------------------------------------------------------------------ screen space

  private drawIndicators(ctx: CanvasRenderingContext2D) {
    const g = this.game;
    const halfW = this.cssW / 2;
    const halfH = this.cssH / 2;
    const items: [number, number, string][] = [];
    for (const p of g.pickups) {
      if (p.kind === 'chest') items.push([p.x, p.y, p.big ? '#ffd34d' : '#5ef2ff']);
      else if (p.kind === 'emp' || p.kind === 'magnet') items.push([p.x, p.y, '#ffffff']);
      else if (p.kind === 'ration' && g.hp < g.maxHp * 0.6) items.push([p.x, p.y, '#43ffa4']);
    }
    // only the closest few, so the edges don't fill with arrows
    items.sort((a, b) => (a[0] - g.px) ** 2 + (a[1] - g.py) ** 2 - ((b[0] - g.px) ** 2 + (b[1] - g.py) ** 2));
    items.length = Math.min(items.length, 5);
    for (const e of g.enemies) if (e.elite) items.push([e.x, e.y, '#ffc94d']);
    for (const [wx, wy, col] of items) {
      const sx = (wx - this.camX) * this.zoom;
      const sy = (wy - this.camY) * this.zoom;
      if (Math.abs(sx) < halfW - 10 && Math.abs(sy) < halfH - 10) continue;
      const a = Math.atan2(sy, sx);
      const m = 22;
      const k = Math.min((halfW - m) / Math.abs(Math.cos(a) || 1e-6), (halfH - m) / Math.abs(Math.sin(a) || 1e-6));
      const x = halfW + Math.cos(a) * k;
      const y = halfH + Math.sin(a) * k;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = col;
      ctx.strokeStyle = '#120d14';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(10, 0);
      ctx.lineTo(-6, -8);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-6, 8);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    }
  }

  private drawScreenFx(ctx: CanvasRenderingContext2D) {
    const w = this.cssW;
    const h = this.cssH;
    if (!this.vignette) {
      const v = makeCanvas(256, 256);
      const x = v.getContext('2d')!;
      const gr = x.createRadialGradient(128, 128, 60, 128, 128, 182);
      gr.addColorStop(0, 'rgba(0,0,0,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      x.fillStyle = gr;
      x.fillRect(0, 0, 256, 256);
      this.vignette = v;
    }
    ctx.drawImage(this.vignette, 0, 0, w, h);
    const g = this.game;
    const low = g.hp / g.maxHp;
    const hurt = this.fx.hurtPulse / 0.35;
    const danger = Math.max(hurt * 0.6, low < 0.3 ? (0.3 - low) * 2 * (0.6 + Math.sin(this.time * 6) * 0.4) : 0);
    if (danger > 0.01) {
      ctx.globalAlpha = Math.min(0.85, danger);
      const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      gr.addColorStop(0, 'rgba(255,0,40,0)');
      gr.addColorStop(1, 'rgba(255,0,40,0.75)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    if (this.fx.flash > 0) {
      ctx.globalAlpha = Math.min(0.7, this.fx.flash);
      ctx.fillStyle = this.fx.flashColor;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }

  private drawJoystick(ctx: CanvasRenderingContext2D) {
    const j = this.joystick;
    if (!j) return;
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.arc(j.ox, j.oy, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(94,242,255,0.5)';
    ctx.beginPath();
    ctx.arc(j.x, j.y, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

