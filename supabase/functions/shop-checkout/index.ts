// Dead Signal web shop: starts a Stripe Checkout for one product and returns its URL.
// Deployed to Supabase project "dead-signal" with verify_jwt = false (the game calls it with the
// publishable key, which isn't a JWT). Secrets (set by the owner in Supabase → Edge Functions →
// Secrets): STRIPE_SECRET_KEY. SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
//
// GET  → { ready, live }                 whether a Stripe key is set, and whether it's a live key
// POST { product, player } → { url }     or { error } with 400 / 409 (already owned) / 503
//
// Prices live here (the server decides what is charged); tests/shop.test.ts keeps the game's
// displayed prices in sync with this table.

// Stripe Managed Payments (Stripe is merchant of record and handles VAT/sales tax) needs a tax
// code per product: video game content with permanent rights, or limited rights for the season pass.
const GAME_PERMANENT = 'txcd_10201000';
const GAME_LIMITED = 'txcd_10201001';
const PRODUCTS: Record<string, { name: string; desc: string; amount: number; once: 'ever' | 'season'; tax: string }> = {
  starter: { name: 'Starter Pack', desc: 'Epic gun mod, 10 crate keys, 3,000 gold and 100 scrap. One per player.', amount: 299, once: 'ever', tax: GAME_PERMANENT },
  pass: { name: 'Signal Pass+', desc: 'Unlocks the premium reward track for the current season.', amount: 499, once: 'season', tax: GAME_LIMITED },
  adfree: { name: 'Skip Ads', desc: 'Every ad reward in Dead Signal, instantly, without watching the ad. Forever.', amount: 799, once: 'ever', tax: GAME_PERMANENT },
};
// pinned so an account-level API upgrade can't change request/response shapes under us
const STRIPE_VERSION = '2026-04-22.dahlia';

// same season clock as the game (src/meta/pass.ts): 30-day seasons from Oct 1 2026
const EPOCH = Date.UTC(2026, 9, 1);
const season = () => Math.max(0, Math.floor((Date.now() - EPOCH) / 864e5 / 30));

const ORIGINS = [/^https:\/\/deadsignal\.info$/, /^https:\/\/www\.deadsignal\.info$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(origin: string | null) {
  const ok = origin && ORIGINS.some((r) => r.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? origin! : 'https://deadsignal.info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
    Vary: 'Origin',
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = { ...cors(origin), 'Content-Type': 'application/json' };
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response(null, { headers });

  const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const live = /^(sk|rk)_live_/.test(key);
  if (req.method === 'GET') return json({ ready: !!key, live });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  if (!key) return json({ error: 'not_configured' }, 503);

  let body: { product?: string; player?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  // own keys only: names like 'constructor' or '__proto__' must not count as products
  const product = typeof body.product === 'string' && Object.hasOwn(PRODUCTS, body.product) ? PRODUCTS[body.product] : undefined;
  const player = body.player ?? '';
  if (!product || !UUID.test(player)) return json({ error: 'bad_request' }, 400);
  const s = season();

  // one Starter Pack / Skip Ads per player, one Pass+ per season
  const sb = Deno.env.get('SUPABASE_URL')!;
  const sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  let q = `${sb}/rest/v1/purchases?select=id&limit=1&refunded_at=is.null&livemode=eq.${live}&player_id=eq.${player}&product=eq.${body.product}`;
  if (product.once === 'season') q += `&season=eq.${s}`;
  const owned = await fetch(q, { headers: { apikey: sk, Authorization: `Bearer ${sk}` } });
  if (owned.ok && ((await owned.json()) as unknown[]).length) return json({ error: 'owned' }, 409);

  const back = origin && ORIGINS.some((r) => r.test(origin)) ? origin : 'https://deadsignal.info';
  const form = new URLSearchParams({
    mode: 'payment',
    client_reference_id: player,
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(product.amount),
    'line_items[0][price_data][product_data][name]': `Dead Signal: ${product.name}`,
    'line_items[0][price_data][product_data][description]': product.desc,
    'line_items[0][price_data][product_data][tax_code]': product.tax,
    // the price players see is what they pay: tax is included, not added at checkout
    'line_items[0][price_data][tax_behavior]': 'inclusive',
    'managed_payments[enabled]': 'true',
    'metadata[product]': body.product!,
    'metadata[season]': String(s),
    'payment_intent_data[metadata][product]': body.product!,
    success_url: `${back}/?shop=done`,
    cancel_url: `${back}/?shop=cancel`,
  });
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': STRIPE_VERSION },
    body: form,
  });
  const out = await res.json();
  if (!res.ok || !out.url) {
    console.error('stripe checkout failed', res.status, out?.error?.message);
    return json({ error: 'stripe' }, 502);
  }
  return json({ url: out.url });
});
