-- Applied to Supabase project "dead-signal" (lxrioefrlncjequyjifk).
-- Server-side copy of src/net/names.ts: leaderboard call signs that fail it are stored as "Courier",
-- so a modified client can't put slurs on the public boards.
create or replace function public.name_ok(n text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  stems text[] := array['nigg','nigga','fagg','faggot','kike','chink','cunt','fuck','retard','tranny','whore','nazi','hitler','rapist','pedophile','molest','kkk','hiel'];
  words text[] := array['fag','spic','rape','shit','bitch','slut','dick','cock','pussy','kys','coon','gook','wetback','nig','porn','sex','cum','twat','ass','asshole','jizz','tits','heil'];
  f text; sq text; dd text; w text;
begin
  f := translate(lower(coalesce(n, '')), '013457@$!|', 'oieastasii');
  sq := regexp_replace(regexp_replace(f, '[^a-z]', '', 'g'), '(.)\1{2,}', '\1\1', 'g');
  dd := regexp_replace(sq, '(.)\1+', '\1', 'g');
  foreach w in array stems loop
    if position(w in sq) > 0 or position(w in dd) > 0 then return false; end if;
  end loop;
  foreach w in array regexp_split_to_array(f, '[^a-z]+') loop
    if w <> '' and (w = any(words) or regexp_replace(w, '(.)\1+', '\1', 'g') = any(words)) then return false; end if;
  end loop;
  if sq = any(words) then return false; end if;
  return true;
end; $$;

create or replace function public.submit_score(p_board text, p_player uuid, p_name text, p_crew text, p_score integer, p_time real, p_hero text)
returns integer language plpgsql security definer set search_path = public as $$
declare r integer; nm text;
begin
  nm := left(btrim(p_name), 16);
  if not public.name_ok(nm) then nm := 'Courier'; end if;
  insert into scores (board, player_id, name, crew, score, run_time, hero)
  values (p_board, p_player, nm, case when public.name_ok(p_crew) then nullif(upper(btrim(coalesce(p_crew, ''))), '') end, p_score, p_time, coalesce(p_hero, 'courier'))
  on conflict (board, player_id) do update
    set score = greatest(scores.score, excluded.score),
        run_time = case when excluded.score > scores.score then excluded.run_time else scores.run_time end,
        hero = case when excluded.score > scores.score then excluded.hero else scores.hero end,
        name = excluded.name, crew = excluded.crew, updated_at = now();
  select 1 + count(*) into r from scores s
   where s.board = p_board and s.score > (select x.score from scores x where x.board = p_board and x.player_id = p_player);
  return r;
end; $$;

revoke all on function public.name_ok(text) from public, anon, authenticated;
-- tidy any existing rows
update public.scores set name = 'Courier' where not public.name_ok(name);
