import { describe, expect, it } from 'vitest';
import { tooSlowFor3d } from '../src/perf';

describe('auto 2D on slow devices', () => {
  it('switches a slow 3D run to 2D', () => {
    expect(tooSlowFor3d(true, undefined, 200, 20000)).toBe(true); // 10 fps
  });
  it('keeps smooth 3D', () => {
    expect(tooSlowFor3d(true, undefined, 1100, 20000)).toBe(false); // 55 fps
  });
  it('ignores very short runs', () => {
    expect(tooSlowFor3d(true, undefined, 50, 5000)).toBe(false);
  });
  it('respects a player who chose 3D', () => {
    expect(tooSlowFor3d(true, '3d', 200, 20000)).toBe(false);
  });
  it('does nothing in 2D', () => {
    expect(tooSlowFor3d(false, undefined, 200, 20000)).toBe(false);
  });
});
