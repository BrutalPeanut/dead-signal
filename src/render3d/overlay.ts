import type { Game } from '../sim/game';
import type { Fx } from '../render/fx';

/**
 * Screen-space layer drawn on a transparent 2D canvas over the WebGL view: damage numbers,
 * health bars, off-screen arrows, tutorial pointer, hurt/flash overlays and the thumb pad.
 * Same art as the 2D renderer; world points are projected through the 3D camera.
 */

export type Project = (x: number, y: number, h: number) => { x: number; y: number; ok: boolean };

export interface OverlayState {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  dpr: number;
  time: number;
  game: Game;
  fx: Fx;
  project: Project;
  joystick: { ox: number; oy: number; x: number; y: number } | null;
  joystickFixed: boolean;
  padIdle: { x: number; y: number } | null;
  guide: { x: number; y: number } | null;
}

let vignette: HTMLCanvasElement | null = null;

export function drawOverlay(s: OverlayState) {
  const { ctx } = s;
  ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
  ctx.clearRect(0, 0, s.w, s.h);
  drawBars(s);
  drawFloaters(s);
  drawGuide(s);
  drawIndicators(s);
  drawScreenFx(s);
  drawJoystick(s);
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, frac: number, col: string) {
  ctx.fillStyle = 'rgba(10,6,12,0.8)';
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 5);
  ctx.fillStyle = col;
  ctx.fillRect(x - w / 2, y, w * Math.max(0, frac), 3);
}

function drawBars(s: OverlayState) {
  const g = s.game;
  for (const e of g.enemies) {
    if (!e.elite) continue;
    const p = s.project(e.x, e.y, e.r * 2.2 * 1.3 + 22);
    if (p.ok) bar(s.ctx, p.x, p.y, 34, e.hp / e.maxHp, '#ffc94d');
  }
  const f = g.hp / g.maxHp;
  const p = s.project(g.px, g.py + 12, 0);
  if (p.ok) bar(s.ctx, p.x, p.y + 4, 30, f, f > 0.5 ? '#43ffa4' : f > 0.25 ? '#ffc94d' : '#ff3b5c');
}

function drawFloaters(s: OverlayState) {
  const ctx = s.ctx;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const f of s.fx.floaters) {
    // floaters rise in sim y (screen up); lift them into the air instead
    const p = s.project(f.x, f.y, 26);
    if (!p.ok) continue;
    const a = Math.min(1, f.life * 4);
    const pop = f.crit ? 1 + Math.max(0, f.life - 0.6) * 3 : 1;
    ctx.globalAlpha = a;
    ctx.font = `800 ${(f.crit ? 15 : 11) * pop}px "Chakra Petch", system-ui, sans-serif`;
    ctx.lineWidth = 3.4;
    ctx.strokeStyle = 'rgba(10,6,12,0.9)';
    ctx.strokeText(f.v, p.x, p.y);
    ctx.fillStyle = f.crit ? '#ffd34d' : '#ffffff';
    ctx.fillText(f.v, p.x, p.y);
  }
  ctx.globalAlpha = 1;
}

function arrow(ctx: CanvasRenderingContext2D, x: number, y: number, a: number, col: string, grow = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.fillStyle = col;
  ctx.strokeStyle = '#120d14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(10 + grow, 0);
  ctx.lineTo(-6, -8);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-6, 8);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** Clamp a projected point to the screen edge, along the ray from the screen centre. */
function edge(s: OverlayState, px: number, py: number, m: number) {
  const hw = s.w / 2, hh = s.h / 2;
  const dx = px - hw, dy = py - hh;
  const a = Math.atan2(dy, dx);
  const k = Math.min((hw - m) / Math.abs(Math.cos(a) || 1e-6), (hh - m) / Math.abs(Math.sin(a) || 1e-6));
  return { x: hw + Math.cos(a) * k, y: hh + Math.sin(a) * k, a };
}

function drawIndicators(s: OverlayState) {
  const g = s.game;
  const items: [number, number, string][] = [];
  for (const p of g.pickups) {
    if (p.kind === 'chest') items.push([p.x, p.y, p.big ? '#ffd34d' : '#5ef2ff']);
    else if (p.kind === 'emp' || p.kind === 'magnet') items.push([p.x, p.y, '#ffffff']);
    else if (p.kind === 'ration' && g.hp < g.maxHp * 0.6) items.push([p.x, p.y, '#43ffa4']);
  }
  items.sort((a, b) => (a[0] - g.px) ** 2 + (a[1] - g.py) ** 2 - ((b[0] - g.px) ** 2 + (b[1] - g.py) ** 2));
  items.length = Math.min(items.length, 5);
  for (const e of g.enemies) if (e.elite) items.push([e.x, e.y, '#ffc94d']);
  for (const [wx, wy, col] of items) {
    const p = s.project(wx, wy, 0);
    if (p.ok && p.x > 10 && p.x < s.w - 10 && p.y > 10 && p.y < s.h - 10) continue;
    // behind the camera: point straight away from the courier instead
    let px = p.x, py = p.y;
    if (!p.ok) {
      const c = s.project(g.px, g.py, 0);
      px = c.x + (wx - g.px) * 10;
      py = c.y + (wy - g.py) * 10;
    }
    const e = edge(s, px, py, 22);
    arrow(s.ctx, e.x, e.y, e.a, col);
  }
}

function drawGuide(s: OverlayState) {
  const t = s.guide;
  if (!t) return;
  const ctx = s.ctx;
  const p = s.project(t.x, t.y, 0);
  const pulse = (Math.sin(s.time * 6) + 1) / 2;
  const m = 26;
  const on = p.ok && p.x > m && p.x < s.w - m && p.y > m + 60 && p.y < s.h - m;
  ctx.save();
  ctx.strokeStyle = '#ffd34d';
  ctx.fillStyle = '#ffd34d';
  ctx.shadowColor = '#ffd34d';
  ctx.shadowBlur = 10;
  if (on) {
    ctx.globalAlpha = 0.8;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 20 + pulse * 7, (20 + pulse * 7) * 0.62, 0, 0, Math.PI * 2);
    ctx.stroke();
    const top = s.project(t.x, t.y, 34);
    const by = top.y - 10 - pulse * 6;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(p.x - 9, by - 8);
    ctx.lineTo(p.x, by + 2);
    ctx.lineTo(p.x + 9, by - 8);
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  } else {
    const c = s.project(s.game.px, s.game.py, 0);
    const e = edge(s, p.ok ? p.x : c.x + (t.x - s.game.px) * 10, p.ok ? p.y : c.y + (t.y - s.game.py) * 10, m);
    ctx.translate(e.x, e.y);
    ctx.rotate(e.a);
    ctx.beginPath();
    ctx.moveTo(10 + pulse * 4, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawScreenFx(s: OverlayState) {
  const { ctx, w, h } = s;
  if (!vignette) {
    const v = document.createElement('canvas');
    v.width = v.height = 256;
    const x = v.getContext('2d')!;
    const gr = x.createRadialGradient(128, 128, 60, 128, 128, 182);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.55)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
    vignette = v;
  }
  ctx.drawImage(vignette, 0, 0, w, h);
  const g = s.game;
  const low = g.hp / g.maxHp;
  const hurt = s.fx.hurtPulse / 0.35;
  const danger = Math.max(hurt * 0.6, low < 0.3 ? (0.3 - low) * 2 * (0.6 + Math.sin(s.time * 6) * 0.4) : 0);
  if (danger > 0.01) {
    ctx.globalAlpha = Math.min(0.85, danger);
    const gr = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    gr.addColorStop(0, 'rgba(255,0,40,0)');
    gr.addColorStop(1, 'rgba(255,0,40,0.75)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
  if (s.fx.flash > 0) {
    ctx.globalAlpha = Math.min(0.7, s.fx.flash);
    ctx.fillStyle = s.fx.flashColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }
}

function drawJoystick(s: OverlayState) {
  const ctx = s.ctx;
  const fixed = s.padIdle ?? (s.joystick && s.joystickFixed ? { x: s.joystick.ox, y: s.joystick.oy } : null);
  if (fixed) {
    const k = s.joystick ?? { ox: fixed.x, oy: fixed.y, x: fixed.x, y: fixed.y };
    const active = !!s.joystick;
    ctx.save();
    ctx.globalAlpha = active ? 0.8 : 0.5;
    ctx.fillStyle = 'rgba(10,14,20,0.45)';
    ctx.strokeStyle = 'rgba(200,215,235,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fixed.x, fixed.y, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,230,245,0.75)';
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      ctx.save();
      ctx.translate(fixed.x + Math.cos(a) * 44, fixed.y + Math.sin(a) * 44);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(-3, -6);
      ctx.lineTo(-3, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = active ? 0.95 : 0.6;
    ctx.fillStyle = active ? 'rgba(255,138,31,0.85)' : 'rgba(94,242,255,0.45)';
    ctx.strokeStyle = active ? '#ffc070' : 'rgba(200,250,255,0.8)';
    ctx.beginPath();
    ctx.arc(k.x, k.y, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    return;
  }
  const j = s.joystick;
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
