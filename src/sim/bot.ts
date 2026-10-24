import { WEAPONS } from './data';
import type { Game } from './game';
import { dist2 } from './math';
import type { Offer } from './types';

/**
 * A simple autopilot used for headless balance runs (and the menu attract-mode).
 * Plays like a decent-but-not-great human: kites away from crowds, dodges telegraphs, grabs gems.
 */
/** Bot temperament: how far it keeps from regular enemies (melee builds hold closer). */
export const botStyle = { kite: 110, human: false };

/** Human-ish wrapper: decisions only every ~0.22s (reaction time) with a little aim wobble. */
const humanState = { t: 0, mx: 0, my: 0, seed: 12345 };
export function humanMove(g: Game): [number, number] {
  humanState.t -= 1 / 60;
  if (humanState.t <= 0) {
    humanState.t = 0.18 + (((humanState.seed = (humanState.seed * 16807) % 2147483647) / 2147483647) * 0.1);
    const [mx, my] = botMove(g);
    const n = ((humanState.seed = (humanState.seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.7;
    const a = Math.atan2(my, mx) + n;
    const m = Math.hypot(mx, my);
    humanState.mx = Math.cos(a) * m;
    humanState.my = Math.sin(a) * m;
  }
  return [humanState.mx, humanState.my];
}

export function botMove(g: Game): [number, number] {
  let fx = 0;
  let fy = 0;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    const dx = g.px - e.x;
    const dy = g.py - e.y;
    const d2 = dx * dx + dy * dy;
    const R = e.kind === 'boss' ? 170 : botStyle.kite;
    if (d2 > R * R) continue;
    const d = Math.sqrt(d2) || 1;
    const w = (e.kind === 'boss' ? 4 : 1) * (1 - d / R) ** 2;
    fx += (dx / d) * w;
    fy += (dy / d) * w;
  }
  for (const s of g.shots) {
    const dx = g.px - s.x;
    const dy = g.py - s.y;
    const d = Math.hypot(dx, dy);
    if (d < 60) {
      fx += (dx / (d || 1)) * 1.5;
      fy += (dy / (d || 1)) * 1.5;
    }
  }
  for (const t of g.telegraphs) {
    if (t.kind === 'circle') {
      const dx = g.px - t.x;
      const dy = g.py - t.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < t.r + 25) {
        fx += (dx / d) * 4;
        fy += (dy / d) * 4;
      }
    } else {
      // step perpendicular out of the lane
      const ca = Math.cos(t.a);
      const sa = Math.sin(t.a);
      const dx = g.px - t.x;
      const dy = g.py - t.y;
      const perp = -dx * sa + dy * ca;
      if (Math.abs(perp) < t.r + 40 && dx * ca + dy * sa > 0) {
        const s = perp >= 0 ? 1 : -1;
        fx += -sa * s * 4;
        fy += ca * s * 4;
      }
    }
  }
  // attraction to loot
  let best: { x: number; y: number } | null = null;
  let bd = 260 * 260;
  const lowHp = g.hp / g.maxHp < 0.5;
  for (const p of g.pickups) {
    if (!p.alive || p.drop > 0) continue;
    let d = dist2(p.x, p.y, g.px, g.py);
    if (p.kind === 'chest' || p.kind === 'emp' || p.kind === 'magnet') d *= 0.2;
    if (p.kind === 'ration') d *= lowHp ? 0.1 : 3;
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  const danger = Math.hypot(fx, fy);
  if (best) {
    const dx = best.x - g.px;
    const dy = best.y - g.py;
    const d = Math.hypot(dx, dy) || 1;
    const pull = danger > 1.2 ? 0.25 : 0.8;
    fx += (dx / d) * pull;
    fy += (dy / d) * pull;
  }
  if (g.cage) {
    const dx = g.cage.x - g.px;
    const dy = g.cage.y - g.py;
    const d = Math.hypot(dx, dy);
    if (d > g.cage.r * 0.6) {
      fx += (dx / d) * 1.2;
      fy += (dy / d) * 1.2;
    }
  }
  const m = Math.hypot(fx, fy);
  if (m < 0.05) return [0, 0];
  return [fx / m, fy / m];
}

/** Optional build preference: ids listed first are strongly favoured (for build-comparison tests). */
export const botPrefs: { ids: string[] } = { ids: [] };

export function botChoose(g: Game, offers: Offer[]): number {
  if (botPrefs.ids.length) {
    let best = -1;
    let rank = 1e9;
    offers.forEach((o, i) => {
      const id = (o as { id?: string }).id;
      const r = id ? botPrefs.ids.indexOf(id) : -1;
      if (r >= 0 && r < rank) {
        rank = r;
        best = i;
      }
    });
    if (best >= 0) return best;
  }
  const owned = new Set(g.weapons.map((w) => w.id));
  const partners = new Set(g.weapons.map((w) => WEAPONS[w.id].partner));
  let bi = 0;
  let bs = -1;
  offers.forEach((o, i) => {
    let s = 0;
    if (o.type === 'weapon') s = owned.has(o.id) ? 3 : g.weapons.length < 4 ? 2.4 : 1;
    else if (o.type === 'passive') s = partners.has(o.id) ? 2.6 : 1.2;
    else s = 0.5;
    if (s > bs) {
      bs = s;
      bi = i;
    }
  });
  return bi;
}
