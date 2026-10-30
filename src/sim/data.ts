// All tunable game data lives here so balance passes touch one file.

export type WeaponId =
  | 'pistol'
  | 'blades'
  | 'arc'
  | 'frag'
  | 'field'
  | 'disc'
  | 'napalm'
  | 'drill'
  | 'cleaver'
  // primary guns: start-of-run only (replace the Pulse Pistol), never offered as new level-up picks
  | 'smg'
  | 'flamer'
  | 'mg'
  | 'bazooka';

export type PassiveId =
  | 'chip'
  | 'plating'
  | 'capacitor'
  | 'fuel'
  | 'medkit'
  | 'magnet'
  | 'gel'
  | 'boots'
  | 'adrenal'
  // partners of the primary guns (one each, like the Targeting Chip for the Pulse Pistol)
  | 'extmag'
  | 'injector'
  | 'beltfeed'
  | 'warhead';

export interface WeaponLevel {
  dmg: number; // multiplier on player ATK
  cd: number; // seconds between activations
  count: number; // projectiles / blades / strikes
  area: number; // radius or size (world units)
  speed: number; // projectile speed (units/s)
  dur: number; // lifetime / active time (s)
  pierce: number; // extra enemies a projectile passes through
  extra: number; // weapon-specific (chain jumps, slow %, bounce, etc.)
}

export interface WeaponDef {
  id: WeaponId;
  name: string;
  evoName: string;
  partner: PassiveId;
  desc: string;
  evoDesc: string;
  color: string;
  levels: WeaponLevel[]; // index 0..4 → Lv1..Lv5
  evo: WeaponLevel;
  levelText: string[]; // what each level-up adds (index 1..4 used)
  /** Primary gun: chosen in the Armory, unlocked by campaign progress, never offered mid-run. */
  gun?: { unlock: number; blurb: string };
}

const L = (
  dmg: number,
  cd: number,
  count: number,
  area: number,
  speed: number,
  dur: number,
  pierce: number,
  extra = 0,
): WeaponLevel => ({ dmg, cd, count, area, speed, dur, pierce, extra });

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    name: 'Pulse Pistol',
    evoName: 'Railstorm',
    partner: 'chip',
    desc: 'Fires pulse bolts at the nearest infected.',
    evoDesc: 'Rapid rail volleys that pierce everything in a line.',
    color: '#5ef2ff',
    levels: [
      L(1.76, 0.68, 1, 5, 520, 1.2, 0),
      L(2.03, 0.8, 2, 5, 540, 1.2, 0),
      L(2.29, 0.72, 2, 5, 560, 1.2, 1),
      L(2.56, 0.65, 3, 6, 580, 1.2, 1),
      L(2.97, 0.55, 4, 6, 600, 1.2, 2),
    ],
    evo: L(3.2, 0.32, 5, 7, 900, 1.0, 999),
    levelText: ['', '+1 bolt, +dmg', 'Bolts pierce 1, faster', '+1 bolt, +dmg', '+1 bolt, pierce 2'],
    gun: { unlock: 0, blurb: 'Reliable pulse bolts. Multi-shot as it levels.' },
  },
  blades: {
    id: 'blades',
    name: 'Orbit Blades',
    evoName: 'Halo Saw',
    partner: 'plating',
    desc: 'Plasma blades orbit you nonstop, shredding anything close.',
    evoDesc: 'A permanent ring of eight saws.',
    color: '#ffb84d',
    levels: [
      L(1.98, 4.0, 2, 74, 3.4, 4.0, 0),
      L(2.18, 3.8, 3, 78, 3.6, 4.4, 0),
      L(2.5, 3.6, 3, 86, 3.8, 4.8, 0),
      L(2.81, 3.4, 4, 90, 4.0, 5.2, 0),
      L(3.33, 3.2, 5, 96, 4.3, 5.6, 0),
    ],
    evo: L(3.8, 0, 8, 104, 4.8, 9999, 0),
    levelText: ['', '+1 blade', 'Wider orbit, faster spin', '+1 blade', '+1 blade, +dmg'],
  },
  arc: {
    id: 'arc',
    name: 'Arc Coil',
    evoName: 'Tesla Storm',
    partner: 'capacitor',
    desc: 'Lightning strikes random infected and chains onward.',
    evoDesc: 'A storm of strikes that chain four times.',
    color: '#a98bff',
    levels: [
      L(1.8, 1.7, 2, 26, 0, 0, 0, 1),
      L(2.0, 1.55, 2, 28, 0, 0, 0, 2),
      L(2.2, 1.4, 3, 30, 0, 0, 0, 2),
      L(2.5, 1.25, 4, 32, 0, 0, 0, 2),
      L(2.9, 1.05, 5, 34, 0, 0, 0, 3),
    ],
    evo: L(3.4, 0.5, 6, 40, 0, 0, 0, 4),
    levelText: ['', 'Chains 2 times', '+1 strike', '+1 strike, +dmg', '+1 strike, chains 3'],
  },
  frag: {
    id: 'frag',
    name: 'Frag Launcher',
    evoName: 'Cluster Barrage',
    partner: 'fuel',
    desc: 'Lobs explosive shells into the crowd.',
    evoDesc: 'Every blast scatters five bomblets.',
    color: '#ff6a3d',
    levels: [
      L(3.51, 2.0, 1, 46, 330, 0.6, 0),
      L(3.92, 1.85, 1, 50, 340, 0.6, 0),
      L(4.32, 1.75, 2, 52, 350, 0.6, 0),
      L(4.86, 1.6, 2, 56, 360, 0.6, 0),
      L(5.67, 1.4, 3, 60, 370, 0.6, 0),
    ],
    evo: L(6.0, 1.15, 3, 66, 400, 0.6, 0, 5),
    levelText: ['', 'Bigger blast', '+1 shell', 'Bigger blast, +dmg', '+1 shell, faster'],
  },
  field: {
    id: 'field',
    name: 'Plasma Field',
    evoName: 'Event Horizon',
    partner: 'medkit',
    desc: 'A burning aura that slows nearby infected and softens their hits.',
    evoDesc: 'A huge singularity that drags infected inward.',
    color: '#43ffa4',
    levels: [
      L(1.03, 0.5, 1, 72, 0, 0, 0, 0.25),
      L(1.21, 0.5, 1, 82, 0, 0, 0, 0.28),
      L(1.38, 0.45, 1, 92, 0, 0, 0, 0.32),
      L(1.55, 0.45, 1, 102, 0, 0, 0, 0.36),
      L(1.84, 0.4, 1, 112, 0, 0, 0, 0.4),
    ],
    evo: L(2.2, 0.33, 1, 150, 0, 0, 0, 0.5),
    levelText: ['', 'Larger field', 'Larger, faster ticks', 'Larger field, +slow', 'Larger, +dmg'],
  },
  disc: {
    id: 'disc',
    name: 'Disc Launcher',
    evoName: 'Gravity Disc',
    partner: 'magnet',
    desc: 'Throws a returning disc that cuts through everything.',
    evoDesc: 'Four discs that drag infected along their path.',
    color: '#ff4fd8',
    levels: [
      L(1.6, 1.7, 1, 14, 380, 1.1, 999),
      L(1.8, 1.6, 1, 15, 400, 1.15, 999),
      L(2.0, 1.5, 2, 16, 410, 1.2, 999),
      L(2.3, 1.35, 2, 18, 420, 1.25, 999),
      L(2.7, 1.2, 3, 19, 440, 1.3, 999),
    ],
    evo: L(3.1, 0.95, 4, 24, 480, 1.4, 999, 1),
    levelText: ['', 'Faster, +range', '+1 disc', 'Bigger disc, +dmg', '+1 disc'],
  },
  napalm: {
    id: 'napalm',
    name: 'Napalm',
    evoName: 'Inferno Grid',
    partner: 'gel',
    desc: 'Hurls canisters that leave burning pools.',
    evoDesc: 'Five spreading pools that set everything ablaze.',
    color: '#ff9a1f',
    levels: [
      L(0.5, 2.4, 1, 36, 300, 3.0, 0),
      L(0.6, 2.3, 2, 38, 300, 3.2, 0),
      L(0.7, 2.2, 2, 42, 300, 3.4, 0),
      L(0.8, 2.0, 3, 45, 300, 3.6, 0),
      L(0.95, 1.8, 3, 50, 300, 4.0, 0),
    ],
    evo: L(1.25, 1.6, 5, 62, 320, 5.0, 0),
    levelText: ['', '+1 canister', 'Bigger pools', '+1 canister, +dmg', 'Bigger, longer pools'],
  },
  drill: {
    id: 'drill',
    name: 'Ricochet Drill',
    evoName: 'Hyperdrill',
    partner: 'boots',
    desc: 'A drill that bounces off the edges of your view.',
    evoDesc: 'Four drills that never stop bouncing.',
    color: '#ffe14d',
    levels: [
      L(1.1, 3.0, 1, 12, 360, 3.0, 999),
      L(1.25, 2.8, 1, 13, 380, 3.5, 999),
      L(1.4, 2.6, 2, 14, 390, 3.8, 999),
      L(1.6, 2.4, 2, 15, 400, 4.2, 999),
      L(1.85, 2.2, 3, 16, 420, 4.6, 999),
    ],
    evo: L(2.8, 0, 4, 18, 470, 9999, 999),
    levelText: ['', 'Longer, faster', '+1 drill', 'Longer, +dmg', '+1 drill'],
  },
  cleaver: {
    id: 'cleaver',
    name: 'Plasma Cleaver',
    evoName: 'Rift Reaper',
    partner: 'adrenal',
    desc: 'Sweeps a plasma blade through anything in front of you.',
    evoDesc: 'Full-circle reaping slashes that hurl the horde back.',
    color: '#ff5470',
    // area = reach, extra = half-angle of the sweep (radians), count = swings per activation
    levels: [
      L(2.99, 1.05, 1, 64, 0, 0, 0, 1.0),
      L(3.45, 0.98, 1, 68, 0, 0, 0, 1.1),
      L(3.91, 0.9, 2, 72, 0, 0, 0, 1.15),
      L(4.48, 0.82, 2, 76, 0, 0, 0, 1.25),
      L(5.29, 0.74, 2, 82, 0, 0, 0, 1.35),
    ],
    evo: L(6.21, 0.6, 2, 96, 0, 0, 0, Math.PI),
    levelText: ['', 'Longer reach, +dmg', 'Swings twice', 'Wider sweep, +dmg', 'Faster, +dmg'],
  },

  // ------------------------------------------------------------ primary guns
  // All four pair with the Targeting Chip, like the Pulse Pistol they replace.
  smg: {
    id: 'smg',
    name: 'Vector SMG',
    evoName: 'Bullet Hose',
    partner: 'extmag',
    desc: 'A rattling stream of rounds at the nearest infected.',
    evoDesc: 'A relentless hose of piercing rounds.',
    color: '#ffd34d',
    // count = rounds per trigger pull, extra = spread (radians)
    levels: [
      L(0.62, 0.2, 1, 4, 640, 0.62, 0, 0.1),
      L(0.7, 0.18, 1, 4, 660, 0.62, 1, 0.1),
      L(0.78, 0.17, 2, 4, 680, 0.64, 1, 0.12),
      L(0.86, 0.16, 2, 5, 700, 0.66, 2, 0.12),
      L(0.96, 0.14, 3, 5, 720, 0.68, 3, 0.14),
    ],
    evo: L(1.2, 0.07, 3, 6, 840, 0.72, 6, 0.16),
    levelText: ['', 'Faster fire, rounds pierce 1', '+1 round per burst', 'Rounds pierce 2', '+1 round, pierce 3'],
    gun: { unlock: 2, blurb: 'Fast, light rounds. Shreds runners and crawlers.' },
  },
  flamer: {
    id: 'flamer',
    name: 'Flamethrower',
    evoName: "Dragon's Breath",
    partner: 'injector',
    desc: 'Hoses a cone of fire through everything in front of you.',
    evoDesc: 'A roaring, longer jet that torches whole crowds.',
    color: '#ff7a1f',
    // area = flame size, speed = jet speed (range), count = flames per puff, extra = cone half-angle
    levels: [
      L(0.49, 0.09, 1, 20, 300, 0.42, 999, 0.22),
      L(0.54, 0.085, 1, 22, 310, 0.44, 999, 0.24),
      L(0.59, 0.08, 2, 23, 320, 0.46, 999, 0.26),
      L(0.67, 0.075, 2, 25, 330, 0.48, 999, 0.28),
      L(0.76, 0.07, 2, 28, 340, 0.5, 999, 0.3),
    ],
    evo: L(0.9, 0.05, 3, 32, 420, 0.55, 999, 0.34),
    levelText: ['', 'Hotter, longer jet', '+1 flame per puff', 'Wider cone, +dmg', 'Bigger flames, +dmg'],
    gun: { unlock: 4, blurb: 'Short range, burns through every infected in the cone.' },
  },
  mg: {
    id: 'mg',
    name: 'Heavy Machine Gun',
    evoName: 'Minigun',
    partner: 'beltfeed',
    desc: 'Heavy rounds that punch through the front rank.',
    evoDesc: 'A spinning wall of lead that pierces the whole line.',
    color: '#ffb02e',
    levels: [
      L(0.95, 0.3, 1, 5, 700, 0.9, 1, 0.08),
      L(1.06, 0.27, 1, 5, 720, 0.9, 1, 0.08),
      L(1.14, 0.24, 1, 6, 740, 0.95, 2, 0.1),
      L(1.25, 0.21, 2, 6, 760, 0.95, 2, 0.1),
      L(1.41, 0.18, 2, 6, 780, 1.0, 3, 0.12),
    ],
    evo: L(1.5, 0.065, 2, 7, 900, 1.0, 5, 0.14),
    levelText: ['', 'Faster fire, +dmg', 'Rounds pierce 2', '+1 round per burst', 'Pierce 3, faster'],
    gun: { unlock: 6, blurb: 'Hard-hitting rounds that pierce, with real knockback.' },
  },
  bazooka: {
    id: 'bazooka',
    name: 'Bazooka',
    evoName: 'Warhead Swarm',
    partner: 'warhead',
    desc: 'Fires rockets that explode on impact.',
    evoDesc: 'Rocket salvos whose blasts scatter bomblets.',
    color: '#ff4d3d',
    // area = blast radius
    levels: [
      L(5.4, 1.2, 1, 44, 330, 1.6, 0),
      L(5.9, 1.15, 1, 46, 340, 1.6, 0),
      L(5.6, 1.1, 2, 48, 350, 1.6, 0),
      L(6.0, 1.05, 2, 50, 360, 1.6, 0),
      L(6.0, 1.0, 3, 50, 380, 1.6, 0),
    ],
    evo: L(6.8, 0.85, 3, 56, 420, 1.6, 0, 1),
    levelText: ['', 'Bigger blast, +dmg', '+1 rocket', 'Bigger blast, +dmg', '+1 rocket, faster'],
    gun: { unlock: 8, blurb: 'Slow, devastating rockets. Best against packs and bosses.' },
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** Primary guns in unlock order (the Pulse Pistol first). `unlock` is the campaign sector index that must be unlocked. */
export const GUN_IDS: WeaponId[] = ['pistol', 'smg', 'flamer', 'mg', 'bazooka'];
export const gunUnlock = (id: WeaponId) => WEAPONS[id].gun?.unlock ?? 0;
export const isGun = (id: WeaponId) => GUN_IDS.includes(id);

export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string; // per level
  color: string;
  partnerOf: WeaponId;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  chip: { id: 'chip', name: 'Targeting Chip', desc: '+12% damage', color: '#5ef2ff', partnerOf: 'pistol' },
  plating: { id: 'plating', name: 'Kinetic Plating', desc: '-7% damage taken', color: '#ffb84d', partnerOf: 'blades' },
  capacitor: { id: 'capacitor', name: 'Capacitor', desc: '-7% cooldowns', color: '#a98bff', partnerOf: 'arc' },
  fuel: { id: 'fuel', name: 'Volatile Fuel', desc: '+10% area', color: '#ff6a3d', partnerOf: 'frag' },
  medkit: { id: 'medkit', name: 'Nano Medkit', desc: '+12% max HP, +0.4 HP/s', color: '#43ffa4', partnerOf: 'field' },
  magnet: { id: 'magnet', name: 'Magnet Core', desc: '+30% pickup range', color: '#ff4fd8', partnerOf: 'disc' },
  gel: { id: 'gel', name: 'Thermal Gel', desc: '+12% duration, +8% projectile speed', color: '#ff9a1f', partnerOf: 'napalm' },
  boots: { id: 'boots', name: 'Thruster Boots', desc: '+8% move speed', color: '#ffe14d', partnerOf: 'drill' },
  adrenal: { id: 'adrenal', name: 'Adrenal Pump', desc: 'Kills heal 0.06% max HP', color: '#ff5470', partnerOf: 'cleaver' },
  // gun partners: tune their own gun (weapons.ts withPartner) + a little damage to everything.
  // Only offered while you carry that gun.
  extmag: { id: 'extmag', name: 'Extended Mag', desc: 'SMG fires 6% faster, +8% damage', color: '#ffd34d', partnerOf: 'smg' },
  injector: { id: 'injector', name: 'Fuel Injector', desc: 'Flamethrower reaches further and burns 7% hotter, +8% damage', color: '#ff7a1f', partnerOf: 'flamer' },
  beltfeed: { id: 'beltfeed', name: 'Belt Feed', desc: 'Machine Gun hits 7% harder, pierces more at Lv 2 and 4, +8% damage', color: '#ffb02e', partnerOf: 'mg' },
  warhead: { id: 'warhead', name: 'Warhead Core', desc: 'Bazooka blasts wider and 4% harder, +8% damage', color: '#ff4d3d', partnerOf: 'bazooka' },
};

export const PASSIVE_IDS = Object.keys(PASSIVES) as PassiveId[];

export const MAX_SKILL_LEVEL = 5;
export const MAX_WEAPON_SLOTS = 6;
export const MAX_PASSIVE_SLOTS = 6;

/**
 * New players get a smaller, simpler kit so level-ups aren't a wall of unfamiliar choices:
 * Sectors 1-2 offer 5 weapons and their partner supports with 3+3 slots; Sector 3 opens 4+4 slots
 * and the full arsenal; Sector 4+ (and Daily/Endless) is the full 6+6 game.
 */
export interface LoadoutRules {
  maxW: number;
  maxP: number;
  weapons: WeaponId[] | null; // null = everything
}
export const STARTER_WEAPONS: WeaponId[] = ['pistol', 'blades', 'arc', 'frag', 'cleaver'];
export function loadoutFor(sector: number, campaign: boolean): LoadoutRules {
  if (!campaign || sector >= 3) return { maxW: MAX_WEAPON_SLOTS, maxP: MAX_PASSIVE_SLOTS, weapons: null };
  if (sector === 2) return { maxW: 4, maxP: 4, weapons: null };
  return { maxW: 3, maxP: 3, weapons: STARTER_WEAPONS };
}

// ---------------------------------------------------------------- enemies

export type EnemyKind = 'shambler' | 'runner' | 'crawler' | 'brute' | 'spitter' | 'bloater';
export type BossKind = 'warden' | 'hive' | 'colossus' | 'broadcaster';

export interface EnemyDef {
  kind: EnemyKind;
  r: number;
  speed: number;
  hp: number;
  dmg: number;
  xp: number;
  mass: number; // knockback resistance
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  shambler: { kind: 'shambler', r: 11, speed: 40, hp: 10, dmg: 7, xp: 1, mass: 1 },
  runner: { kind: 'runner', r: 9, speed: 76, hp: 6, dmg: 5, xp: 1, mass: 0.7 },
  crawler: { kind: 'crawler', r: 7, speed: 58, hp: 3.5, dmg: 4, xp: 1, mass: 0.5 },
  brute: { kind: 'brute', r: 19, speed: 30, hp: 70, dmg: 14, xp: 6, mass: 4 },
  spitter: { kind: 'spitter', r: 11, speed: 42, hp: 15, dmg: 6, xp: 2, mass: 1 },
  bloater: { kind: 'bloater', r: 15, speed: 33, hp: 28, dmg: 10, xp: 3, mass: 2 },
};

export interface BossDef {
  kind: BossKind;
  name: string;
  title: string;
  r: number;
  speed: number;
  hp: number; // base, scaled by chapter
  dmg: number;
}

export const BOSSES: Record<BossKind, BossDef> = {
  warden: { kind: 'warden', name: 'The Warden', title: 'Riot Unit 07, still on duty', r: 34, speed: 46, hp: 2600, dmg: 18 },
  hive: { kind: 'hive', name: 'Hive Mother', title: 'She hears the signal loudest', r: 38, speed: 30, hp: 3200, dmg: 16 },
  broadcaster: { kind: 'broadcaster', name: 'The Broadcaster', title: 'Still on the air', r: 40, speed: 34, hp: 4600, dmg: 21 },
  colossus: { kind: 'colossus', name: 'Signal Colossus', title: 'The tower walks', r: 44, speed: 26, hp: 4200, dmg: 22 },
};

// ---------------------------------------------------------------- run pacing

/** Real run length in seconds. */
export const RUN_LENGTH = 300;
/**
 * The run's pacing tables (spawns, enemy mix, hordes, elites, HP scaling) are authored on a
 * 0–600 "mission clock"; the sim advances it TIME_SCALE× faster than real time, so a 5-minute run
 * still builds from a trickle to a packed horde.
 */
export const MISSION_LENGTH = 600;
export const TIME_SCALE = MISSION_LENGTH / RUN_LENGTH;
/** Mission time of the mid-boss (real time = this / TIME_SCALE). */
export const MIDBOSS_TIME = 300;
/** Real-time star thresholds (half and 80% of the run). */
export const STAR1_TIME = RUN_LENGTH * 0.5;
export const STAR2_TIME = RUN_LENGTH * 0.8;
/** Sector 1 is a short training run (2:00, straight to the boss); everything else is 5:00. */
export const runLengthFor = (sector: number) => (sector === 0 ? 120 : RUN_LENGTH);
/** Star thresholds scale with the run: survive half, survive 80%, clear. */
export const starTimes = (len: number): [number, number] => [len * 0.5, len * 0.8];
/** XP gem multiplier: half the run time, most of the level-ups. */
export const XP_MUL = 1.05;

export interface HordeEvent {
  t: number;
  kind: EnemyKind;
  count: number;
  rings: number;
}
export const HORDES: HordeEvent[] = [
  { t: 90, kind: 'shambler', count: 36, rings: 1 },
  { t: 240, kind: 'runner', count: 44, rings: 1 },
  { t: 390, kind: 'shambler', count: 56, rings: 2 },
  { t: 510, kind: 'crawler', count: 70, rings: 2 },
];
export const ELITE_TIMES = [150, 450];

/** Weighted enemy mix by run time (seconds). */
export function enemyMix(t: number): [EnemyKind, number][] {
  return [
    ['shambler', 10],
    ['runner', t > 40 ? 4 + t / 60 : 0],
    ['crawler', t > 120 ? 5 : 0],
    ['spitter', t > 180 ? 2 + t / 150 : 0],
    ['brute', t > 200 ? 1 + t / 200 : 0],
    ['bloater', t > 270 ? 2 : 0],
  ];
}

/** Spawns per second. */
/** Spawns per second: a gentle 60s build-up for a level-1 build, then a dense, rising horde. */
export const spawnRate = (t: number) => (t < 60 ? 3.2 + t * 0.06 : 5 + t * 0.03 + (t * t) / 36000);

/** Enemy HP multiplier over a run. */
export const hpScale = (t: number) => 1 + t / 70 + (t * t) / 52000;

/** Experience needed to go from level L to L+1. */
export const xpToNext = (L: number) => Math.round(3 + 3.2 * L + 0.6 * L * L);
