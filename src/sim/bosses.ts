import type { Game } from './game';
import { TAU } from './math';
import type { Enemy } from './types';

/**
 * Bosses are readable set pieces: every damaging move is telegraphed on the floor first.
 * Each has a phase 2 below 50% HP that adds pressure without adding new rules.
 */
export function updateBoss(g: Game, b: Enemy, dt: number) {
  const dx = g.px - b.x;
  const dy = g.py - b.y;
  const d = Math.hypot(dx, dy) || 1;
  if (!b.phase2 && b.hp < b.maxHp * 0.5) {
    b.phase2 = true;
    g.fx.push({ t: 'banner', text: 'ENRAGED', sub: '', color: '#ff3b5c' });
  }
  b.anim += dt * 3;
  b.stateT -= dt;
  const chase = (mul = 1) => {
    b.x += (dx / d) * b.speed * mul * dt;
    b.y += (dy / d) * b.speed * mul * dt;
    if (Math.abs(dx) > 4) b.face = dx < 0 ? -1 : 1;
  };

  switch (b.boss) {
    case 'warden':
      warden(g, b, dt, chase);
      break;
    case 'hive':
      hive(g, b, dt, chase, dx / d, dy / d);
      break;
    case 'colossus':
      colossus(g, b, dt, chase);
      break;
    case 'broadcaster':
      broadcaster(g, b, chase);
      break;
  }

  if (g.cage) {
    const c = g.cage;
    const ddx = b.x - c.x;
    const ddy = b.y - c.y;
    const dd = Math.hypot(ddx, ddy);
    const lim = c.r - b.r * 0.6;
    if (dd > lim) {
      b.x = c.x + (ddx / dd) * lim;
      b.y = c.y + (ddy / dd) * lim;
    }
  }
}

function warden(g: Game, b: Enemy, dt: number, chase: (m?: number) => void) {
  switch (b.state) {
    case 0: // stalk
      chase(b.phase2 ? 1.25 : 1);
      if (b.stateT <= 0) {
        b.state = 1;
        b.stateT = b.phase2 ? 0.65 : 0.85;
        b.aimA = Math.atan2(g.py - b.y, g.px - b.x);
        g.telegraphs.push({ kind: 'line', x: b.x, y: b.y, r: b.r * 0.8, a: b.aimA, len: 400, t: b.stateT, total: b.stateT, dmg: 0, sweep: 0, active: 0 });
      }
      break;
    case 1: // wind-up
      if (b.stateT <= 0) {
        b.state = 2;
        b.stateT = 0.55;
        g.fx.push({ t: 'shake', amt: 4 });
      }
      break;
    case 2: // charge
      b.x += Math.cos(b.aimA) * 640 * dt;
      b.y += Math.sin(b.aimA) * 640 * dt;
      b.anim += dt * 10;
      if (b.stateT <= 0) {
        b.state = 3;
        b.stateT = 0.85;
        g.telegraphs.push({ kind: 'circle', x: b.x, y: b.y, r: 100, a: 0, len: 0, t: 0.7, total: 0.7, dmg: b.dmg * 1.5, sweep: 0, active: 0 });
      }
      break;
    case 3: // slam
      if (b.stateT <= 0) {
        if (b.phase2) {
          // shockwave of debris
          for (let k = 0; k < 14; k++) {
            const a = (k / 14) * TAU;
            g.shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * 170, vy: Math.sin(a) * 170, r: 7, dmg: b.dmg * 0.8, life: 3, kind: 'spore', alive: true });
          }
        }
        b.state = 0;
        b.stateT = b.phase2 ? 1.6 : 2.4;
      }
      break;
  }
}

function hive(g: Game, b: Enemy, dt: number, chase: (m?: number) => void, nx: number, ny: number) {
  chase(0.8);
  if (b.stateT <= 0) {
    b.stateT = b.phase2 ? 2.0 : 2.7;
    const n = b.phase2 ? 9 : 6;
    const spread = b.phase2 ? 1.4 : 1.0;
    const base = Math.atan2(ny, nx);
    for (let k = 0; k < n; k++) {
      const a = base - spread / 2 + (spread * k) / (n - 1);
      g.shots.push({ x: b.x, y: b.y, vx: Math.cos(a) * 125, vy: Math.sin(a) * 125, r: 7, dmg: b.dmg * 0.8, life: 3.6, kind: 'spore', alive: true });
    }
  }
  b.shootCd -= dt;
  if (b.shootCd <= 0) {
    b.shootCd = b.phase2 ? 4.5 : 6;
    if (g.enemies.length < 70) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU;
        g.spawnEnemyAt('crawler', b.x + Math.cos(a) * 50, b.y + Math.sin(a) * 50, false);
      }
    }
    // acid puddle ring telegraphs around the player
    for (let k = 0; k < (b.phase2 ? 4 : 2); k++) {
      const a = g.rng.range(0, TAU);
      const r = g.rng.range(0, 70);
      g.telegraphs.push({ kind: 'circle', x: g.px + Math.cos(a) * r, y: g.py + Math.sin(a) * r, r: 44, a: 0, len: 0, t: 1.2, total: 1.2, dmg: b.dmg * 1.2, sweep: 0, active: 0 });
    }
  }
}

function colossus(g: Game, b: Enemy, _dt: number, chase: (m?: number) => void) {
  const lasering = g.telegraphs.some((t) => t.kind === 'line' && (t.t > 0 || t.active > 0));
  if (!lasering) chase(1);
  if (b.stateT > 0) return;
  b.state++;
  if (b.state % 3 === 0) {
    // sweeping laser
    const toP = Math.atan2(g.py - b.y, g.px - b.x);
    const dir = g.rng.chance(0.5) ? 1 : -1;
    const span = 2.0;
    const dur = b.phase2 ? 1.4 : 1.8;
    g.telegraphs.push({
      kind: 'line', x: b.x, y: b.y, r: 16, a: toP - (dir * span) / 2, len: 560, t: 1.0, total: 1.0,
      dmg: b.dmg * 0.7, sweep: (dir * span) / dur, active: dur,
    });
    b.stateT = 1.0 + dur + 1.0;
    g.fx.push({ t: 'banner', text: '', sub: 'Laser charging', color: '#ff3b5c' });
  } else {
    // mortar volley
    const n = b.phase2 ? 8 : 5;
    for (let k = 0; k < n; k++) {
      const a = g.rng.range(0, TAU);
      const r = k === 0 ? 0 : g.rng.range(40, 150);
      g.telegraphs.push({ kind: 'circle', x: g.px + Math.cos(a) * r, y: g.py + Math.sin(a) * r, r: 42, a: 0, len: 0, t: 1.15 + k * 0.08, total: 1.15 + k * 0.08, dmg: b.dmg, sweep: 0, active: 0 });
    }
    b.stateT = b.phase2 ? 2.2 : 3.0;
  }
}

/**
 * The Broadcaster (Sectors 11+): three readable moves on a loop.
 *  - Cross-beam: 4 (phase 2: 6) beams fan out from it and sweep a quarter turn. Stand between them.
 *  - Seekers: slow homing orbs that expire after a few seconds. Keep moving; they turn wide.
 *  - Blink: a red circle marks where it will land; it appears there with a slam.
 */
function broadcaster(g: Game, b: Enemy, chase: (m?: number) => void) {
  const beaming = g.telegraphs.some((t) => t.kind === 'line' && (t.t > 0 || t.active > 0));
  if (b.state === 9) {
    // waiting to land a blink
    if (b.stateT <= 0) {
      b.x = (b as any).landX;
      b.y = (b as any).landY;
      g.fx.push({ t: 'shake', amt: 8 });
      g.fx.push({ t: 'explode', x: b.x, y: b.y, r: 70, color: '#ff3bd4' });
      b.state = 1;
      b.stateT = b.phase2 ? 1.0 : 1.4;
    }
    return;
  }
  if (!beaming) chase(0.75);
  if (b.stateT > 0) return;
  const move = b.state % 3;
  b.state = (b.state + 1) % 9;
  if (move === 0) {
    const n = b.phase2 ? 6 : 4;
    const base = Math.atan2(g.py - b.y, g.px - b.x) + Math.PI / n;
    const dir = g.rng.chance(0.5) ? 1 : -1;
    const dur = 2.4;
    for (let k = 0; k < n; k++) {
      g.telegraphs.push({
        kind: 'line', x: b.x, y: b.y, r: 13, a: base + (k / n) * Math.PI * 2, len: 520, t: 1.1, total: 1.1,
        dmg: b.dmg * 0.6, sweep: (dir * (Math.PI / 2)) / dur, active: dur,
      });
    }
    g.fx.push({ t: 'banner', text: '', sub: 'Cross-beam charging', color: '#ff3b5c' });
    b.stateT = 1.1 + dur + 0.9;
  } else if (move === 1) {
    const n = b.phase2 ? 5 : 3;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + g.rng.range(0, 1);
      g.shots.push({ x: b.x + Math.cos(a) * 30, y: b.y + Math.sin(a) * 30, vx: Math.cos(a) * 95, vy: Math.sin(a) * 95, r: 9, dmg: b.dmg * 0.7, life: 4.5, kind: 'spore', alive: true, home: 1.2 });
    }
    b.stateT = b.phase2 ? 2.0 : 2.8;
  } else {
    const r = 64;
    (b as any).landX = g.px;
    (b as any).landY = g.py;
    g.telegraphs.push({ kind: 'circle', x: g.px, y: g.py, r, a: 0, len: 0, t: 1.15, total: 1.15, dmg: b.dmg * 1.4, sweep: 0, active: 0 });
    b.state = 9;
    b.stateT = 1.15;
  }
}
