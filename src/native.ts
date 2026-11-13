/**
 * Store-app builds. `npm run build:android` / `build:ios` compile the same game with
 * __NATIVE__ = 'android' | 'ios' into dist-android/ or dist-ios/, which Capacitor wraps
 * (see android/, ios/ and .github/workflows/android.yml, ios.yml). Differences from the site:
 *  - ads: AdMob rewarded ads (still rewarded and opt-in only, same placements)
 *  - shop: Google Play Billing / Apple in-app purchase instead of Stripe (the stores require it)
 *  - Google Drive backup is hidden (Google sign-in doesn't run inside an app WebView);
 *    cloud save codes, leaderboards and anonymous stats work as on the site
 * The site build has __NATIVE__ = '' and never loads any of the plugins.
 */
declare const __NATIVE__: string;
declare const __ADMOB_LIVE__: boolean;
const RAW = typeof __NATIVE__ !== 'undefined' ? __NATIVE__ : '';
export const NATIVE: '' | 'android' | 'ios' = RAW === 'android' || RAW === 'ios' ? RAW : '';
/** "Google Play" / "the App Store", for player-facing text. */
export const STORE_NAME = NATIVE === 'ios' ? 'the App Store' : 'Google Play';

/** AdMob rewarded units. Test builds use Google's test units so testers never tap real ads. */
const REWARDED_LIVE = { android: 'ca-app-pub-6900407641110608/2783161067', ios: 'ca-app-pub-6900407641110608/6108086570' };
const REWARDED_TEST = { android: 'ca-app-pub-3940256099942544/5224354917', ios: 'ca-app-pub-3940256099942544/1712485313' };
/** AdMob app ids. Android's is also in android/app/src/main/AndroidManifest.xml; iOS's goes into
 *  Info.plist (GADApplicationIdentifier) when the iOS workflow builds with ads_live. */
export const ADMOB_APP_ID = 'ca-app-pub-6900407641110608~8554362492';
export const ADMOB_IOS_APP_ID = 'ca-app-pub-6900407641110608~7477008563';
export const ADMOB_LIVE = typeof __ADMOB_LIVE__ !== 'undefined' && __ADMOB_LIVE__;
const rewardedUnit = () => {
  const p = NATIVE === 'ios' ? 'ios' : 'android';
  return (ADMOB_LIVE && REWARDED_LIVE[p]) || REWARDED_TEST[p];
};

type AdMobMod = typeof import('@capacitor-community/admob');
let admob: AdMobMod | null = null;
let loaded = false;
let loading: Promise<boolean> | null = null;
let privacyOptions = false;

/** True when the law needs a way to change ad consent later (Settings shows "Ad privacy choices"). */
export const nativePrivacyOptions = () => privacyOptions;
export async function showNativePrivacyOptions(): Promise<void> {
  try {
    await admob?.AdMob.showPrivacyOptionsForm();
  } catch {
    /* form unavailable right now */
  }
}

/** Start AdMob (with Google's consent form where the law asks for one) and preload an ad. */
export async function initNativeAds(): Promise<boolean> {
  if (!NATIVE) return false;
  try {
    admob = await import('@capacitor-community/admob');
    const { AdMob } = admob;
    await AdMob.initialize({ initializeForTesting: !ADMOB_LIVE });
    // Google's consent form first (EEA/UK/Swiss players; set up under AdMob → Privacy & messaging)
    try {
      const info = await AdMob.requestConsentInfo();
      if (info.isConsentFormAvailable && info.status === admob.AdmobConsentStatus.REQUIRED) await AdMob.showConsentForm();
      privacyOptions = (await AdMob.requestConsentInfo()).privacyOptionsRequirementStatus === 'REQUIRED';
    } catch {
      /* consent service unreachable: AdMob falls back to non-personalized ads */
    }
    if (NATIVE === 'ios') {
      // Apple's App Tracking Transparency prompt (if Google's form didn't already show it);
      // ads still work (non-personalized) if declined
      try {
        const st = await AdMob.trackingAuthorizationStatus();
        if (st.status === 'notDetermined') await AdMob.requestTrackingAuthorization();
      } catch {
        /* older iOS: no prompt needed */
      }
    }
    void preload();
    return true;
  } catch {
    admob = null;
    return false;
  }
}

function preload(): Promise<boolean> {
  if (!admob) return Promise.resolve(false);
  if (loaded) return Promise.resolve(true);
  loading ??= admob.AdMob.prepareRewardVideoAd({ adId: rewardedUnit(), isTesting: !ADMOB_LIVE })
    .then(() => (loaded = true))
    .catch(() => false)
    .finally(() => (loading = null));
  return loading;
}

export const nativeAdReady = () => loaded;

/** Show a rewarded ad. Resolves true only if the player earned the reward. */
export async function showNativeRewarded(onStart: () => void, onEnd: () => void): Promise<boolean | 'unfilled'> {
  if (!admob) return 'unfilled';
  if (!loaded && !(await preload())) return 'unfilled';
  const { AdMob, RewardAdPluginEvents } = admob;
  let rewarded = false;
  // The show call only resolves when the reward is earned (it never settles if the player closes
  // the ad early), so the ad is over when it's dismissed or fails to show, not when the call returns.
  let over: () => void = () => {};
  const closed = new Promise<void>((r) => (over = r));
  const subs = await Promise.all([
    AdMob.addListener(RewardAdPluginEvents.Rewarded, () => (rewarded = true)),
    AdMob.addListener(RewardAdPluginEvents.Dismissed, () => over()),
    AdMob.addListener(RewardAdPluginEvents.FailedToShow, () => over()),
  ]);
  loaded = false;
  onStart();
  try {
    await Promise.race([
      AdMob.showRewardVideoAd().then(
        () => {
          rewarded = true; // resolves with the reward item once it's earned; wait for the close
          return closed;
        },
        () => over(),
      ),
      closed,
    ]);
  } finally {
    for (const s of subs) void s.remove();
    onEnd();
    void preload(); // the next one is ready by the next offer
  }
  return rewarded;
}

// ------------------------------------------------------------------ store billing

/** Store product ids (one-time products), the same in Play Console and App Store Connect. */
export const PLAY_IDS = { starter: 'starter_pack', pass: 'signal_pass_plus', adfree: 'skip_ads' } as const;
type PlayKey = keyof typeof PLAY_IDS;
const byPlayId = Object.fromEntries(Object.entries(PLAY_IDS).map(([k, v]) => [v, k])) as Record<string, PlayKey>;

type PurchasesMod = typeof import('@capgo/native-purchases');
let np: PurchasesMod | null = null;
/** Localized prices from Play, e.g. { starter: '$2.99' }. Empty = billing unavailable. */
export const playPrices: Partial<Record<PlayKey, string>> = {};

export async function initBilling(): Promise<boolean> {
  if (!NATIVE) return false;
  try {
    np = await import('@capgo/native-purchases');
    const ok = await np.NativePurchases.isBillingSupported();
    if (!ok.isBillingSupported) return false;
    const { products } = await np.NativePurchases.getProducts({ productIdentifiers: Object.values(PLAY_IDS), productType: np.PURCHASE_TYPE.INAPP });
    for (const p of products) {
      const k = byPlayId[p.identifier];
      if (k) playPrices[k] = p.priceString;
    }
    return Object.keys(playPrices).length > 0;
  } catch {
    np = null;
    return false;
  }
}

/** A Play purchase in the shape the shop's applyPurchases() takes (id = Play purchase token). */
export interface PlayRow {
  id: string;
  product: PlayKey;
  season: number | null;
  fresh: boolean;
}

/** Buy one product. Signal Pass+ is consumed so it can be bought again next season. */
export async function playBuy(product: PlayKey, playerId: string, season: number): Promise<PlayRow | 'cancelled' | 'error'> {
  if (!np) return 'error';
  try {
    const t = await np.NativePurchases.purchaseProduct({
      productIdentifier: PLAY_IDS[product],
      productType: np.PURCHASE_TYPE.INAPP,
      appAccountToken: playerId,
      isConsumable: product === 'pass',
    });
    if (t.purchaseState && t.purchaseState !== '1') return 'error'; // pending (e.g. cash payment): delivered by restore later
    return { id: t.purchaseToken ?? t.transactionId, product, season: product === 'pass' ? season : null, fresh: true };
  } catch (e) {
    return /cancel/i.test(String((e as Error)?.message ?? e)) ? 'cancelled' : 'error';
  }
}

/** Owned one-time products (Starter Pack, Skip Ads) still on this Google account, for restores. */
export async function playOwned(): Promise<PlayRow[]> {
  if (!np) return [];
  try {
    const { purchases } = await np.NativePurchases.getPurchases({ productType: np.PURCHASE_TYPE.INAPP });
    const out: PlayRow[] = [];
    for (const t of purchases) {
      const k = byPlayId[t.productIdentifier];
      if (!k || k === 'pass' || (t.purchaseState && t.purchaseState !== '1')) continue;
      out.push({ id: t.purchaseToken ?? t.transactionId, product: k, season: null, fresh: true });
    }
    return out;
  } catch {
    return [];
  }
}
