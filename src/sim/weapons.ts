import { WEAPONS, type WeaponLevel } from './data';
import type { Game } from './game';
import { TAU, dist2 } from './math';
import type { Enemy, Projectile, WeaponState } from './types';

export function weaponStats(w: WeaponState): WeaponLevel {
  const d = WEAPONS[w.id];
  return w.evolved ? d.evo : d.levels[Math.min(d.levels.length, w.level) - 1];
}

/** Blade positions are needed by both sim (collision) and renderer (drawing). */
export function bladePositions(g: Game, w: WeaponState, out: number[] = []): number[] {
  const s = weaponStats(w);
  const r = s.area * g.areaMul;
  out.length = 0;
  for (let k = 0; k < s.count; k++) {
    const a = w.angle + (k / s.count) * TAU;
    out.push(g.px + Math.cos(a) * r, g.py + Math.sin(a) * r);
  }
  return out;
}

export function bladesActive(w: WeaponState) {
  return w.evolved || w.active > 0;
}

type ProjInit = Partial<Projectile> & Pick<Projectile, 'kind' | 'x' | 'y' | 'dmg'>;

function fire(g: Game, p: ProjInit) {
  return g.addProjectile({
    vx: 0,
    vy: 0,
    r: 5,
    life: 1,
    maxLife: p.life ?? 1,
    pierce: 0,
    hitCd: 0,
    tx: 0,
    ty: 0,
    sx: p.x,
    sy: p.y,
    area: 0,
    evo: false,
    spin: 0,
    extra: 0,
    ...p,
  });
}

/** Enemies within the visible area (plus margin), sorted by distance when requested. */
function visibleEnemies(g: Game, margin = 20): Enemy[] {
  const out: Enemy[] = [];
  const hw = g.viewW + margin;
  const hh = g.viewH + margin;
  for (const e of g.enemies) {
    if (!e.alive) continue;
    if (Math.abs(e.x - g.px) < hw && Math.abs(e.y - g.py) < hh) out.push(e);
  }
  return out;
}

function nearest(g: Game, list: Enemy[], n: number): Enemy[] {
  if (list.length <= n) return list.slice().sort((a, b) => dist2(a.x, a.y, g.px, g.py) - dist2(b.x, b.y, g.px, g.py));
  // partial selection: fine for n ≤ 6
  const res: Enemy[] = [];
  const used = new Set<Enemy>();
  for (let k = 0; k < n; k++) {
    let best: Enemy | null = null;
    let bd = Infinity;
    for (const e of list) {
      if (used.has(e)) continue;
      // bosses pull focus so single-target weapons don't waste time on adds
      const d = dist2(e.x, e.y, g.px, g.py) * (e.kind === 'boss' ? 0.4 : 1);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    if (!best) break;
    used.add(best);
    res.push(best);
  }
  return res;
}

export function updateWeapons(g: Game, dt: number) {
  const atk = g.base.atk;
  for (const w of g.weapons) {
    const s = weaponStats(w);
    const dmg = s.dmg * atk;
    switch (w.id) {
      case 'pistol': {
        w.timer -= dt;
        if (w.timer > 0) break;
        const vis = visibleEnemies(g, 30);
        if (!vis.length) {
          w.timer = 0.1;
          break;
        }
        w.timer = s.cd * g.cdMul;
        const targets = nearest(g, vis, s.count);
        const sp = s.speed * g.projSpeedMul;
        for (let k = 0; k < s.count; k++) {
          const t = targets[k % targets.length];
          let a = Math.atan2(t.y - g.py, t.x - g.px);
          if (k >= targets.length) a += (k - targets.length + 1) * 0.12 * (k % 2 ? 1 : -1);
          if (k === 0) g.aim = a;
          fire(g, {
            kind: w.evolved ? 'rail' : 'bolt',
            x: g.px + Math.cos(a) * 14,
            y: g.py + Math.sin(a) * 14,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            r: s.area,
            dmg,
            life: s.dur,
            maxLife: s.dur,
            pierce: s.pierce,
            evo: w.evolved,
          });
        }
        g.fx.push({ t: 'shoot', weapon: 'pistol' });
        break;
      }

      case 'blades': {
        w.angle += s.speed * dt;
        if (!w.evolved) {
          if (w.active > 0) {
            w.active -= dt;
            if (w.active <= 0) w.timer = s.cd * g.cdMul;
          } else {
            w.timer -= dt;
            if (w.timer <= 0) {
              w.active = s.dur * g.durMul;
              g.fx.push({ t: 'shoot', weapon: 'blades' });
            }
          }
        }
        if (!bladesActive(w)) break;
        const pos = bladePositions(g, w, scratch);
        const br = 13 * (w.evolved ? 1.3 : 1) * Math.sqrt(g.areaMul);
        for (let k = 0; k < pos.length; k += 2) {
          const bx = pos[k];
          const by = pos[k + 1];
          g.grid.query(bx, by, br + 40, (j) => {
            const e = g.enemies[j];
            if (!e.alive) return;
            const rr = br + e.r;
            if (dist2(bx, by, e.x, e.y) > rr * rr) return;
            const last = e.hits.get(w.sourceId);
            if (last !== undefined && g.time - last < 0.35) return;
            e.hits.set(w.sourceId, g.time);
            const dx = e.x - g.px;
            const dy = e.y - g.py;
            const d = Math.hypot(dx, dy) || 1;
            g.damage(e, dmg, dx / d, dy / d, 220, '#ffb84d');
          });
        }
        break;
      }

      case 'arc': {
        w.timer -= dt;
        if (w.timer > 0) break;
        const vis = visibleEnemies(g, 0);
        if (!vis.length) {
          w.timer = 0.15;
          break;
        }
        w.timer = s.cd * g.cdMul;
        const area = s.area * g.areaMul;
        for (let k = 0; k < s.count; k++) {
          let t = g.rng.pick(vis);
          if (g.boss && k === 0) t = g.boss;
          const hitSet = new Set<Enemy>();
          const pts = [t.x + g.rng.range(-30, 30), t.y - 260, t.x, t.y];
          let cur: Enemy | null = t;
          for (let jump = 0; jump <= s.extra && cur; jump++) {
            hitSet.add(cur);
            const cx = cur.x;
            const cy = cur.y;
            g.damage(cur, dmg * (jump === 0 ? 1 : 0.7), 0, 0, 0, '#a98bff');
            // splash
            g.grid.query(cx, cy, area + 20, (j) => {
              const e = g.enemies[j];
              if (!e.alive || hitSet.has(e)) return;
              if (dist2(cx, cy, e.x, e.y) < (area + e.r) ** 2) g.damage(e, dmg * 0.4, 0, 0, 0, '#a98bff');
            });
            // next jump: nearest un-hit enemy
            let next: Enemy | null = null;
            let bd = 120 * 120;
            g.grid.query(cx, cy, 120, (j) => {
              const e = g.enemies[j];
              if (!e.alive || hitSet.has(e)) return;
              const d = dist2(cx, cy, e.x, e.y);
              if (d < bd) {
                bd = d;
                next = e;
              }
            });
            cur = next;
            if (cur) pts.push((cur as Enemy).x, (cur as Enemy).y);
          }
          g.fx.push({ t: 'arc', pts, color: w.evolved ? '#d6c8ff' : '#a98bff' });
        }
        g.fx.push({ t: 'shoot', weapon: 'arc' });
        break;
      }

      case 'frag': {
        w.timer -= dt;
        if (w.timer > 0) break;
        const vis = visibleEnemies(g, -10);
        if (!vis.length) {
          w.timer = 0.2;
          break;
        }
        w.timer = s.cd * g.cdMul;
        const near = nearest(g, vis, 10);
        for (let k = 0; k < s.count; k++) {
          const t = g.boss && k === 0 ? g.boss : g.rng.pick(near);
          const d = Math.hypot(t.x - g.px, t.y - g.py);
          const flight = Math.min(0.8, Math.max(0.35, d / (s.speed * g.projSpeedMul)));
          fire(g, {
            kind: 'shell',
            x: g.px,
            y: g.py,
            sx: g.px,
            sy: g.py,
            tx: t.x + g.rng.range(-12, 12),
            ty: t.y + g.rng.range(-12, 12),
            dmg,
            life: flight,
            maxLife: flight,
            area: s.area * g.areaMul,
            evo: w.evolved,
            r: 6,
          });
        }
        g.fx.push({ t: 'shoot', weapon: 'frag' });
        break;
      }

      case 'field': {
        const r = s.area * g.areaMul;
        const slow = s.extra;
        // continuous slow (+ pull when evolved)
        g.grid.query(g.px, g.py, r + 30, (j) => {
          const e = g.enemies[j];
          if (!e.alive) return;
          const d2 = dist2(e.x, e.y, g.px, g.py);
          if (d2 > (r + e.r) ** 2) return;
          if (e.kind !== 'boss') e.slow = Math.max(e.slow, slow);
          if (w.evolved && e.kind !== 'boss') {
            const d = Math.sqrt(d2) || 1;
            e.x -= ((e.x - g.px) / d) * 22 * dt;
            e.y -= ((e.y - g.py) / d) * 22 * dt;
          }
        });
        w.timer -= dt;
        if (w.timer > 0) break;
        w.timer = s.cd;
        g.grid.query(g.px, g.py, r + 30, (j) => {
          const e = g.enemies[j];
          if (!e.alive) return;
          if (dist2(e.x, e.y, g.px, g.py) > (r + e.r) ** 2) return;
          g.damage(e, dmg, 0, 0, 0, '#43ffa4');
        });
        break;
      }

      case 'disc': {
        w.timer -= dt;
        if (w.timer > 0) break;
        const vis = visibleEnemies(g, 0);
        w.timer = s.cd * g.cdMul;
        const base = vis.length ? (() => {
          const t = nearest(g, vis, 1)[0];
          return Math.atan2(t.y - g.py, t.x - g.px);
        })() : g.aim;
        const sp = s.speed * g.projSpeedMul;
        const life = s.dur * g.durMul;
        for (let k = 0; k < s.count; k++) {
          const a = base + (k / s.count) * TAU;
          fire(g, {
            kind: 'disc',
            x: g.px,
            y: g.py,
            vx: Math.cos(a) * sp,
            vy: Math.sin(a) * sp,
            r: s.area * Math.sqrt(g.areaMul),
            dmg,
            life,
            maxLife: life,
            pierce: 999,
            hitCd: 0.3,
            evo: w.evolved,
          });
        }
        g.fx.push({ t: 'shoot', weapon: 'disc' });
        break;
      }

      case 'napalm': {
        w.timer -= dt;
        if (w.timer > 0) break;
        w.timer = s.cd * g.cdMul;
        const vis = visibleEnemies(g, -20);
        for (let k = 0; k < s.count; k++) {
          let tx: number;
          let ty: number;
          if (vis.length) {
            const t = g.rng.pick(vis);
            tx = t.x;
            ty = t.y;
          } else {
            const a = g.rng.range(0, TAU);
            tx = g.px + Math.cos(a) * 110;
            ty = g.py + Math.sin(a) * 110;
          }
          fire(g, {
            kind: 'canister',
            x: g.px,
            y: g.py,
            sx: g.px,
            sy: g.py,
            tx,
            ty,
            dmg,
            life: 0.6,
            maxLife: 0.6,
            area: s.area * g.areaMul,
            extra: s.dur * g.durMul,
            evo: w.evolved,
          });
        }
        g.fx.push({ t: 'shoot', weapon: 'napalm' });
        break;
      }

      case 'drill': {
        const sp = s.speed * g.projSpeedMul;
        const spawn = (n: number, life: number) => {
          for (let k = 0; k < n; k++) {
            const a = g.rng.range(0, TAU);
            fire(g, {
              kind: 'drill',
              x: g.px,
              y: g.py,
              vx: Math.cos(a) * sp,
              vy: Math.sin(a) * sp,
              r: s.area * Math.sqrt(g.areaMul),
              dmg,
              life,
              maxLife: life,
              pierce: 999,
              hitCd: 0.25,
              evo: w.evolved,
            });
          }
        };
        if (w.evolved) {
          let alive = 0;
          for (const p of g.projectiles) if (p.alive && p.kind === 'drill' && p.evo) alive++;
          if (alive < s.count) spawn(s.count - alive, 9999);
          break;
        }
        w.timer -= dt;
        if (w.timer > 0) break;
        w.timer = s.cd * g.cdMul;
        spawn(s.count, s.dur * g.durMul);
        g.fx.push({ t: 'shoot', weapon: 'drill' });
        break;
      }
    }
  }
}

const scratch: number[] = [];
