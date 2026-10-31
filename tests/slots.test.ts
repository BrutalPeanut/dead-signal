import { describe, expect, it } from 'vitest';
import { Profile, normalizeSave } from '../src/meta/profile';
import { MAX_LEVEL } from '../src/meta/gear';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
const mk = () => {
  const p = new Profile(new MemStorage() as unknown as Storage);
  p.data.gold = 1e7;
  p.data.scrap = 1e5;
  return p;
};

describe('gear levels belong to the slot', () => {
  it('swapping in a new item keeps the slot level', () => {
    const p = mk();
    for (let i = 0; i < 6; i++) expect(p.levelUp('g2')).toBe(true); // kevlar vest
    expect(p.slotLevel('vest')).toBe(7);
    p.data.gear.push({ uid: 'n', def: 'kevlar', rarity: 1, level: 1 });
    const hpBefore = p.baseStats().hp;
    p.equip('n');
    expect(p.lvOf(p.item('n')!)).toBe(7);
    expect(p.baseStats().hp).toBeGreaterThan(hpBefore); // better rarity at the same level
  });

  it('the item rarity caps the level it uses, and merging lifts the cap', () => {
    const p = mk();
    p.data.slotLv.vest = 25;
    const common = p.item('g2')!;
    expect(p.lvOf(common)).toBe(MAX_LEVEL[0]);
    expect(p.canLevel(common)).toBe(false);
    p.data.gear.push({ uid: 'a', def: 'kevlar', rarity: 0, level: 1 }, { uid: 'b', def: 'kevlar', rarity: 0, level: 1 });
    p.merge('g2');
    expect(p.lvOf(p.item('g2')!)).toBe(MAX_LEVEL[1]);
  });

  it('only the equipped item can level its slot', () => {
    const p = mk();
    p.data.gear.push({ uid: 'spare', def: 'kevlar', rarity: 0, level: 1 });
    expect(p.canLevel(p.item('spare')!)).toBe(false);
    expect(p.levelUp('spare')).toBe(false);
  });

  it('old saves move item levels onto the slots without losing power', () => {
    const p = mk();
    const raw = JSON.parse(JSON.stringify(p.data));
    delete raw.slotLv;
    raw.gear[0].level = 9; // equipped sidearm
    raw.gear[1].level = 4; // equipped kevlar
    raw.gear.push({ uid: 'old', def: 'kevlar', rarity: 1, level: 12 }); // spare, levelled higher
    const before = new Profile(new MemStorage() as unknown as Storage);
    before.data = { ...raw, slotLv: { weapon: 9, vest: 4 } }; // the old item-level stats, computed slot-style
    const atkBefore = before.baseStats().atk;
    const d = normalizeSave(raw)!;
    expect(d.slotLv.weapon).toBe(9);
    expect(d.slotLv.vest).toBe(12); // the highest level any vest had
    expect(d.gear.every((g) => g.level === 1)).toBe(true); // nothing counted twice on salvage
    const q = mk();
    q.adopt(d);
    expect(q.baseStats().atk).toBe(atkBefore);
  });
});

describe('better gear indicator', () => {
  it('flags an empty slot with gear available, and a stronger unequipped item', () => {
    const p = mk();
    expect(p.upgradeFor('boots')).toBeUndefined();
    p.data.gear.push({ uid: 'bt', def: 'treads', rarity: 0, level: 1 });
    expect(p.upgradeFor('boots')?.uid).toBe('bt');
    p.data.gear.push({ uid: 'v2', def: 'kevlar', rarity: 2, level: 1 });
    expect(p.upgradeFor('vest')?.uid).toBe('v2');
    expect(p.isUpgrade(p.item('v2')!)).toBe(true);
    p.equip('v2');
    expect(p.upgradeFor('vest')).toBeUndefined();
    expect(p.isUpgrade(p.item('g2')!)).toBe(false); // the old one is worse now
  });
});

describe('2× speed from ads', () => {
  it('one ad = 30 minutes, stacking to 2 hours, and it expires', () => {
    const p = mk();
    const t = 1_000_000;
    expect(p.speedActive(t)).toBe(false);
    p.grantSpeed(t);
    expect(p.speedLeftMin(t)).toBe(30);
    expect(p.data.settings.speed).toBe(2);
    for (let i = 0; i < 6; i++) p.grantSpeed(t);
    expect(p.speedLeftMin(t)).toBe(120);
    expect(p.speedActive(t + 2 * 3_600_000 + 1)).toBe(false);
  });
});
