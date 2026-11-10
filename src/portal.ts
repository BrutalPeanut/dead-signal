/**
 * Web-portal builds. `npm run build:crazygames` compiles the same game with __PORTAL__ set, which
 * swaps a few edges of the app for the portal's SDK:
 *  - ads: rewarded ads through the portal (never Google's script, never an ad of our own)
 *  - saves: the portal's data module (syncs to the player's portal account) instead of bare
 *    localStorage; our own cloud sync, Google Drive backup and install offer are off
 *  - events: loading start/stop, gameplay start/stop, and a celebration on big wins
 * The normal site build has __PORTAL__ = '' and none of this runs.
 */
declare const __PORTAL__: string;
export const PORTAL: '' | 'crazygames' = typeof __PORTAL__ !== 'undefined' && __PORTAL__ === 'crazygames' ? 'crazygames' : '';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (e: unknown) => void;
}
/** The slice of the CrazyGames HTML5 SDK v3 the game uses. */
interface CrazySdk {
  init(): Promise<void>;
  /** 'crazygames' on the site, 'local' on localhost, 'disabled' anywhere else (calls throw). */
  environment: string;
  ad: { requestAd(type: 'midgame' | 'rewarded', cb: AdCallbacks): void };
  game: { gameplayStart(): void; gameplayStop(): void; loadingStart(): void; loadingStop(): void; happytime(): void };
  data: { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void; clear(): void };
}

let sdk: CrazySdk | null = null;
let playing = false;
const safe = (fn: () => void) => {
  try {
    fn();
  } catch {
    /* the portal SDK must never be able to break the game */
  }
};

/** Start the portal SDK (no-op on the normal site). Resolves even if the SDK is missing or slow. */
export async function initPortal(): Promise<void> {
  if (PORTAL !== 'crazygames') return;
  try {
    const s = (window as unknown as { CrazyGames?: { SDK?: CrazySdk } }).CrazyGames?.SDK;
    if (!s) return;
    await Promise.race([s.init(), new Promise((_, no) => setTimeout(() => no(new Error('sdk timeout')), 6000))]);
    if (s.environment === 'crazygames' || s.environment === 'local') sdk = s;
  } catch {
    sdk = null;
  }
  safe(() => sdk?.game.loadingStart());
}

export const portal = {
  /** The live SDK, or null (normal site, SDK blocked, or opened outside the portal). */
  get sdk(): CrazySdk | null {
    return sdk;
  },
  /** Where saves go: the portal's data module (falls back to what localStorage already holds). */
  storage(): Storage | null {
    if (!sdk) return null;
    const d = sdk.data;
    const ls = (() => {
      try {
        return localStorage;
      } catch {
        return null;
      }
    })();
    return {
      getItem: (k: string) => {
        const v = d.getItem(k);
        return v !== null ? v : (ls?.getItem(k) ?? null);
      },
      setItem: (k: string, v: string) => d.setItem(k, v),
      removeItem: (k: string) => d.removeItem(k),
      clear: () => d.clear(),
      key: () => null,
      length: 0,
    } as Storage;
  },
  /** The game finished loading and can be played. */
  loaded() {
    safe(() => sdk?.game.loadingStop());
  },
  /** Tell the portal when the player is actually playing (a run in motion) vs in a menu or pause. */
  gameplay(on: boolean) {
    if (!sdk || on === playing) return;
    playing = on;
    safe(() => (on ? sdk!.game.gameplayStart() : sdk!.game.gameplayStop()));
  },
  /** Site-wide celebration: for rare, big moments only (the portal asks for restraint). */
  happy() {
    safe(() => sdk?.game.happytime());
  },
};
