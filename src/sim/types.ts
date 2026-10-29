import type { BossKind, EnemyKind, PassiveId, WeaponId } from './data';

export interface Enemy {
  id: number;
  kind: EnemyKind | 'boss';
  boss?: BossKind;
  x: number;
  y: number;
  kx: number; // knockback velocity
  ky: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  xp: number;
  mass: number;
  elite: boolean;
  alive: boolean;
  flash: number; // hit flash timer
  slow: number; // 0..1 current slow amount (refreshed by field)
  contactCd: number;
  anim: number; // walk cycle phase
  face: number; // -1 left, 1 right
  shootCd: number;
  hits: Map<number, number>; // sourceId -> time of last hit (for per-source hit cooldowns)
  burn: number; // napalm burn visual timer
  // boss AI scratch
  state: number;
  stateT: number;
  aimA: number;
  phase2: boolean;
}

export type ProjKind = 'bolt' | 'rail' | 'shell' | 'bomblet' | 'disc' | 'drill' | 'canister' | 'bullet' | 'slug' | 'flame' | 'rocket';

export interface Projectile {
  id: number;
  kind: ProjKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  maxLife: number;
  pierce: number;
  hitCd: number; // per-enemy re-hit cooldown, 0 = hit once
  // target point for lobbed shells/canisters
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  area: number;
  evo: boolean;
  alive: boolean;
  spin: number;
  extra: number; // weapon-specific payload (e.g. napalm pool lifetime)
}

export interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  kind: 'acid' | 'spore';
  alive: boolean;
  /** Homing strength (rad/s turn rate) for seeker orbs. */
  home?: number;
}

export interface Pool {
  x: number;
  y: number;
  r: number;
  life: number;
  maxLife: number;
  tick: number;
  dmg: number;
  evo: boolean;
}

/** Boss telegraphs: they show where damage is about to land, then detonate. */
export interface Telegraph {
  kind: 'circle' | 'line';
  x: number;
  y: number;
  r: number; // radius (circle) or half-width (line)
  a: number; // angle (line)
  len: number; // line length
  t: number; // time until detonation
  total: number;
  dmg: number;
  sweep: number; // for sweeping lasers: angular velocity once active
  active: number; // >0 while laser is live
}

export type PickupKind = 'xp' | 'gold' | 'ration' | 'magnet' | 'emp' | 'chest';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  pulled: boolean;
  vx: number;
  vy: number;
  alive: boolean;
  drop: number; // airdrop fall animation timer (>0 = still falling, not collectible)
  big: boolean; // chest from boss vs elite
}

export interface WeaponState {
  id: WeaponId;
  level: number; // 1..5
  evolved: boolean;
  timer: number;
  active: number; // for timed weapons (blades): remaining active time
  angle: number;
  sourceId: number;
}

export interface PassiveState {
  id: PassiveId;
  level: number;
}

export type Offer =
  | { type: 'weapon'; id: WeaponId; level: number; isNew: boolean }
  | { type: 'passive'; id: PassiveId; level: number; isNew: boolean }
  | { type: 'heal' }
  | { type: 'gold' };

export interface ChestResult {
  big: boolean;
  evolutions: WeaponId[];
  upgrades: Offer[];
}

export type FxEvent =
  | { t: 'hit'; x: number; y: number; color: string }
  | { t: 'dmg'; x: number; y: number; v: number; crit: boolean }
  | { t: 'death'; x: number; y: number; kind: string; elite: boolean; r: number }
  | { t: 'explode'; x: number; y: number; r: number; color: string }
  | { t: 'arc'; pts: number[]; color: string }
  | { t: 'shake'; amt: number }
  | { t: 'levelup' }
  | { t: 'pickup'; kind: PickupKind; x: number; y: number }
  | { t: 'playerHit'; amt: number }
  | { t: 'banner'; text: string; sub: string; color: string }
  | { t: 'toast'; text: string; color: string; big?: boolean }
  | { t: 'shoot'; weapon: WeaponId }
  | { t: 'slash'; x: number; y: number; a: number; r: number; arc: number; evo: boolean }
  | { t: 'emp'; x: number; y: number }
  | { t: 'heal'; amt: number }
  | { t: 'evolve'; weapon: WeaponId }
  | { t: 'bossDown'; x: number; y: number }
  | { t: 'airdrop'; x: number; y: number };

export interface BaseStats {
  atk: number;
  hp: number;
  def: number; // 0..0.6 damage reduction from gear/talents
  crit: number; // crit chance
  critMul: number;
  moveSpeed: number;
  pickup: number;
  healMul: number;
  goldMul: number;
  rerolls: number;
  revives: number;
  startWeapon: WeaponId;
  startLevels: number; // free level-ups at run start (Head Start talent)
  regen: number; // fraction of max hp per second
  /** Character perk: a second weapon at run start. */
  bonusWeapon?: WeaponId;
}

export type RunState = 'play' | 'levelup' | 'chest' | 'revive' | 'dead' | 'won';
