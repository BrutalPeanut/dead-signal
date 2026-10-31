import { afterEach, describe, expect, it } from 'vitest';
import { Audio } from '../src/audio';

/** Just enough of Web Audio to see what each bus is set to. */
class FakeGain {
  gain = { value: 1 };
  connect<T>(n: T) { return n; }
}
class FakeCtx {
  state = 'running';
  sampleRate = 8000;
  currentTime = 0;
  destination = {};
  createGain() { return new FakeGain(); }
  createDynamicsCompressor() { return { threshold: { value: 0 }, ratio: { value: 0 }, connect: <T>(n: T) => n }; }
  createBuffer() { return { getChannelData: () => new Float32Array(8000) }; }
  resume() { return Promise.resolve(); }
}
const g = globalThis as unknown as { window?: unknown };
afterEach(() => delete g.window);

const fresh = () => {
  g.window = { AudioContext: FakeCtx };
  return new Audio() as unknown as { sfxBus: FakeGain; musicBus: FakeGain; unlock(): void; setSfx(on: boolean): void; setMusic(on: boolean): void };
};

describe('sound settings', () => {
  it('music and sound effects saved as off stay off when audio starts on the first tap', () => {
    const a = fresh();
    a.setSfx(false);
    a.setMusic(false);
    a.unlock();
    expect(a.musicBus.gain.value).toBe(0);
    expect(a.sfxBus.gain.value).toBe(0);
  });

  it('each toggle takes effect immediately, both ways', () => {
    const a = fresh();
    a.unlock();
    expect(a.musicBus.gain.value).toBeGreaterThan(0);
    expect(a.sfxBus.gain.value).toBeGreaterThan(0);
    a.setMusic(false);
    a.setSfx(false);
    expect(a.musicBus.gain.value).toBe(0);
    expect(a.sfxBus.gain.value).toBe(0);
    a.setMusic(true);
    a.setSfx(true);
    expect(a.musicBus.gain.value).toBeGreaterThan(0);
    expect(a.sfxBus.gain.value).toBeGreaterThan(0);
  });
});
