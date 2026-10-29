import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { getChapter } from '../src/sim/chapters';
import { buildOffers } from '../src/sim/offers';
import { GUN_IDS, WEAPONS, type WeaponId } from '../src/sim/data';
import { Rng } from '../src/sim/math';
import { Profile } from '../src/meta/profile';
import type { BaseStats } from '../src/sim/types';

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

const base = (startWeapon: WeaponId): BaseStats => ({
  atk: 30, hp: 1e9, def: 0, crit: 0, critMul: 1, moveSpeed: 92, pickup: 46, healMul: 1, goldMul: 1,
  rerolls: 0, revives: 0, startWeapon, startLevels: 0, regen: 0,
});
const win = { won: true, time: 600, kills: 100, gold: 0, level: 10, bossKills: 1, eliteKills: 0 };

describe('primary guns', () => {
  it.each(GUN_IDS)('%s starts the run, fires and kills infected', (id) => {
    const g = new Game(getChapter(0), base(id), 3);
    expect(g.weapons.map((w) => w.id)).toEqual([id]);
    for (let i = 0; i < 60 * 40; i++) {
      if (g.state === 'levelup') g.choose(0);
      else if (g.state === 'chest') g.closeChest();
      g.step(0, 0);
      g.fx.length = 0;
    }
    expect(g.dmgBy[id] ?? 0).toBeGreaterThan(0);
    expect(g.kills).toBeGreaterThan(20);
  });

  it('are never offered as new weapons mid-run (but the starting one levels up)', () => {
    const rng = new Rng(1);
    for (let i = 0; i < 400; i++) {
      const offers = buildOffers(rng, [{ id: 'smg', level: 2, evolved: false, timer: 0, active: 0, angle: 0, sourceId: 1 }], []);
      for (const o of offers) if (o.type === 'weapon' && o.isNew) expect(['smg', 'flamer', 'mg', 'bazooka']).not.toContain(o.id);
    }
    const ups = new Set<string>();
    for (let i = 0; i < 200; i++)
      for (const o of buildOffers(rng, [{ id: 'smg', level: 2, evolved: false, timer: 0, active: 0, angle: 0, sourceId: 1 }], [])) if (o.type === 'weapon') ups.add(o.id + o.isNew);
    expect(ups.has('smgfalse')).toBe(true);
  });

  it('only one primary gun at a time: the pistol is never offered alongside another gun', () => {
    const rng = new Rng(2);
    for (const id of ['smg', 'flamer', 'mg', 'bazooka'] as const)
      for (let i = 0; i < 300; i++)
        for (const o of buildOffers(rng, [{ id, level: 1, evolved: false, timer: 0, active: 0, angle: 0, sourceId: 1 }], []))
          if (o.type === 'weapon') expect(o.id === id || !WEAPONS[o.id].gun).toBe(true);
    // a run that started with non-gun gear (e.g. the Arc Gauntlet) can still find the pistol
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++)
      for (const o of buildOffers(rng, [{ id: 'arc', level: 1, evolved: false, timer: 0, active: 0, angle: 0, sourceId: 1 }], [])) if (o.type === 'weapon') seen.add(o.id);
    expect(seen.has('pistol')).toBe(true);
  });

  it('all pair with the Targeting Chip so they can evolve', () => {
    for (const id of GUN_IDS) expect(WEAPONS[id].partner).toBe('chip');
  });

  it('unlock with campaign progress, auto-equip on unlock, and can be swapped back', () => {
    const p = mk();
    expect(p.gunsUnlocked()).toEqual(['pistol']);
    expect(p.baseStats().startWeapon).toBe('pistol');
    p.setGun('bazooka'); // locked: ignored
    expect(p.gun()).toBe('pistol');
    p.applyRun(0, win, 1);
    expect(p.gun()).toBe('pistol');
    const rw = p.applyRun(1, win, 2); // clearing Sector 2 unlocks the SMG
    expect(rw.newGun).toBe('smg');
    expect(p.baseStats().startWeapon).toBe('smg');
    p.setGun('pistol');
    expect(p.baseStats().startWeapon).toBe('pistol');
    for (let s = 2; s < 8; s++) p.applyRun(s, win, s);
    expect(p.gunsUnlocked()).toEqual(['pistol', 'smg', 'flamer', 'mg', 'bazooka']);
    expect(p.gun()).toBe('bazooka');
    p.setGun('flamer');
    expect(p.baseStats().startWeapon).toBe('flamer');
  });

  it('old saves with no gun picked get the newest unlocked gun', () => {
    const p = mk();
    p.data.unlocked = 5;
    expect(p.gun()).toBe('flamer');
  });

  it('weapon gear never changes the primary weapon: one gun, nothing extra', () => {
    const p = mk();
    p.data.unlocked = 12; // e.g. a player who reached Sector 13 wearing crate gear
    p.data.gear.push({ uid: 'z', def: 'tube', rarity: 2, level: 9 });
    p.data.equipped.weapon = 'z';
    const g = new Game(getChapter(12), p.baseStats(), 1);
    expect(g.weapons.map((w) => w.id)).toEqual(['bazooka']);
  });
});
