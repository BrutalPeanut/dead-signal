-- Applied to Supabase project "dead-signal" (lxrioefrlncjequyjifk).
-- Call sign filter v2: server copy of the list layers in src/net/names.ts (allowed characters, no phone
-- numbers or links, our stems/words with the same folding and safe-word allow-list). The client also runs
-- the obscenity package; this list is a subset, so the server never renames a name the game accepted.
create or replace function public.words_ok(n text) returns boolean
language plpgsql immutable set search_path = public as $$
declare
  stems text[] := array['nigg','nigga','niger','fagg','faggot','kike','chink','cunt','kunt','fuck','fuk','phuck','phuk','retard','tranny','whore','nazi','hitler','rapist','pedophile','molest','kkk','hiel','jihad','genocide','holocaust','swastika','killjews','whitepower','siegheil','gaschamber','incest','bestiality','cocksuck','motherfuck','blowjob','handjob','dildo','penis','vagina','boner','hentai','orgasm','masturbat','ejaculat'];
  words text[] := array['fag','spic','rape','raper','shit','bitch','slut','dick','cock','pussy','kys','coon','gook','wetback','nig','porn','sex','sexy','cum','twat','ass','asshole','jizz','tits','heil','anal','anus','boob','boobs','nude','nudes','horny','milf','thot','hoe','skank','wank','wanker','prick','nutsack','scrotum','clit','semen','kms','kill yourself','pedo','isis','lynch'];
  nm text; f text; sq text; dd text; w text;
begin
  nm := regexp_replace(coalesce(n, ''), 'therapist|scunthorpe|cockpit|cocktail|cockatoo|cockroach|peacock|hancock|shitake|shiitake|pushit|analyst|analysis|grapes|bassist|assassin|classic|passion|cumberland|cucumber|document|circumstance|sussex|essex|middlesex|dickens|snigger', ' ', 'gi');
  f := translate(lower(nm), '013457@$!|', 'oieastasii');
  if position('kkk' in regexp_replace(f, '[^a-z]', '', 'g')) > 0 then return false; end if;
  sq := regexp_replace(regexp_replace(f, '[^a-z]', '', 'g'), '(.)\1{2,}', '\1\1', 'g');
  dd := regexp_replace(sq, '(.)\1+', '\1', 'g');
  foreach w in array stems loop
    if position(w in sq) > 0 or position(w in dd) > 0 then return false; end if;
  end loop;
  foreach w in array regexp_split_to_array(f, '[^a-z]+') loop
    if w <> '' and (w = any(words) or regexp_replace(w, '(.)\1+', '\1', 'g') = any(words)) then return false; end if;
  end loop;
  foreach w in array words loop
    if position(' ' in w) > 0 and position(w in f) > 0 then return false; end if;
  end loop;
  if sq = any(words) or dd = any(words) then return false; end if;
  return true;
end; $$;
revoke all on function public.words_ok(text) from public, anon, authenticated;

create or replace function public.name_ok(n text) returns boolean
language plpgsql immutable set search_path = public as $$
declare nm text;
begin
  nm := btrim(regexp_replace(coalesce(n, ''), '\s+', ' ', 'g'));
  if nm = '' then return true; end if;
  if length(nm) > 16 or nm !~ '^[A-Za-z0-9 _.-]+$' then return false; end if;
  if regexp_replace(nm, '[ ._-]', '', 'g') ~ '[0-9]{5,}' then return false; end if;
  if nm ~* '(https?|www|\.(com|net|org|gg|io|tv|xyz|ly))' then return false; end if;
  return public.words_ok(nm);
end; $$;
revoke all on function public.name_ok(text) from public, anon, authenticated;

-- Crew codes are A-Z/0-9 and may hold digit runs: check them against the word lists only.
create or replace function public.submit_score(p_board text, p_player uuid, p_name text, p_crew text, p_score integer, p_time real, p_hero text)
returns integer language plpgsql security definer set search_path = public as $$
declare r integer; nm text;
begin
  nm := left(btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')), 16);
  if not public.name_ok(nm) then nm := 'Courier'; end if;
  insert into scores (board, player_id, name, crew, score, run_time, hero)
  values (p_board, p_player, nm, case when public.words_ok(p_crew) then nullif(upper(btrim(coalesce(p_crew, ''))), '') end, p_score, p_time, coalesce(p_hero, 'courier'))
  on conflict (board, player_id) do update
    set score = greatest(scores.score, excluded.score),
        run_time = case when excluded.score > scores.score then excluded.run_time else scores.run_time end,
        hero = case when excluded.score > scores.score then excluded.hero else scores.hero end,
        name = excluded.name, crew = excluded.crew, updated_at = now();
  select 1 + count(*) into r from scores s
   where s.board = p_board and s.score > (select x.score from scores x where x.board = p_board and x.player_id = p_player);
  return r;
end; $$;

-- Clean up any names already on the boards that fail the stricter rules.
update public.scores set name = 'Courier' where not public.name_ok(name);
update public.scores set crew = null where crew is not null and not public.words_ok(crew);
