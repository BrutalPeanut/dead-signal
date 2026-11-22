/**
 * Call sign filter for the public leaderboards, in layers, the way most games do it:
 *
 * 1. Allowed characters only: plain letters, digits, space, `_ - .` (2–16 long). This shuts out
 *    look-alike Unicode letters and emoji, which is how players usually sneak words past filters.
 * 2. No personal info or ads: no long digit runs (phone numbers) and no links.
 * 3. A maintained profanity list (the `obscenity` package: leetspeak, repeated letters and
 *    look-alike tricks, with an allow-list so words like "Assassin" and "Scunthorpe" pass),
 *    checked on the name as typed and with spaces/dots removed (catches "f.u.c.k").
 * 4. Our own list of slurs and hate terms the package doesn't cover (nazi, kkk, …), using the same
 *    folding.
 *
 * The server repeats layers 1, 2 and 4 (supabase/migrations/20261122_name_filter_v2.sql) so a
 * modified client can't get around them; the server list is a subset of what this file blocks, so
 * a name the game accepts is never silently renamed by the server.
 */
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';

/** Matched anywhere once the name is squashed to letters (so separators and leetspeak don't help). */
export const STEMS = [
  'nigg', 'nigga', 'niger', 'fagg', 'faggot', 'kike', 'chink', 'cunt', 'kunt', 'fuck', 'fuk', 'phuck', 'phuk', 'retard',
  'tranny', 'whore', 'nazi', 'hitler', 'rapist', 'pedophile', 'molest', 'kkk', 'hiel', 'jihad', 'genocide',
  'holocaust', 'swastika', 'killjews', 'whitepower', 'siegheil', 'gaschamber', 'incest', 'bestiality', 'cocksuck',
  'motherfuck', 'blowjob', 'handjob', 'dildo', 'penis', 'vagina', 'boner', 'hentai', 'orgasm', 'masturbat', 'ejaculat',
];
/** Matched only as a whole word (or the whole squashed name), to keep "grape", "spice", "Dickens" fine. */
export const WORDS = [
  'fag', 'spic', 'rape', 'raper', 'shit', 'bitch', 'slut', 'dick', 'cock', 'pussy', 'kys', 'coon', 'gook', 'wetback', 'nig', 'porn',
  'sex', 'sexy', 'cum', 'twat', 'ass', 'asshole', 'jizz', 'tits', 'heil', 'anal', 'anus', 'boob', 'boobs', 'nude', 'nudes',
  'horny', 'milf', 'thot', 'hoe', 'skank', 'wank', 'wanker', 'prick', 'nutsack', 'scrotum', 'clit', 'semen', 'kms', 'kill yourself', 'pedo', 'isis', 'lynch',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[01345 7@$!|]/g, (c) => LEET[c] ?? c);

let matcher: RegExpMatcher | null = null;
const profanity = () => (matcher ??= new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers }));

const ALLOWED = /^[A-Za-z0-9 _.\-]+$/;

/** Real words that contain a blocked stem ("the-rapist", "s-cunt-horpe"): removed before checking. */
const SAFE_WORDS = ['therapist', 'scunthorpe', 'cockpit', 'cocktail', 'cockatoo', 'cockroach', 'peacock', 'hancock', 'shitake', 'shiitake', 'pushit', 'analyst', 'analysis', 'grapes', 'bassist', 'assassin', 'classic', 'passion', 'cumberland', 'cucumber', 'document', 'circumstance', 'sussex', 'essex', 'middlesex', 'dickens', 'snigger'];
const stripSafe = (s: string) => SAFE_WORDS.reduce((t, w) => t.replace(new RegExp(w, 'gi'), ' '), s);

/** Why a call sign can't be used, or null if it's fine. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 16) return 'Call sign needs 2–16 characters';
  if (!ALLOWED.test(name)) return 'Use letters, numbers, spaces, - _ or . only';
  if (/\d{5,}/.test(name.replace(/[\s._-]/g, ''))) return 'No phone numbers or long number strings';
  if (/(https?|www|\.(com|net|org|gg|io|tv|xyz|ly))/i.test(name)) return 'No links in call signs';
  const check = stripSafe(name);
  if (!legacyClean(check)) return 'That call sign isn’t allowed on the public boards';
  const squashed = check.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (profanity().hasMatch(check) || profanity().hasMatch(squashed)) return 'That call sign isn’t allowed on the public boards';
  return null;
}

/** True if the call sign is fine to show publicly. */
export const cleanName = (name: string) => nameProblem(name) === null;

/** Crew codes (A–Z/0–9, may hold digit runs): word checks only. */
export function cleanCrew(code: string): boolean {
  const check = stripSafe(code);
  return legacyClean(check) && !profanity().hasMatch(check.toLowerCase());
}

/** Our own list check (the part the server repeats). */
function legacyClean(name: string): boolean {
  const f = fold(name);
  if (f.replace(/[^a-z]/g, '').includes('kkk')) return false;
  const squashed = f.replace(/[^a-z]/g, '').replace(/(.)\1{2,}/g, '$1$1'); // "fuuuck" → "fuuck"
  const deduped = squashed.replace(/(.)\1+/g, '$1'); // "fuuck" → "fuck"
  if (STEMS.some((s) => squashed.includes(s) || deduped.includes(s))) return false;
  const words = f.split(/[^a-z]+/).filter(Boolean);
  if (words.some((w) => WORDS.includes(w) || WORDS.includes(w.replace(/(.)\1+/g, '$1')))) return false;
  if (WORDS.some((w) => w.includes(' ') && f.includes(w))) return false;
  if (WORDS.includes(squashed) || WORDS.includes(deduped)) return false; // "s h i t" spelled out with spaces
  return true;
}

const ADJ = ['Rogue', 'Silent', 'Iron', 'Neon', 'Lucky', 'Rapid', 'Frost', 'Solar', 'Static', 'Ghost', 'Steel', 'Crimson', 'Atomic', 'Swift', 'Last', 'Wild', 'Hollow', 'Electric', 'Shadow', 'Night'];
const NOUN = ['Courier', 'Ranger', 'Signal', 'Runner', 'Falcon', 'Viper', 'Comet', 'Wolf', 'Raven', 'Spark', 'Nomad', 'Echo', 'Pulse', 'Drifter', 'Scout', 'Fox', 'Blade', 'Rook', 'Orbit', 'Tango'];

/** A safe random call sign, e.g. "Neon Raven 42" (fits in 16 characters). */
export function randomName(rand = Math.random): string {
  for (;;) {
    const n = `${ADJ[Math.floor(rand() * ADJ.length)]} ${NOUN[Math.floor(rand() * NOUN.length)]}`;
    const withNum = `${n} ${10 + Math.floor(rand() * 90)}`;
    const pick = withNum.length <= 16 ? withNum : n.length <= 16 ? n : null;
    if (pick && cleanName(pick)) return pick;
  }
}
