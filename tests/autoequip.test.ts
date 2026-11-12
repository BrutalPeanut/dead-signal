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

/** Add an item the way a drop does (push + autoEquip). */
function drop(p: Profile, def: string, rarity: number) {
  const it = { uid: p.newUid(), def, rarity, level: 1 };
  p.data.gear.push(it);
  p.autoEquip(it);
  return it;
}

describe('auto-equip', () => {
  it('fills an empty slot', () => {
    const p = mk();
    delete p.data.equipped.vest;
    const it = drop(p, 'kevlar', 0);
    expect(p.data.equipped.vest).toBe(it.uid);
  });

  it('replaces weaker gear with a strictly better drop and reports it', () => {
    const p = mk();
    const old = drop(p, 'kevlar', 0);
    p.data.equipped.vest = old.uid;
    p.autoEquipped = [];
    const better = drop(p, 'kevlar', 2);
    expect(p.data.equipped.vest).toBe(better.uid);
    expect(p.autoEquipped).toEqual([better.uid]);
  });

  it('never swaps in lower-rarity or weaker gear', () => {
    const p = mk();
    const rare = drop(p, 'kevlar', 2);
    p.data.equipped.vest = rare.uid;
    drop(p, 'hazmat', 1);
    drop(p, 'kevlar', 0);
    expect(p.data.equipped.vest).toBe(rare.uid);
  });

  it('keeps the gun mod a player chose (only upgrades within the same mod)', () => {
    const p = mk();
    const cur = p.item(p.data.equipped.weapon!)!;
    const other = cur.def === 'tube' ? 'sidearm' : 'tube';
    drop(p, other, 3);
    expect(p.data.equipped.weapon).toBe(cur.uid);
    const same = drop(p, cur.def, 3);
    expect(p.data.equipped.weapon).toBe(same.uid);
  });
});
