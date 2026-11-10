import { describe, expect, it } from 'vitest';
import { Profile } from '../src/meta/profile';

class Mem {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
const run = (time: number) => ({ won: true, time, kills: 400, gold: 50, level: 10, bossKills: 0, eliteKills: 1, score: 1000 });

describe('interrupted run stash', () => {
  it('survives a reload, is paid out once, and never as a win', () => {
    const store = new Mem() as unknown as Storage;
    const a = new Profile(store);
    a.stashRun({ sector: 2, mode: 'campaign', r: run(140), at: Date.now() });
    const b = new Profile(store); // next launch
    const st = b.takeStashedRun()!;
    expect(st.sector).toBe(2);
    expect(st.r.won).toBe(false);
    expect(st.r.kills).toBe(400);
    expect(b.takeStashedRun()).toBeNull();
    const gold = b.data.gold;
    const rw = b.applyRun(st.sector, st.r, 5);
    expect(rw.gold).toBeGreaterThan(0);
    expect(b.data.gold).toBe(gold + rw.gold);
    expect(b.data.unlocked).toBe(0); // an interrupted run can't clear a sector
  });

  it('ignores runs that had barely started, stale ones, cleared ones and junk', () => {
    const store = new Mem() as unknown as Storage;
    const p = new Profile(store);
    p.stashRun({ sector: 0, mode: 'campaign', r: run(8), at: Date.now() });
    expect(p.takeStashedRun()).toBeNull();
    p.stashRun({ sector: 0, mode: 'campaign', r: run(100), at: Date.now() - 8 * 864e5 });
    expect(p.takeStashedRun()).toBeNull();
    p.stashRun({ sector: 0, mode: 'campaign', r: run(100), at: Date.now() });
    p.stashRun(null);
    expect(p.takeStashedRun()).toBeNull();
    store.setItem('deadsignal.save.v1:run', '{"sector":999,"mode":"x"}');
    expect(p.takeStashedRun()).toBeNull();
    store.setItem('deadsignal.save.v1:run', 'not json');
    expect(p.takeStashedRun()).toBeNull();
  });
});
