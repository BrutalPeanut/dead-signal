import { describe, expect, it } from 'vitest';
import { FREE_ECON, Profile } from '../src/meta/profile';
import { ASCEND_AT } from '../src/meta/ascension';

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
const mk = (ads = false) => {
  const p = new Profile(new Mem() as unknown as Storage);
  p.adEcon = ads;
  return p;
};
const run = { won: true, time: 300, kills: 400, gold: 50, level: 10, bossKills: 2, eliteKills: 1, score: 1000 };

describe('ad economy', () => {
  it('trims base gold and scrap only when ads exist', () => {
    const off = mk(false).applyRun(3, run, 7);
    const on = mk(true).applyRun(3, run, 7);
    expect(on.gold / off.gold).toBeCloseTo(FREE_ECON, 1);
    expect(on.scrap).toBeLessThan(off.scrap);
    expect(on.keys).toBe(off.keys);
    expect(mk(true).relayRates().goldPerH).toBeLessThan(mk(false).relayRates().goldPerH);
  });

  it('a double-rewards ad leaves an ad watcher well ahead of the old baseline', () => {
    const p = mk(true);
    const g0 = p.data.gold, s0 = p.data.scrap;
    const rw = p.applyRun(3, run, 7);
    p.grantRunDouble(rw);
    const base = mk(false).applyRun(3, run, 7);
    expect(p.data.gold - g0).toBeGreaterThan(base.gold * 1.6);
    expect(p.data.scrap - s0).toBeGreaterThan(base.scrap * 1.5);
  });

  it('relay ×2 doubles the collection', () => {
    const a = mk(true), b = mk(true);
    const t = Date.now();
    a.data.relayAt = b.data.relayAt = t - 4 * 3.6e6;
    const ra = a.claimRelay(t, 1), rb = b.claimRelay(t, 2);
    expect(rb.gold).toBe(ra.gold * 2);
    expect(b.data.relayAt).toBe(t);
  });

  it('sign-in double works once per day, only after claiming', () => {
    const p = mk(true);
    const now = new Date(2026, 9, 31, 12);
    expect(p.canDoubleDaily(now)).toBe(false);
    p.claimDaily(now);
    const g = p.data.gold;
    const r = p.doubleDaily(now)!;
    expect(p.data.gold).toBe(g + (r.gold ?? 0));
    expect(p.doubleDaily(now)).toBeNull();
  });

  it('ascension bonus is +50% cores, once per rank', () => {
    const p = mk(true);
    p.data.unlocked = ASCEND_AT;
    for (let i = 0; i < ASCEND_AT; i++) p.data.stars[i] = 7;
    const r = p.ascend()!;
    expect(p.ascendBonus()).toBe(Math.round(r.cores * 0.5));
    const c = p.data.asc!.cores;
    expect(p.claimAscendBonus()).toBe(25);
    expect(p.data.asc!.cores).toBe(c + 25);
    expect(p.ascendBonus()).toBe(0);
  });
});
