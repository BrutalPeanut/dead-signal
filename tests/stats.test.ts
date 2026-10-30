import { afterEach, describe, expect, it } from 'vitest';
import { Stats } from '../src/net/stats';
import { setFetcher } from '../src/net/leaderboard';

afterEach(() => setFetcher((u, i) => fetch(u, i)));

describe('stats', () => {
  it('batches events and sends them with the player id', async () => {
    const calls: { url: string; body: { p_player: string; p_events: unknown[] } }[] = [];
    setFetcher(async (url, init) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return { ok: true, json: async () => 1 };
    });
    const s = new Stats(() => 'player-1', true, 0);
    for (let i = 0; i < 120; i++) s.track('run_start', { s: 2, m: 'campaign', d: { gun: 'smg' } });
    expect(await s.flush()).toBe(true);
    expect(calls.map((c) => c.body.p_events.length)).toEqual([50, 50, 20]);
    expect(calls[0].url).toMatch(/log_events$/);
    expect(calls[0].body.p_player).toBe('player-1');
    expect(s.pending()).toBe(0);
  });

  it('keeps events while offline and sends them later', async () => {
    let down = true;
    setFetcher(async () => {
      if (down) throw new Error('offline');
      return { ok: true, json: async () => 1 };
    });
    const s = new Stats(() => 'p', true, 0);
    s.track('session');
    expect(await s.flush()).toBe(false);
    expect(s.pending()).toBe(1);
    down = false;
    expect(await s.flush()).toBe(true);
    expect(s.sent).toBe(1);
  });

  it('does nothing for test saves, and caps the queue and error reports', async () => {
    let calls = 0;
    setFetcher(async () => (calls++, { ok: true, json: async () => 1 }));
    const off = new Stats(() => 'p', false, 0);
    off.track('session');
    await off.flush();
    expect(calls).toBe(0);
    const s = new Stats(() => 'p', true, 0);
    for (let i = 0; i < 20; i++) s.error('boom ' + 'x'.repeat(500));
    expect(s.pending()).toBe(5);
    for (let i = 0; i < 1000; i++) s.track('ad');
    expect(s.pending()).toBe(200);
  });
});
