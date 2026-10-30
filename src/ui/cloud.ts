import type { CloudSync } from '../meta/sync';
import type { CloudVersion } from '../net/cloud';
import { prettyCode } from '../net/cloud';
import { driveConfigured, inAppBrowser } from '../net/gdrive';
import { h, toast } from './dom';

const ago = (iso: string | number) => {
  const s = Math.max(0, (Date.now() - (typeof iso === 'number' ? iso : Date.parse(iso))) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};
const label = (v: CloudVersion) => `Sector ${v.sector + 1} · Lv ${v.level}`;

export function statusText(s: CloudSync) {
  switch (s.status) {
    case 'off':
      return 'Off for test saves';
    case 'syncing':
      return 'Backing up…';
    case 'ok':
      return `Backed up ${ago(s.lastOk)}`;
    case 'offline':
      return 'Offline · will back up when connected';
    default:
      return 'Waiting to back up';
  }
}

/**
 * Cloud save sheet: this device's sync code, taking progress from another device's code, and
 * restoring one of the last five backups. `onReplaced` reloads the game after a save is swapped in.
 */
export function cloudModal(sync: CloudSync, onClose: () => void, onReplaced: () => void) {
  const body = h('div');
  const sheet = h('div.sheet.cloud', { onclick: (e: Event) => e.stopPropagation() });
  const el = h('div.modal', { onclick: onClose }, sheet);

  const main = () => {
    const code = sync.code();
    const status = h('div.help', { style: { marginTop: '4px' } }, statusText(sync));
    sync.onStatus(() => (status.textContent = statusText(sync)));
    const copy = h('button.btn.small.cyan', 'Copy');
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(prettyCode(code));
        toast('Sync code copied', '#43ffa4');
      } catch {
        toast(prettyCode(code), '#5ef2ff');
      }
    };
    body.replaceChildren(
      h('div.help', { style: { marginTop: 0 } }, 'Your progress backs up automatically. To play on another phone, browser or PC, enter this code there.'),
      h('div.sync-code', h('b', prettyCode(code)), copy),
      status,
      h('button.btn', { style: { width: '100%', marginTop: '14px' }, onclick: enter }, 'Use a code from another device'),
      h('button.btn', { style: { width: '100%', marginTop: '8px' }, onclick: backups }, 'Restore a backup'),
      ...(sync.previousCodes().length ? [h('button.btn', { style: { width: '100%', marginTop: '8px' }, onclick: undoReset }, 'Undo a reset')] : []),
      ...driveSection(),
      h('div.help', { style: { marginTop: '12px' } }, 'Lost your code? Email deadsignalsupportchannel@gmail.com with your call sign and roughly how far you got, and we can find your save.'),
      h('button.btn', { style: { width: '100%', marginTop: '14px' }, onclick: onClose }, 'Done'),
    );
  };

  const confirmReplace = (title: string, v: CloudVersion, go: () => Promise<boolean> | boolean) => {
    const btn = h('button.btn.primary', { style: { width: '100%' } }, 'Replace this device’s progress');
    btn.onclick = async () => {
      btn.setAttribute('disabled', '');
      if (await go()) onReplaced();
      else {
        toast('Couldn’t load that save. Try again', '#ff5470');
        btn.removeAttribute('disabled');
      }
    };
    body.replaceChildren(
      h('div.sync-found', h('small', title), h('b', label(v)), h('span', `Saved ${ago(v.updated_at)}`)),
      h('div.help', 'This device’s current progress will be replaced. Your settings stay as they are.'),
      btn,
      h('button.btn', { style: { width: '100%', marginTop: '8px' }, onclick: main }, 'Cancel'),
    );
  };

  const enter = () => {
    const input = h('input.sync-input', { placeholder: 'XXXXX-XXXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: '14' }) as HTMLInputElement;
    const msg = h('div.help', '');
    const go = h('button.btn.primary', { style: { width: '100%', marginTop: '10px' } }, 'Find my save');
    go.onclick = async () => {
      msg.textContent = 'Looking…';
      const r = await sync.peek(input.value);
      if (r === 'bad') msg.textContent = 'That doesn’t look like a sync code (10 letters and numbers).';
      else if (r === 'offline') msg.textContent = 'Can’t reach the server right now. Check your connection.';
      else if (r === 'none') msg.textContent = 'No save found for that code.';
      else if (r.code === sync.code()) msg.textContent = 'That’s this device’s own code.';
      else confirmReplace('Found a save', r.v, () => sync.useCode(r.code, r.v));
    };
    body.replaceChildren(
      h('div.help', { style: { marginTop: 0 } }, 'Open Settings → Cloud save on your other device to see its code.'),
      input,
      go,
      msg,
      h('button.btn', { style: { width: '100%', marginTop: '8px' }, onclick: main }, 'Back'),
    );
    setTimeout(() => input.focus(), 50);
  };

  /** Google Drive: an extra backup in the player's own Drive, recoverable with just their Google account. */
  const driveSection = (): HTMLElement[] => {
    if (!driveConfigured()) return [];
    const head = h('div.sync-sub', 'Google Drive backup');
    if (inAppBrowser())
      return [
        head,
        h('div.help', { style: { marginTop: '4px' } }, 'Google sign-in doesn’t work inside Messenger or Facebook. Open deadsignal.info in Chrome to back up to your Google Drive.'),
        h('button.btn.small', { style: { width: '100%' }, onclick: () => navigator.clipboard?.writeText('https://deadsignal.info').then(() => toast('Link copied: paste it in Chrome', '#43ffa4')) }, 'Copy game link'),
      ];
    const at = sync.driveAt();
    const note = h('div.help', { style: { marginTop: '4px' } }, at ? `Last backed up to Drive ${ago(at)}. Backs up again after each run while you’re signed in.` : 'Keep a copy in your own Google Drive: restore it on any phone or PC by signing in, no code needed.');
    const up = h('button.btn', { style: { width: '100%', marginTop: '6px' } }, 'Back up to Google Drive');
    up.onclick = async () => {
      up.setAttribute('disabled', '');
      up.textContent = 'Backing up…';
      const r = await sync.driveBackup();
      toast(r === 'ok' ? 'Backed up to your Google Drive' : r === 'denied' ? 'Google sign-in was cancelled' : 'Couldn’t reach Google Drive. Try again', r === 'ok' ? '#43ffa4' : '#ff5470');
      main();
    };
    const down = h('button.btn', { style: { width: '100%', marginTop: '8px' } }, 'Restore from Google Drive');
    down.onclick = async () => {
      down.setAttribute('disabled', '');
      down.textContent = 'Looking…';
      const r = await sync.drivePeek();
      if (r === 'none') toast('No Dead Signal save in this Google Drive yet', '#8d97ab');
      else if (r === 'denied') toast('Google sign-in was cancelled', '#ff5470');
      else if (r === 'error') toast('Couldn’t reach Google Drive. Try again', '#ff5470');
      else return confirmReplace('Found in Google Drive', r.v, () => sync.driveAdopt(r.save));
      main();
    };
    return [head, note, up, down];
  };

  const undoReset = async () => {
    body.replaceChildren(h('div.help', 'Looking up your previous saves…'));
    const rows: HTMLElement[] = [];
    for (const c of sync.previousCodes()) {
      const r = await sync.peek(c);
      if (typeof r !== 'string') rows.push(h('button.sync-row', { onclick: () => confirmReplace('Save from before the reset', r.v, () => sync.useCode(r.code, r.v)) }, h('b', label(r.v)), h('span', prettyCode(c))));
    }
    body.replaceChildren(
      h('div.help', { style: { marginTop: 0 } }, rows.length ? 'Saves this device had before Reset progress. Pick one to bring it back.' : 'No earlier saves found (or the server can’t be reached).'),
      ...rows,
      h('button.btn', { style: { width: '100%', marginTop: '10px' }, onclick: main }, 'Back'),
    );
  };

  const backups = async () => {
    body.replaceChildren(h('div.help', 'Loading backups…'));
    const list = await sync.backups();
    if (list === null) {
      body.replaceChildren(h('div.help', 'Can’t reach the server right now.'), h('button.btn', { style: { width: '100%' }, onclick: main }, 'Back'));
      return;
    }
    body.replaceChildren(
      h('div.help', { style: { marginTop: 0 } }, list.length ? 'The last few backups of this device’s code. Pick one to roll back to.' : 'No backups yet.'),
      ...list.map((v, i) =>
        h(
          'button.sync-row',
          { onclick: () => confirmReplace(i === 0 ? 'Newest backup' : 'Older backup', v, () => sync.restore(v.id)) },
          h('b', label(v)),
          h('span', ago(v.updated_at)),
        ),
      ),
      h('button.btn', { style: { width: '100%', marginTop: '10px' }, onclick: main }, 'Back'),
    );
  };

  sheet.append(h('h2', { style: { fontSize: '22px' } }, 'Cloud save'), body);
  main();
  return el;
}

/**
 * "Protect your progress": shown after Sector 2 until the player confirms they kept their code.
 * iPhones wipe a website's data after ~7 days away, and then only the code brings a save back.
 */
export function protectModal(sync: CloudSync, onDone: () => void) {
  const code = prettyCode(sync.code());
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;
  const text = `My Dead Signal sync code: ${code}\nPlay: https://deadsignal.info (Settings → Cloud save → Use a code)`;
  const done = (saved: boolean) => {
    sync.markReminded(saved);
    onDone();
  };
  const share = h('button.btn.primary', { style: { width: '100%', marginTop: '14px' } }, 'Send it to myself');
  share.onclick = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Dead Signal sync code', text });
        toast('Saved! Keep that message', '#43ffa4');
        return done(true);
      }
    } catch {
      return; // share sheet closed
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied: paste it somewhere safe', '#43ffa4');
    } catch {
      toast(code, '#5ef2ff');
    }
  };
  return h(
    'div.modal',
    h(
      'div.sheet.cloud',
      h('h2', { style: { fontSize: '22px' } }, 'Protect your progress'),
      h('div.help', { style: { marginTop: 0 } }, 'Your progress backs up to the cloud automatically. If this browser ever clears its data, or you switch phones, this code brings everything back:'),
      h('div.sync-code', h('b', code)),
      share,
      ios && !standalone ? h('div.help', '📱 iPhone tip: tap Share → Add to Home Screen and play from there. iPhones keep home-screen games’ data safe.') : null,
      h('button.btn', { style: { width: '100%', marginTop: '10px' }, onclick: () => done(true) }, 'I’ve saved it'),
      h('button.btn.small', { style: { width: '100%', marginTop: '8px', opacity: 0.7 }, onclick: () => done(false) }, 'Remind me later'),
    ),
  );
}
