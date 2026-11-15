import { describe, expect, it } from 'vitest';
import { founderStep } from '../src/meta/founder';
import { Profile, normalizeSave } from '../src/meta/profile';

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

describe('founders', () => {
  it('a brand-new player is not a Founder until they play a run', () => {
    const p = mk();
    expect(founderStep(p.data, false)).toBe(null);
    expect(p.data.founder).toBeUndefined();
  });

  it('playing before launch makes you a Founder once', () => {
    const p = mk();
    p.data.stats.runs = 1;
    expect(founderStep(p.data, false, 123)).toBe('marked');
    expect(p.data.founder).toEqual({ at: 123 });
    expect(founderStep(p.data, false)).toBe(null);
  });

  it('after launch, a Founder gets the pack once; new players never become Founders', () => {
    const p = mk();
    p.data.stats.runs = 3;
    founderStep(p.data, false);
    expect(founderStep(p.data, true)).toBe('reward');
    p.data.founder!.claimed = true;
    expect(founderStep(p.data, true)).toBe(null);

    const late = mk();
    late.data.stats.runs = 5;
    expect(founderStep(late.data, true)).toBe(null);
    expect(late.data.founder).toBeUndefined();
  });

  it('Founder status survives save/load and cloud round trips; junk is dropped', () => {
    const p = mk();
    p.data.founder = { at: 5, claimed: false };
    const back = normalizeSave(JSON.parse(JSON.stringify(p.data)))!;
    expect(back.founder).toEqual({ at: 5, claimed: false });
    const bad = normalizeSave({ ...JSON.parse(JSON.stringify(p.data)), founder: 'yes' })!;
    expect(bad.founder).toBeUndefined();
  });
});
