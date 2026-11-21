import { describe, expect, it } from 'vitest';
import { Profile, normalizeSave } from '../src/meta/profile';
import { reportName, setFetcher } from '../src/net/leaderboard';

class Mem { m = new Map<string, string>(); getItem(k: string) { return this.m.get(k) ?? null; } setItem(k: string, v: string) { this.m.set(k, v); } removeItem() {} clear() {} key() { return null; } length = 0; }
const mk = () => new Profile(new Mem() as unknown as Storage);

describe('leaderboard report / block', () => {
  it('old saves get an empty block list; junk is dropped', () => {
    const p = mk();
    const old = JSON.parse(JSON.stringify(p.data));
    delete old.online.blocked;
    expect(normalizeSave(old)!.online.blocked).toEqual([]);
    old.online.blocked = ['abc', 5, null, 'def'];
    expect(normalizeSave(old)!.online.blocked).toEqual(['abc', 'def']);
    old.online.blocked = 'nope';
    expect(normalizeSave(old)!.online.blocked).toEqual([]);
  });

  it('blocking is saved once per tag and survives a reload', () => {
    const store = new Mem();
    const p = new Profile(store as unknown as Storage);
    p.blockTag('0123456789abcdef');
    p.blockTag('0123456789abcdef');
    expect(p.data.online.blocked).toEqual(['0123456789abcdef']);
    expect(new Profile(store as unknown as Storage).data.online.blocked).toEqual(['0123456789abcdef']);
    p.unblockAll();
    expect(p.data.online.blocked).toEqual([]);
  });

  it('report sends the opaque tag, never another player id', async () => {
    const calls: any[] = [];
    setFetcher(async (url, init) => (calls.push({ url, body: JSON.parse(String(init.body)) }), { ok: true, json: async () => true }));
    expect(await reportName('me-id', '0123456789abcdef', 'endless')).toBe(true);
    expect(calls[0].url).toMatch(/report_name$/);
    expect(calls[0].body).toEqual({ p_player: 'me-id', p_tag: '0123456789abcdef', p_board: 'endless' });
    setFetcher(async () => { throw new Error('offline'); });
    expect(await reportName('me-id', '0123456789abcdef', 'endless')).toBe(false);
  });
});
