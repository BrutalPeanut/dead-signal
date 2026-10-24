import { describe, expect, it } from 'vitest';
import { Profile } from '../src/meta/profile';
import { newCrewCode, setFetcher, validCrew, validName } from '../src/net/leaderboard';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }
const mk = () => new Profile(new Mem() as unknown as Storage);

describe('leaderboard client', () => {
  it('queues scores until a call sign is set, then uploads best-per-board', async () => {
    const calls: any[] = [];
    let online = true;
    setFetcher(async (url, init) => {
      if (!online) throw new Error('offline');
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return { ok: true, json: async () => 3 };
    });
    const p = mk();
    const day = new Date(2026, 9, 24, 12);
    expect(await p.postScore('daily', 1000, 100, day)).toBeNull(); // no name yet
    expect(await p.postScore('daily', 800, 90, day)).toBeNull(); // lower score doesn't replace
    expect(p.data.online.pending).toHaveLength(1);
    expect(p.data.online.pending[0].score).toBe(1000);
    p.setOnline('BShack', 'shack7');
    online = false;
    expect(await p.postScore('endless', 5000, 400, day)).toBeNull(); // offline: kept
    expect(p.data.online.pending).toHaveLength(2);
    online = true;
    expect(await p.postScore('endless', 6000, 450, day)).toBe(3);
    expect(p.data.online.pending).toHaveLength(0);
    const daily = calls.find((c) => c.body.p_board === 'daily:2026-10-24');
    expect(daily.body.p_score).toBe(1000);
    expect(daily.body.p_crew).toBe('SHACK7');
    expect(calls.find((c) => c.body.p_board === 'endless').body.p_score).toBe(6000);
  });

  it('validates names and crew codes', () => {
    expect(validName('Al')).toBe(true);
    expect(validName('A')).toBe(false);
    expect(validCrew('')).toBe(true);
    expect(validCrew('shack7')).toBe(true);
    expect(validCrew('no!')).toBe(false);
    expect(newCrewCode()).toMatch(/^[A-Z2-9]{6}$/);
  });
});
