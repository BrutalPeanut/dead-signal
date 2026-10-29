import type { CloudSync } from '../meta/sync';
import type { CloudVersion } from '../net/cloud';
import { prettyCode } from '../net/cloud';
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
