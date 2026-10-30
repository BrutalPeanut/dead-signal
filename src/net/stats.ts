/**
 * Anonymous gameplay stats (Supabase `log_events`). Keyed only by the game's random player id:
 * no names, no cookies, no IP stored. Events queue in memory and go out in small batches every
 * 20 s, at the end of a run and when the tab is hidden. Everything fails soft: if the network is
 * down the batch is kept (up to a cap) and retried later; stats never block or slow the game.
 */
import { rpc } from './leaderboard';

export type StatKind = 'session' | 'run_start' | 'run_end' | 'ad' | 'unlock' | 'error';
export type StatMode = 'campaign' | 'daily' | 'endless';

interface Ev {
  k: StatKind;
  s?: number;
  m?: StatMode;
  d?: Record<string, unknown>;
}

const MAX_QUEUE = 200;
const BATCH = 50;

export class Stats {
  private q: Ev[] = [];
  private busy = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private errors = 0;
  /** Sent counter, for tests and debugging. */
  sent = 0;

  constructor(private player: () => string, readonly enabled: boolean, flushEveryMs = 20_000) {
    if (!enabled) return;
    if (flushEveryMs > 0 && typeof setInterval !== 'undefined') this.timer = setInterval(() => void this.flush(), flushEveryMs);
  }

  track(k: StatKind, extra: { s?: number; m?: StatMode; d?: Record<string, unknown> } = {}) {
    if (!this.enabled) return;
    this.q.push({ k, ...extra });
    if (this.q.length > MAX_QUEUE) this.q.splice(0, this.q.length - MAX_QUEUE);
  }

  /** Report a JavaScript error (at most 5 per session, message trimmed). */
  error(msg: string, where = '') {
    if (!this.enabled || this.errors >= 5) return;
    this.errors++;
    this.track('error', { d: { msg: String(msg).slice(0, 240), where: where.slice(0, 120) } });
  }

  async flush(closing = false): Promise<boolean> {
    if (!this.enabled || this.busy || !this.q.length) return true;
    this.busy = true;
    const batch = this.q.slice(0, BATCH);
    const n = await rpc<number>('log_events', { p_player: this.player(), p_events: batch }, 7000, closing);
    this.busy = false;
    if (n === null) return false; // offline: keep the queue for the next try
    this.q.splice(0, batch.length);
    this.sent += batch.length;
    if (this.q.length) return this.flush(closing);
    return true;
  }

  pending() {
    return this.q.length;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }
}
