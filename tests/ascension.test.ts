import { describe, expect, it } from 'vitest';
import { Profile, progressOf } from '../src/meta/profile';
import { CloudSync } from '../src/meta/sync';
import { ASCEND_AT, coresFor } from '../src/meta/ascension';
import { getChapter } from '../src/sim/chapters';
import { dropWeights } from '../src/meta/gear';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
const mk = () => new Profile(new MemStorage() as unknown as Storage);

/** A save that has cleared Sectors 1-10 with every star. */
function veteran() {
  const p = mk();
  const d = p.data;
  d.unlocked = ASCEND_AT;
  for (let i = 0; i < ASCEND_AT; i++) {
    d.stars[i] = 7;
    d.starClaims[i] = 7;
    d.best[i] = 300;
  }
  d.gold = 50_000;
  d.scrap = 900;
  d.keys = 2;
  d.tracks.atk = 20;
  d.accountLevel = 25;
  d.gear.push({ uid: 'gx', def: 'sidearm', rarity: 4, level: 30 });
  p.save();
  return p;
}

describe('ascension', () => {
  it('is locked until Sector 10 is cleared', () => {
    const p = mk();
    p.data.unlocked = ASCEND_AT - 1;
    expect(p.canAscend()).toBe(false);
    expect(p.ascend()).toBeNull();
    expect(p.rank()).toBe(0);
  });

  it('resets only the campaign and keeps gear, currencies, talents, guns and couriers', () => {
    const p = veteran();
    const gunsBefore = p.gunsUnlocked();
    const powerBefore = p.power();
    const keysBefore = p.data.keys;
    const r = p.ascend()!;
    expect(r.rank).toBe(1);
    expect(r.cores).toBe(50); // 10 sectors × (1 + 1 + 3)
    const d = p.data;
    expect(d.unlocked).toBe(0);
    expect(d.stars).toEqual({});
    expect(d.starClaims).toEqual({});
    expect(d.best).toEqual({});
    expect(d.gold).toBe(50_000);
    expect(d.scrap).toBe(900);
    expect(d.keys).toBe(keysBefore + r.keys);
    expect(d.tracks.atk).toBe(20);
    expect(d.accountLevel).toBe(25);
    expect(d.gear.some((g) => g.uid === 'gx')).toBe(true);
    expect(p.gunsUnlocked()).toEqual(gunsBefore);
    expect(p.charUnlocked('ranger')).toBe(true); // unlocks at Sector 10
    expect(p.power()).toBe(powerBefore);
    expect(p.data.asc!.cores).toBe(50);
  });

  it('sector chests can be earned and claimed again after ascending', () => {
    const p = veteran();
    p.ascend();
    p.data.stars[0] = 7;
    expect(p.claimStar(0, 4)).not.toBeNull();
  });

  it('Signal Lab upgrades cost cores, stack to their cap and raise power', () => {
    const p = veteran();
    p.ascend();
    const before = p.power();
    const cores = p.data.asc!.cores;
    expect(p.buyLab('atk')).toBe(true);
    expect(p.data.asc!.cores).toBe(cores - 8);
    expect(p.lab('atk')).toBe(1);
    expect(p.power()).toBeGreaterThan(before);
    p.data.asc!.cores = 10_000;
    while (p.buyLab('revive'));
    expect(p.lab('revive')).toBe(1);
    expect(p.baseStats().revives).toBeGreaterThanOrEqual(1);
    p.data.asc!.cores = 0;
    expect(p.buyLab('hp')).toBe(false);
  });

  it('ranks pay more and toughen the infected', () => {
    const r0 = getChapter(4, 0);
    const r2 = getChapter(4, 2);
    expect(r2.hpMul / r0.hpMul).toBeCloseTo(1.15 ** 2);
    expect(r2.dmgMul / r0.dmgMul).toBeCloseTo(1.08 ** 2);
    expect(r2.power).toBeGreaterThan(r0.power);
    // same run, rank 0 vs rank 1
    const run = { won: true, time: 300, kills: 400, gold: 50, level: 10, bossKills: 2, eliteKills: 1, score: 1000 };
    const a = veteran();
    const ga = a.applyRun(3, run, 7).gold;
    const b = veteran();
    b.ascend();
    const gb = b.applyRun(3, run, 7).gold;
    expect(gb / ga).toBeCloseTo(1.25, 1);
  });

  it('luck shifts drops toward rarer gear', () => {
    const rare = (w: number[]) => (w[3] + w[4]) / w.reduce((x, y) => x + y, 0);
    expect(rare(dropWeights(9, false, 3))).toBeGreaterThan(rare(dropWeights(9, false, 0)));
    expect(rare(dropWeights(9, true, 4))).toBeGreaterThan(rare(dropWeights(9, true, 0)));
    for (const w of [dropWeights(30, false, 6), dropWeights(30, true, 6)]) for (const x of w) expect(x).toBeGreaterThanOrEqual(0);
  });

  it('a pre-ascension cloud backup never overwrites the ascended save', () => {
    const p = veteran();
    const before = progressOf(p.data);
    p.ascend();
    expect(progressOf(p.data)).toBeGreaterThan(before);
  });

  it('Act II sectors are worth double cores', () => {
    expect(coresFor({ 0: 7 })).toBe(5);
    expect(coresFor({ 12: 7 })).toBe(10);
    expect(coresFor({ 3: 1 })).toBe(1);
  });

  it('replaying the climb does not re-announce guns or couriers already unlocked', () => {
    const p = veteran();
    p.ascend();
    const win = { won: true, time: 300, kills: 400, gold: 50, level: 10, bossKills: 2, eliteKills: 1, score: 1000 };
    for (let s = 0; s < ASCEND_AT; s++) {
      const r = p.applyRun(s, win, s + 1);
      expect(r.unlockedSector).toBe(true);
      expect(r.newGun).toBeUndefined();
      expect(r.newCharacter).toBeUndefined();
    }
    expect(p.canAscend()).toBe(true);
    // pushing past the old frontier announces new unlocks again
    expect(p.data.asc!.peak).toBe(ASCEND_AT);
  });

  it('survives a cloud round trip', () => {
    const p = veteran();
    p.ascend();
    p.buyLab('loot');
    const q = mk();
    expect(q.adopt(JSON.parse(JSON.stringify(p.data)))).toBe(true);
    expect(q.rank()).toBe(1);
    expect(q.lab('loot')).toBe(1);
    expect(new CloudSync(q, false).status).toBe('off');
  });
});
