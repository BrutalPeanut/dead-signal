import { describe, expect, it } from 'vitest';
import { framedByOtherSite } from '../src/framing';
import { isStripeCheckout } from '../src/net/shop';

const win = (top: unknown, origin = 'https://deadsignal.info'): Window => {
  const w: Record<string, unknown> = { location: { origin } };
  w.self = w;
  w.top = top === 'self' ? w : top;
  return w as unknown as Window;
};

describe('clickjacking guard', () => {
  it('runs normally when not in a frame', () => {
    expect(framedByOtherSite(win('self'))).toBe(false);
  });
  it('allows a frame from our own site', () => {
    expect(framedByOtherSite(win({ location: { origin: 'https://deadsignal.info' } }))).toBe(false);
  });
  it('blocks a frame from another site (cross-origin access throws)', () => {
    const top = {
      get location(): never {
        throw new Error('SecurityError');
      },
    };
    expect(framedByOtherSite(win(top))).toBe(true);
  });
});

describe('checkout redirect guard', () => {
  it('follows only Stripe checkout pages', () => {
    expect(isStripeCheckout('https://checkout.stripe.com/c/pay/cs_test_123')).toBe(true);
    expect(isStripeCheckout('http://checkout.stripe.com/c/pay/x')).toBe(false);
    expect(isStripeCheckout('https://checkout.stripe.com.evil.example/x')).toBe(false);
    expect(isStripeCheckout('https://evil.example/?checkout.stripe.com')).toBe(false);
    expect(isStripeCheckout('javascript:alert(1)')).toBe(false);
    expect(isStripeCheckout('not a url')).toBe(false);
  });
});
