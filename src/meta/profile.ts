import { CHAPTER_COUNT, getChapter } from '../sim/chapters';
import { Rng } from '../sim/math';
import type { RunResult } from '../sim/game';
import type { BaseStats } from '../sim/types';
import {
  GEAR,
  GEAR_IDS,
  MAX_LEVEL,
  MERGE_COUNT,
  SLOTS,
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

const KEY = 'deadsignal.save.v1';
export const RELAY_CAP_H = 8;

export interface Settings {
  sfx: boolean;
  music: boolean;
  haptics: boolean;
  damageNumbers: boolean;
}

export interface SaveData {
  v: 1;
  gold: number;
  scrap: number;
  keys: number;
  accountLevel: number;
  accountXp: number;
  unlocked: number; // highest sector index unlocked
  stars: Record<number, number>; // bitmask: 1 = survived 5:00, 2 = survived 8:00, 4 = cleared
  best: Record<number, number>; // best survival time per sector
  gear: GearItem[];
  equipped: Partial<Record<Slot, string>>;
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
    tracks: { atk: 0, hp: 0, def: 0, heal: 0 },
    relayAt: Date.now(),
    lastDaily: '',
    settings: { sfx: true, music: true, haptics: true, damageNumbers: true },
    stats: { runs: 0, kills: 0, bossKills: 0, wins: 0 },
    seenIntro: false,
    uidSeq: 3,
    missions: null,
    starClaims: {},
  };
}

export class Profile {
  data: SaveData;
  private listeners: (() => void)[] = [];

  constructor(private storage: Storage | null = typeof localStorage !== 'undefined' ? localStorage : null) {
    this.data = this.load();
  }

  onChange(fn: () => void) {
    this.listeners.push(fn);
  }

  private load(): SaveData {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as SaveData;
        if (d.v === 1) return { ...fresh(), ...d, settings: { ...fresh().settings, ...d.settings }, starClaims: d.starClaims ?? {} };
      }
    } catch {
      /* corrupted save → start fresh */
    }
    return fresh();
  }

  save() {
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage full / private mode: keep playing in memory */
    }
    for (const l of this.listeners) l();
  }

  reset() {
    this.data = fresh();
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
      if (g.stat === 'atk') atk += gearStat(it);
      else hp += gearStat(it);
    }
    const p = this.perkSum();
    atk *= 1 + p.atkPct;
    hp *= 1 + p.hpPct;
    const weapon = this.data.equipped.weapon ? this.item(this.data.equipped.weapon) : undefined;
    return {
      atk: Math.round(atk),
      hp: Math.round(hp),
      def: Math.min(0.6, d.tracks.def * 0.005 + p.def),
      crit: 0.05 + p.crit + this.milestone('crit'),
      critMul: 1.5 + p.critMul,
      moveSpeed: 92 * (1 + p.move),
      pickup: 46 * (1 + p.pickup + this.milestone('pickup')),
      healMul: 1 + d.tracks.heal * 0.04 + p.heal,
      goldMul: 1 + this.milestone('gold'),
      rerolls: 1 + this.milestone('reroll'),
      revives: this.milestone('revive') + p.revive,
      startWeapon: weapon ? GEAR[weapon.def].startWeapon ?? 'pistol' : 'pistol',
      startLevels: this.milestone('startLevel') + p.startLevel,
      regen: p.regen,
    };
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

  canLevel(it: GearItem) {
    if (it.level >= MAX_LEVEL[it.rarity]) return false;
    const c = levelCost(it.level, it.rarity);
    return this.data.gold >= c.gold && this.data.scrap >= c.scrap;
  }

  levelUp(uid: string): boolean {
    const it = this.item(uid);
    if (!it || !this.canLevel(it)) return false;
    const c = levelCost(it.level, it.rarity);
    this.data.gold -= c.gold;
    this.data.scrap -= c.scrap;
    it.level++;
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
    const rarity = rng.weighted(dropWeights(sector, crate));
    // weapons are rarer in drops so slots fill evenly
    const pool = GEAR_IDS.flatMap((id) => (GEAR[id].slot === 'weapon' ? [id] : [id, id]));
    return { uid: this.newUid(), def: rng.pick(pool), rarity, level: 1 };
  }

  openCrate(rng = new Rng(Date.now())): GearItem | null {
    if (this.data.keys <= 0) return null;
    this.data.keys--;
    const it = this.rollItem(rng, this.data.unlocked, true);
    this.data.gear.push(it);
    this.track('crate', 1);
    this.save();
    return it;
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

  applyRun(sector: number, r: RunResult, seed = Date.now()): RunRewards {
    const d = this.data;
    const ch = getChapter(sector);
    const rng = new Rng(seed);
    const goldMul = 1 + this.milestone('gold');
    const gold = Math.round((r.gold + (r.time / 6) * ch.goldMul + (r.won ? 120 * ch.goldMul : 0)) * goldMul);
    const xp = Math.round(r.time * 0.5 + r.kills * 0.02 + r.bossKills * 60 + (r.won ? 100 : 0));
    const prevStars = d.stars[sector] ?? 0;
    let stars = prevStars;
    if (r.time >= 300) stars |= 1;
    if (r.time >= 480) stars |= 2;
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
    const scrap = Math.round(2 + r.time / 60 + r.eliteKills * 2 + r.bossKills * 4);

    let unlockedSector = false;
    if (r.won && sector === d.unlocked && d.unlocked < CHAPTER_COUNT - 1) {
      d.unlocked++;
      unlockedSector = true;
    }

    d.gold += gold;
    d.scrap += scrap;
    d.keys += keys;
    d.gear.push(...items);
    d.stats.runs++;
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
    return { gold, xp, keys, scrap, items, firstClear, newStars, levelsGained, unlockedSector };
  }

  // ------------------------------------------------------------------ idle relay + daily

  relayRates() {
    const s = this.data.unlocked;
    return { goldPerH: Math.round(60 * (1 + s * 0.6)), scrapPerH: 3 + s, xpPerH: 40 + s * 10 };
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

  claimDaily(now = new Date()) {
    if (!this.dailyAvailable(now)) return null;
    this.data.lastDaily = now.toDateString();
    const gold = 200 + this.data.unlocked * 120;
    this.data.gold += gold;
    this.data.keys += 1;
    this.save();
    return { gold, keys: 1 };
  }

  // ------------------------------------------------------------------ missions + sector chests

  /** Today's missions (rolled on first access each day). */
  missions(now = new Date()): DailyMissions {
    const key = dateKey(now);
    if (!this.data.missions || this.data.missions.date !== key) {
      this.data.missions = rollDaily(key, this.data.unlocked);
    }
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
    this.save();
    return ms.reward;
  }

  bonusReady() {
    const m = this.missions();
    return !m.bonusClaimed && m.list.every((x) => x.claimed);
  }

  claimBonus(): Reward | null {
    if (!this.bonusReady()) return null;
    const r = dailyBonus(this.data.unlocked);
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
