import { GEAR, RARITIES, RARITY_COLORS } from '../meta/gear';
import type { RunRewards } from '../meta/profile';
import type { RunResult } from '../sim/game';
import { gearIcon } from '../render/icons';
import { coin, fmtNum, fmtTime, h } from './dom';

export function resultsModal(r: RunResult, rw: RunRewards, sectorName: string, onContinue: () => void) {
  const title = r.won ? 'SECTOR CLEARED' : 'SIGNAL LOST';
  const color = r.won ? '#43ffa4' : '#ff3b5c';
  const rewards: HTMLElement[] = [
    h('div.reward', coin('gold'), `+${fmtNum(rw.gold)}`),
    h('div.reward', coin('xp'), `+${fmtNum(rw.xp)} XP`),
    h('div.reward', coin('scrap'), `+${rw.scrap}`),
  ];
  if (rw.keys) rewards.push(h('div.reward', coin('key'), `+${rw.keys}`));
  for (const it of rw.items) {
    const d = GEAR[it.def];
    rewards.push(
      h(
        'div.reward',
        { style: { borderColor: RARITY_COLORS[it.rarity] } },
        h('img', { src: gearIcon(d.slot, RARITY_COLORS[it.rarity], it.def), style: { width: '26px', height: '26px' } }),
        h('span', { style: { color: RARITY_COLORS[it.rarity], fontSize: '12px' } }, `${RARITIES[it.rarity]} ${d.name}`),
      ),
    );
  }
  const notes: string[] = [];
  if (rw.firstClear) notes.push('First clear bonus!');
  if (rw.unlockedSector) notes.push('Next sector unlocked.');
  if (rw.levelsGained) notes.push(`Account level up! (+${rw.levelsGained})`);
  if (!r.won && r.time < 300) notes.push('Tip: upgrade gear in the Armory and buy talents, then try again.');
  return h(
    'div.modal.results',
    h('h2', { style: { color, textShadow: `0 0 24px ${color}` } }, title),
    h('div.sub', sectorName),
    h(
      'div.stats',
      h('div', h('b', fmtTime(r.time)), h('span', 'Survived')),
      h('div', h('b', fmtNum(r.kills)), h('span', 'Kills')),
      h('div', h('b', r.level), h('span', 'Level')),
    ),
    h('div.rewards', rewards),
    notes.length ? h('div.help', { style: { color: '#cfd7e6', fontSize: '13px' } }, notes.join(' ')) : null,
    h('div.actions', h('button.btn.primary.big', { onclick: onContinue }, 'Continue')),
  );
}

export function introModal(onGo: () => void) {
  return h(
    'div.modal',
    h('h2', { style: { color: '#ff7ae6' } }, '03:14 AM'),
    h(
      'div.intro',
      h('p', 'A broadcast went out on every frequency at once. Everyone who heard it ', h('span.hl', 'changed'), '.'),
      h('p', "You're a courier. Your rig was tuned to a dead channel — so you're still you."),
      h('p', 'Move with one thumb. Your weapons fire on their own. Grab the green shards to level up, and survive ten minutes per sector.'),
      h('p', 'Max a weapon and pick up its partner gear to ', h('span.hl', 'evolve'), ' it from a chest.'),
    ),
    h('div.actions', h('button.btn.primary.big', { onclick: onGo }, "Let's go")),
  );
}

export function settingsModal(
  s: { sfx: boolean; music: boolean; haptics: boolean },
  onToggle: (k: 'sfx' | 'music' | 'haptics') => void,
  onReset: () => void,
  onClose: () => void,
) {
  const toggle = (label: string, key: 'sfx' | 'music' | 'haptics') => {
    const sw = h('span.sw' + (s[key] ? '.on' : ''));
    return h('button.toggle', { onclick: () => (onToggle(key), sw.classList.toggle('on')) }, label, sw);
  };
  let armed = false;
  const reset = h('button.btn.small', { style: { marginTop: '18px', color: '#ff3b5c' } }, 'Reset progress');
  reset.onclick = () => {
    if (!armed) {
      armed = true;
      reset.textContent = 'Tap again to erase everything';
      return;
    }
    onReset();
  };
  return h(
    'div.modal',
    { onclick: onClose },
    h(
      'div.sheet',
      { onclick: (e: Event) => e.stopPropagation() },
      h('h2', { style: { fontSize: '22px' } }, 'Settings'),
      toggle('Sound effects', 'sfx'),
      toggle('Music', 'music'),
      toggle('Vibration', 'haptics'),
      h('div', { style: { textAlign: 'center' } }, reset),
      h('div.help', 'Dead Signal · v0.1 · progress is saved on this device'),
      h('button.btn', { style: { width: '100%', marginTop: '12px' }, onclick: onClose }, 'Done'),
    ),
  );
}
