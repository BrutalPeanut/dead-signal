import type { ChapterDef } from './chapters';
import {
  BOSSES,
  ELITE_TIMES,
  ENEMIES,
  HORDES,
  MAX_SKILL_LEVEL,
  MIDBOSS_TIME,
  PASSIVES,
  RUN_LENGTH,
  WEAPONS,
  enemyMix,
  hpScale,
  spawnRate,
  xpToNext,
  type BossKind,
  type EnemyKind,
  type PassiveId,
  type WeaponId,
} from './data';
import { Rng, TAU, dist2 } from './math';
import { buildOffers } from './offers';
import { SpatialHash } from './spatial';
import type {
  BaseStats,
  ChestResult,
  Enemy,
  EnemyShot,
  FxEvent,
  Offer,
  PassiveState,
  Pickup,
  PickupKind,
  Pool,
  Projectile,
  RunState,
  Telegraph,
  WeaponState,
} from './types';
import { updateWeapons } from './weapons';
import { updateBoss } from './bosses';

export const DT = 1 / 60;
const MAX_ENEMIES = 420;
const MAX_GEMS = 320;

export interface RunResult {
  won: boolean;
  time: number;
  kills: number;
  gold: number;
  level: number;
  bossKills: number;
  eliteKills: number;
}

export class Game {
  readonly rng: Rng;
  readonly chapter: ChapterDef;
  readonly base: BaseStats;

  state: RunState = 'play';
  time = 0;
  kills = 0;
  gold = 0;
  bossKills = 0;
  eliteKills = 0;

  // player
  px = 0;
  py = 0;
  pvx = 0;
  pvy = 0;
  hp: number;
  maxHp: number;
  level = 1;
  xp = 0;
  xpNeed = xpToNext(1);
  pendingLevels = 0;
  rerolls: number;
  revives: number;
  aim = 0; // facing angle of player's gun
  hurtT = 0;
  moving = false;

  weapons: WeaponState[] = [];
  passives: PassiveState[] = [];
  offers: Offer[] = [];
  chest: ChestResult | null = null;
  pendingChests: boolean[] = []; // big?

  enemies: Enemy[] = [];
  projectiles: Projectile[] = [];
  shots: EnemyShot[] = [];
  pools: Pool[] = [];
  telegraphs: Telegraph[] = [];
  pickups: Pickup[] = [];
  fx: FxEvent[] = [];

  grid = new SpatialHash(48);
  private nextId = 1;
  private spawnAcc = 0;
  private hordeIdx = 0;
  private warnedHorde = -1;
  private eliteIdx = 0;
  private airdropT = 32;
  midBossSpawned = false;
  finalBossSpawned = false;
  boss: Enemy | null = null;
  cage: { x: number; y: number; r: number } | null = null;
  winT = -1;
  slowmo = 0;

  // view half-extents in world units (set by renderer; headless uses a phone-ish default)
  viewW = 210;
  viewH = 380;

  // derived stats (recomputed on change)
  dmgMul = 1;
  takenMul = 1;
  cdMul = 1;
  areaMul = 1;
  durMul = 1;
  projSpeedMul = 1;
  moveSpeed = 92;
  pickupR = 46;
  regen = 0;

  constructor(chapter: ChapterDef, base: BaseStats, seed = Date.now()) {
    this.rng = new Rng(seed);
    this.chapter = chapter;
    this.base = base;
    this.maxHp = base.hp;
    this.hp = base.hp;
    this.rerolls = base.rerolls;
    this.revives = base.revives;
    this.addWeapon(base.startWeapon);
    this.recalc();
    // Opening wave so the first second already has targets (empty screens kill first impressions).
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + this.rng.range(-0.2, 0.2);
      const d = 240 + this.rng.range(0, 80);
      this.spawnEnemyAt('shambler', Math.cos(a) * d, Math.sin(a) * d, false);
    }
    if (base.startLevels > 0) {
      this.pendingLevels += base.startLevels;
      this.openLevelUp();
    }
  }

  newId() {
    return this.nextId++;
  }

  // ------------------------------------------------------------------ stats

  passiveLevel(id: PassiveId) {
    return this.passives.find((p) => p.id === id)?.level ?? 0;
  }

  recalc() {
    const lv = (id: PassiveId) => this.passiveLevel(id);
    this.dmgMul = 1 + 0.12 * lv('chip');
    this.takenMul = (1 - this.base.def) * (1 - 0.07 * lv('plating'));
    this.cdMul = 1 - 0.07 * lv('capacitor');
    this.areaMul = 1 + 0.1 * lv('fuel');
    this.durMul = 1 + 0.12 * lv('gel');
    this.projSpeedMul = 1 + 0.08 * lv('gel');
    this.moveSpeed = this.base.moveSpeed * (1 + 0.08 * lv('boots'));
    this.pickupR = this.base.pickup * (1 + 0.3 * lv('magnet'));
    const newMax = Math.round(this.base.hp * (1 + 0.12 * lv('medkit')));
    if (newMax > this.maxHp) this.hp += newMax - this.maxHp;
    this.maxHp = newMax;
    this.hp = Math.min(this.hp, this.maxHp);
    this.regen = this.base.regen + 0.0025 * lv('medkit');
  }

  addWeapon(id: WeaponId) {
    this.weapons.push({ id, level: 1, evolved: false, timer: 0.4, active: 0, angle: 0, sourceId: this.newId() });
  }

  // ------------------------------------------------------------------ main update

  /** Advance one fixed step. mx,my is the movement intent (-1..1). */
  step(mx: number, my: number) {
    if (this.state !== 'play') return;
    let dt = DT;
    if (this.slowmo > 0) {
      this.slowmo -= DT;
      dt *= 0.3;
    }
    this.time += dt;

    this.updatePlayer(dt, mx, my);
    this.director(dt);
    this.rebuildGrid();
    this.updateEnemies(dt);
    this.rebuildGrid();
    updateWeapons(this, dt);
    this.updateProjectiles(dt);
    this.updatePools(dt);
    this.updateShots(dt);
    this.updateTelegraphs(dt);
    this.updatePickups(dt);
    this.compact();

    if (this.hp <= 0) this.onDeath();
    if (this.winT > 0) {
      this.winT -= DT;
      if (this.winT <= 0) this.state = 'won';
    }
    if (this.state === 'play') {
      if (this.pendingChests.length) this.openChest(this.pendingChests.shift()!);
      else if (this.pendingLevels > 0) this.openLevelUp();
    }
  }

  private updatePlayer(dt: number, mx: number, my: number) {
    const m = Math.hypot(mx, my);
    if (m > 1) {
      mx /= m;
      my /= m;
    }
    this.moving = m > 0.05;
    const spd = this.moveSpeed;
    this.pvx = mx * spd;
    this.pvy = my * spd;
    this.px += this.pvx * dt;
    this.py += this.pvy * dt;
    if (this.cage) {
      const c = this.cage;
      const dx = this.px - c.x;
      const dy = this.py - c.y;
      const d = Math.hypot(dx, dy);
      const lim = c.r - 12;
      if (d > lim) {
        this.px = c.x + (dx / d) * lim;
        this.py = c.y + (dy / d) * lim;
      }
    }
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.regen > 0) this.hp = Math.min(this.maxHp, this.hp + this.maxHp * this.regen * dt);
  }

  // ------------------------------------------------------------------ spawning / pacing

  private director(dt: number) {
    const t = this.time;
    const bossActive = !!this.boss;

    // Horde warnings 4s ahead, spawn on time.
    const h = HORDES[this.hordeIdx];
    if (h && !bossActive) {
      if (t >= h.t - 4 && this.warnedHorde < this.hordeIdx) {
        this.warnedHorde = this.hordeIdx;
        this.fx.push({ t: 'banner', text: 'HORDE INCOMING', sub: 'They heard the signal', color: '#ff3b5c' });
      }
      if (t >= h.t) {
        this.spawnHorde(h.kind, h.count, h.rings);
        this.hordeIdx++;
      }
    } else if (h && bossActive && t >= h.t) this.hordeIdx++; // skip hordes during bosses

    const et = ELITE_TIMES[this.eliteIdx];
    if (et !== undefined && t >= et) {
      this.eliteIdx++;
      if (!bossActive) {
        const kinds: EnemyKind[] = ['brute', 'shambler', 'bloater'];
        this.spawnEnemy(this.rng.pick(kinds), true);
        this.fx.push({ t: 'banner', text: 'ELITE DETECTED', sub: 'Kill it for a supply chest', color: '#ffc94d' });
      }
    }

    if (!this.midBossSpawned && t >= MIDBOSS_TIME) {
      this.midBossSpawned = true;
      this.spawnBoss(this.chapter.midBoss, true);
    }
    if (!this.finalBossSpawned && t >= RUN_LENGTH) {
      this.finalBossSpawned = true;
      this.spawnBoss(this.chapter.finalBoss, false);
    }

    if (!bossActive && t < RUN_LENGTH) {
      this.spawnAcc += spawnRate(t) * dt;
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.enemies.length >= MAX_ENEMIES) break;
        const mix = enemyMix(t);
        const i = this.rng.weighted(mix.map((m) => m[1]));
        const kind = mix[i][0];
        if (kind === 'crawler') {
          // crawlers come in packs
          const [x, y] = this.edgePoint();
          for (let k = 0; k < 5; k++) this.spawnEnemyAt(kind, x + this.rng.range(-20, 20), y + this.rng.range(-20, 20), false);
        } else this.spawnEnemy(kind, false);
      }
    }

    // Airdrops on a timer — the fix for "rations never show up".
    this.airdropT -= dt;
    if (this.airdropT <= 0) {
      this.airdropT = 38;
      this.spawnAirdrop();
    }
  }

  /** A point just outside the camera, biased toward where the player is heading. */
  edgePoint(): [number, number] {
    let a: number;
    if (this.moving && this.rng.chance(0.55)) {
      a = Math.atan2(this.pvy, this.pvx) + this.rng.range(-1.1, 1.1);
    } else a = this.rng.range(0, TAU);
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    // distance to rectangle edge along direction + margin
    const tx = Math.abs(ca) > 1e-6 ? this.viewW / Math.abs(ca) : Infinity;
    const ty = Math.abs(sa) > 1e-6 ? this.viewH / Math.abs(sa) : Infinity;
    const d = Math.min(tx, ty) + 40;
    return [this.px + ca * d, this.py + sa * d];
  }

  spawnEnemy(kind: EnemyKind, elite: boolean) {
    const [x, y] = this.edgePoint();
    return this.spawnEnemyAt(kind, x, y, elite);
  }

  spawnEnemyAt(kind: EnemyKind, x: number, y: number, elite: boolean): Enemy {
    const d = ENEMIES[kind];
    const hpm = hpScale(this.time) * this.chapter.hpMul * (elite ? 14 : 1);
    const e: Enemy = {
      id: this.newId(),
      kind,
      x,
      y,
      kx: 0,
      ky: 0,
      r: d.r * (elite ? 1.5 : 1),
      hp: d.hp * hpm,
      maxHp: d.hp * hpm,
      speed: d.speed * (elite ? 0.85 : 1) * this.rng.range(0.92, 1.08),
      dmg: d.dmg * this.chapter.dmgMul * (elite ? 1.5 : 1) * (1 + this.time / 600),
      xp: d.xp * (elite ? 20 : 1),
      mass: d.mass * (elite ? 4 : 1),
      elite,
      alive: true,
      flash: 0,
      slow: 0,
      contactCd: 0,
      anim: this.rng.range(0, TAU),
      face: 1,
      shootCd: this.rng.range(1, 2.5),
      hits: new Map(),
      burn: 0,
      state: 0,
      stateT: 0,
      aimA: 0,
      phase2: false,
    };
    this.enemies.push(e);
    return e;
  }

  private spawnHorde(kind: EnemyKind, count: number, rings: number) {
    // Rings close in from outside the view with a guaranteed gap so it's escapable, not a death sentence.
    for (let ring = 0; ring < rings; ring++) {
      const R = Math.max(this.viewW, this.viewH) + 30 + ring * 60;
      const gapA = this.rng.range(0, TAU);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * TAU;
        const diff = Math.abs(((a - gapA + Math.PI * 3) % TAU) - Math.PI);
        if (diff < 0.32) continue;
        if (this.enemies.length >= MAX_ENEMIES + 80) break;
        this.spawnEnemyAt(kind, this.px + Math.cos(a) * R, this.py + Math.sin(a) * R, false);
      }
    }
  }

  private spawnBoss(kind: BossKind, mid: boolean) {
    const def = BOSSES[kind];
    // Clear the field (with XP) — boss fights are a clean set piece, like Survivor.io.
    for (const e of this.enemies) if (e.alive && e.kind !== 'boss') this.killEnemy(e, false);
    this.shots.length = 0;
    const cr = Math.min(this.viewW, this.viewH) * 0.95 + 20;
    this.cage = { x: this.px, y: this.py, r: Math.max(190, cr) };
    const hp = def.hp * this.chapter.hpMul * hpScale(this.time) * (mid ? 0.55 : 1) * 0.45;
    const b: Enemy = {
      id: this.newId(),
      kind: 'boss',
      boss: kind,
      x: this.px,
      y: this.py - this.cage.r * 0.6,
      kx: 0,
      ky: 0,
      r: def.r,
      hp,
      maxHp: hp,
      speed: def.speed,
      dmg: def.dmg * this.chapter.dmgMul * (1 + this.time / 900),
      xp: 60,
      mass: 40,
      elite: false,
      alive: true,
      flash: 0,
      slow: 0,
      contactCd: 0,
      anim: 0,
      face: 1,
      shootCd: 2,
      hits: new Map(),
      burn: 0,
      state: 0,
      stateT: 1.5,
      aimA: 0,
      phase2: false,
    };
    (b as any).mid = mid;
    this.enemies.push(b);
    this.boss = b;
    this.fx.push({ t: 'banner', text: def.name.toUpperCase(), sub: def.title, color: '#ff3b5c' });
    this.fx.push({ t: 'shake', amt: 10 });
  }

  private spawnAirdrop() {
    const lowHp = this.hp / this.maxHp < 0.4;
    let kind: PickupKind;
    if (lowHp) kind = 'ration';
    else kind = (['ration', 'magnet', 'emp'] as const)[this.rng.weighted([0.34, 0.38, 0.28])];
    const a = this.rng.range(0, TAU);
    const d = this.rng.range(90, Math.min(this.viewW, this.viewH) * 0.85);
    let x = this.px + Math.cos(a) * d;
    let y = this.py + Math.sin(a) * d;
    if (this.cage) {
      x = this.cage.x + (x - this.cage.x) * 0.6;
      y = this.cage.y + (y - this.cage.y) * 0.6;
    }
    const p = this.addPickup(kind, x, y, 0);
    p.drop = 1.2;
    this.fx.push({ t: 'airdrop', x, y });
  }

  // ------------------------------------------------------------------ enemies

  private rebuildGrid() {
    this.grid.clear();
    const es = this.enemies;
    for (let i = 0; i < es.length; i++) if (es[i].alive) this.grid.insert(i, es[i].x, es[i].y);
  }

  private updateEnemies(dt: number) {
    const es = this.enemies;
    const px = this.px;
    const py = this.py;
    const despawnR2 = Math.pow(Math.max(this.viewW, this.viewH) * 2.4, 2);
    for (let i = 0; i < es.length; i++) {
      const e = es[i];
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (e.burn > 0) e.burn -= dt;
      if (e.contactCd > 0) e.contactCd -= dt;

      if (e.kind === 'boss') {
        updateBoss(this, e, dt);
      } else {
        let dx = px - e.x;
        let dy = py - e.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        let spd = e.speed * (1 - e.slow);
        if (e.kind === 'spitter') {
          if (d < 165) spd = d < 120 ? -spd * 0.6 : 0;
          e.shootCd -= dt;
          if (e.shootCd <= 0 && d < 230) {
            e.shootCd = 2.4;
            const s = 150;
            this.shots.push({ x: e.x, y: e.y, vx: dx * s, vy: dy * s, r: 6, dmg: e.dmg * 1.3, life: 3, kind: 'acid', alive: true });
          }
        }
        e.x += dx * spd * dt;
        e.y += dy * spd * dt;
        if (Math.abs(dx) > 0.2) e.face = dx < 0 ? -1 : 1;
        e.anim += dt * (spd / 10 + 2);

        // Recycle enemies the player left far behind so the horde stays dense around you.
        if (dist2(e.x, e.y, px, py) > despawnR2 && !e.elite) {
          const [nx, ny] = this.edgePoint();
          e.x = nx;
          e.y = ny;
        }
      }
      e.slow = 0;

      // knockback
      if (e.kx || e.ky) {
        e.x += e.kx * dt;
        e.y += e.ky * dt;
        const f = Math.pow(0.0005, dt);
        e.kx *= f;
        e.ky *= f;
        if (Math.abs(e.kx) < 1 && Math.abs(e.ky) < 1) e.kx = e.ky = 0;
      }

      // separation (cheap): push away from neighbours
      if (e.kind !== 'boss') {
        this.grid.query(e.x, e.y, e.r * 2, (j) => {
          if (j === i) return;
          const o = es[j];
          if (!o.alive) return;
          const ddx = e.x - o.x;
          const ddy = e.y - o.y;
          const rr = e.r + o.r;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < rr * rr && d2 > 0.0001) {
            const dd = Math.sqrt(d2);
            const push = ((rr - dd) / dd) * 0.5 * (o.mass / (e.mass + o.mass)) * 1.6;
            e.x += ddx * push;
            e.y += ddy * push;
          }
        });
      }

      // contact damage
      const cr = e.r + 10;
      if (e.contactCd <= 0 && dist2(e.x, e.y, px, py) < cr * cr) {
        e.contactCd = 0.6;
        this.hurtPlayer(e.dmg);
      }

      if (this.cage && e.kind !== 'boss') {
        // keep adds inside the cage
        const c = this.cage;
        const ddx = e.x - c.x;
        const ddy = e.y - c.y;
        const dd = Math.hypot(ddx, ddy);
        if (dd > c.r - e.r) {
          e.x = c.x + (ddx / dd) * (c.r - e.r);
          e.y = c.y + (ddy / dd) * (c.r - e.r);
        }
      }
    }
  }

  hurtPlayer(raw: number) {
    if (this.state !== 'play' || this.winT > 0) return;
    const amt = raw * this.takenMul;
    this.hp -= amt;
    this.hurtT = 0.25;
    this.fx.push({ t: 'playerHit', amt });
  }

  /** Deal damage to an enemy. Returns true if it died. */
  damage(e: Enemy, base: number, kbx = 0, kby = 0, kb = 0, color = '#ffffff'): boolean {
    if (!e.alive) return false;
    const crit = this.rng.chance(this.base.crit);
    const v = base * this.dmgMul * (crit ? this.base.critMul : 1) * this.rng.range(0.9, 1.1);
    e.hp -= v;
    e.flash = 0.09;
    if (kb > 0 && e.mass < 30) {
      const kk = kb / e.mass;
      e.kx += kbx * kk;
      e.ky += kby * kk;
    }
    this.fx.push({ t: 'dmg', x: e.x, y: e.y - e.r, v, crit });
    this.fx.push({ t: 'hit', x: e.x, y: e.y, color });
    if (e.hp <= 0) {
      this.killEnemy(e, true);
      return true;
    }
    return false;
  }

  killEnemy(e: Enemy, counted: boolean) {
    if (!e.alive) return;
    e.alive = false;
    if (counted) this.kills++;
    this.fx.push({ t: 'death', x: e.x, y: e.y, kind: e.boss ?? e.kind, elite: e.elite, r: e.r });

    if (e.kind === 'boss') {
      this.bossKills++;
      this.boss = null;
      this.cage = null;
      this.telegraphs.length = 0;
      this.shots.length = 0;
      this.fx.push({ t: 'bossDown', x: e.x, y: e.y });
      this.fx.push({ t: 'shake', amt: 16 });
      this.slowmo = 1.2;
      const mid = (e as any).mid as boolean;
      this.addPickup('gold', e.x + 20, e.y, Math.round(60 * this.chapter.goldMul));
      if (mid) {
        const c = this.addPickup('chest', e.x, e.y, 0);
        c.big = true;
        // gem fountain
        for (let k = 0; k < 14; k++) this.addPickup('xp', e.x + this.rng.range(-50, 50), e.y + this.rng.range(-50, 50), 5);
      } else {
        this.winT = 2.2;
      }
      return;
    }

    if (e.kind === 'bloater') {
      this.fx.push({ t: 'explode', x: e.x, y: e.y, r: 58, color: '#9dff4a' });
      if (dist2(e.x, e.y, this.px, this.py) < 58 * 58) this.hurtPlayer(e.dmg * 1.4);
    }

    if (e.elite) {
      this.eliteKills++;
      this.addPickup('chest', e.x, e.y, 0);
      this.addPickup('gold', e.x + 12, e.y + 6, Math.round(15 * this.chapter.goldMul));
      return;
    }
    // drops
    this.addPickup('xp', e.x, e.y, e.xp);
    const r = this.rng.next();
    if (r < 0.045) this.addPickup('gold', e.x + 6, e.y, Math.max(1, Math.round(this.rng.range(1, 3) * this.chapter.goldMul)));
    else if (r < 0.048) this.addPickup('ration', e.x, e.y, 0);
  }

  // ------------------------------------------------------------------ projectiles

  addProjectile(p: Omit<Projectile, 'id' | 'alive'>): Projectile {
    const pr = { ...p, id: this.newId(), alive: true } as Projectile;
    this.projectiles.push(pr);
    return pr;
  }

  private updateProjectiles(dt: number) {
    const es = this.enemies;
    for (const p of this.projectiles) {
      if (!p.alive) continue;
      p.life -= dt;
      p.spin += dt * 14;
      if (p.kind === 'shell' || p.kind === 'canister') {
        // lobbed: lerp from start to target over maxLife
        const k = 1 - Math.max(0, p.life) / p.maxLife;
        p.x = p.sx + (p.tx - p.sx) * k;
        p.y = p.sy + (p.ty - p.sy) * k;
        if (p.life <= 0) {
          p.alive = false;
          if (p.kind === 'shell') this.explode(p.x, p.y, p.area, p.dmg, '#ff6a3d', p.evo);
          else this.pools.push({ x: p.x, y: p.y, r: p.area, life: p.extra, maxLife: p.extra, tick: 0, dmg: p.dmg, evo: p.evo });
        }
        continue;
      }
      if (p.kind === 'bomblet') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.94;
        p.vy *= 0.94;
        if (p.life <= 0) {
          p.alive = false;
          this.explode(p.x, p.y, p.area, p.dmg, '#ffb03d', false);
        }
        continue;
      }
      if (p.kind === 'disc') {
        // out then home back to player
        const half = p.maxLife * 0.5;
        if (p.life < half) {
          const dx = this.px - p.x;
          const dy = this.py - p.y;
          const d = Math.hypot(dx, dy) || 1;
          const s = Math.hypot(p.vx, p.vy);
          p.vx += ((dx / d) * s - p.vx) * Math.min(1, dt * 7);
          p.vy += ((dy / d) * s - p.vy) * Math.min(1, dt * 7);
          if (d < 16) p.alive = false;
        }
        if (p.life < -2) p.alive = false;
      } else if (p.kind === 'drill') {
        // bounce on view edges
        const lx = this.px - this.viewW;
        const hx = this.px + this.viewW;
        const ly = this.py - this.viewH;
        const hy = this.py + this.viewH;
        if ((p.x < lx && p.vx < 0) || (p.x > hx && p.vx > 0)) p.vx = -p.vx;
        if ((p.y < ly && p.vy < 0) || (p.y > hy && p.vy > 0)) p.vy = -p.vy;
        if (p.life <= 0) p.alive = false;
      } else if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // collisions
      const pr = p.r;
      this.grid.query(p.x, p.y, pr + 40, (j) => {
        if (!p.alive) return;
        const e = es[j];
        if (!e.alive) return;
        const rr = pr + e.r;
        if (dist2(p.x, p.y, e.x, e.y) > rr * rr) return;
        const last = e.hits.get(p.id);
        if (last !== undefined && (p.hitCd === 0 || this.time - last < p.hitCd)) return;
        e.hits.set(p.id, this.time);
        const sp = Math.hypot(p.vx, p.vy) || 1;
        this.damage(e, p.dmg, p.vx / sp, p.vy / sp, p.kind === 'rail' ? 40 : 120, WEAPON_COLOR[p.kind]);
        if (p.kind === 'disc' && p.evo) {
          // gravity disc drags enemies along
          e.kx += p.vx * 0.5;
          e.ky += p.vy * 0.5;
        }
        if (p.pierce <= 0) p.alive = false;
        else if (p.pierce < 900) p.pierce--;
      });
    }
  }

  explode(x: number, y: number, r: number, dmg: number, color: string, cluster: boolean) {
    this.fx.push({ t: 'explode', x, y, r, color });
    this.fx.push({ t: 'shake', amt: 2.5 });
    const es = this.enemies;
    this.grid.query(x, y, r + 30, (j) => {
      const e = es[j];
      if (!e.alive) return;
      const rr = r + e.r;
      const d2 = dist2(x, y, e.x, e.y);
      if (d2 > rr * rr) return;
      const d = Math.sqrt(d2) || 1;
      this.damage(e, dmg, (e.x - x) / d, (e.y - y) / d, 160, color);
    });
    if (cluster) {
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * TAU + this.rng.range(-0.3, 0.3);
        const s = this.rng.range(140, 220);
        this.addProjectile({
          kind: 'bomblet', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 4, dmg: dmg * 0.45,
          life: 0.45, maxLife: 0.45, pierce: 0, hitCd: 0, tx: 0, ty: 0, sx: x, sy: y, area: r * 0.55, evo: false, spin: 0, extra: 0,
        });
      }
    }
  }

  private updatePools(dt: number) {
    const es = this.enemies;
    for (const pl of this.pools) {
      pl.life -= dt;
      pl.tick -= dt;
      if (pl.tick <= 0) {
        pl.tick = 0.3;
        this.grid.query(pl.x, pl.y, pl.r + 20, (j) => {
          const e = es[j];
          if (!e.alive) return;
          const rr = pl.r + e.r * 0.5;
          if (dist2(pl.x, pl.y, e.x, e.y) > rr * rr) return;
          e.burn = 0.5;
          this.damage(e, pl.dmg, 0, 0, 0, '#ff9a1f');
        });
        if (pl.evo && pl.life > 0.5 && this.rng.chance(0.06)) {
          // inferno grid: pools spread
          const a = this.rng.range(0, TAU);
          this.pools.push({ x: pl.x + Math.cos(a) * pl.r * 1.4, y: pl.y + Math.sin(a) * pl.r * 1.4, r: pl.r * 0.7, life: 1.8, maxLife: 1.8, tick: 0.15, dmg: pl.dmg, evo: false });
        }
      }
    }
    if (this.pools.length > 40) this.pools.splice(0, this.pools.length - 40);
  }

  private updateShots(dt: number) {
    for (const s of this.shots) {
      if (!s.alive) continue;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0) s.alive = false;
      const rr = s.r + 9;
      if (dist2(s.x, s.y, this.px, this.py) < rr * rr) {
        s.alive = false;
        this.hurtPlayer(s.dmg);
      }
    }
  }

  private updateTelegraphs(dt: number) {
    for (const tg of this.telegraphs) {
      if (tg.t > 0) {
        tg.t -= dt;
        if (tg.t <= 0) {
          if (tg.kind === 'circle') {
            this.fx.push({ t: 'explode', x: tg.x, y: tg.y, r: tg.r, color: '#ff3b5c' });
            this.fx.push({ t: 'shake', amt: 4 });
            if (dist2(tg.x, tg.y, this.px, this.py) < (tg.r + 8) ** 2) this.hurtPlayer(tg.dmg);
            tg.active = -1;
          } else if (tg.active <= 0 && tg.sweep === 0) {
            // instant line strike (dmg 0 = purely a warning, e.g. Warden's charge lane)
            if (tg.dmg > 0 && this.inLine(tg)) this.hurtPlayer(tg.dmg);
            this.fx.push({ t: 'shake', amt: 5 });
            tg.active = -1;
          }
        }
      } else if (tg.active > 0) {
        tg.active -= dt;
        tg.a += tg.sweep * dt;
        if (this.boss) {
          tg.x = this.boss.x;
          tg.y = this.boss.y;
        }
        (tg as any).tickT = ((tg as any).tickT ?? 0) - dt;
        if ((tg as any).tickT <= 0 && this.inLine(tg)) {
          (tg as any).tickT = 0.25;
          this.hurtPlayer(tg.dmg);
        }
        if (tg.active <= 0) tg.active = -1;
      }
    }
    this.telegraphs = this.telegraphs.filter((t) => t.active !== -1);
  }

  private inLine(tg: Telegraph) {
    const dx = this.px - tg.x;
    const dy = this.py - tg.y;
    const ca = Math.cos(tg.a);
    const sa = Math.sin(tg.a);
    const along = dx * ca + dy * sa;
    const perp = Math.abs(-dx * sa + dy * ca);
    return along > 0 && along < tg.len && perp < tg.r + 8;
  }

  // ------------------------------------------------------------------ pickups

  addPickup(kind: PickupKind, x: number, y: number, value: number): Pickup {
    const p: Pickup = { kind, x, y, value, pulled: false, vx: 0, vy: 0, alive: true, drop: 0, big: false };
    this.pickups.push(p);
    return p;
  }

  private updatePickups(dt: number) {
    const px = this.px;
    const py = this.py;
    const r2 = this.pickupR * this.pickupR;
    let gems = 0;
    for (const p of this.pickups) {
      if (!p.alive) continue;
      if (p.drop > 0) {
        p.drop -= dt;
        continue;
      }
      if (p.kind === 'xp') gems++;
      const d2 = dist2(p.x, p.y, px, py);
      if (!p.pulled && (p.kind === 'xp' || p.kind === 'gold') && d2 < r2) p.pulled = true;
      if (p.pulled) {
        const d = Math.sqrt(d2) || 1;
        const acc = 900;
        p.vx += ((px - p.x) / d) * acc * dt;
        p.vy += ((py - p.y) / d) * acc * dt;
        const sp = Math.hypot(p.vx, p.vy);
        const max = 520;
        if (sp > max) {
          p.vx *= max / sp;
          p.vy *= max / sp;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (dist2(p.x, p.y, px, py) < 18 * 18) this.collect(p);
    }
    if (gems > MAX_GEMS) this.mergeGems();
  }

  private mergeGems() {
    // Fold the farthest gems into one big gem near the player to keep the entity count bounded.
    const gems = this.pickups.filter((p) => p.alive && p.kind === 'xp' && !p.pulled);
    gems.sort((a, b) => dist2(b.x, b.y, this.px, this.py) - dist2(a.x, a.y, this.px, this.py));
    const take = gems.slice(0, gems.length - MAX_GEMS + 60);
    let total = 0;
    for (const g of take) {
      total += g.value;
      g.alive = false;
    }
    if (total > 0) {
      const a = this.rng.range(0, TAU);
      this.addPickup('xp', this.px + Math.cos(a) * 120, this.py + Math.sin(a) * 120, total);
    }
  }

  private collect(p: Pickup) {
    p.alive = false;
    this.fx.push({ t: 'pickup', kind: p.kind, x: p.x, y: p.y });
    switch (p.kind) {
      case 'xp':
        this.gainXp(p.value);
        break;
      case 'gold':
        this.gold += p.value;
        break;
      case 'ration': {
        const amt = this.maxHp * 0.3 * this.base.healMul;
        this.hp = Math.min(this.maxHp, this.hp + amt);
        this.fx.push({ t: 'heal', amt });
        break;
      }
      case 'magnet':
        for (const q of this.pickups) if (q.alive && (q.kind === 'xp' || q.kind === 'gold')) q.pulled = true;
        break;
      case 'emp':
        this.emp();
        break;
      case 'chest':
        this.pendingChests.push(p.big);
        break;
    }
  }

  emp() {
    this.fx.push({ t: 'emp', x: this.px, y: this.py });
    this.fx.push({ t: 'shake', amt: 12 });
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (Math.abs(e.x - this.px) > this.viewW + 30 || Math.abs(e.y - this.py) > this.viewH + 30) continue;
      if (e.kind === 'boss') this.damage(e, e.maxHp * 0.06 / this.dmgMul);
      else if (e.elite) this.damage(e, e.maxHp * 0.5 / this.dmgMul);
      else this.killEnemy(e, true);
    }
    this.shots.length = 0;
  }

  gainXp(v: number) {
    this.xp += v;
    while (this.xp >= this.xpNeed) {
      this.xp -= this.xpNeed;
      this.level++;
      this.xpNeed = xpToNext(this.level);
      this.pendingLevels++;
    }
  }

  // ------------------------------------------------------------------ choices

  private openLevelUp() {
    this.pendingLevels--;
    this.offers = buildOffers(this.rng, this.weapons, this.passives);
    this.state = 'levelup';
    this.fx.push({ t: 'levelup' });
  }

  reroll(): boolean {
    if (this.state !== 'levelup' || this.rerolls <= 0) return false;
    this.rerolls--;
    this.offers = buildOffers(this.rng, this.weapons, this.passives);
    return true;
  }

  choose(i: number) {
    if (this.state !== 'levelup') return;
    const o = this.offers[i];
    if (!o) return;
    this.applyOffer(o);
    this.offers = [];
    this.state = 'play';
    if (this.pendingLevels > 0) this.openLevelUp();
  }

  applyOffer(o: Offer) {
    switch (o.type) {
      case 'weapon': {
        const w = this.weapons.find((x) => x.id === o.id);
        if (w) w.level = Math.min(MAX_SKILL_LEVEL, w.level + 1);
        else this.addWeapon(o.id);
        break;
      }
      case 'passive': {
        const p = this.passives.find((x) => x.id === o.id);
        if (p) p.level = Math.min(MAX_SKILL_LEVEL, p.level + 1);
        else this.passives.push({ id: o.id, level: 1 });
        break;
      }
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.3);
        break;
      case 'gold':
        this.gold += 40;
        break;
    }
    this.recalc();
  }

  evolvable(): WeaponId[] {
    return this.weapons
      .filter((w) => !w.evolved && w.level >= MAX_SKILL_LEVEL && this.passiveLevel(WEAPONS[w.id].partner) > 0)
      .map((w) => w.id);
  }

  private openChest(big: boolean) {
    const evos = this.evolvable();
    const res: ChestResult = { big, evolutions: [], upgrades: [] };
    // Chests always evolve when possible — no luck involved.
    if (evos.length) {
      const n = big ? Math.min(2, evos.length) : 1;
      for (let i = 0; i < n; i++) {
        const id = evos[i];
        const w = this.weapons.find((x) => x.id === id)!;
        w.evolved = true;
        w.timer = 0.2;
        res.evolutions.push(id);
        this.fx.push({ t: 'evolve', weapon: id });
      }
    }
    const ups = (big ? 3 : 1) - res.evolutions.length;
    for (let i = 0; i < ups; i++) {
      const offs = buildOffers(this.rng, this.weapons, this.passives, 1);
      const o = offs[0];
      this.applyOffer(o);
      res.upgrades.push(o);
    }
    this.chest = res;
    this.state = 'chest';
  }

  closeChest() {
    if (this.state !== 'chest') return;
    this.chest = null;
    this.state = 'play';
  }

  // ------------------------------------------------------------------ death

  private onDeath() {
    if (this.revives > 0) {
      this.state = 'revive';
    } else {
      this.state = 'dead';
    }
  }

  revive(accept: boolean) {
    if (this.state !== 'revive') return;
    if (accept && this.revives > 0) {
      this.revives--;
      this.hp = this.maxHp;
      this.state = 'play';
      this.emp();
      this.fx.push({ t: 'banner', text: 'SECOND WIND', sub: 'Signal restored', color: '#43ffa4' });
    } else this.state = 'dead';
  }

  result(): RunResult {
    return {
      won: this.state === 'won',
      time: Math.min(this.time, RUN_LENGTH),
      kills: this.kills,
      gold: this.gold,
      level: this.level,
      bossKills: this.bossKills,
      eliteKills: this.eliteKills,
    };
  }

  // ------------------------------------------------------------------ housekeeping

  private compact() {
    if (this.enemies.some((e) => !e.alive)) this.enemies = this.enemies.filter((e) => e.alive);
    if (this.projectiles.length > 0 && this.projectiles.some((p) => !p.alive))
      this.projectiles = this.projectiles.filter((p) => p.alive);
    this.pools = this.pools.filter((p) => p.life > 0);
    if (this.shots.some((s) => !s.alive)) this.shots = this.shots.filter((s) => s.alive);
    if (this.pickups.some((p) => !p.alive)) this.pickups = this.pickups.filter((p) => p.alive);
    // prune stale hit records occasionally
    if ((this.time * 60) % 120 < 1) {
      for (const e of this.enemies) if (e.hits.size > 12) e.hits.clear();
    }
  }

  /** Readable skill summary for UI. */
  passiveNames() {
    return this.passives.map((p) => PASSIVES[p.id].name);
  }
}

const WEAPON_COLOR: Record<string, string> = {
  bolt: '#5ef2ff',
  rail: '#9ffcff',
  disc: '#ff4fd8',
  drill: '#ffe14d',
  bomblet: '#ffb03d',
  shell: '#ff6a3d',
  canister: '#ff9a1f',
};
