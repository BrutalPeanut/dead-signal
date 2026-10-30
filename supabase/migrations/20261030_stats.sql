-- Applied to Supabase project "dead-signal" (lxrioefrlncjequyjifk).
-- Anonymous gameplay stats: keyed by the game's random player id only (no names, no IPs, no
-- cookies). Same locked-table design as the leaderboards: clients can only call log_events.
create table public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  day date not null default (now() at time zone 'utc')::date,
  player uuid not null,
  kind text not null check (kind in ('session', 'run_start', 'run_end', 'ad', 'unlock', 'error')),
  sector integer check (sector is null or sector between 0 and 999),
  mode text check (mode is null or mode in ('campaign', 'daily', 'endless')),
  data jsonb not null default '{}'::jsonb check (octet_length(data::text) <= 2048)
);
create index events_day_kind on public.events (day, kind);
create index events_player_day on public.events (player, day);

alter table public.events enable row level security;
revoke all on public.events from anon, authenticated;

-- Batch insert, at most 50 events per call and 600 per player per day (drops the rest quietly).
create or replace function public.log_events(p_player uuid, p_events jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare used integer; room integer; n integer;
begin
  if p_player is null or jsonb_typeof(p_events) <> 'array' then return 0; end if;
  select count(*) into used from events where player = p_player and day = (now() at time zone 'utc')::date;
  room := greatest(0, 600 - used);
  insert into events (player, kind, sector, mode, data)
  select p_player, e->>'k', case when e->>'s' ~ '^[0-9]{1,3}$' then (e->>'s')::int end, e->>'m', coalesce(e->'d', '{}'::jsonb)
  from (select e from jsonb_array_elements(p_events) e limit least(50, room)) x
  where e->>'k' in ('session', 'run_start', 'run_end', 'ad', 'unlock', 'error')
    and (e->>'m' is null or e->>'m' in ('campaign', 'daily', 'endless'))
    and octet_length(coalesce(e->'d', '{}'::jsonb)::text) <= 2048;
  get diagnostics n = row_count;
  return n;
end; $$;
revoke all on function public.log_events(uuid, jsonb) from public;
grant execute on function public.log_events(uuid, jsonb) to anon, authenticated;

-- Reporting views, not exposed to the API (read with SQL from the dashboard)
create schema if not exists stats;
revoke all on schema stats from anon, authenticated;

create or replace view stats.daily with (security_invoker = on) as
select day,
  count(distinct player) filter (where kind = 'session') as players,
  count(*) filter (where kind = 'session') as sessions,
  count(*) filter (where kind = 'run_start') as runs,
  count(*) filter (where kind = 'ad' and (data->>'ok')::boolean) as ads_watched,
  count(*) filter (where kind = 'error') as errors
from public.events group by day order by day desc;

-- Of the players first seen on a day, how many came back 1, 7 and 30 days later
create or replace view stats.retention with (security_invoker = on) as
with first as (select player, min(day) as d0 from public.events where kind = 'session' group by player),
seen as (select distinct player, day from public.events where kind = 'session')
select f.d0 as cohort, count(*) as new_players,
  round(100.0 * count(*) filter (where exists (select 1 from seen s where s.player = f.player and s.day = f.d0 + 1)) / count(*), 1) as d1_pct,
  round(100.0 * count(*) filter (where exists (select 1 from seen s where s.player = f.player and s.day = f.d0 + 7)) / count(*), 1) as d7_pct,
  round(100.0 * count(*) filter (where exists (select 1 from seen s where s.player = f.player and s.day = f.d0 + 30)) / count(*), 1) as d30_pct
from first f group by f.d0 order by f.d0 desc;

-- Campaign sectors: attempts, win rate, how long losses last and what killed them
create or replace view stats.sectors with (security_invoker = on) as
select sector + 1 as sector, count(*) as runs,
  round(100.0 * count(*) filter (where (data->>'won')::boolean) / count(*), 1) as win_pct,
  round(avg((data->>'time')::numeric) filter (where not (data->>'won')::boolean)) as avg_loss_secs,
  mode() within group (order by data->>'killedBy') filter (where not (data->>'won')::boolean) as top_killer,
  count(distinct player) as players
from public.events where kind = 'run_end' and mode = 'campaign'
group by sector order by sector;

-- Where new players stop: the highest sector each player has reached
create or replace view stats.funnel with (security_invoker = on) as
select reached + 1 as sector_reached, count(*) as players
from (select player, max((data->>'unlocked')::int) as reached from public.events where kind = 'session' group by player) x
group by reached order by reached;

drop view if exists stats.ads;
create view stats.ads with (security_invoker = on) as
select data->>'placement' as placement,
  count(*) filter (where data->>'stage' = 'offer') as offered,
  count(*) filter (where data->>'stage' = 'result') as started,
  count(*) filter (where data->>'stage' = 'result' and (data->>'ok')::boolean) as completed
from public.events where kind = 'ad' group by 1 order by 2 desc;
