import type { Game } from '../sim/game';

/**
 * Render interpolation. The sim steps at a fixed 60 Hz; a 120/144/165 Hz monitor draws two or
 * three frames per step, some showing a step of motion and some none, which reads as shaky
 * movement. Before each step we remember where everything was; at draw time positions are
 * blended between the last two steps by how far we are into the next one, then put back, so the
 * sim never sees the blended values.
 */
type Pt = { x: number; y: number; _ix?: number; _iy?: number };
const LISTS = ['enemies', 'projectiles', 'shots', 'pickups'] as const;

export class Interp {
  private ppx = 0;
  private ppy = 0;
  private saved: number[] = [];
  private savedObjs: Pt[] = [];
  private spx = 0;
  private spy = 0;
  private applied = false;

  /** Call right before every g.step(). */
  capture(g: Game) {
    this.ppx = g.px;
    this.ppy = g.py;
    for (const k of LISTS) for (const o of g[k] as Pt[]) {
      o._ix = o.x;
      o._iy = o.y;
    }
  }

  /** Blend positions for drawing: a = 0 → previous step, 1 → current step. */
  apply(g: Game, a: number) {
    if (a >= 1) return;
    this.applied = true;
    this.spx = g.px;
    this.spy = g.py;
    if (Math.abs(g.px - this.ppx) + Math.abs(g.py - this.ppy) < 60) {
      g.px = this.ppx + (g.px - this.ppx) * a;
      g.py = this.ppy + (g.py - this.ppy) * a;
    }
    const s = this.saved;
    const so = this.savedObjs;
    s.length = 0;
    so.length = 0;
    for (const k of LISTS) for (const o of g[k] as Pt[]) {
      if (o._ix === undefined || o._iy === undefined) continue; // spawned this step
      const dx = o.x - o._ix, dy = o.y - o._iy;
      if (dx === 0 && dy === 0) continue;
      if (Math.abs(dx) + Math.abs(dy) > 80) continue; // teleport/respawn: don't smear it across the screen
      so.push(o);
      s.push(o.x, o.y);
      o.x = o._ix + dx * a;
      o.y = o._iy + dy * a;
    }
  }

  /** Put the real sim positions back. */
  restore(g: Game) {
    if (!this.applied) return;
    this.applied = false;
    g.px = this.spx;
    g.py = this.spy;
    const s = this.saved;
    const so = this.savedObjs;
    for (let i = 0; i < so.length; i++) {
      so[i].x = s[i * 2];
      so[i].y = s[i * 2 + 1];
    }
    so.length = 0;
  }
}
