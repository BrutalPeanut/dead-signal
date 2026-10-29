-- Applied to Supabase project "dead-signal" (lxrioefrlncjequyjifk).
-- Cloud saves keyed by a 10-character sync code (the code is the secret: 32^10 ≈ 1e15).
-- Like the leaderboards, clients get no table access; they call four SECURITY DEFINER RPCs.
-- Nothing ever deletes a whole save: pushes add versions and only the oldest beyond 5 are trimmed.
create table public.cloud_saves (
  id bigint generated always as identity primary key,
  code text not null check (code ~ '^[A-HJ-NP-Z2-9]{10}$'),
  player_id uuid,
  name text check (name is null or char_length(name) <= 16),
  save jsonb not null check (octet_length(save::text) <= 262144),
  sector integer not null default 0 check (sector between 0 and 999),
  level integer not null default 1 check (level between 0 and 9999),
  progress bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index cloud_saves_code_id on public.cloud_saves (code, id desc);
create index cloud_saves_player on public.cloud_saves (player_id);

alter table public.cloud_saves enable row level security;
revoke all on public.cloud_saves from anon, authenticated;

-- Store a save. Pushes within 2 minutes of the newest version refresh it in place, so the five
-- kept versions stay spread out in time and a burst of saves can't flush the good backups.
create or replace function public.save_push(p_code text, p_player uuid, p_name text, p_save jsonb, p_sector integer, p_level integer, p_progress bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare latest cloud_saves%rowtype; new_id bigint;
begin
  select * into latest from cloud_saves where code = p_code order by id desc limit 1;
  if found and latest.save = p_save then return latest.id; end if;
  if found and latest.updated_at > now() - interval '2 minutes' then
    update cloud_saves set save = p_save, sector = p_sector, level = p_level, progress = p_progress,
      player_id = coalesce(p_player, player_id), name = coalesce(left(btrim(p_name), 16), name), updated_at = now()
    where id = latest.id;
    return latest.id;
  end if;
  insert into cloud_saves (code, player_id, name, save, sector, level, progress)
  values (p_code, p_player, left(btrim(p_name), 16), p_save, p_sector, p_level, p_progress)
  returning id into new_id;
  delete from cloud_saves where code = p_code and id not in (
    select id from cloud_saves where code = p_code order by id desc limit 5);
  return new_id;
end; $$;

-- Newest version for a code (with its save).
create or replace function public.save_pull(p_code text)
returns table (id bigint, save jsonb, sector integer, level integer, progress bigint, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.save, c.sector, c.level, c.progress, c.updated_at from cloud_saves c
  where c.code = p_code order by c.id desc limit 1;
$$;

-- The kept versions (no save bodies), newest first, for "Restore backup".
create or replace function public.save_list(p_code text)
returns table (id bigint, sector integer, level integer, progress bigint, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.sector, c.level, c.progress, c.updated_at from cloud_saves c
  where c.code = p_code order by c.id desc limit 5;
$$;

-- One specific version (both code and id must match).
create or replace function public.save_get(p_code text, p_id bigint)
returns table (id bigint, save jsonb, sector integer, level integer, progress bigint, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.save, c.sector, c.level, c.progress, c.updated_at from cloud_saves c
  where c.code = p_code and c.id = p_id;
$$;

revoke all on function public.save_push(text, uuid, text, jsonb, integer, integer, bigint) from public;
revoke all on function public.save_pull(text) from public;
revoke all on function public.save_list(text) from public;
revoke all on function public.save_get(text, bigint) from public;
grant execute on function public.save_push(text, uuid, text, jsonb, integer, integer, bigint) to anon, authenticated;
grant execute on function public.save_pull(text) to anon, authenticated;
grant execute on function public.save_list(text) to anon, authenticated;
grant execute on function public.save_get(text, bigint) to anon, authenticated;
