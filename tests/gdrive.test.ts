import { afterEach, describe, expect, it } from 'vitest';
import { _setToken, driveLoad, driveSave, inAppBrowser, setDriveFetch } from '../src/net/gdrive';
import { Profile } from '../src/meta/profile';
import { CloudSync } from '../src/meta/sync';

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.get(k) ?? null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  key() { return null; }
  get length() { return this.m.size; }
}

/** A tiny fake of the Drive v3 endpoints the game uses (appDataFolder only). */
function fakeDrive() {
  const files = new Map<string, { name: string; body: string; modifiedTime: string }>();
  let n = 0;
  const calls: string[] = [];
  const res = (ok: boolean, body: unknown, status = ok ? 200 : 400) => ({ ok, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
  setDriveFetch(async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push(`${method} ${url.replace(/\?.*/, '')}`);
    if (!String((init.headers as Record<string, string>)?.Authorization ?? '').startsWith('Bearer ')) return res(false, { error: 'auth' }, 401);
    const u = new URL(url);
    if (method === 'GET' && u.pathname === '/drive/v3/files') {
      expect(u.searchParams.get('spaces')).toBe('appDataFolder');
      return res(true, { files: [...files].map(([id, f]) => ({ id, modifiedTime: f.modifiedTime })) });
    }
    if (method === 'POST' && u.pathname === '/upload/drive/v3/files') {
      const body = String(init.body);
      expect(body).toContain('"parents":["appDataFolder"]');
      const json = body.split('\r\n\r\n')[2].split('\r\n--')[0];
      files.set('f' + ++n, { name: 'dead-signal-save.json', body: json, modifiedTime: new Date().toISOString() });
      return res(true, { id: 'f' + n });
    }
    const m = u.pathname.match(/\/files\/(\w+)$/);
    if (m && method === 'PATCH') {
      files.get(m[1])!.body = String(init.body);
      return res(true, { id: m[1] });
    }
    if (m && method === 'GET' && u.searchParams.get('alt') === 'media') return res(true, files.get(m[1])!.body);
    return res(false, 'unexpected', 404);
  });
  return { files, calls };
}

afterEach(() => setDriveFetch((u, i) => fetch(u, i) as never));

describe('Google Drive backup', () => {
  it('creates the save in the hidden app folder once, then updates that same file', async () => {
    const d = fakeDrive();
    _setToken('t');
    await driveSave({ v: 1, unlocked: 3, gear: [] });
    await driveSave({ v: 1, unlocked: 5, gear: [] });
    expect(d.files.size).toBe(1);
    expect(d.calls.filter((c) => c.startsWith('POST'))).toHaveLength(1);
    expect(d.calls.filter((c) => c.startsWith('PATCH'))).toHaveLength(1);
    const got = await driveLoad();
    expect((got!.save as { unlocked: number }).unlocked).toBe(5);
  });

  it('returns nothing when Drive has no save, and refuses without sign-in', async () => {
    fakeDrive();
    _setToken('t');
    expect(await driveLoad()).toBeNull();
    _setToken('', -1);
    await expect(driveSave({})).rejects.toThrow('not signed in');
  });

  it('restores a whole save on a new device from just the Google account', async () => {
    fakeDrive();
    _setToken('t');
    const a = new Profile(new MemStorage() as unknown as Storage);
    const sa = new CloudSync(a, true, 0);
    a.data.unlocked = 14;
    a.data.gold = 999;
    a.save();
    expect(await sa.driveBackup()).toBe('ok');
    const b = new Profile(new MemStorage() as unknown as Storage);
    const sb = new CloudSync(b, true, 0);
    const myCode = sb.code();
    const r = await sb.drivePeek();
    if (typeof r === 'string') throw new Error(r);
    expect(r.v.sector).toBe(14);
    expect(sb.driveAdopt(r.save)).toBe(true);
    expect(b.data.unlocked).toBe(14);
    expect(b.data.gold).toBe(999);
    expect(b.data.sync?.code).toBe(myCode); // keeps this device's own sync code
  });

  it('spots the in-app browsers where Google sign-in is blocked', () => {
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14) [FB_IAB/MESSENGER;FBAV/480.0]')).toBe(true);
    expect(inAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true);
    expect(inAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile Safari/537.36')).toBe(false);
  });
});
