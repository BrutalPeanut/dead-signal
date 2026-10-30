import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KEY, Profile } from '../src/meta/profile';
import { CloudSync } from '../src/meta/sync';
import { setFetcher } from '../src/net/leaderboard';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

/** Minimal in-memory stand-in for the cloud save RPCs. */
function fakeCloud() {
  const rows: { id: number; code: string; save: unknown; sector: number; level: number; progress: number }[] = [];
  let seq = 0;
  setFetcher(async (url, init) => {
    const fn = url.split('/').pop();
    const b = JSON.parse(String(init.body));
    const mine = rows.filter((r) => r.code === b.p_code).sort((a, c) => c.id - a.id);
    let out: unknown = [];
    if (fn === 'save_push') {
      rows.push({ id: ++seq, code: b.p_code, save: b.p_save, sector: b.p_sector, level: b.p_level, progress: b.p_progress });
      out = seq;
    } else if (fn === 'save_pull') out = mine.slice(0, 1).map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    else if (fn === 'save_list') out = mine.map((r) => ({ ...r, updated_at: new Date().toISOString() }));
    return { ok: true, json: async () => JSON.parse(JSON.stringify(out)) };
  });
  return rows;
}

let store: MemStorage;
beforeEach(() => (store = new MemStorage()));
afterEach(() => setFetcher((u, i) => fetch(u, i)));
const open = () => new Profile(store as unknown as Storage);

describe('progress never silently disappears', () => {
  it('a corrupted save falls back to the copy from the last good launch', () => {
    const p = open();
    p.data.unlocked = 9;
    p.data.gold = 4321;
    p.save();
    expect(open().loadedFrom).toBe('ok'); // this launch stores the known-good backup
    store.setItem(KEY, '{"v":1,"unlocked":9,"gear":[{"uid":'); // truncated write
    const q = open();
    expect(q.loadedFrom).toBe('backup');
    expect(q.data.unlocked).toBe(9);
    expect(q.data.gold).toBe(4321);
    expect(store.getItem(KEY + ':broken')).toContain('"unlocked":9'); // kept for support
  });

  it('an unreadable future-version save is never thrown away', () => {
    const p = open();
    p.data.unlocked = 4;
    p.save();
    open();
    store.setItem(KEY, JSON.stringify({ v: 2, something: 'new' }));
    const q = open();
    expect(q.data.unlocked).toBe(4);
    expect(store.getItem(KEY + ':broken')).toContain('"v":2');
  });

  it('the sync code survives even if the whole save is lost, and the cloud brings progress back', async () => {
    const rows = fakeCloud();
    const p = open();
    const s = new CloudSync(p, true, 0);
    p.data.unlocked = 12;
    p.save();
    await s.startup();
    const code = s.code();
    expect(rows.at(-1)!.code).toBe(code);
    // the save itself is wiped (both copies), only the separate code key is left
    store.removeItem(KEY);
    store.removeItem(KEY + ':bak');
    const q = open();
    expect(q.data.unlocked).toBe(0);
    expect(q.data.sync?.code).toBe(code);
    const s2 = new CloudSync(q, true, 0);
    expect(await s2.startup()).toBe('adopted');
    expect(q.data.unlocked).toBe(12);
  });

  it('a reset can be undone: the old code is remembered and still finds its save', async () => {
    fakeCloud();
    const p = open();
    const s = new CloudSync(p, true, 0);
    p.data.unlocked = 7;
    p.save();
    await s.startup();
    const old = s.code();
    p.reset();
    s.fresh();
    expect(s.code()).not.toBe(old);
    expect(p.data.unlocked).toBe(0);
    expect(s.previousCodes()).toEqual([old]);
    const found = await s.peek(old);
    if (typeof found === 'string') throw new Error(found);
    expect(s.useCode(found.code, found.v)).toBe(true);
    expect(p.data.unlocked).toBe(7);
    expect(open().previousCodes()).toEqual([old]); // remembered across launches
  });

  it('reminds players to keep their code after Sector 2, until they confirm', () => {
    const p = open();
    const s = new CloudSync(p, true, 0);
    expect(s.needsReminder()).toBe(false); // too early
    p.data.unlocked = 2;
    expect(s.needsReminder()).toBe(true);
    s.markReminded(false); // "remind me later"
    expect(s.needsReminder()).toBe(false);
    expect(s.needsReminder(Date.now() + 3 * 86_400_000)).toBe(true);
    s.markReminded(true); // "I've saved it"
    expect(s.needsReminder(Date.now() + 30 * 86_400_000)).toBe(false);
    expect(new CloudSync(p, false, 0).needsReminder()).toBe(false); // test saves never nag
  });
});
