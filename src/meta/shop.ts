import { GEAR_IDS, GEAR } from './gear';
import type { Profile } from './profile';
import type { GearItem } from './gear';
import { Rng } from '../sim/math';
import { seasonOf } from './pass';

/**
 * Web shop (Stripe Checkout). The server (supabase/functions/shop-checkout) decides prices; these
 * are the labels the game shows, kept equal by tests/shop.test.ts.
 *
 *  - starter: one-off bundle, once per player.
 *  - pass:    Signal Pass+ for the season it was bought in.
 *  - adfree:  every rewarded ad pays out instantly without the ad. Only sold while ads exist.
 */
export type ProductId = 'starter' | 'pass' | 'adfree';

export interface Product {
  id: ProductId;
  name: string;
  cents: number;
  blurb: string;
  lines: string[];
}

export const STARTER = { gold: 3000, scrap: 100, keys: 10, rarity: 3 } as const;

export const PRODUCTS: Record<ProductId, Product> = {
  starter: {
    id: 'starter',
    name: 'Starter Pack',
    cents: 299,
    blurb: 'A big head start. One per player.',
    lines: ['Epic Gun Mod', `${STARTER.keys} crate keys`, `${STARTER.gold.toLocaleString('en-US')} gold`, `${STARTER.scrap} scrap`],
  },
  pass: {
    id: 'pass',
    name: 'Signal Pass+',
    cents: 499,
    blurb: 'Unlock the premium track for this season.',
    lines: ['30 premium rewards', 'Epic and Legendary gear', 'Tiers you already reached are ready to claim'],
  },
  adfree: {
    id: 'adfree',
    name: 'Skip Ads',
    cents: 799,
    blurb: 'Every ad reward, instantly. Forever.',
    lines: ['No ad to watch for revives, doubles, keys, rerolls and more', 'Same rewards, zero waiting', 'Applies on every device with your cloud save'],
  },
};

export const price = (p: Product) => `$${(p.cents / 100).toFixed(2)}`;

/** One row from the shop_claim RPC. */
export interface PurchaseRow {
  id: string;
  product: string;
  season: number | null;
  fresh: boolean;
}

export interface Granted {
  product: ProductId;
  item?: GearItem;
}

/**
 * Apply what the server says this player owns. Lasting things (Skip Ads, this season's Pass+) are
 * re-derived every time, so a lost or rolled-back save gets them back; the Starter Pack's contents
 * are only paid for rows the server marks `fresh` and that this save hasn't seen.
 * Returns what was newly granted (for the thank-you toast).
 */
export function applyPurchases(p: Profile, rows: PurchaseRow[], now = new Date()): Granted[] {
  const d = p.data;
  const shop = (d.shop ??= {});
  const seen = new Set(shop.got ?? []);
  const out: Granted[] = [];
  const cur = seasonOf(now).n;
  for (const r of rows) {
    const isNew = !seen.has(r.id);
    if (r.product === 'adfree') {
      if (!shop.adfree) out.push({ product: 'adfree' });
      shop.adfree = true;
    } else if (r.product === 'pass') {
      const ps = p.pass(now);
      if (r.season === cur && !ps.premium) {
        p.unlockPremiumPass();
        out.push({ product: 'pass' });
      }
    } else if (r.product === 'starter') {
      if (r.fresh && isNew && !shop.starter) {
        shop.starter = true;
        out.push({ product: 'starter', item: grantStarter(p) });
      } else if (!r.fresh) shop.starter = true; // bought, contents already delivered
    }
    if (isNew) seen.add(r.id);
  }
  shop.got = [...seen].slice(-50);
  p.save();
  return out;
}

function grantStarter(p: Profile): GearItem {
  const d = p.data;
  d.gold += STARTER.gold;
  d.scrap += STARTER.scrap;
  d.keys += STARTER.keys;
  const mods = GEAR_IDS.filter((id) => GEAR[id].slot === 'weapon');
  const rng = new Rng(Date.now() ^ (d.uidSeq * 7919));
  const it: GearItem = { uid: p.newUid(), def: rng.pick(mods), rarity: STARTER.rarity, level: 1 };
  d.gear.push(it);
  // an Epic beats anything a new player has: put it on
  const cur = d.equipped.weapon ? p.item(d.equipped.weapon) : undefined;
  if (!cur || cur.rarity < it.rarity) d.equipped.weapon = it.uid;
  return it;
}

/** Which products to offer right now. Skip Ads only makes sense while the game shows ads. */
export function offers(p: Profile, adsShown: boolean, now = new Date()): { product: Product; owned: boolean }[] {
  const shop = p.data.shop ?? {};
  const list: { product: Product; owned: boolean }[] = [
    { product: PRODUCTS.starter, owned: !!shop.starter },
    { product: PRODUCTS.pass, owned: p.pass(now).premium },
  ];
  if (adsShown || shop.adfree) list.push({ product: PRODUCTS.adfree, owned: !!shop.adfree });
  return list;
}
