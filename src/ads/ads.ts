/**
 * Ads layer. The game only ever calls `ads.showRewarded(placement)`; which network sits behind it
 * (AdMob now, AppLovin MAX later) is one provider class. Rewarded only, always opt-in:
 * the player taps "Watch ad" and gets something for it.
 *
 * The web build ships ads OFF. `?ads=demo` turns on a sample provider that plays a fake,
 * clearly-labelled ad, so placements can be reviewed before any network is wired up.
 */
import { h } from '../ui/dom';

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
    if (new URLSearchParams(location.search).get('ads') === 'demo') return new DemoAds();
  } catch {
    /* no location (tests) */
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
