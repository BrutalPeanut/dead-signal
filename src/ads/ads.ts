/**
 * Ads layer. The game only ever calls `ads.showRewarded(placement)`; which network sits behind it
 * (AdMob now, AppLovin MAX later) is one provider class. Rewarded only, always opt-in:
 * the player taps "Watch ad" and gets something for it.
 *
 * Modes:
 *  - LIVE_ADS = false (until Google approves H5 Games Ads for deadsignal.info): ads OFF. Every
 *    ad-gated reward (like 2× speed) is simply free.
 *  - LIVE_ADS = true: real rewarded ads through Google's H5 Games Ads (Ad Placement API).
 *  - `?ads=test`: the real H5 integration in Google's test mode (fake Google ads, no revenue),
 *    to check the wiring on the live site before approval.
 *  - `?ads=demo`: a local sample ad, no network at all.
 */

/** Flip to true once AdSense has approved H5 Games Ads for the site. */
export const LIVE_ADS = false;
const AD_CLIENT = 'ca-pub-6900407641110608';

/** The game sets these so ads can silence and resume its audio. */
export const adAudio = { mute: () => {}, unmute: () => {} };
import { h, toast } from '../ui/dom';

export type Placement = 'revive' | 'double' | 'key' | 'speed';

export interface AdProvider {
  readonly name: string;
  isReady(p: Placement): boolean;
  /** Resolves true only if the ad was watched to the reward point. */
  showRewarded(p: Placement): Promise<boolean>;
}

/** Sample ad: a 15-second fictional game trailer with a countdown and a close button. */
class DemoAds implements AdProvider {
  readonly name = 'demo';
  isReady() {
    return true;
  }
  showRewarded(p: Placement): Promise<boolean> {
    return new Promise((resolve) => {
      const LEN = 15;
      let left = LEN;
      let done = false;
      const canvas = h('canvas.ad-creative') as HTMLCanvasElement;
      const count = h('span.ad-count', `Reward in ${left}s`);
      const close = h('button.ad-close', { 'aria-label': 'Close ad' }, '✕');
      const el = h(
        'div.ad-overlay',
        h('div.ad-top', h('span.ad-tag', 'SAMPLE AD'), count, close),
        canvas,
        h('div.ad-cta', h('b', 'Gem Grove'), h('span', 'Fictional game used for this preview'), h('button.ad-install', 'Play free')),
        h('div.ad-foot', `Reward: ${p === 'revive' ? 'get back up' : p === 'double' ? 'double your gold' : p === 'speed' ? '30 minutes of 2× speed' : '1 crate key'}`),
      );
      document.getElementById('ui')!.append(el);
      const ctx = canvas.getContext('2d')!;
      const t0 = performance.now();
      let raf = 0;
      const draw = (now: number) => {
        const t = (now - t0) / 1000;
        const w = (canvas.width = canvas.clientWidth * 2);
        const hh = (canvas.height = canvas.clientHeight * 2);
        const g = ctx.createLinearGradient(0, 0, 0, hh);
        g.addColorStop(0, '#5ec8ff');
        g.addColorStop(1, '#7a5cff');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, hh);
        const cols = 6;
        const cell = w / (cols + 1);
        const colors = ['#ff5a7a', '#ffd34d', '#43e08a', '#4da3ff', '#c87bff'];
        for (let r = 0; r < 7; r++)
          for (let c = 0; c < cols; c++) {
            const k = (r * 7 + c * 3 + Math.floor(t * 1.5)) % colors.length;
            const x = cell * (c + 1);
            const y = hh * 0.22 + r * cell * 0.95 + Math.sin(t * 3 + r + c) * 4;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(Math.PI / 4);
            ctx.fillStyle = colors[k];
            ctx.shadowColor = 'rgba(0,0,0,0.25)';
            ctx.shadowBlur = 8;
            const s = cell * 0.32 * (1 + 0.08 * Math.sin(t * 6 + c));
            ctx.fillRect(-s, -s, s * 2, s * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.45)';
            ctx.fillRect(-s * 0.7, -s * 0.7, s * 0.6, s * 0.6);
            ctx.restore();
          }
        ctx.fillStyle = '#fff';
        ctx.font = `900 ${Math.round(w * 0.09)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('MATCH 3 TO GROW!', w / 2, hh * 0.13);
        raf = requestAnimationFrame(draw);
      };
      raf = requestAnimationFrame(draw);
      const tick = setInterval(() => {
        left--;
        if (left > 0) count.textContent = `Reward in ${left}s`;
        else {
          done = true;
          count.textContent = '✓ Reward earned';
          el.classList.add('earned');
          clearInterval(tick);
        }
      }, 1000);
      close.onclick = () => {
        if (!done && !el.classList.contains('confirm')) {
          el.classList.add('confirm');
          count.textContent = `Close now and lose the reward? Tap ✕ again`;
          setTimeout(() => el.classList.remove('confirm'), 2500);
          return;
        }
        clearInterval(tick);
        cancelAnimationFrame(raf);
        el.remove();
        resolve(done);
      };
    });
  }
}

type AdBreak = (o: Record<string, unknown>) => void;
type W = Window & { adsbygoogle?: unknown[]; adBreak?: AdBreak; adConfig?: AdBreak };

/**
 * Google H5 Games Ads: rewarded breaks only (never interstitials, never mid-run). The player has
 * already tapped "Watch ad", so the ad is shown as soon as Google offers one (beforeReward).
 */
class H5Ads implements AdProvider {
  readonly name: string;
  private ready = false;
  constructor(test: boolean) {
    this.name = test ? 'h5-test' : 'h5';
    const w = window as W;
    w.adsbygoogle = w.adsbygoogle || [];
    w.adBreak = w.adConfig = (o) => w.adsbygoogle!.push(o);
    const sc = document.createElement('script');
    sc.async = true;
    sc.crossOrigin = 'anonymous';
    sc.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`;
    sc.setAttribute('data-ad-client', AD_CLIENT);
    sc.setAttribute('data-ad-frequency-hint', '30s');
    if (test) sc.setAttribute('data-adbreak-test', 'on');
    document.head.append(sc);
    w.adConfig({ preloadAdBreaks: 'on', sound: 'on', onReady: () => (this.ready = true) });
  }
  isReady() {
    return this.ready;
  }
  showRewarded(p: Placement): Promise<boolean> {
    return new Promise((resolve) => {
      // ad blocker / offline / Google's script never loaded: answer straight away
      if (!this.ready) {
        toast('Ads aren’t available right now (an ad blocker or a weak connection?)', '#8d97ab');
        return resolve(false);
      }
      let viewed = false;
      let offered = false;
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        adAudio.unmute();
        resolve(ok);
      };
      // no answer from Google at all: don't leave the button hanging
      setTimeout(() => {
        if (!offered) {
          toast('No ad available right now. Try again in a minute', '#8d97ab');
          finish(false);
        }
      }, 8000);
      (window as W).adBreak!({
        type: 'reward',
        name: p,
        beforeAd: () => adAudio.mute(),
        afterAd: () => adAudio.unmute(),
        beforeReward: (showAdFn: () => void) => {
          offered = true;
          showAdFn();
        },
        adViewed: () => (viewed = true),
        adDismissed: () => (viewed = false),
        adBreakDone: () => {
          if (!offered && !done) toast('No ad available right now. Try again in a minute', '#8d97ab');
          finish(viewed);
        },
      });
    });
  }
}

class NoAds implements AdProvider {
  readonly name = 'none';
  isReady() {
    return false;
  }
  async showRewarded() {
    return false;
  }
}

function pick(): AdProvider {
  try {
    const q = new URLSearchParams(location.search).get('ads');
    if (q === 'demo') return new DemoAds();
    if (q === 'test') return new H5Ads(true);
    if (q === 'off') return new NoAds();
    if (LIVE_ADS) return new H5Ads(false);
  } catch {
    /* no window/location (tests) */
  }
  return new NoAds();
}

/** Listeners told about every rewarded ad (the stats module counts starts and completions). */
export const adListeners: ((p: Placement, ok: boolean) => void)[] = [];
const provider = pick();
export const ads: AdProvider = {
  name: provider.name,
  isReady: (p) => provider.isReady(p),
  showRewarded: async (p) => {
    const ok = await provider.showRewarded(p);
    for (const l of adListeners) l(p, ok);
    return ok;
  },
};
export const adsOn = () => ads.name !== 'none';
