import type { Reward } from './missions';

/**
 * Signal Pass: a 30-tier season track (30 days). Signal Points (SP) come from simply playing,
 * so it rewards showing up over weeks. The free track is fully live; the premium track is wired
 * for in-app purchase once the game ships to the stores (see Profile.unlockPremiumPass).
 */
export const PASS_TIERS = 30;
export const SP_PER_TIER = 250;
export const SEASON_DAYS = 30;
const EPOCH = Date.UTC(2026, 9, 1); // Season 1 starts Oct 1 2026

const SEASON_NAMES = ['Static Bloom', 'Dead Air', 'Carrier Wave', 'Night Shift', 'Feedback', 'Interference'];

export function seasonOf(now = new Date()) {
  const day = Math.floor((now.getTime() - EPOCH) / 864e5);
  const n = Math.max(0, Math.floor(day / SEASON_DAYS));
  const ends = new Date(EPOCH + (n + 1) * SEASON_DAYS * 864e5);
  return { n, number: n + 1, name: SEASON_NAMES[n % SEASON_NAMES.length], ends, daysLeft: Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / 864e5)) };
}

export interface PassReward extends Reward {
  /** A gear item of exactly this rarity. */
  itemRarity?: number;
}

export function passReward(tier: number, premium: boolean, sector: number): PassReward {
  const m = 1 + sector * 0.35;
  const t = tier + 1; // 1-based
  if (!premium) {
    if (t === 10) return { itemRarity: 2 };
    if (t === 20) return { keys: 3 };
    if (t === 30) return { itemRarity: 3, keys: 2 };
    if (t % 5 === 0) return { keys: 1, gold: Math.round(150 * m) };
    if (t % 2 === 0) return { scrap: 8 + Math.floor(sector * 1.5) };
    return { gold: Math.round(120 * m) };
  }
  if (t === 10) return { itemRarity: 3 };
  if (t === 20) return { itemRarity: 3, keys: 2 };
  if (t === 30) return { itemRarity: 4, keys: 3 };
  if (t % 5 === 0) return { keys: 2, gold: Math.round(300 * m) };
  if (t % 3 === 0) return { keys: 1 };
  if (t % 2 === 0) return { scrap: 20 + sector * 3 };
  return { gold: Math.round(280 * m) };
}

export interface PassState {
  season: number;
  sp: number;
  free: number; // claimed bitmask (tiers 0..29)
  prem: number;
  premium: boolean;
}

export const freshPass = (season = 0): PassState => ({ season, sp: 0, free: 0, prem: 0, premium: false });

/** SP for a finished run: time played, kills, bosses, and a bonus for winning. */
export function runSp(time: number, kills: number, bosses: number, won: boolean) {
  return Math.round(Math.min(time, 600) / 6 + kills / 120 + bosses * 15 + (won ? 25 : 0));
}

export const passLevel = (sp: number) => Math.min(PASS_TIERS, Math.floor(sp / SP_PER_TIER));
