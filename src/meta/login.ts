import type { Reward } from './missions';

/**
 * 7-day sign-in calendar. Progress never resets on a missed day (it just waits), so the calendar
 * is a reason to come back rather than a punishment for being away. Day 7 is the jackpot.
 */
export interface LoginReward extends Reward {
  /** Day 7: a guaranteed item of at least this rarity. */
  itemRarity?: number;
}

export const LOGIN_DAYS = 7;

export function loginReward(day: number, sector: number): LoginReward {
  const m = 1 + sector * 0.5;
  switch (day % LOGIN_DAYS) {
    case 0:
      return { gold: Math.round(150 * m) };
    case 1:
      return { keys: 1 };
    case 2:
      return { scrap: 10 + sector * 3 };
    case 3:
      return { gold: Math.round(300 * m) };
    case 4:
      return { keys: 2 };
    case 5:
      return { gold: Math.round(250 * m), scrap: 15 + sector * 3 };
    default:
      return { itemRarity: 2, keys: 1 };
  }
}

export interface LoginState {
  /** Total days claimed (next reward is `claimed % 7`). */
  claimed: number;
  /** Consecutive-day streak, for bragging rights. */
  streak: number;
  /** toDateString() of the last claim. */
  last: string;
}

export const freshLogin = (): LoginState => ({ claimed: 0, streak: 0, last: '' });
