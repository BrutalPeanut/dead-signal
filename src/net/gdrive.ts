/**
 * Google Drive backup: the save goes into the player's own Drive, in the hidden app-data folder
 * (scope drive.appdata: the game can only see its own file, never the player's documents, and the
 * player doesn't see a stray file in their Drive). Sign-in is Google Identity Services' token
 * flow: a popup, no passwords pass through the game, and the token lasts about an hour.
 *
 * Google blocks sign-in inside in-app browsers (Messenger, Facebook, Instagram), so the UI asks
 * those players to open the game in Chrome first.
 */

/** OAuth web client id from Google Cloud Console (public, not a secret). Empty = feature hidden. */
// Google Cloud project "Dead Signal" (dead-signal-513219), web client "Dead Signal web"
// (origins https://deadsignal.info and https://www.deadsignal.info; scope drive.appdata only).
export const GOOGLE_CLIENT_ID: string =
  (import.meta as { env?: Record<string, string> }).env?.VITE_GOOGLE_CLIENT_ID ?? '957385136433-tlsggrud98gel5rtolm5o1232bgfp75f.apps.googleusercontent.com';

const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const FILE = 'dead-signal-save.json';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export type DriveFetch = (url: string, init?: RequestInit) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown>; text: () => Promise<string> }>;
let fx: DriveFetch = (u, i) => fetch(u, i);
/** Tests swap the network out. */
export function setDriveFetch(f: DriveFetch) {
  fx = f;
}

export const driveConfigured = () => !!GOOGLE_CLIENT_ID;

/** In-app browsers where Google refuses to show its sign-in page. */
export function inAppBrowser(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  return /FBAN|FBAV|FB_IAB|Messenger|Instagram|Line\/|; wv\)/i.test(ua);
}

// ------------------------------------------------------------------ sign-in (token)

interface TokenClient {
  requestAccessToken: (o?: { prompt?: string }) => void;
}
type GIS = { accounts: { oauth2: { initTokenClient: (o: Record<string, unknown>) => TokenClient } } };

let token = '';
let tokenExp = 0;
let gisLoading: Promise<GIS> | null = null;

function loadGis(): Promise<GIS> {
  const w = window as unknown as { google?: GIS };
  if (w.google?.accounts?.oauth2) return Promise.resolve(w.google);
  gisLoading ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => (w.google ? res(w.google) : rej(new Error('Google sign-in failed to load')));
    s.onerror = () => {
      gisLoading = null;
      rej(new Error('Google sign-in failed to load'));
    };
    document.head.append(s);
  });
  return gisLoading;
}

export const signedIn = () => !!token && Date.now() < tokenExp - 60_000;

/** Ask for a Drive token. Must be called from a tap (it opens Google's popup). */
export async function signIn(): Promise<boolean> {
  if (signedIn()) return true;
  const gis = await loadGis();
  return new Promise((res) => {
    const client = gis.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (r: { access_token?: string; expires_in?: number; error?: string }) => {
        if (r.access_token) {
          token = r.access_token;
          tokenExp = Date.now() + (r.expires_in ?? 3600) * 1000;
          res(true);
        } else res(false);
      },
      error_callback: () => res(false),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Tests only. */
export function _setToken(t: string, ttlMs = 3_600_000) {
  token = t;
  tokenExp = Date.now() + ttlMs;
}

// ------------------------------------------------------------------ Drive file

const auth = () => ({ Authorization: `Bearer ${token}` });

async function findFile(): Promise<{ id: string; modifiedTime: string } | null> {
  const q = encodeURIComponent(`name = '${FILE}'`);
  const r = await fx(`${API}?spaces=appDataFolder&q=${q}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc`, { headers: auth() });
  if (!r.ok) throw new Error(`Drive list failed (${r.status})`);
  const j = (await r.json()) as { files?: { id: string; modifiedTime: string }[] };
  return j.files?.[0] ?? null;
}

/** Save to Drive (creates the file the first time, then updates it). */
export async function driveSave(save: unknown): Promise<void> {
  if (!signedIn()) throw new Error('not signed in');
  const body = JSON.stringify({ app: 'dead-signal', savedAt: new Date().toISOString(), save });
  const f = await findFile();
  if (f) {
    const r = await fx(`${UPLOAD}/${f.id}?uploadType=media`, { method: 'PATCH', headers: { ...auth(), 'Content-Type': 'application/json' }, body });
    if (!r.ok) throw new Error(`Drive update failed (${r.status})`);
    return;
  }
  const boundary = 'ds' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: FILE, parents: ['appDataFolder'], mimeType: 'application/json' });
  const multipart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${boundary}--`;
  const r = await fx(`${UPLOAD}?uploadType=multipart`, { method: 'POST', headers: { ...auth(), 'Content-Type': `multipart/related; boundary=${boundary}` }, body: multipart });
  if (!r.ok) throw new Error(`Drive create failed (${r.status})`);
}

/** The save stored in Drive, or null if there isn't one yet. */
export async function driveLoad(): Promise<{ save: unknown; savedAt: string } | null> {
  if (!signedIn()) throw new Error('not signed in');
  const f = await findFile();
  if (!f) return null;
  const r = await fx(`${API}/${f.id}?alt=media`, { headers: auth() });
  if (!r.ok) throw new Error(`Drive download failed (${r.status})`);
  const j = JSON.parse(await r.text()) as { app?: string; savedAt?: string; save?: unknown };
  if (j.app !== 'dead-signal' || !j.save) return null;
  return { save: j.save, savedAt: j.savedAt ?? f.modifiedTime };
}
