export type TrackId = 'atk' | 'hp' | 'def' | 'heal';

export interface Track {
  id: TrackId;
  name: string;
  per: number;
  unit: string;
  desc: (lv: number) => string;
}

export const TRACKS: Track[] = [
  { id: 'atk', name: 'Firepower', per: 2, unit: 'ATK', desc: (l) => `+${l * 2} ATK` },
  { id: 'hp', name: 'Conditioning', per: 15, unit: 'HP', desc: (l) => `+${l * 15} max HP` },
  { id: 'def', name: 'Toughness', per: 0.005, unit: 'DEF', desc: (l) => `-${(l * 0.5).toFixed(1)}% damage taken` },
  { id: 'heal', name: 'Field Medic', per: 0.04, unit: 'Heal', desc: (l) => `+${l * 4}% healing` },
];

/** Track level cap grows with account level so talents can't outrun the sectors. */
export const trackCap = (accountLevel: number) => 3 + accountLevel * 2;
export const trackCost = (lv: number) => Math.round(60 * Math.pow(1.19, lv));

export interface Milestone {
  level: number;
  name: string;
  desc: string;
  key: 'reroll' | 'revive' | 'startLevel' | 'pickup' | 'gold' | 'crit';
  value: number;
}

/** Free unlocks at account levels — every level feels like it gave you something. */
export const MILESTONES: Milestone[] = [
  { level: 2, name: 'Quick Thinking', desc: '+1 reroll per run', key: 'reroll', value: 1 },
  { level: 3, name: 'Scavenger', desc: '+10% gold from runs', key: 'gold', value: 0.1 },
  { level: 4, name: 'Second Wind', desc: 'Revive once per run', key: 'revive', value: 1 },
  { level: 6, name: 'Head Start', desc: 'Start each run with a free level-up', key: 'startLevel', value: 1 },
  { level: 8, name: 'Long Reach', desc: '+20% pickup range', key: 'pickup', value: 0.2 },
  { level: 10, name: 'Second Opinion', desc: '+1 reroll per run', key: 'reroll', value: 1 },
  { level: 12, name: 'Steady Hands', desc: '+5% crit chance', key: 'crit', value: 0.05 },
  { level: 14, name: 'Black Market', desc: '+15% gold from runs', key: 'gold', value: 0.15 },
  { level: 16, name: 'Momentum', desc: 'Another free level-up at start', key: 'startLevel', value: 1 },
  { level: 20, name: 'Last Light', desc: 'A second revive per run', key: 'revive', value: 1 },
];

export const accountXpNeed = (lv: number) => Math.round(120 + 90 * lv + 6 * lv * lv);
