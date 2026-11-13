import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fake AdMob plugin that behaves like @capacitor-community/admob 8: showRewardVideoAd()
// resolves only when the reward is earned and never settles if the player closes early.
type L = (...a: unknown[]) => void;
const listeners = new Map<string, Set<L>>();
const emit = (ev: string) => listeners.get(ev)?.forEach((f) => f());
let mode: 'earn' | 'close-early' | 'fail' = 'earn';
vi.mock('@capacitor-community/admob', () => ({
  AdmobConsentStatus: { REQUIRED: 'REQUIRED' },
  RewardAdPluginEvents: { Rewarded: 'rew', Dismissed: 'dis', FailedToShow: 'fail' },
  AdMob: {
    initialize: async () => {},
    requestConsentInfo: async () => ({ isConsentFormAvailable: false, status: 'OBTAINED', privacyOptionsRequirementStatus: 'REQUIRED' }),
    showConsentForm: async () => {},
    trackingAuthorizationStatus: async () => ({ status: 'authorized' }),
    prepareRewardVideoAd: async () => ({}),
    addListener: async (ev: string, f: L) => {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev)!.add(f);
      return { remove: async () => listeners.get(ev)!.delete(f) };
    },
    showRewardVideoAd: () =>
      new Promise((resolve) => {
        setTimeout(() => {
          if (mode === 'earn') {
            emit('rew');
            resolve({ type: 'coins', amount: 1 });
            setTimeout(() => emit('dis'), 5);
          } else if (mode === 'close-early') emit('dis'); // promise never settles
          else emit('fail');
        }, 5);
      }),
  },
}));

(globalThis as Record<string, unknown>).__NATIVE__ = 'android';

describe('native rewarded ads', () => {
  beforeEach(() => listeners.clear());

  it('pays out when watched, and only after the ad closes', async () => {
    const n = await import('../src/native');
    expect(await n.initNativeAds()).toBe(true);
    expect(n.nativePrivacyOptions()).toBe(true);
    mode = 'earn';
    const order: string[] = [];
    const r = await n.showNativeRewarded(() => order.push('start'), () => order.push('end'));
    expect(r).toBe(true);
    expect(order).toEqual(['start', 'end']);
  });

  it('finishes (no reward) when the player closes the ad early instead of hanging', async () => {
    const n = await import('../src/native');
    await n.initNativeAds();
    mode = 'close-early';
    let ended = false;
    const r = await n.showNativeRewarded(() => {}, () => (ended = true));
    expect(r).toBe(false);
    expect(ended).toBe(true);
  });

  it('finishes when the ad fails to show', async () => {
    const n = await import('../src/native');
    await n.initNativeAds();
    mode = 'fail';
    expect(await n.showNativeRewarded(() => {}, () => {})).toBe(false);
  });
});
