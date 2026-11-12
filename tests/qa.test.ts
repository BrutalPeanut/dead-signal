import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resultTitle, deathTip } from '../src/ui/screens';
import { Profile, aheadOf } from '../src/meta/profile';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}
const mk = () => new Profile(new MemStorage() as unknown as Storage);

describe('QA report regressions', () => {
  it('a retreat is not described as a death', () => {
    expect(resultTitle({ retreated: true })).toBe('RETREATED');
    expect(resultTitle({})).toBe('SIGNAL LOST');
    // the app clears killedBy on a retreat, so no "Downed by" line is built
    expect(deathTip(undefined)).toBeNull();
  });

  it('no player-facing text claims an evolution needs both skills maxed', () => {
    const walk = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : []));
    for (const f of walk('src')) expect(readFileSync(f, 'utf8').toLowerCase(), f).not.toContain('max both');
  });

  it('save ordering: progress first, then activity that only goes up', () => {
    const a = mk().data;
    const b = mk().data;
    expect(aheadOf(a, b)).toBe(false);
    b.login.claimed++;
    expect(aheadOf(b, a)).toBe(true); // same sector/level/XP, but b claimed a sign-in reward
    expect(aheadOf(a, b)).toBe(false);
    a.unlocked = 5;
    expect(aheadOf(a, b)).toBe(true); // real progress outranks activity
    b.asc = { ...(b.asc ?? {}), rank: 1 } as typeof b.asc;
    expect(aheadOf(b, a)).toBe(true); // an ascension outranks a pre-ascension save
  });
});
