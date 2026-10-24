import { describe, expect, it } from 'vitest';
import { Profile } from '../src/meta/profile';
import { PASS_TIERS, SP_PER_TIER, runSp, seasonOf } from '../src/meta/pass';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }
const mk = () => new Profile(new Mem() as unknown as Storage);

describe('signal pass', () => {
  it('seasons are 30 days and numbered from Oct 2026', () => {
    expect(seasonOf(new Date(2026, 9, 24)).number).toBe(1);
    expect(seasonOf(new Date(2026, 10, 5)).number).toBe(2);
  });

  it('runs earn SP; tiers are claimable once on the free track; premium needs unlock', () => {
    const p = mk();
    const r = { won: true, time: 300, kills: 6000, gold: 100, level: 30, bossKills: 2, eliteKills: 1, score: 1 };
    p.applyRun(0, r);
    expect(p.pass().sp).toBe(runSp(300, 6000, 2, true));
    p.pass().sp = SP_PER_TIER * 10;
    const scrap0 = p.data.scrap;
    expect(p.claimPass(1, false)).not.toBeNull(); // tier 2 = scrap
    expect(p.data.scrap).toBeGreaterThan(scrap0);
    expect(p.claimPass(1, false)).toBeNull();
    expect(p.claimPass(1, true)).toBeNull();
    const t10 = p.claimPass(9, false)!;
    expect(t10.item!.rarity).toBe(2);
    expect(p.claimPass(10, false)).toBeNull(); // not reached
    p.unlockPremiumPass();
    expect(p.claimPass(1, true)).not.toBeNull();
  });

  it('a typical player finishes the free track within a season (~3 runs a day)', () => {
    const perRun = runSp(260, 4500, 1, false);
    const perDay = perRun * 3 + 3 * 30; // 3 runs + 3 missions
    expect((SP_PER_TIER * PASS_TIERS) / perDay).toBeLessThan(30);
    expect((SP_PER_TIER * PASS_TIERS) / perDay).toBeGreaterThan(15);
  });

  it('season rollover grants unclaimed free rewards and resets', () => {
    const p = mk();
    p.data.pass.season = -1; // pretend it's last season's pass
    p.data.pass.sp = SP_PER_TIER * 3;
    const gold0 = p.data.gold;
    const ps = p.pass();
    expect(ps.sp).toBe(0);
    expect(p.data.gold).toBeGreaterThan(gold0);
  });
});
