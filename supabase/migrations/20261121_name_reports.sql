-- Report / block for leaderboard call signs (App Store Guideline 1.2: UGC needs report + block).
-- Rows carry an opaque tag (hash of player id + board) so clients can report/block without ever
-- seeing anyone's player id. A name reported by 3 different players is hidden from everyone but its owner.
create table if not exists public.name_reports (
  tag text not null,
  reporter uuid not null,
  name text not null,
  board text not null,
  created_at timestamptz not null default now(),
  primary key (tag, reporter)
);
alter table public.name_reports enable row level security;
revoke all on public.name_reports from anon, authenticated;

create or replace function public.board_tag(p_player uuid) returns text
language sql immutable set search_path = public as $$
  select substr(md5('ds-tag:' || p_player::text), 1, 16);
$$;
revoke all on function public.board_tag(uuid) from public, anon, authenticated;

drop function if exists public.get_board(text, text, uuid, integer);
create function public.get_board(p_board text, p_crew text, p_player uuid, p_limit integer default 50)
returns table(rnk bigint, name text, score integer, run_time real, hero text, crew text, me boolean, tag text)
language sql stable security definer set search_path = public as $$
  with hidden as (
    select r.tag from name_reports r group by r.tag having count(*) >= 3
  ), b as (
    select s.*, board_tag(s.player_id) as tg, rank() over (order by s.score desc, s.updated_at asc) as rk
    from scores s
    where s.board = p_board
      and (p_crew is null or p_crew = '' or s.crew = upper(p_crew))
      and (s.player_id = p_player or board_tag(s.player_id) not in (select tag from hidden))
  )
  select b.rk, b.name, b.score, b.run_time, b.hero, b.crew, b.player_id = p_player, b.tg
  from b
  where b.rk <= least(greatest(p_limit, 1), 100) or b.player_id = p_player
  order by b.rk;
$$;
grant execute on function public.get_board(text, text, uuid, integer) to anon;

create or replace function public.report_name(p_player uuid, p_tag text, p_board text)
returns boolean language plpgsql security definer set search_path = public as $$
declare n text;
begin
  if p_player is null or p_tag !~ '^[0-9a-f]{16}$' then return false; end if;
  select s.name into n from scores s where s.board = p_board and board_tag(s.player_id) = p_tag limit 1;
  if n is null or board_tag(p_player) = p_tag then return false; end if;
  insert into name_reports (tag, reporter, name, board) values (p_tag, p_player, n, left(p_board, 40))
  on conflict do nothing;
  return true;
end $$;
revoke all on function public.report_name(uuid, text, text) from public;
grant execute on function public.report_name(uuid, text, text) to anon;

create or replace view stats.reports as
  select tag, max(name) as name, count(*) as reports, max(created_at) as last_report,
         count(*) >= 3 as hidden
  from public.name_reports group by tag order by reports desc, last_report desc;
