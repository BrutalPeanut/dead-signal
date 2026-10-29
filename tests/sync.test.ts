import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Profile, progressOf } from '../src/meta/profile';
import { CloudSync } from '../src/meta/sync';
import { setFetcher } from '../src/net/leaderboard';
import { newSyncCode, normalizeCode } from '../src/net/cloud';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

/** In-memory copy of the Supabase RPCs (same rules: dedupe, 2-minute merge window, keep 5). */
class FakeServer {
  rows: { id: number; code: string; save: unknown; sector: number; level: number; progress: number; t: number }[] = [];
  seq = 0;
  now = 1_000_000;
  down = false;
  calls = 0;
  fetch = async (url: string, init: RequestInit) => {
    this.calls++;
    if (this.down) throw new Error('offline');
    const fn = url.split('/').pop()!;
    const b = JSON.parse(String(init.body));
    const mine = () => this.rows.filter((r) => r.code === b.p_code).sort((a, c) => c.id - a.id);
    const meta = (r: FakeServer['rows'][number]) => ({ id: r.id, sector: r.sector, level: r.level, progress: r.progress, updated_at: new Date(r.t).toISOString() });
    let out: unknown;
    if (fn === 'save_push') {
      if (!/^[A-HJ-NP-Z2-9]{10}$/.test(b.p_code)) return { ok: false, json: async () => null };
      const latest = mine()[0];
      if (latest && JSON.stringify(latest.save) === JSON.stringify(b.p_save)) out = latest.id;
      else if (latest && this.now - latest.t < 120_000) {
        Object.assign(latest, { save: b.p_save, sector: b.p_sector, level: b.p_level, progress: b.p_progress, t: this.now });
        out = latest.id;
      } else {
        const r = { id: ++this.seq, code: b.p_code, save: b.p_save, sector: b.p_sector, level: b.p_level, progress: b.p_progress, t: this.now };
        this.rows.push(r);
        const keep = new Set(mine().slice(0, 5).map((x) => x.id));
        this.rows = this.rows.filter((x) => x.code !== b.p_code || keep.has(x.id));
        out = r.id;
      }
    } else if (fn === 'save_pull') out = mine().slice(0, 1).map((r) => ({ ...meta(r), save: r.save }));
    else if (fn === 'save_list') out = mine().slice(0, 5).map(meta);
    else if (fn === 'save_get') out = mine().filter((r) => r.id === b.p_id).map((r) => ({ ...meta(r), save: r.save }));
    return { ok: true, json: async () => JSON.parse(JSON.stringify(out)) };
  };
}

let srv: FakeServer;
beforeEach(() => {
  srv = new FakeServer();
  setFetcher(srv.fetch);
});
afterEach(() => setFetcher((u, i) => fetch(u, i)));

const device = () => {
  const p = new Profile(new MemStorage() as unknown as Storage);
  return { p, s: new CloudSync(p, true, 0) };
};
const play = (p: Profile, sector: number) => {
  p.data.unlocked = sector;
  p.data.gold += 100;
  p.save();
};

describe('cloud save', () => {
  it('codes are 10 unambiguous characters and typing them is forgiving', () => {
    const c = newSyncCode();
    expect(c).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    expect(normalizeCode(` ${c.slice(0, 5).toLowerCase()}-${c.slice(5)} `)).toBe(c);
    expect(normalizeCode('SHORT')).toBeNull();
    expect(normalizeCode('ABCDE0IJKL')).toBeNull(); // 0 and I never appear
  });

  it('backs up on launch and after changes, without re-sending unchanged saves', async () => {
    const { p, s } = device();
    expect(await s.startup()).toBe('pushed');
    expect(srv.rows).toHaveLength(1);
    play(p, 3);
    await s.pushNow();
    expect((srv.rows[0].save as { unlocked: number }).unlocked).toBe(3);
    const calls = srv.calls;
    await s.pushNow();
    expect(srv.calls).toBe(calls); // nothing changed: no network
  });

  it('another device takes the further-along save with the code, then keeps both in sync', async () => {
    const a = device();
    play(a.p, 12);
    await a.s.startup();
    const b = device();
    await b.s.startup();
    const found = await b.s.peek(a.s.code());
    expect(found).not.toBe('bad');
    if (typeof found === 'string') throw new Error(found);
    expect(found.v.sector).toBe(12);
    expect(b.s.useCode(found.code, found.v)).toBe(true);
    expect(b.p.data.unlocked).toBe(12);
    expect(b.s.code()).toBe(a.s.code());
    // b plays on, a relaunches and picks it up
    srv.now += 600_000;
    play(b.p, 14);
    await b.s.pushNow();
    expect(await a.s.startup()).toBe('adopted');
    expect(a.p.data.unlocked).toBe(14);
  });

  it('keeps this device settings when taking a cloud save', async () => {
    const a = device();
    play(a.p, 5);
    await a.s.startup();
    const b = device();
    b.p.data.settings.controls = 'left';
    const f = await b.s.peek(a.s.code());
    if (typeof f === 'string') throw new Error(f);
    b.s.useCode(f.code, f.v);
    expect(b.p.data.settings.controls).toBe('left');
  });

  it('a device that is behind never overwrites the cloud (even when it cannot take the save yet)', async () => {
    const a = device();
    play(a.p, 9);
    await a.s.startup();
    const b = device();
    b.p.data.sync = { code: a.s.code() }; // same code, older progress
    play(b.p, 2);
    expect(await b.s.startup(() => false)).toBe('later'); // mid-run
    await b.s.pushNow();
    expect(srv.rows.at(-1)!.sector).toBe(9);
    expect(await b.s.startup()).toBe('adopted');
    expect(b.p.data.unlocked).toBe(9);
  });

  it('a device that launched offline checks the cloud before its first backup', async () => {
    const a = device();
    play(a.p, 9);
    await a.s.startup();
    const b = device();
    b.p.data.sync = { code: a.s.code() };
    srv.down = true;
    expect(await b.s.startup()).toBe('offline');
    play(b.p, 2);
    srv.down = false;
    expect(await b.s.pushNow()).toBe(true); // took the further-along save instead of overwriting it
    expect(b.p.data.unlocked).toBe(9);
    expect(srv.rows.filter((r) => r.code === a.s.code()).every((r) => r.sector === 9)).toBe(true);
  });

  it('offline: keeps playing locally and backs up when the connection returns', async () => {
    const { p, s } = device();
    srv.down = true;
    expect(await s.startup()).toBe('offline');
    play(p, 4);
    expect(await s.pushNow()).toBe(false);
    expect(s.status).toBe('offline');
    expect(p.data.unlocked).toBe(4); // local save untouched
    srv.down = false;
    expect(await s.pushNow()).toBe(true);
    expect(srv.rows[0].sector).toBe(4);
  });

  it('a corrupt cloud save is never adopted', async () => {
    const { p, s } = device();
    play(p, 3);
    srv.rows.push({ id: 99, code: s.code(), save: { garbage: true }, sector: 30, level: 99, progress: 9e12, t: srv.now });
    expect(await s.startup()).toBe('pushed');
    expect(p.data.unlocked).toBe(3);
    expect(await s.peek(s.code())).not.toBe('bad');
  });

  it('keeps the last 5 versions, spaced out, and can restore one', async () => {
    const { p, s } = device();
    for (let i = 1; i <= 8; i++) {
      srv.now += 180_000;
      play(p, i);
      await s.pushNow();
    }
    const list = (await s.backups())!;
    expect(list.map((v) => v.sector)).toEqual([8, 7, 6, 5, 4]);
    // a burst inside the 2-minute window refreshes the newest instead of flushing backups
    for (let i = 0; i < 5; i++) {
      p.data.gold++;
      p.save();
      await s.pushNow();
    }
    expect((await s.backups())!.map((v) => v.sector)).toEqual([8, 7, 6, 5, 4]);
    expect(await s.restore(list[3].id)).toBe(true);
    expect(p.data.unlocked).toBe(5);
  });

  it('reset starts a new code so old backups stay put and cannot sync back', async () => {
    const { p, s } = device();
    play(p, 7);
    await s.startup();
    const old = s.code();
    p.reset();
    s.fresh();
    expect(s.code()).not.toBe(old);
    expect(await s.startup()).toBe('pushed');
    expect(p.data.unlocked).toBe(0);
    expect(srv.rows.find((r) => r.code === old)!.sector).toBe(7);
  });

  it('progress orders by sector, then account level', () => {
    const p = new Profile(new MemStorage() as unknown as Storage);
    const a = progressOf({ ...p.data, unlocked: 3, accountLevel: 50 });
    const b = progressOf({ ...p.data, unlocked: 4, accountLevel: 1 });
    expect(b).toBeGreaterThan(a);
  });
});
