/**
 * Online leaderboards (Supabase). The table is locked; the client can only call two RPCs:
 * submit_score (keeps each player's best per board) and get_board (top N + your own row).
 * Everything here fails soft: offline or blocked → null, and the game carries on.
 */
const BASE = 'https://lxrioefrlncjequyjifk.supabase.co/rest/v1/rpc/';
// Publishable key: safe to ship in the client (it can only reach the RPCs granted to anon).
const KEY = 'sb_publishable_ofX3qAaBOs0U-RpjOCpdAw_7pumR46t';

export interface BoardRow {
  rnk: number;
  name: string;
  score: number;
  run_time: number;
  hero: string;
  crew: string | null;
  me: boolean;
}

export type FetchLike = (url: string, init: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;
let fetcher: FetchLike = (u, i) => fetch(u, i);
/** Tests swap the network out. */
export function setFetcher(f: FetchLike) {
  fetcher = f;
}

export async function rpc<T>(fn: string, body: Record<string, unknown>, timeoutMs = 7000, keepalive = false): Promise<T | null> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  try {
    const res = await fetcher(BASE + fn, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl?.signal,
      // small requests sent as the tab closes (stats) must outlive the page
      keepalive,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface Submission {
  board: string;
  score: number;
  time: number;
  hero: string;
}

export async function submitScore(player: string, name: string, crew: string, s: Submission): Promise<number | null> {
  return rpc<number>('submit_score', {
    p_board: s.board,
    p_player: player,
    p_name: name,
    p_crew: crew || null,
    p_score: Math.max(0, Math.min(20_000_000, Math.round(s.score))),
    p_time: Math.max(0, Math.min(7200, s.time)),
    p_hero: s.hero,
  });
}

export async function getBoard(board: string, crew: string, player: string, limit = 50): Promise<BoardRow[] | null> {
  return rpc<BoardRow[]>('get_board', { p_board: board, p_crew: crew || null, p_player: player, p_limit: limit });
}

export const dailyBoard = (key: string) => `daily:${key}`;
export const ENDLESS_BOARD = 'endless';

/** Short, unambiguous crew codes (no 0/O/1/I). */
export function newCrewCode(rand = Math.random) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[Math.floor(rand() * A.length)];
  return s;
}

export const validName = (n: string) => n.trim().length >= 2 && n.trim().length <= 16;
export const validCrew = (c: string) => c === '' || /^[A-Z0-9]{4,8}$/.test(c.trim().toUpperCase());

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 3) | 8).toString(16);
  });
}
