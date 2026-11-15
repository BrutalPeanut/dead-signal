import type { SaveData } from './profile';

/**
 * Founders: everyone who plays before the official launch (website, TestFlight, the Play closed
 * test). Their progress simply carries on into the release (same save, same app), and once
 * LAUNCHED is flipped they get a one-time Founder's Pack plus a permanent Founder badge.
 *
 * Flip LAUNCHED to true in the release PR. After that, nobody new becomes a Founder.
 */
export const LAUNCHED = false;
export const FOUNDER_PACK = { keys: 5, gold: 2500, scrap: 150 } as const;

/**
 * 'marked'  this player just became a Founder (pre-launch, after their first run)
 * 'reward'  launched, and their Founder's Pack is waiting (caller grants it, then sets claimed)
 */
export function founderStep(d: SaveData, launched = LAUNCHED, now = Date.now()): 'marked' | 'reward' | null {
  if (!launched) {
    if (!d.founder && d.stats.runs >= 1) {
      d.founder = { at: now };
      return 'marked';
    }
    return null;
  }
  return d.founder && !d.founder.claimed ? 'reward' : null;
}
