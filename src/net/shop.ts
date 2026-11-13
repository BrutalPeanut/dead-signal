/**
 * Web shop network calls. Checkout happens on Stripe's own page (we never see card details);
 * the game only sends its random player id, and picks purchases up afterwards with shop_claim.
 */
import { KEY, rpc } from './leaderboard';
import type { ProductId, PurchaseRow } from '../meta/shop';

const FN = 'https://lxrioefrlncjequyjifk.supabase.co/functions/v1/shop-checkout';

export interface ShopStatus {
  ready: boolean;
  live: boolean;
}

/** Is a Stripe key configured (and is it live)? null when offline. */
export async function shopStatus(): Promise<ShopStatus | null> {
  try {
    const res = await fetch(FN, { headers: { apikey: KEY } });
    if (!res.ok) return null;
    return (await res.json()) as ShopStatus;
  } catch {
    return null;
  }
}

export type CheckoutResult = { url: string } | { error: 'owned' | 'offline' | 'unavailable' | 'not_ready' };

export async function startCheckout(product: ProductId, player: string): Promise<CheckoutResult> {
  try {
    const res = await fetch(FN, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ product, player }),
    });
    const out = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    // only ever send the player to Stripe's own checkout page
    if (out.url && isStripeCheckout(out.url)) return { url: out.url };
    return { error: out.error === 'owned' ? 'owned' : out.error === 'not_configured' ? 'not_ready' : 'unavailable' };
  } catch {
    return { error: 'offline' };
  }
}

/** Everything these player ids own; fresh rows are being delivered for the first time. */
export function claimPurchases(ids: string[]): Promise<PurchaseRow[] | null> {
  return rpc<PurchaseRow[]>('shop_claim', { p_players: ids });
}

/** True for an https://checkout.stripe.com/... address (nothing else is followed after Buy). */
export function isStripeCheckout(u: string): boolean {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && x.hostname === 'checkout.stripe.com';
  } catch {
    return false;
  }
}
