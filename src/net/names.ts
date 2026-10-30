/**
 * Call sign filter for the public leaderboards. The server applies the same rules (see
 * supabase/migrations/20261029_name_filter.sql) so a modified client can't get around it; this
 * copy just gives players a friendly message instead of a silently renamed entry.
 *
 * Two lists to keep false positives low: STEMS match anywhere once the name is squashed to
 * letters (so "f.u.c.k" or "fvck"-style leetspeak still trips them), WORDS only match as a whole
 * word (so "grape", "spice" and "Dickens" are fine).
 */
const STEMS = ['nigg', 'nigga', 'fagg', 'faggot', 'kike', 'chink', 'cunt', 'fuck', 'retard', 'tranny', 'whore', 'nazi', 'hitler', 'rapist', 'pedophile', 'molest', 'kkk', 'hiel'];
const WORDS = ['fag', 'spic', 'rape', 'shit', 'bitch', 'slut', 'dick', 'cock', 'pussy', 'kys', 'coon', 'gook', 'wetback', 'nig', 'porn', 'sex', 'cum', 'twat', 'ass', 'asshole', 'jizz', 'tits', 'heil'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[01345 7@$!|]/g, (c) => LEET[c] ?? c);

/** True if the call sign is fine to show publicly. */
export function cleanName(name: string): boolean {
  const f = fold(name);
  const squashed = f.replace(/[^a-z]/g, '').replace(/(.)\1{2,}/g, '$1$1'); // "fuuuck" → "fuuck"
  const deduped = squashed.replace(/(.)\1+/g, '$1'); // "fuuck" → "fuck"
  if (STEMS.some((s) => squashed.includes(s) || deduped.includes(s))) return false;
  const words = f.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => WORDS.includes(w) || WORDS.includes(w.replace(/(.)\1+/g, '$1')))) return false;
  if (WORDS.includes(squashed)) return false; // "s h i t" spelled out with spaces
  return true;
}
