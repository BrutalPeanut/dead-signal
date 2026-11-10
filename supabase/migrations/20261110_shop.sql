-- Applied to Supabase project "dead-signal" (lxrioefrlncjequyjifk).
-- Web shop (Stripe Checkout). The stripe-webhook edge function records each paid checkout here,
-- keyed by the Stripe Checkout Session id and the player's random id (client_reference_id).
-- No names, emails or card details are stored: Stripe keeps those.
-- Clients get no table access; they call one RPC, shop_claim, with their player id(s).
create table public.purchases (
  id text primary key,                         -- Stripe Checkout Session id (cs_...)
  player_id uuid not null,
  product text not null check (product in ('starter', 'pass', 'adfree')),
  season integer,                              -- Signal Pass season bought (pass only)
  amount integer not null,                     -- cents
  currency text not null,
  livemode boolean not null,
  payment_intent text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,                      -- first time the game picked it up
  refunded_at timestamptz
);
create index purchases_player on public.purchases (player_id);
create index purchases_pi on public.purchases (payment_intent);

alter table public.purchases enable row level security;
revoke all on public.purchases from anon, authenticated;

-- Everything a player owns (not refunded). `fresh` = picked up for the first time by this call,
-- so one-off contents (the Starter Pack's gold and gear) are granted exactly once.
-- Several ids are accepted because a cloud-save restore can bring an older id along.
create or replace function public.shop_claim(p_players uuid[])
returns table (id text, product text, season integer, fresh boolean)
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
begin
  if p_players is null or cardinality(p_players) = 0 or cardinality(p_players) > 8 then return; end if;
  return query
  with upd as (
    update purchases p set claimed_at = now()
    where p.player_id = any(p_players) and p.claimed_at is null and p.refunded_at is null
    returning p.id
  )
  select p.id, p.product, p.season, exists (select 1 from upd where upd.id = p.id)
  from purchases p
  where p.player_id = any(p_players) and p.refunded_at is null
  order by p.created_at;
end; $$;

revoke all on function public.shop_claim(uuid[]) from public;
grant execute on function public.shop_claim(uuid[]) to anon, authenticated;

-- Sales report (owner only, like the other stats views).
create or replace view stats.sales as
select date_trunc('day', created_at)::date as day, product, livemode,
       count(*) as sold, count(refunded_at) as refunded,
       sum(amount) filter (where refunded_at is null) / 100.0 as revenue
from public.purchases group by 1, 2, 3 order by 1 desc, 2;
