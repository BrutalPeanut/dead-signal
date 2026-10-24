-- Applied to Supabase project "dead-signal" (lxrioefrlncjequyjifk).
-- Clients have no table access; they call the two SECURITY DEFINER RPCs (intentional: they are the API).
create table public.scores (
  id bigint generated always as identity primary key,
  board text not null check (board ~ '^(daily:\d{4}-\d{1,2}-\d{1,2}|endless)$'),
  player_id uuid not null,
  name text not null check (char_length(name) between 2 and 16),
  crew text check (crew is null or crew ~ '^[A-Z0-9]{4,8}$'),
  score integer not null check (score >= 0 and score <= 20000000),
  run_time real not null default 0 check (run_time >= 0 and run_time <= 7200),
  hero text not null default 'courier' check (char_length(hero) <= 16),
  updated_at timestamptz not null default now(),
  unique (board, player_id)
);
create index scores_board_score on public.scores (board, score desc);
create index scores_board_crew_score on public.scores (board, crew, score desc);

alter table public.scores enable row level security;
revoke all on public.scores from anon, authenticated;

create or replace function public.submit_score(p_board text, p_player uuid, p_name text, p_crew text, p_score integer, p_time real, p_hero text)
returns integer language plpgsql security definer set search_path = public as $$
declare r integer;
begin
  insert into scores (board, player_id, name, crew, score, run_time, hero)
  values (p_board, p_player, left(btrim(p_name), 16), nullif(upper(btrim(coalesce(p_crew, ''))), ''), p_score, p_time, coalesce(p_hero, 'courier'))
  on conflict (board, player_id) do update
    set score = greatest(scores.score, excluded.score),
        run_time = case when excluded.score > scores.score then excluded.run_time else scores.run_time end,
        hero = case when excluded.score > scores.score then excluded.hero else scores.hero end,
        name = excluded.name, crew = excluded.crew, updated_at = now();
  select 1 + count(*) into r from scores s
   where s.board = p_board and s.score > (select x.score from scores x where x.board = p_board and x.player_id = p_player);
  return r;
end; $$;

create or replace function public.get_board(p_board text, p_crew text, p_player uuid, p_limit integer default 50)
returns table (rnk bigint, name text, score integer, run_time real, hero text, crew text, me boolean)
language sql stable security definer set search_path = public as $$
  with b as (
    select s.*, rank() over (order by s.score desc, s.updated_at asc) as rk
    from scores s
    where s.board = p_board and (p_crew is null or p_crew = '' or s.crew = upper(p_crew))
  )
  select b.rk, b.name, b.score, b.run_time, b.hero, b.crew, b.player_id = p_player
  from b where b.rk <= least(greatest(p_limit, 1), 100) or b.player_id = p_player
  order by b.rk;
$$;

revoke all on function public.submit_score(text, uuid, text, text, integer, real, text) from public;
revoke all on function public.get_board(text, text, uuid, integer) from public;
grant execute on function public.submit_score(text, uuid, text, text, integer, real, text) to anon, authenticated;
grant execute on function public.get_board(text, text, uuid, integer) to anon, authenticated;
