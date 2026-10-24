import { describe, expect, it } from 'vitest';
import { Profile } from '../src/meta/profile';

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

describe('profile', () => {
  it('starts with a sidearm and vest equipped', () => {
    const p = mk();
    const b = p.baseStats();
    expect(b.startWeapon).toBe('pistol');
    expect(b.atk).toBe(20);
    expect(b.hp).toBe(180);
  });

  it('merges three identical items into the next rarity and keeps the best level', () => {
    const p = mk();
    p.data.gear.push({ uid: 'a', def: 'kevlar', rarity: 0, level: 5 }, { uid: 'b', def: 'kevlar', rarity: 0, level: 2 });
    const r = p.merge('g2');
    expect(r?.rarity).toBe(1);
    expect(r?.level).toBe(5);
    expect(p.data.gear.filter((g) => g.def === 'kevlar').length).toBe(1);
    expect(p.data.equipped.vest).toBe('g2');
  });

  it('merge keeps equipped pointer valid when a fodder item was equipped', () => {
    const p = mk();
    p.data.gear.push({ uid: 'a', def: 'sidearm', rarity: 0, level: 1 }, { uid: 'b', def: 'sidearm', rarity: 0, level: 1 });
    p.merge('a');
    const eq = p.data.equipped.weapon!;
    expect(p.item(eq)).toBeDefined();
  });

  it('levels gear with gold + scrap', () => {
    const p = mk();
    const before = p.baseStats().atk;
    expect(p.levelUp('g1')).toBe(true);
    expect(p.baseStats().atk).toBeGreaterThan(before);
  });

  it('awards rewards, stars and unlocks the next sector on a win', () => {
    const p = mk();
    const rw = p.applyRun(0, { won: true, time: 600, kills: 8000, gold: 500, level: 30, bossKills: 2, eliteKills: 2 }, 1);
    expect(rw.firstClear).toBe(true);
    expect(rw.unlockedSector).toBe(true);
    expect(p.data.unlocked).toBe(1);
    expect(p.data.stars[0]).toBe(7);
    expect(rw.items.length).toBe(4);
    expect(rw.keys).toBe(2);
  });

  it('a short loss still pays something', () => {
    const p = mk();
    const g0 = p.data.gold;
    p.applyRun(0, { won: false, time: 60, kills: 100, gold: 3, level: 4, bossKills: 0, eliteKills: 0 }, 1);
    expect(p.data.gold).toBeGreaterThan(g0);
    expect(p.data.unlocked).toBe(0);
  });

  it('relay caps at 8 hours', () => {
    const p = mk();
    const r = p.relayPending(p.data.relayAt + 24 * 3.6e6);
    expect(r.hours).toBe(8);
  });

  it('cannot unequip the weapon or salvage equipped gear', () => {
    const p = mk();
    p.unequip('weapon');
    expect(p.data.equipped.weapon).toBe('g1');
    expect(p.salvage('g1')).toBe(false);
  });

  it('daily can be claimed once per day', () => {
    const p = mk();
    const d = new Date('2026-10-24T12:00:00');
    expect(p.claimDaily(d)).not.toBeNull();
    expect(p.claimDaily(d)).toBeNull();
  });
});

describe('missions and sector chests', () => {
  it('rolls 5 daily missions including kills and runs, stable within a day', () => {
    const p = mk();
    const d = new Date('2026-10-24T09:00:00');
    const a = p.missions(d).list.map((m) => m.kind);
    expect(a.length).toBe(5);
    expect(a).toContain('kills');
    expect(a).toContain('runs');
    expect(p.missions(new Date('2026-10-24T22:00:00')).list.map((m) => m.kind)).toEqual(a);
  });

  it('tracks run progress and pays out once', () => {
    const p = mk();
    p.missions();
    for (let i = 0; i < 3; i++) p.applyRun(0, { won: false, time: 200, kills: 600, gold: 0, level: 5, bossKills: 0, eliteKills: 1 }, i);
    const list = p.missions().list;
    const ri = list.findIndex((m) => m.kind === 'runs');
    expect(list[ri].progress).toBe(3);
    const g0 = p.data.gold;
    expect(p.claimMission(ri)).not.toBeNull();
    expect(p.data.gold).toBeGreaterThan(g0);
    expect(p.claimMission(ri)).toBeNull();
  });

  it('survive missions track the best single run, not the sum', () => {
    const p = mk();
    const m = p.missions();
    m.list[2] = { kind: 'survive', target: 480, progress: 0, claimed: false, reward: { scrap: 6 } };
    p.applyRun(0, { won: false, time: 300, kills: 0, gold: 0, level: 1, bossKills: 0, eliteKills: 0 }, 1);
    p.applyRun(0, { won: false, time: 300, kills: 0, gold: 0, level: 1, bossKills: 0, eliteKills: 0 }, 2);
    expect(p.missions().list[2].progress).toBe(300);
  });

  it('sector chests unlock with stars and claim once', () => {
    const p = mk();
    expect(p.canClaimStar(0, 1)).toBe(false);
    p.applyRun(0, { won: true, time: 600, kills: 5000, gold: 100, level: 25, bossKills: 2, eliteKills: 2 }, 1);
    expect(p.starChestsReady()).toBe(3);
    expect(p.claimStar(0, 4)?.keys).toBe(1);
    expect(p.claimStar(0, 4)).toBeNull();
    expect(p.starChestsReady()).toBe(2);
  });
});
