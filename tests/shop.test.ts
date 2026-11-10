import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Profile, normalizeSave } from '../src/meta/profile';
import { PRODUCTS, STARTER, applyPurchases, offers, type PurchaseRow } from '../src/meta/shop';
import { seasonOf } from '../src/meta/pass';

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
const mk = () => new Profile(new Mem() as unknown as Storage);
const row = (id: string, product: string, fresh = true, season: number | null = null): PurchaseRow => ({ id, product, season, fresh });

describe('web shop', () => {
  it('shows the same prices the server charges', () => {
    const fn = readFileSync(new URL('../supabase/functions/shop-checkout/index.ts', import.meta.url), 'utf8');
    for (const p of Object.values(PRODUCTS)) {
      const m = fn.match(new RegExp(`${p.id}: \\{[^}]*amount: (\\d+)`));
      expect(m, p.id).not.toBeNull();
      expect(Number(m![1]), p.id).toBe(p.cents);
    }
  });

  it('delivers the Starter Pack exactly once', () => {
    const p = mk();
    const g0 = p.data.gold, k0 = p.data.keys, n0 = p.data.gear.length;
    const got = applyPurchases(p, [row('cs_1', 'starter')]);
    expect(got.map((g) => g.product)).toEqual(['starter']);
    expect(p.data.gold).toBe(g0 + STARTER.gold);
    expect(p.data.keys).toBe(k0 + STARTER.keys);
    expect(p.data.gear.length).toBe(n0 + 1);
    const it = got[0].item!;
    expect(it.rarity).toBe(STARTER.rarity);
    expect(p.data.equipped.weapon).toBe(it.uid); // the Epic mod goes on
    // the same row again (fresh by a race, or not fresh) pays nothing more
    expect(applyPurchases(p, [row('cs_1', 'starter')])).toEqual([]);
    expect(applyPurchases(p, [row('cs_1', 'starter', false)])).toEqual([]);
    expect(p.data.gold).toBe(g0 + STARTER.gold);
    expect(offers(p, false).find((o) => o.product.id === 'starter')!.owned).toBe(true);
  });

  it('a starter already delivered elsewhere only marks it owned', () => {
    const p = mk();
    const g0 = p.data.gold;
    expect(applyPurchases(p, [row('cs_9', 'starter', false)])).toEqual([]);
    expect(p.data.gold).toBe(g0);
    expect(p.data.shop!.starter).toBe(true);
  });

  it('Signal Pass+ unlocks for the season it was bought in only', () => {
    const now = new Date();
    const cur = seasonOf(now).n;
    const p = mk();
    expect(applyPurchases(p, [row('cs_old', 'pass', false, cur - 1)], now)).toEqual([]);
    expect(p.pass(now).premium).toBe(false);
    expect(applyPurchases(p, [row('cs_2', 'pass', true, cur)], now).map((g) => g.product)).toEqual(['pass']);
    expect(p.pass(now).premium).toBe(true);
    // a restored save that lost premium gets it back from the server list
    p.data.pass.premium = false;
    expect(applyPurchases(p, [row('cs_2', 'pass', false, cur)], now).map((g) => g.product)).toEqual(['pass']);
  });

  it('Skip Ads is permanent and only offered while ads exist', () => {
    const p = mk();
    expect(offers(p, false).some((o) => o.product.id === 'adfree')).toBe(false);
    expect(offers(p, true).some((o) => o.product.id === 'adfree')).toBe(true);
    applyPurchases(p, [row('cs_3', 'adfree')]);
    expect(p.adFree()).toBe(true);
    expect(offers(p, false).find((o) => o.product.id === 'adfree')!.owned).toBe(true);
  });

  it('save migration: old saves are untouched, junk shop data is cleaned', () => {
    const p = mk();
    const raw = JSON.parse(JSON.stringify(p.data));
    expect(normalizeSave(raw)!.shop).toBeUndefined();
    raw.shop = { starter: true, adfree: 'yes', got: ['cs_1', 5, 'cs_2'], ids: [null] };
    const d = normalizeSave(raw)!;
    expect(d.shop).toEqual({ starter: true, got: ['cs_1', 'cs_2'] });
    raw.shop = 'nope';
    expect(normalizeSave(raw)!.shop).toBeUndefined();
  });

  it('a cloud restore keeps purchases and the old player id', () => {
    const p = mk();
    const oldId = p.playerId();
    applyPurchases(p, [row('cs_5', 'adfree')]);
    const other = mk();
    other.playerId();
    other.data.unlocked = 9;
    expect(p.adopt(JSON.parse(JSON.stringify(other.data)))).toBe(true);
    expect(p.data.unlocked).toBe(9);
    expect(p.adFree()).toBe(true);
    expect(p.buyerIds()).toEqual([other.data.online.id, oldId]);
  });
});
