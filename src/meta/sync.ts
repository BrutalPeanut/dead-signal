import { cloudGet, cloudList, cloudPull, cloudPush, newSyncCode, normalizeCode, type CloudVersion } from '../net/cloud';
import { normalizeSave, progressOf, type Profile } from './profile';

/**
 * Cloud save. Every device gets a sync code; its save is backed up a few seconds after each
 * change (the server keeps the last 5 versions, spaced at least 2 minutes apart). On launch, if
 * the cloud copy for this code is further along than this device (another device played on), it
 * is adopted. The local save always comes first: the game never waits on the network, and when
 * offline it just keeps playing and backs up later.
 */
export type SyncStatus = 'off' | 'idle' | 'syncing' | 'ok' | 'offline';

export class CloudSync {
  status: SyncStatus = 'idle';
  lastOk = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPushed = '';
  private busy = false;
  private again = false;
  private listeners: (() => void)[] = [];
  /** The cloud is ahead but we couldn't take it yet (mid-run): never overwrite it meanwhile. */
  behind = false;
  /** Backups wait until this device has been compared with the cloud at least once. */
  private checked = false;
  private canAdopt: () => boolean = () => true;
  /** Called whenever a save from the cloud replaced this device's (the app refreshes its UI). */
  onAdopted: () => void = () => {};

  constructor(private p: Profile, readonly enabled: boolean, private delayMs = 4000) {
    if (!enabled) {
      this.status = 'off';
      return;
    }
    this.code();
    p.onChange(() => this.schedule());
  }

  onStatus(fn: () => void) {
    this.listeners.push(fn);
  }
  private set(s: SyncStatus) {
    this.status = s;
    if (s === 'ok') this.lastOk = Date.now();
    for (const l of this.listeners) l();
  }

  /** This device's sync code (created on first use). */
  code(): string {
    const d = this.p.data;
    if (!d.sync?.code) {
      d.sync = { code: newSyncCode() };
      this.p.save();
    }
    return d.sync!.code;
  }

  /**
   * On launch: compare with the cloud. Returns 'adopted' if a further-along save from another
   * device replaced this one (the caller reloads the UI), otherwise backs this device up.
   */
  async startup(canAdopt: () => boolean = () => true): Promise<'adopted' | 'pushed' | 'offline' | 'off' | 'later'> {
    if (!this.enabled) return 'off';
    this.canAdopt = canAdopt;
    this.set('syncing');
    const remote = await cloudPull(this.code());
    if (remote === null) {
      this.set('offline');
      return 'offline';
    }
    this.checked = true;
    if (remote && remote.progress > progressOf(this.p.data) && normalizeSave(remote.save)) {
      if (!canAdopt()) {
        this.behind = true;
        this.set('idle');
        return 'later';
      }
      this.behind = false;
      this.p.adopt(remote.save);
      this.lastPushed = JSON.stringify(this.p.data);
      this.set('ok');
      this.onAdopted();
      return 'adopted';
    }
    this.behind = false;
    return (await this.pushNow()) ? 'pushed' : 'offline';
  }

  private schedule() {
    if (!this.enabled) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.pushNow();
    }, this.delayMs);
  }

  /** Back up now (skipped if nothing changed since the last backup). */
  async pushNow(): Promise<boolean> {
    if (!this.enabled || this.behind) return false;
    if (!this.checked) {
      // never compared with the cloud yet (launched offline): check first, it pushes if we're ahead
      const r = await this.startup(this.canAdopt);
      return r === 'pushed' || r === 'adopted';
    }
    if (this.busy) {
      this.again = true;
      return true;
    }
    const json = JSON.stringify(this.p.data);
    if (json === this.lastPushed && this.status === 'ok') return true;
    this.busy = true;
    this.set('syncing');
    const d = this.p.data;
    const id = await cloudPush(this.code(), d.online.id || null, d.online.name || null, JSON.parse(json), d.unlocked, d.accountLevel, progressOf(d));
    this.busy = false;
    if (id === null) {
      this.set('offline');
      return false;
    }
    this.lastPushed = json;
    this.set('ok');
    if (this.again) {
      this.again = false;
      return this.pushNow();
    }
    return true;
  }

  /** Look up another device's code: its newest save, 'bad' for a mistyped code, 'none' if empty. */
  async peek(raw: string): Promise<{ code: string; v: CloudVersion } | 'bad' | 'none' | 'offline'> {
    const code = normalizeCode(raw);
    if (!code) return 'bad';
    const v = await cloudPull(code);
    if (v === null) return 'offline';
    if (!v || !normalizeSave(v.save)) return 'none';
    return { code, v };
  }

  /** Switch this device to another code and take its save. */
  useCode(code: string, v: CloudVersion): boolean {
    if (!this.p.adopt(v.save, code)) return false;
    this.behind = false;
    this.lastPushed = JSON.stringify(this.p.data);
    this.set('ok');
    return true;
  }

  /** Codes this device used before a Reset (to undo it). */
  previousCodes() {
    return this.p.previousCodes();
  }

  /** Should we remind the player to keep a copy of their code? After Sector 2, every 2 days until they confirm. */
  needsReminder(now = Date.now()) {
    const s = this.p.data.sync;
    if (!this.enabled || !s || s.saved) return false;
    if (this.p.data.unlocked < 2) return false;
    return now - (s.nagAt ?? 0) > 2 * 86_400_000;
  }
  markReminded(saved: boolean, now = Date.now()) {
    const s = this.p.data.sync;
    if (!s) return;
    if (saved) s.saved = true;
    s.nagAt = now;
    this.p.save();
  }

  backups() {
    return cloudList(this.code());
  }

  /** Roll this device back to one of the kept versions (it becomes the newest backup). */
  async restore(id: number): Promise<boolean> {
    const v = await cloudGet(this.code(), id);
    if (!v || !this.p.adopt(v.save)) return false;
    this.lastPushed = '';
    await this.pushNow();
    return true;
  }

  /** After "Reset progress": a brand-new code, so the old backups stay safe and can't sync back. */
  fresh() {
    if (!this.enabled) return;
    this.behind = false;
    this.p.data.sync = { code: newSyncCode() };
    this.p.save();
  }
}
