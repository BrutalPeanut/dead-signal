// Stripe → Dead Signal: records paid checkouts (and refunds) in public.purchases.
// Deployed with verify_jwt = false: Stripe can't send a Supabase token, so every request is
// checked against the Stripe signature instead. Secret: STRIPE_WEBHOOK_SECRET (whsec_...).
// Events to send from Stripe: checkout.session.completed, checkout.session.async_payment_succeeded,
// charge.refunded.

const enc = new TextEncoder();
const TOLERANCE_S = 300;

async function verify(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = header.split(',').map((p) => p.split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCE_S) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`)));
  const hex = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('');
  // constant-time compare
  return sigs.some((s) => s.length === hex.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ hex.charCodeAt(i)), 0) === 0);
}

const PRODUCTS = new Set(['starter', 'pass', 'adfree']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method', { status: 405 });
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) return new Response('not configured', { status: 503 });
  const payload = await req.text();
  if (!(await verify(payload, req.headers.get('stripe-signature') ?? '', secret))) return new Response('bad signature', { status: 400 });

  const ev = JSON.parse(payload);
  const sb = Deno.env.get('SUPABASE_URL')!;
  const sk = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = (path: string, init: RequestInit) =>
    fetch(`${sb}/rest/v1/${path}`, { ...init, headers: { apikey: sk, Authorization: `Bearer ${sk}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });

  if (ev.type === 'checkout.session.completed' || ev.type === 'checkout.session.async_payment_succeeded') {
    const s = ev.data.object;
    if (s.payment_status !== 'paid') return new Response('pending'); // async methods finish later
    const product = s.metadata?.product;
    if (!PRODUCTS.has(product) || !UUID.test(s.client_reference_id ?? '')) {
      console.error('unrecognised checkout', s.id);
      return new Response('ignored');
    }
    const row = {
      id: s.id,
      player_id: s.client_reference_id,
      product,
      season: product === 'pass' ? Number(s.metadata?.season ?? 0) : null,
      amount: s.amount_total ?? 0,
      currency: s.currency ?? 'usd',
      livemode: !!ev.livemode,
      payment_intent: typeof s.payment_intent === 'string' ? s.payment_intent : (s.payment_intent?.id ?? null),
    };
    const r = await db('purchases', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify(row) });
    if (!r.ok) {
      console.error('insert failed', r.status, await r.text());
      return new Response('db error', { status: 500 }); // Stripe retries
    }
  } else if (ev.type === 'charge.refunded') {
    const c = ev.data.object;
    // only a full refund takes the item back
    if (c.refunded && c.payment_intent) {
      const pi = typeof c.payment_intent === 'string' ? c.payment_intent : c.payment_intent.id;
      const r = await db(`purchases?payment_intent=eq.${encodeURIComponent(pi)}&refunded_at=is.null`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ refunded_at: new Date().toISOString() }) });
      if (!r.ok) return new Response('db error', { status: 500 });
    }
  }
  return new Response('ok');
});
