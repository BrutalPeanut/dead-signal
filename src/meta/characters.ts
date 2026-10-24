import type { WeaponId } from '../sim/data';

/**
 * Playable couriers. Each has one clear perk (easy to read on a card) and unlocks from campaign
 * progress, so every few sectors there's a new toy to try on old sectors and in Endless.
 * Daily Challenge ignores perks (standard kit) so its scores stay comparable.
 */
export interface CharacterDef {
  id: string;
  name: string;
  role: string;
  perk: string;
  /** Sectors that must be cleared to unlock (0 = available from the start). */
  unlock: number;
  atkPct?: number;
  hpPct?: number;
  move?: number;
  crit?: number;
  regen?: number;
  healMul?: number;
  pickup?: number;
  bonusWeapon?: WeaponId;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'courier', name: 'Courier', role: 'All-rounder', perk: 'Balanced. +10% pickup range.', unlock: 0, pickup: 0.1 },
  { id: 'medic', name: 'Patch', role: 'Medic', perk: 'Regenerates 0.4% HP/s. +25% healing.', unlock: 3, regen: 0.004, healMul: 0.25 },
  { id: 'rigger', name: 'Volt', role: 'Rigger', perk: 'Starts every run with an Arc Coil.', unlock: 6, bonusWeapon: 'arc' },
  { id: 'ranger', name: 'Ghost', role: 'Ranger', perk: '+12% move speed, +10% crit chance.', unlock: 10, move: 0.12, crit: 0.1 },
  { id: 'vanguard', name: 'Bulwark', role: 'Vanguard', perk: '+30% max HP, +10% damage, -8% speed.', unlock: 15, hpPct: 0.3, atkPct: 0.1, move: -0.08 },
];

export const charById = (id: string) => CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
