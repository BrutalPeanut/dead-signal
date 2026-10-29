/**
 * Cloud saves (Supabase), keyed by a 10-character sync code. Same locked-table + RPC design as
 * the leaderboards: save_push / save_pull / save_list / save_get. Fails soft: null = offline.
 */
import { rpc } from './leaderboard';

export interface CloudVersion {
  id: number;
  sector: number;
  level: number;
  progress: number;
  updated_at: string;
  save?: unknown;
}

const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** 10 characters from an unambiguous alphabet (no 0/O/1/I): 32^10 ≈ 10^15 codes. */
export function newSyncCode(rand: () => number = secureRand) {
  let s = '';
  for (let i = 0; i < 10; i++) s += A[Math.floor(rand() * A.length) % A.length];
  return s;
}
function secureRand() {
  try {
    const b = new Uint32Array(1);
    crypto.getRandomValues(b);
    return b[0] / 2 ** 32;
  } catch {
    return Math.random();
  }
}
/** Accepts what people type: any case, with spaces or dashes. */
export function normalizeCode(raw: string): string | null {
  const s = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-HJ-NP-Z2-9]{10}$/.test(s) ? s : null;
}
export const prettyCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;

export async function cloudPush(code: string, player: string | null, name: string | null, save: unknown, sector: number, level: number, progress: number) {
  return rpc<number>('save_push', { p_code: code, p_player: player, p_name: name, p_save: save, p_sector: sector, p_level: level, p_progress: progress });
}
/** Newest version: undefined if the code has no save, null if offline. */
export async function cloudPull(code: string): Promise<CloudVersion | undefined | null> {
  const r = await rpc<CloudVersion[]>('save_pull', { p_code: code });
  return r === null ? null : r[0];
}
export async function cloudList(code: string) {
  return rpc<CloudVersion[]>('save_list', { p_code: code });
}
export async function cloudGet(code: string, id: number): Promise<CloudVersion | undefined | null> {
  const r = await rpc<CloudVersion[]>('save_get', { p_code: code, p_id: id });
  return r === null ? null : r[0];
}
