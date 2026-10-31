import { CHARACTERS, charById } from './characters';
import { PASS_TIERS, freshPass, passLevel, passReward, runSp, seasonOf, type PassReward, type PassState } from './pass';
import { dailyBoard, ENDLESS_BOARD, submitScore, uuid, type Submission } from '../net/leaderboard';
import { DAILY_TIERS, dailySeed, type RunMode } from '../sim/modes';
import { LOGIN_DAYS, freshLogin, loginReward, type LoginReward, type LoginState } from './login';
import { CHAPTER_COUNT, getChapter } from '../sim/chapters';
import { GUN_IDS, STAR2_TIME, TIME_SCALE, gunUnlock, runLengthFor, starTimes, type WeaponId } from '../sim/data';
import { Rng } from '../sim/math';
import type { RunResult } from '../sim/game';
import type { BaseStats } from '../sim/types';
import {
  GEAR,
  GEAR_IDS,
  MAX_LEVEL,
  MERGE_COUNT,
  RARITIES,
  SLOTS,
  SLOT_NAMES,
  activePerks,
  dropWeights,
  gearStat,
  levelCost,
  salvageValue,
  type GearItem,
  type PerkStat,
  type Slot,
} from './gear';
import { dailyBonus, dateKey, MISSION_DEFS, rollDaily, starReward, type DailyMissions, type MissionKind, type Reward } from './missions';
import { MILESTONES, TRACKS, accountXpNeed, trackCap, trackCost, type TrackId } from './talents';
import { ASCEND_AT, LAB, ascendKeys, coresFor, freshAsc, labPerk, rankRewardMul, type AscState, type LabId } from './ascension';

export interface CoachAction {
  kind: 'collect' | 'equip' | 'merge' | 'crate' | 'talent' | 'level';
  label: string;
  detail: string;
  apply: () => boolean;
}

export const KEY = 'deadsignal.save.v1';
export const RELAY_CAP_H = 8;

export interface Settings {
  sfx: boolean;
  music: boolean;
  haptics: boolean;
  damageNumbers: boolean;
  /** Movement: drag anywhere, or a fixed thumb pad in the bottom-left / bottom-right corner. */
  controls: ControlMode;
  /** Renderer: '3d' (default) or the original '2d' art. */
  graphics?: '3d' | '2d';
}

export type ControlMode = 'drag' | 'left' | 'right';

export interface SaveData {
  v: 1;
  gold: number;
  scrap: number;
  keys: number;
  accountLevel: number;
  accountXp: number;
  unlocked: number; // highest sector index unlocked
  stars: Record<number, number>; // bitmask: 1 = survived half the run, 2 = 80%, 4 = cleared
  best: Record<number, number>; // best survival time per sector
  gear: GearItem[];
  equipped: Partial<Record<Slot, string>>;
  /**
   * Gear levels belong to the slot, not the item: whatever is equipped there uses the slot's level
   * (capped by its rarity's max level), so swapping in better gear never costs levelling.
   */
  slotLv: Partial<Record<Slot, number>>;
  tracks: Record<TrackId, number>;
  relayAt: number; // ms timestamp of last relay claim
  lastDaily: string;
  settings: Settings;
  stats: { runs: number; kills: number; bossKills: number; wins: number };
  seenIntro: boolean;
  uidSeq: number;
  missions: DailyMissions | null;
  /** Claimed sector-chest bits per sector (same bit layout as stars). */
  starClaims: Record<number, number>;
  bestScore: Record<number, number>;
  login: LoginState;
  daily: { key: string; best: number; tiers: number; plays: number; bestEver: number };
  endless: { best: number; bestScore: number; runs: number };
  character: string;
  online: { id: string; name: string; crew: string; pending: Submission[] };
  pass: PassState;
  adKeys?: { date: string; n: number };
  /** Chosen primary gun (replaces the Pulse Pistol). Unset = the newest one unlocked. */
  gun?: WeaponId;
  /** Cloud save sync code (see meta/sync.ts); `saved` = the player confirmed they kept a copy. */
  sync?: { code: string; saved?: boolean; nagAt?: number };
  /** Google Drive backup: when this device last backed up there. */
  gdrive?: { at: number };
  /** Ascension (see meta/ascension.ts). Unset = never ascended. */
  asc?: AscState;
}

export interface RunRewards {
  gold: number;
  xp: number;
  keys: number;
  scrap: number;
  items: GearItem[];
  firstClear: boolean;
  newStars: number;
  levelsGained: number;
  unlockedSector: boolean;
  score: number;
  newBest: boolean;
  prevBest: number;
  starsBefore: number;
  starsAfter: number;
  /** Daily Challenge tiers reached for the first time today. */
  tiersNew?: string[];
  mode?: RunMode;
  /** Primary gun unlocked (and equipped) by this clear, if any. */
  newGun?: WeaponId;
  /** Character unlocked by this clear, if any. */
  newCharacter?: string;
  /** Loadout grew with this clear (starter kit opens up over Sectors 1-3). */
  newLoadout?: string;
}

function fresh(): SaveData {
  return {
    v: 1,
    gold: 150,
    scrap: 10,
    keys: 1,
    accountLevel: 1,
    accountXp: 0,
    unlocked: 0,
    stars: {},
    best: {},
    gear: [
      { uid: 'g1', def: 'sidearm', rarity: 0, level: 1 },
      { uid: 'g2', def: 'kevlar', rarity: 0, level: 1 },
    ],
    equipped: { weapon: 'g1', vest: 'g2' },
    slotLv: {},
    tracks: { atk: 0, hp: 0, def: 0, heal: 0 },
    relayAt: Date.now(),
    lastDaily: '',
    settings: { sfx: true, music: true, haptics: true, damageNumbers: true, controls: 'drag' },
    stats: { runs: 0, kills: 0, bossKills: 0, wins: 0 },
    seenIntro: false,
    uidSeq: 3,
    missions: null,
    starClaims: {},
    bestScore: {},
    login: freshLogin(),
    daily: { key: '', best: 0, tiers: 0, plays: 0, bestEver: 0 },
    endless: { best: 0, bestScore: 0, runs: 0 },
    character: 'courier',
    online: { id: '', name: '', crew: '', pending: [] },
    pass: freshPass(seasonOf().n),
  };
}

/** Validate and fill in a parsed save (from storage or the cloud); null if it isn't one. */
export function normalizeSave(raw: unknown): SaveData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as SaveData;
  if (d.v !== 1 || typeof d.unlocked !== 'number' || !Array.isArray(d.gear)) return null;
  const f = fresh();
  if (!d.slotLv) migrateSlotLevels(d);
  return { ...f, ...d, settings: { ...f.settings, ...d.settings }, starClaims: d.starClaims ?? {}, bestScore: d.bestScore ?? {}, login: d.login ?? freshLogin(), daily: d.daily ?? f.daily, endless: d.endless ?? f.endless, character: d.character ?? 'courier', online: d.online ?? f.online, pass: d.pass ?? f.pass };
}

/**
 * Older saves levelled each item. Move that onto the slots: each slot takes the highest level any
 * of its items had (nobody loses power), and items go back to level 1 so nothing is counted twice.
 */
function migrateSlotLevels(d: SaveData) {
  const lv: Partial<Record<Slot, number>> = {};
  for (const it of d.gear) {
    const s = GEAR[it.def]?.slot;
    if (!s) continue;
    lv[s] = Math.max(lv[s] ?? 1, it.level | 0 || 1);
    it.level = 1;
  }
  d.slotLv = lv;
}

/** How far along a save is, for "keep the furthest" merges: sector, then account level, then XP. */
export function progressOf(d: SaveData): number {
  // an ascension restarts the campaign, so the rank comes first: a pre-ascension backup must never win
  return Math.min(d.asc?.rank ?? 0, 9000) * 1e11 + d.unlocked * 1e9 + Math.min(d.accountLevel, 9999) * 1e5 + Math.min(Math.max(0, d.accountXp | 0), 99999);
}

export class Profile {
  data: SaveData;
  /** Playtest links only (never saved): floor for ATK/HP so a test save can hold its own deep in the campaign. */
  boost: { atk: number; hp: number } | null = null;
  private listeners: (() => void)[] = [];

  constructor(private storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null, private key = KEY) {
    this.data = this.load();
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  /** How this launch's save was loaded: 'ok', 'backup' (main save was unreadable), or 'new'. */
  loadedFrom: 'ok' | 'backup' | 'new' = 'new';

  private get(k: string) {
    try {
      return this.storage?.getItem(k) ?? null;
    } catch {
      return null;
    }
  }
  private put(k: string, v: string) {
    try {
      this.storage?.setItem(k, v);
    } catch {
      /* storage full / private mode */
    }
  }

  /**
   * Load with fallbacks so a bad write never silently wipes a player:
   *  1. the main save;
   *  2. if that's unreadable (crash mid-write, bad update, unknown version), the copy taken at the
   *     last good launch (`:bak`); the unreadable text is kept in `:broken` for support;
   *  3. the sync code is also stored on its own (`:code`), so even a fresh start can find its cloud
   *     save again and adopt it on launch.
   */
  private load(): SaveData {
    let d: SaveData | null = null;
    const raw = this.get(this.key);
    if (raw) {
      try {
        d = normalizeSave(JSON.parse(raw));
      } catch {
        d = null;
      }
      if (d) {
        this.loadedFrom = 'ok';
        this.put(this.key + ':bak', raw); // known-good copy for next time
      } else if (!this.get(this.key + ':broken')) this.put(this.key + ':broken', raw.slice(0, 500_000));
    }
    if (!d) {
      const bak = this.get(this.key + ':bak');
      if (bak) {
        try {
          d = normalizeSave(JSON.parse(bak));
        } catch {
          d = null;
        }
        if (d) this.loadedFrom = 'backup';
      }
    }
    d ??= fresh();
    const code = this.get(this.key + ':code');
    if (!d.sync?.code && code && /^[A-HJ-NP-Z2-9]{10}$/.test(code)) d.sync = { ...d.sync, code };
    return d;
  }

  /** Sync codes this device used before a Reset (newest first), so a reset can be undone. */
  previousCodes(): string[] {
    try {
      const v = JSON.parse(this.get(this.key + ':codes') ?? '[]');
      return Array.isArray(v) ? v.filter((c) => typeof c === 'string') : [];
    } catch {
      return [];
    }
  }

  /**
   * Replace this device's progress with a save from the cloud. Keeps this device's settings
   * (sound, controls, graphics) and sync code. Returns false (and changes nothing) if the save
   * isn't a valid Dead Signal save.
   */
  adopt(raw: unknown, code?: string): boolean {
    const d = normalizeSave(raw);
    if (!d) return false;
    d.settings = this.data.settings;
    d.sync = code ? { code } : this.data.sync;
    this.data = d;
    this.save();
    return true;
  }

  save() {
    this.put(this.key, JSON.stringify(this.data));
    const code = this.data.sync?.code;
    if (code && code !== this.savedCode) {
      this.put(this.key + ':code', code);
      this.savedCode = code;
    }
    for (const l of this.listeners) l();
  }
  private savedCode = '';

  /** Erase this device's progress. The old cloud backups are left alone under the old code; this
   *  device starts a fresh code so the reset can't be undone by a sync. */
  reset() {
    const old = this.data.sync?.code;
    if (old) this.put(this.key + ':codes', JSON.stringify([old, ...this.previousCodes().filter((c) => c !== old)].slice(0, 5)));
    this.data = fresh();
    this.put(this.key + ':code', '');
    this.savedCode = '';
    this.save();
  }

  // ------------------------------------------------------------------ stats

  equippedItems(): GearItem[] {
    const out: GearItem[] = [];
    for (const s of SLOTS) {
      const uid = this.data.equipped[s];
      const it = uid ? this.item(uid) : undefined;
      if (it) out.push(it);
    }
    return out;
  }

  item(uid: string) {
    return this.data.gear.find((g) => g.uid === uid);
  }

  private perkSum(): Record<PerkStat, number> {
    const sum = { atkPct: 0, hpPct: 0, crit: 0, critMul: 0, def: 0, move: 0, pickup: 0, heal: 0, regen: 0, revive: 0, startLevel: 0 } as Record<PerkStat, number>;
    for (const it of this.equippedItems()) for (const p of activePerks(it)) sum[p.stat] += p.value;
    return sum;
  }

  private milestone(key: string) {
    return MILESTONES.filter((m) => m.key === key && this.data.accountLevel >= m.level).reduce((a, m) => a + m.value, 0);
  }

  baseStats(): BaseStats {
    const d = this.data;
    let atk = 10 + d.tracks.atk * 2;
    let hp = 120 + d.tracks.hp * 15;
    for (const it of this.equippedItems()) {
      const g = GEAR[it.def];
      if (g.stat === 'atk') atk += this.statOf(it);
      else hp += this.statOf(it);
    }
    const p = this.perkSum();
    const ch = charById(d.character);
    atk *= 1 + p.atkPct + (ch.atkPct ?? 0) + this.lab('atk') * 0.05;
    hp *= 1 + p.hpPct + (ch.hpPct ?? 0) + this.lab('hp') * 0.05;
    return {
      atk: Math.round(Math.max(atk, this.boost?.atk ?? 0)),
      hp: Math.round(Math.max(hp, this.boost?.hp ?? 0)),
      def: Math.min(0.6, d.tracks.def * 0.005 + p.def),
      crit: 0.05 + p.crit + this.milestone('crit') + (ch.crit ?? 0),
      critMul: 1.5 + p.critMul,
      moveSpeed: 92 * (1 + p.move + (ch.move ?? 0)),
      pickup: 46 * (1 + p.pickup + this.milestone('pickup') + (ch.pickup ?? 0)),
      healMul: 1 + d.tracks.heal * 0.04 + p.heal + (ch.healMul ?? 0),
      goldMul: 1 + this.milestone('gold'),
      rerolls: 1 + this.milestone('reroll'),
      revives: this.milestone('revive') + p.revive + this.lab('revive'),
      // one primary weapon: always the gun picked in the Armory (weapon gear only adds stats)
      startWeapon: this.gun(),
      startLevels: this.milestone('startLevel') + p.startLevel + this.lab('start'),
      regen: p.regen + (ch.regen ?? 0),
      bonusWeapon: ch.bonusWeapon,
    };
  }

  /** Primary guns unlocked so far, in unlock order. */
  gunsUnlocked(): WeaponId[] {
    return GUN_IDS.filter((id) => gunUnlock(id) <= this.reach());
  }
  /** The equipped primary gun: the picked one if it is unlocked, else the newest unlocked. */
  gun(): WeaponId {
    const have = this.gunsUnlocked();
    return this.data.gun && have.includes(this.data.gun) ? this.data.gun : have[have.length - 1];
  }
  setGun(id: WeaponId) {
    if (!this.gunsUnlocked().includes(id)) return;
    this.data.gun = id;
    this.save();
  }

  /**
   * Daily Challenge loadout: identical for everyone so family scores compare skill, not gear.
   * Tuned so a decent run clears it about half the time (see scripts/modes.ts).
   */
  standardKit(): BaseStats {
    return {
      atk: 45, hp: 420, def: 0.05, crit: 0.08, critMul: 1.6, moveSpeed: 92, pickup: 52,
      healMul: 1, goldMul: 1, rerolls: 2, revives: 0, startWeapon: 'pistol', startLevels: 0, regen: 0,
    };
  }

  // ------------------------------------------------------------------ online

  /** Stable anonymous player id (created on first use). */
  playerId() {
    if (!this.data.online.id) {
      this.data.online.id = uuid();
      this.save();
    }
    return this.data.online.id;
  }

  setOnline(name: string, crew: string) {
    this.playerId();
    this.data.online.name = name.trim().slice(0, 16);
    this.data.online.crew = crew.trim().toUpperCase();
    this.save();
  }

  /**
   * Queue a score for the board and try to send everything pending. Resolves with the rank of
   * this submission (null when offline or no call sign yet; it stays queued for next time).
   */
  async postScore(mode: 'daily' | 'endless', score: number, time: number, now = new Date()): Promise<number | null> {
    const o = this.data.online;
    const board = mode === 'daily' ? dailyBoard(this.dailyState(now).key) : ENDLESS_BOARD;
    const sub: Submission = { board, score, time, hero: this.data.character };
    const same = o.pending.find((x) => x.board === board);
    if (same) {
      if (score > same.score) Object.assign(same, sub);
    } else o.pending.push(sub);
    o.pending = o.pending.slice(-6);
    this.save();
    return this.flushScores(board);
  }

  async flushScores(want?: string): Promise<number | null> {
    const o = this.data.online;
    if (!o.name) return null;
    let rank: number | null = null;
    for (const s of o.pending.slice()) {
      const r = await submitScore(this.playerId(), o.name, o.crew, s);
      if (r === null) return rank; // offline: keep the rest queued
      o.pending = o.pending.filter((x) => x !== s);
      if (s.board === want) rank = r;
    }
    this.save();
    return rank;
  }

  // ------------------------------------------------------------------ Signal Pass

  /** Current season's pass; rolls over (auto-granting unclaimed free rewards) when a season ends. */
  pass(now = new Date()): PassState {
    const s = seasonOf(now).n;
    const p = this.data.pass;
    if (p.season !== s) {
      for (let i = 0; i < passLevel(p.sp); i++) {
        if (!(p.free & (1 << i))) this.grantPass(passReward(i, false, this.reach()));
        if (p.premium && !(p.prem & (1 << i))) this.grantPass(passReward(i, true, this.reach()));
      }
      this.data.pass = freshPass(s);
      this.save();
    }
    return this.data.pass;
  }

  addSp(n: number) {
    this.pass().sp += Math.max(0, Math.round(n));
  }

  private grantPass(r: PassReward) {
    this.grant(r);
    if (r.itemRarity !== undefined) {
      const it = this.rollItem(new Rng(Date.now() ^ (this.data.uidSeq * 7919)), this.reach(), true);
      it.rarity = r.itemRarity;
      this.data.gear.push(it);
      this.autoEquip(it);
      return it;
    }
    return undefined;
  }

  canClaimPass(tier: number, premium: boolean) {
    const p = this.pass();
    if (tier >= passLevel(p.sp)) return false;
    if (premium) return p.premium && !(p.prem & (1 << tier));
    return !(p.free & (1 << tier));
  }

  claimPass(tier: number, premium: boolean): { reward: PassReward; item?: GearItem } | null {
    if (!this.canClaimPass(tier, premium)) return null;
    const p = this.pass();
    if (premium) p.prem |= 1 << tier;
    else p.free |= 1 << tier;
    const reward = passReward(tier, premium, this.reach());
    const item = this.grantPass(reward);
    this.save();
    return { reward, item };
  }

  passClaimable() {
    const p = this.pass();
    let n = 0;
    for (let i = 0; i < passLevel(p.sp); i++) {
      if (!(p.free & (1 << i))) n++;
      if (p.premium && !(p.prem & (1 << i))) n++;
    }
    return n;
  }

  /** Premium track unlock. Wired for the store build's in-app purchase; not exposed on the web. */
  unlockPremiumPass() {
    this.pass().premium = true;
    this.save();
  }

  /** Rewarded-ad crate keys: 3 per day. */
  adKeysLeft(now = new Date()) {
    const k = this.data.adKeys;
    return k && k.date === now.toDateString() ? Math.max(0, 3 - k.n) : 3;
  }

  grantAdKey(now = new Date()) {
    if (this.adKeysLeft(now) <= 0) return false;
    const k = this.data.adKeys?.date === now.toDateString() ? this.data.adKeys : { date: now.toDateString(), n: 0 };
    k.n++;
    this.data.adKeys = k;
    this.data.keys++;
    this.save();
    return true;
  }

  charUnlocked(id: string) {
    return this.reach() >= charById(id).unlock;
  }

  selectCharacter(id: string) {
    if (!this.charUnlocked(id)) return false;
    this.data.character = id;
    this.save();
    return true;
  }

  // ------------------------------------------------------------------ ascension

  asc(): AscState {
    return (this.data.asc ??= freshAsc());
  }
  rank() {
    return this.data.asc?.rank ?? 0;
  }
  /** Furthest sector ever unlocked (survives ascending): unlocks and income scale with this. */
  reach() {
    return Math.max(this.data.unlocked, this.data.asc?.peak ?? 0);
  }
  lab(id: LabId) {
    return this.data.asc?.lab[id] ?? 0;
  }
  /** Better drop/crate rarity: one step per rank (up to 2) plus Lucky Signal. */
  luck() {
    return Math.min(2, this.rank()) + this.lab('luck');
  }
  canAscend() {
    return this.data.unlocked >= ASCEND_AT;
  }
  /** Signal Cores ascending right now would pay. */
  coresOnAscend() {
    return coresFor(this.data.stars);
  }
  /**
   * Restart the campaign one rank higher. Only campaign progress resets; everything else is kept.
   * Returns what was granted, or null if not allowed yet.
   */
  ascend(): { rank: number; cores: number; keys: number } | null {
    if (!this.canAscend()) return null;
    const d = this.data;
    const a = this.asc();
    const cores = this.coresOnAscend();
    a.peak = Math.max(a.peak, d.unlocked);
    a.rank++;
    a.cores += cores;
    a.earned += cores;
    const keys = ascendKeys(a.rank);
    d.keys += keys;
    d.gun = this.gun(); // keep the gun in hand (unlocks follow the peak)
    d.unlocked = 0;
    d.stars = {};
    d.starClaims = {};
    d.best = {};
    d.bestScore = {};
    this.save();
    return { rank: a.rank, cores, keys };
  }
  labCost(id: LabId) {
    const lv = this.lab(id);
    const perk = labPerk(id);
    return lv >= perk.max ? Infinity : perk.cost(lv);
  }
  canBuyLab(id: LabId) {
    return (this.data.asc?.cores ?? 0) >= this.labCost(id);
  }
  buyLab(id: LabId) {
    if (!this.canBuyLab(id)) return false;
    const a = this.asc();
    a.cores -= this.labCost(id);
    a.lab[id] = this.lab(id) + 1;
    this.save();
    return true;
  }
  labAffordable() {
    return LAB.some((p) => this.canBuyLab(p.id));
  }
  /** Gold/scrap multiplier from the Lab (all modes). */
  private lootMul() {
    return 1 + this.lab('loot') * 0.1;
  }
  private xpMul() {
    return 1 + this.lab('xp') * 0.15;
  }

  power(): number {
    const b = this.baseStats();
    return Math.round(b.atk * 8 + b.hp * (1 + b.def));
  }

  // ------------------------------------------------------------------ gear actions

  newUid() {
    return 'g' + this.data.uidSeq++;
  }

  equip(uid: string) {
    const it = this.item(uid);
    if (!it) return;
    this.data.equipped[GEAR[it.def].slot] = uid;
    this.save();
  }

  unequip(slot: Slot) {
    if (slot === 'weapon') return; // always keep a weapon
    delete this.data.equipped[slot];
    this.save();
  }

  isEquipped(uid: string) {
    return Object.values(this.data.equipped).includes(uid);
  }

  /** Level of a gear slot (what any item equipped there is levelled to, up to its rarity cap). */
  slotLevel(s: Slot) {
    return Math.max(1, this.data.slotLv[s] ?? 1);
  }
  /** The level this item has (or would have) in its slot. */
  lvOf(it: GearItem) {
    return Math.min(this.slotLevel(GEAR[it.def].slot), MAX_LEVEL[it.rarity]);
  }
  /** ATK/HP this item gives (or would give) in its slot. */
  statOf(it: GearItem) {
    return gearStat({ ...it, level: this.lvOf(it) });
  }
  /** The slot's level is past this item's rarity cap (merge it to use the rest). */
  capped(it: GearItem) {
    return this.slotLevel(GEAR[it.def].slot) >= MAX_LEVEL[it.rarity];
  }
  levelCostOf(it: GearItem) {
    return levelCost(this.slotLevel(GEAR[it.def].slot), it.rarity);
  }

  /** Only the equipped item's slot can be levelled (cost scales with that item's rarity). */
  canLevel(it: GearItem) {
    if (!this.isEquipped(it.uid) || this.capped(it)) return false;
    const c = this.levelCostOf(it);
    return this.data.gold >= c.gold && this.data.scrap >= c.scrap;
  }

  /** Level up the slot the item `uid` is equipped in. */
  levelUp(uid: string): boolean {
    const it = this.item(uid);
    if (!it || !this.canLevel(it)) return false;
    const c = this.levelCostOf(it);
    const s = GEAR[it.def].slot;
    this.data.gold -= c.gold;
    this.data.scrap -= c.scrap;
    this.data.slotLv[s] = this.slotLevel(s) + 1;
    this.track('levelgear', 1);
    this.save();
    return true;
  }

  /** Items that can merge with `uid` (same def + rarity). */
  mergeMates(uid: string): GearItem[] {
    const it = this.item(uid);
    if (!it || it.rarity >= 5) return [];
    return this.data.gear.filter((g) => g.uid !== uid && g.def === it.def && g.rarity === it.rarity);
  }

  /** Merge `uid` with two mates (unequipped preferred). Keeps the highest level. */
  merge(uid: string): GearItem | null {
    const it = this.item(uid);
    if (!it) return null;
    const mates = this.mergeMates(uid).sort((a, b) => Number(this.isEquipped(a.uid)) - Number(this.isEquipped(b.uid)) || a.level - b.level);
    if (mates.length < MERGE_COUNT - 1) return null;
    const used = mates.slice(0, MERGE_COUNT - 1);
    // refund levelling spent on fodder as scrap/gold so merging never feels like a loss
    for (const u of used) {
      const s = salvageValue({ ...u, rarity: 0 });
      this.data.gold += s.gold;
      this.data.scrap += Math.max(0, s.scrap - 2);
    }
    const level = Math.max(it.level, ...used.map((u) => u.level));
    for (const u of used) {
      for (const s of SLOTS) if (this.data.equipped[s] === u.uid) this.data.equipped[s] = uid;
    }
    this.data.gear = this.data.gear.filter((g) => !used.includes(g));
    it.rarity++;
    it.level = level;
    this.save();
    return it;
  }

  /** Merge everything that can be merged, lowest rarity first. Returns number of merges. */
  mergeAll(): number {
    let n = 0;
    for (let r = 0; r < 5; r++) {
      let again = true;
      while (again) {
        again = false;
        for (const def of GEAR_IDS) {
          const group = this.data.gear.filter((g) => g.def === def && g.rarity === r);
          if (group.length >= MERGE_COUNT) {
            group.sort((a, b) => Number(this.isEquipped(b.uid)) - Number(this.isEquipped(a.uid)) || b.level - a.level);
            this.merge(group[0].uid);
            n++;
            again = true;
          }
        }
      }
    }
    return n;
  }

  salvage(uid: string): boolean {
    const it = this.item(uid);
    if (!it || this.isEquipped(uid)) return false;
    const v = salvageValue(it);
    this.data.scrap += v.scrap;
    this.data.gold += v.gold;
    this.data.gear = this.data.gear.filter((g) => g.uid !== uid);
    this.save();
    return true;
  }

  rollItem(rng: Rng, sector: number, crate: boolean): GearItem {
    const rarity = rng.weighted(dropWeights(sector, crate, this.luck()));
    // weapons are rarer in drops so slots fill evenly
    const pool = GEAR_IDS.flatMap((id) => (GEAR[id].slot === 'weapon' ? [id] : [id, id]));
    return { uid: this.newUid(), def: rng.pick(pool), rarity, level: 1 };
  }

  openCrate(rng = new Rng(Date.now())): GearItem | null {
    if (this.data.keys <= 0) return null;
    this.data.keys--;
    const it = this.rollItem(rng, this.reach(), true);
    this.data.gear.push(it);
    this.autoEquip(it);
    this.track('crate', 1);
    this.save();
    return it;
  }

  /** Open every crate key at once (each item auto-equips into empty slots like single opens). */
  openAllCrates(rng = new Rng(Date.now())): GearItem[] {
    const out: GearItem[] = [];
    while (this.data.keys > 0) {
      const it = this.openCrate(rng);
      if (!it) break;
      out.push(it);
    }
    return out;
  }

  /** New gear goes straight into an empty slot: an empty slot is pure lost power. */
  autoEquip(it: GearItem) {
    const slot = GEAR[it.def].slot;
    if (!this.data.equipped[slot]) this.data.equipped[slot] = it.uid;
  }

  /** Strongest item for a slot by stat, preferring higher rarity on ties. */
  bestFor(slot: Slot): GearItem | undefined {
    return this.data.gear
      .filter((g) => GEAR[g.def].slot === slot)
      .sort((a, b) => this.statOf(b) - this.statOf(a) || b.rarity - a.rarity)[0];
  }

  /**
   * An unequipped item that beats what's in this slot (or fills it if empty), or undefined.
   * Weapons keep their own play style, so a weapon only counts as an upgrade within the same item.
   * The 5% margin keeps near-ties from nagging.
   */
  upgradeFor(slot: Slot): GearItem | undefined {
    const uid = this.data.equipped[slot];
    const cur = uid ? this.item(uid) : undefined;
    const pool = this.data.gear.filter((g) => GEAR[g.def].slot === slot && g.uid !== cur?.uid && (slot !== 'weapon' || !cur || g.def === cur.def));
    const best = pool.sort((a, b) => this.statOf(b) - this.statOf(a) || b.rarity - a.rarity)[0];
    if (!best) return undefined;
    return !cur || this.statOf(best) > this.statOf(cur) * 1.05 ? best : undefined;
  }

  /** Is this unequipped item better than what's equipped in its slot? */
  isUpgrade(it: GearItem) {
    return !this.isEquipped(it.uid) && this.upgradeFor(GEAR[it.def].slot)?.uid === it.uid;
  }

  /**
   * The single most valuable next upgrade, as a one-tap action. Drives the lobby's Power Up coach
   * so players who never open the menus still progress.
   */
  /** Free rewards sitting unclaimed: missions, the daily bonus, sector chests, the daily gift, a full-ish relay. */
  freeRewards(now = new Date()) {
    const relay = this.relayPending(now.getTime());
    const relayWorth = relay.hours >= 1;
    return this.missionsClaimable() + this.starChestsReady() + (this.dailyAvailable(now) ? 1 : 0) + (relayWorth ? 1 : 0) + this.passClaimable();
  }

  /** Claim every free reward at once; returns how many were collected. */
  collectAll(now = new Date()): number {
    let n = 0;
    const m = this.missions(now);
    m.list.forEach((_, i) => {
      if (this.claimMission(i)) n++;
    });
    if (this.claimBonus()) n++;
    for (const k of Object.keys(this.data.stars)) for (const b of [1, 2, 4] as const) if (this.claimStar(Number(k), b)) n++;
    if (this.claimDaily(now)) n++;
    for (let i = 0; i < PASS_TIERS; i++) {
      if (this.claimPass(i, false)) n++;
      if (this.claimPass(i, true)) n++;
    }
    if (this.relayPending(now.getTime()).hours >= 1) {
      this.claimRelay(now.getTime());
      n++;
    }
    return n;
  }

  coach(): CoachAction | null {
    const d = this.data;
    // 0. free stuff first: a red badge the player hasn't noticed is the cheapest power there is
    const free = this.freeRewards();
    if (free > 0) {
      return { kind: 'collect', label: 'Collect free rewards', detail: `${free} ready`, apply: () => this.collectAll() > 0 };
    }
    // 1. better gear sitting unequipped
    for (const s of SLOTS) {
      const cur = d.equipped[s] ? this.item(d.equipped[s]!) : undefined;
      const best = this.upgradeFor(s);
      if (best) {
        const gain = Math.round(this.statOf(best) - (cur ? this.statOf(cur) : 0));
        return { kind: 'equip', label: `Equip ${RARITIES[best.rarity]} ${GEAR[best.def].name}`, detail: `+${gain} ${GEAR[best.def].stat === 'atk' ? 'ATK' : 'HP'}`, apply: () => (this.equip(best.uid), true) };
      }
    }
    // 2. merges
    const mergeable = d.gear.find((g) => this.mergeMates(g.uid).length >= MERGE_COUNT - 1);
    if (mergeable) {
      return { kind: 'merge', label: `Merge 3 ${GEAR[mergeable.def].name}s`, detail: `→ ${RARITIES[mergeable.rarity + 1]}`, apply: () => this.mergeAll() > 0 };
    }
    // 3. crates
    if (d.keys > 0) return { kind: 'crate', label: d.keys > 1 ? `Open ${d.keys} supply crates` : 'Open a supply crate', detail: `${d.keys} key${d.keys > 1 ? 's' : ''}`, apply: () => this.openAllCrates().length > 0 };
    // 4. cheapest affordable stat upgrade (talent ATK/HP or levelling equipped gear)
    const opts: { cost: number; a: CoachAction }[] = [];
    for (const id of ['atk', 'hp'] as const) {
      if (this.canBuyTrack(id)) {
        const t = TRACKS.find((x) => x.id === id)!;
        opts.push({ cost: trackCost(d.tracks[id]), a: { kind: 'talent', label: `${t.name}: +${t.per} ${t.unit}`, detail: `${trackCost(d.tracks[id])} gold`, apply: () => this.buyTrack(id) } });
      }
    }
    for (const it of this.equippedItems()) {
      if (this.canLevel(it)) {
        const c = this.levelCostOf(it);
        opts.push({ cost: c.gold, a: { kind: 'level', label: `Level up ${SLOT_NAMES[GEAR[it.def].slot]} slot`, detail: `${c.gold} gold`, apply: () => this.levelUp(it.uid) } });
      }
    }
    opts.sort((a, b) => a.cost - b.cost);
    return opts[0]?.a ?? null;
  }

  // ------------------------------------------------------------------ talents

  trackLevel(id: TrackId) {
    return this.data.tracks[id];
  }

  canBuyTrack(id: TrackId) {
    const lv = this.data.tracks[id];
    return lv < trackCap(this.data.accountLevel) && this.data.gold >= trackCost(lv);
  }

  buyTrack(id: TrackId): boolean {
    if (!this.canBuyTrack(id)) return false;
    this.data.gold -= trackCost(this.data.tracks[id]);
    this.data.tracks[id]++;
    this.save();
    return true;
  }

  // ------------------------------------------------------------------ runs

  /** Shared bookkeeping for any finished run (stats, missions, account XP). */
  private bookRun(r: RunResult, xp: number) {
    const d = this.data;
    this.addSp(runSp(r.time, r.kills, r.bossKills, r.won));
    d.stats.runs++;
    this.track('runs', 1);
    this.track('kills', r.kills);
    this.track('survive', Math.min(r.time, 300));
    this.track('boss', r.bossKills);
    this.track('elite', r.eliteKills);
    this.track('evolve', r.evolutions ?? 0);
    d.stats.kills += r.kills;
    d.stats.bossKills += r.bossKills;
    let levelsGained = 0;
    d.accountXp += xp;
    while (d.accountXp >= accountXpNeed(d.accountLevel)) {
      d.accountXp -= accountXpNeed(d.accountLevel);
      d.accountLevel++;
      levelsGained++;
    }
    return levelsGained;
  }

  dailyState(now = new Date()) {
    const key = dailySeed(now).key;
    if (this.data.daily.key !== key) this.data.daily = { key, best: 0, tiers: 0, plays: 0, bestEver: this.data.daily.bestEver };
    return this.data.daily;
  }

  /** Daily Challenge: gold for playing, tier chests the first time each score tier is reached today. */
  applyDaily(r: RunResult, now = new Date()): RunRewards {
    const d = this.data;
    const ds = this.dailyState(now);
    const m = (1 + this.reach() * 0.45) * this.lootMul();
    const score = r.score ?? 0;
    const prevBest = ds.best;
    const newBest = score > prevBest;
    ds.best = Math.max(ds.best, score);
    ds.bestEver = Math.max(ds.bestEver, score);
    ds.plays++;
    let gold = Math.round((r.gold + 60 + (r.won ? 120 : 0)) * m);
    let scrap = Math.round((3 + Math.floor(r.time / 60)) * this.lootMul());
    let keys = 0;
    const tiersNew: string[] = [];
    DAILY_TIERS.forEach((t, i) => {
      if (score >= t.score && !(ds.tiers & (1 << i))) {
        ds.tiers |= 1 << i;
        tiersNew.push(t.name);
        this.addSp(50);
        if (i === 0) gold += Math.round(250 * m);
        if (i === 1) (keys += 1), (scrap += 15);
        if (i === 2) (keys += 2), (gold += Math.round(500 * m));
      }
    });
    d.gold += gold;
    d.scrap += scrap;
    d.keys += keys;
    const xp = Math.round((r.time * 0.8 + r.bossKills * 60) * this.xpMul());
    const levelsGained = this.bookRun(r, xp);
    this.save();
    return { gold, xp, keys, scrap, items: [], firstClear: false, newStars: 0, levelsGained, unlockedSector: false, score, newBest, prevBest, starsBefore: 0, starsAfter: 0, tiersNew, mode: 'daily' };
  }

  /** Endless: rewards scale with minutes survived and bosses felled; best time and score are kept. */
  applyEndless(sector: number, r: RunResult, seed = Date.now()): RunRewards {
    const d = this.data;
    const ch = getChapter(sector);
    const rng = new Rng(seed);
    const mins = r.time / 60;
    const gold = Math.round((r.gold + mins * 70 * ch.goldMul) * (1 + this.milestone('gold')) * this.lootMul());
    const scrap = Math.round((2 + mins * 3 + r.bossKills * 4) * this.lootMul());
    const keys = Math.floor(r.bossKills / 2);
    const items: GearItem[] = [];
    for (let i = 0; i < Math.min(3, Math.floor(r.bossKills / 2)); i++) items.push(this.rollItem(rng, sector, false));
    d.gold += gold;
    d.scrap += scrap;
    d.keys += keys;
    d.gear.push(...items);
    for (const it of items) this.autoEquip(it);
    const score = r.score ?? 0;
    const prevBest = d.endless.bestScore;
    const newBest = score > prevBest;
    d.endless.bestScore = Math.max(prevBest, score);
    d.endless.best = Math.max(d.endless.best, r.time);
    d.endless.runs++;
    const xp = Math.round((r.time + r.bossKills * 60) * this.xpMul());
    const levelsGained = this.bookRun(r, xp);
    this.save();
    return { gold, xp, keys, scrap, items, firstClear: false, newStars: 0, levelsGained, unlockedSector: false, score, newBest, prevBest, starsBefore: 0, starsAfter: 0, mode: 'endless' };
  }

  applyRun(sector: number, r: RunResult, seed = Date.now()): RunRewards {
    const d = this.data;
    const ch = getChapter(sector);
    const rng = new Rng(seed);
    const goldMul = 1 + this.milestone('gold');
    const rmul = rankRewardMul(this.rank());
    const gold = Math.round((r.gold + ((r.time * TIME_SCALE) / 6) * ch.goldMul + (r.won ? 120 * ch.goldMul : 0)) * goldMul * this.lootMul() * rmul);
    const xp = Math.round((r.time * TIME_SCALE * 0.5 + r.kills * 0.02 + r.bossKills * 60 + (r.won ? 100 : 0)) * this.xpMul() * rmul);
    const prevStars = d.stars[sector] ?? 0;
    const score = r.score ?? 0;
    const prevBest = d.bestScore[sector] ?? 0;
    const newBest = score > prevBest;
    if (newBest) d.bestScore[sector] = score;
    let stars = prevStars;
    const [s1, s2] = starTimes(runLengthFor(sector));
    if (r.time >= s1) stars |= 1;
    if (r.time >= s2) stars |= 2;
    if (r.won) stars |= 4;
    const firstClear = r.won && !(prevStars & 4);
    const newStars = popcount(stars) - popcount(prevStars);
    d.stars[sector] = stars;
    d.best[sector] = Math.max(d.best[sector] ?? 0, r.time);

    let keys = r.won ? 1 : 0;
    if (firstClear) keys += 1;
    keys += newStars > 0 && !firstClear ? 1 : 0;

    const items: GearItem[] = [];
    const drops = r.bossKills + (r.eliteKills > 0 ? 1 : 0) + (r.won ? 1 : 0);
    for (let i = 0; i < drops; i++) items.push(this.rollItem(rng, sector, false));
    const scrap = Math.round((2 + (r.time * TIME_SCALE) / 60 + r.eliteKills * 2 + r.bossKills * 4) * this.lootMul() * rmul);

    let unlockedSector = false;
    if (r.won && sector === d.unlocked && d.unlocked < CHAPTER_COUNT - 1) {
      d.unlocked++;
      unlockedSector = true;
    }

    d.gold += gold;
    d.scrap += scrap;
    d.keys += keys;
    d.gear.push(...items);
    for (const it of items) this.autoEquip(it);
    d.stats.runs++;
    this.addSp(runSp(r.time, r.kills, r.bossKills, r.won));
    this.track('runs', 1);
    this.track('kills', r.kills);
    this.track('survive', r.time);
    this.track('boss', r.bossKills);
    this.track('elite', r.eliteKills);
    this.track('evolve', r.evolutions ?? 0);
    d.stats.kills += r.kills;
    d.stats.bossKills += r.bossKills;
    if (r.won) d.stats.wins++;

    let levelsGained = 0;
    d.accountXp += xp;
    while (d.accountXp >= accountXpNeed(d.accountLevel)) {
      d.accountXp -= accountXpNeed(d.accountLevel);
      d.accountLevel++;
      levelsGained++;
    }
    this.save();
    const firstTime = unlockedSector && d.unlocked > (d.asc?.peak ?? 0);
    if (d.asc && d.unlocked > d.asc.peak) d.asc.peak = d.unlocked;
    const newGun = firstTime ? GUN_IDS.find((id) => id !== 'pistol' && gunUnlock(id) === d.unlocked) : undefined;
    if (newGun) d.gun = newGun; // the new gun replaces the old one; the Armory swaps back
    const newCharacter = firstTime ? CHARACTERS.find((c) => c.unlock === d.unlocked)?.name : undefined;
    const newLoadout = !firstTime ? undefined : d.unlocked === 2 ? 'More slots! You can now carry 4 attack + 4 support upgrades, and every weapon type can appear.' : d.unlocked === 3 ? 'Full loadout unlocked: 6 attack + 6 support slots.' : undefined;
    return { gold, xp, keys, scrap, items, firstClear, newStars, levelsGained, unlockedSector, score, newBest, prevBest, starsBefore: prevStars, starsAfter: stars, newCharacter, newLoadout, newGun };
  }

  // ------------------------------------------------------------------ idle relay + daily

  relayRates() {
    const s = this.reach();
    const k = 1 + this.lab('relay') * 0.2;
    return { goldPerH: Math.round(60 * (1 + s * 0.6) * k), scrapPerH: Math.round((3 + s) * k), xpPerH: Math.round((40 + s * 10) * k) };
  }

  relayPending(now = Date.now()) {
    const h = Math.min(RELAY_CAP_H, Math.max(0, (now - this.data.relayAt) / 3.6e6));
    const r = this.relayRates();
    return { hours: h, gold: Math.floor(r.goldPerH * h), scrap: Math.floor(r.scrapPerH * h), xp: Math.floor(r.xpPerH * h) };
  }

  claimRelay(now = Date.now()) {
    const p = this.relayPending(now);
    if (p.gold <= 0 && p.scrap <= 0) return p;
    this.data.gold += p.gold;
    this.data.scrap += p.scrap;
    this.data.accountXp += p.xp;
    while (this.data.accountXp >= accountXpNeed(this.data.accountLevel)) {
      this.data.accountXp -= accountXpNeed(this.data.accountLevel);
      this.data.accountLevel++;
    }
    this.data.relayAt = now;
    this.track('relay', 1);
    this.save();
    return p;
  }

  dailyAvailable(now = new Date()) {
    return this.data.lastDaily !== now.toDateString();
  }

  /** Claim today's sign-in calendar reward. */
  claimDaily(now = new Date()): (LoginReward & { day: number; item?: GearItem }) | null {
    if (!this.dailyAvailable(now)) return null;
    const lg = this.data.login;
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    lg.streak = lg.last === yesterday.toDateString() ? lg.streak + 1 : 1;
    lg.last = now.toDateString();
    this.data.lastDaily = now.toDateString();
    const day = lg.claimed % LOGIN_DAYS;
    lg.claimed++;
    const r = loginReward(day, this.reach());
    this.grant(r);
    let item: GearItem | undefined;
    if (r.itemRarity !== undefined) {
      item = this.rollItem(new Rng(now.getTime()), this.reach(), true);
      item.rarity = Math.max(item.rarity, r.itemRarity);
      this.data.gear.push(item);
      this.autoEquip(item);
    }
    this.save();
    return { ...r, day, item };
  }

  // ------------------------------------------------------------------ missions + sector chests

  /** Today's missions (rolled on first access each day). */
  missions(now = new Date()): DailyMissions {
    const key = dateKey(now);
    if (!this.data.missions || this.data.missions.date !== key) {
      this.data.missions = rollDaily(key, this.reach());
    }
    // saves from the 10-minute era may hold a survive target longer than a run
    for (const m of this.data.missions.list) if (m.kind === 'survive' && m.target > STAR2_TIME) m.target = STAR2_TIME;
    return this.data.missions;
  }

  track(kind: MissionKind, amount: number, now = new Date()) {
    if (amount <= 0) return;
    const m = this.missions(now);
    for (const ms of m.list) {
      if (ms.kind !== kind || ms.claimed) continue;
      ms.progress = MISSION_DEFS[kind].mode === 'max' ? Math.max(ms.progress, amount) : ms.progress + amount;
      ms.progress = Math.min(ms.progress, ms.target);
    }
  }

  grant(r: Reward) {
    this.data.gold += r.gold ?? 0;
    this.data.scrap += r.scrap ?? 0;
    this.data.keys += r.keys ?? 0;
  }

  claimMission(i: number): Reward | null {
    const ms = this.missions().list[i];
    if (!ms || ms.claimed || ms.progress < ms.target) return null;
    ms.claimed = true;
    this.grant(ms.reward);
    this.addSp(30);
    this.save();
    return ms.reward;
  }

  bonusReady() {
    const m = this.missions();
    return !m.bonusClaimed && m.list.every((x) => x.claimed);
  }

  claimBonus(): Reward | null {
    if (!this.bonusReady()) return null;
    const r = dailyBonus(this.reach());
    this.missions().bonusClaimed = true;
    this.grant(r);
    this.save();
    return r;
  }

  missionsClaimable() {
    return this.missions().list.filter((x) => !x.claimed && x.progress >= x.target).length + (this.bonusReady() ? 1 : 0);
  }

  canClaimStar(sector: number, bit: 1 | 2 | 4) {
    return !!((this.data.stars[sector] ?? 0) & bit) && !((this.data.starClaims[sector] ?? 0) & bit);
  }

  claimStar(sector: number, bit: 1 | 2 | 4): Reward | null {
    if (!this.canClaimStar(sector, bit)) return null;
    this.data.starClaims[sector] = (this.data.starClaims[sector] ?? 0) | bit;
    const r = starReward(sector, bit);
    this.grant(r);
    this.save();
    return r;
  }

  /** Total unclaimed sector chests across all sectors. */
  starChestsReady() {
    let n = 0;
    for (const k of Object.keys(this.data.stars)) {
      const s = Number(k);
      for (const b of [1, 2, 4] as const) if (this.canClaimStar(s, b)) n++;
    }
    return n;
  }

  trackInfo() {
    return TRACKS.map((t) => ({ ...t, level: this.data.tracks[t.id], cost: trackCost(this.data.tracks[t.id]), cap: trackCap(this.data.accountLevel) }));
  }
}

function popcount(n: number) {
  let c = 0;
  while (n) {
    c += n & 1;
    n >>= 1;
  }
  return c;
}
