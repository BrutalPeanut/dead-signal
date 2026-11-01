import { GEAR, RARITIES, RARITY_COLORS } from '../meta/gear';
import type { RunRewards } from '../meta/profile';
import type { RunResult } from '../sim/game';
import { gearIcon, skillIcon } from '../render/icons';
import { BOSSES, RUN_LENGTH, WEAPONS, starTimes, type BossKind } from '../sim/data';
import { DAILY_TIERS } from '../sim/modes';

/** "What got me, and what do I do about it" — one line, shown on a loss. */
export function deathTip(src?: string, boss?: string): [string, string] | null {
  if (!src) return null;
  const bn = boss ? BOSSES[boss as BossKind]?.name ?? 'The boss' : 'The boss';
  const T: Record<string, [string, string]> = {
    'boss-shot': [`${bn}'s spores`, 'Strafe sideways through the gaps in the fan instead of running straight back.'],
    'boss-aoe': [`${bn}'s strike zone`, 'Red circles land a moment later: step out as soon as they appear.'],
    'boss-line': [`${bn}'s charge`, 'The red lane shows where it will charge. Sidestep, then punish it.'],
    'boss-laser': [`${bn}'s laser`, 'Circle around the boss in the same direction the beam sweeps.'],
    'boss-touch': [bn, 'Bosses hit hard up close. Keep a little distance and let your weapons work.'],
    brute: ['a Brute', 'Brutes hit hardest. Kite them in wide circles rather than standing your ground.'],
    spitter: ['a Spitter', 'Keep moving and the acid lands where you were.'],
    shot: ['Spitter acid', 'Keep moving and the acid lands where you were.'],
    bloater: ['a Bloater', 'Bloaters burst when they die. Pop them at range.'],
    'bloater-pop': ['a Bloater burst', 'Bloaters burst when they die. Pop them at range.'],
    runner: ['Runners', 'Runners are fast but fragile. Area weapons like Arc or Napalm clear them.'],
    crawler: ['Crawlers', 'Crawlers swarm low. Blades and Plasma Field shred them.'],
    shambler: ['the horde', 'Move in big loops so the horde trails behind you in one clump.'],
  };
  return T[src] ?? ['the horde', 'Move in big loops so the horde trails behind you in one clump.'];
}
import { coin, controlsPicker, fmtNum, fmtTime, h } from './dom';

export function resultsModal(
  r: RunResult,
  rw: RunRewards,
  sectorName: string,
  onContinue: () => void,
  powerUp: string | null = null,
  onPowerUp: () => void = onContinue,
  onDoubleAd?: () => Promise<boolean>,
) {
  const title = rw.mode === 'endless' ? (rw.newBest ? 'NEW RECORD' : 'SIGNAL LOST') : rw.mode === 'daily' ? (r.won ? 'CHALLENGE CLEARED' : 'CHALLENGE OVER') : r.won ? 'SECTOR CLEARED' : 'SIGNAL LOST';
  const color = r.won || (rw.mode === 'endless' && rw.newBest) ? '#43ffa4' : '#ff3b5c';
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
  // stars: earned before (dim gold), earned this run (bright + "NEW"), not yet (grey)
  const LEN = r.runLength ?? RUN_LENGTH;
  const [S1, S2] = starTimes(LEN);
  const starDefs: [number, string][] = [
    [1, `Survive ${fmtTime(S1).replace(/^0/, '')}`],
    [2, `Survive ${fmtTime(S2).replace(/^0/, '')}`],
    [4, 'Clear'],
  ];
  const stars = rw.mode === 'daily'
    ? h(
        'div.res-stars',
        DAILY_TIERS.map((t) => {
          const has = r.score! >= t.score || (rw.tiersNew ?? []).includes(t.name);
          const isNew = (rw.tiersNew ?? []).includes(t.name);
          return h('div.rs' + (has ? '.on' : '') + (isNew ? '.new' : ''), { style: { '--tc': t.color } as any }, h('i'), h('small', `${t.name} ${Math.round(t.score / 1000)}K`), isNew ? h('b', 'NEW') : null);
        }),
      )
    : rw.mode === 'endless'
    ? null
    : h(
    'div.res-stars',
    starDefs.map(([bit, label]) => {
      const had = !!(rw.starsBefore & bit);
      const has = !!(rw.starsAfter & bit);
      return h('div.rs' + (has ? '.on' : '') + (has && !had ? '.new' : ''), h('i'), h('small', label), has && !had ? h('b', 'NEW') : null);
    }),
  );
  // the single most useful "what next" line
  let next = '';
  if (rw.mode === 'daily') {
    const nt = DAILY_TIERS.find((t) => (r.score ?? 0) < t.score);
    next = nt ? `${(nt.score - (r.score ?? 0)).toLocaleString()} points from ${nt.name}. Same run all day — try again!` : 'Gold tier! Come back tomorrow for a new challenge.';
  } else if (rw.mode === 'endless') next = rw.newBest ? 'New personal best!' : `Best score ${rw.prevBest.toLocaleString()}. Push a little further!`;
  else if (r.won) next = rw.unlockedSector ? 'Next sector unlocked. Keep the streak going!' : 'Cleared again. Push your score higher!';
  else if (r.time < S1) next = `${fmtTime(S1 - r.time)} short of your first star. ${powerUp ? 'Go again!' : 'Upgrade in the Armory, then go again!'}`;
  else if (r.time < S2) next = `${fmtTime(S2 - r.time)} short of the ${fmtTime(S2).replace(/^0/, '')} star!`;
  else next = `So close: ${fmtTime(LEN - r.time)} from clearing the sector!`;
  if (rw.levelsGained) next += ` Account level up!`;
  if (rw.newCharacter) next += ` New courier unlocked: ${rw.newCharacter}! (Armory)`;
  if (rw.newLoadout) next += ` ${rw.newLoadout}`;
  return h(
    'div.modal.results',
    h('h2', { style: { color, textShadow: `0 0 24px ${color}` } }, title),
    h('div.sub', sectorName),
    h(
      'div.res-score',
      h('small', 'SCORE'),
      h('b', rw.score.toLocaleString()),
      rw.newBest ? h('span.best-badge', rw.prevBest ? 'NEW BEST!' : 'FIRST SCORE!') : h('span.prev', `Best ${rw.prevBest.toLocaleString()}`),
    ),
    stars,
    rw.newGun
      ? h(
          'div.new-gun',
          { style: { borderColor: WEAPONS[rw.newGun].color } },
          h('img', { src: skillIcon(rw.newGun), alt: '' }),
          h('div', h('small', 'NEW GUN UNLOCKED'), h('b', { style: { color: WEAPONS[rw.newGun].color } }, WEAPONS[rw.newGun].name), h('span', 'Equipped for your next run · swap any time in the Armory')),
        )
      : null,
    h(
      'div.stats',
      h('div', h('b', fmtTime(r.time)), h('span', 'Survived')),
      h('div', h('b', fmtNum(r.kills)), h('span', 'Kills')),
      h('div', h('b', r.level), h('span', 'Level')),
    ),
    h('div.rewards', rewards),
    onDoubleAd && rw.gold > 0
      ? (() => {
          const btn = h('button.btn.cyan.ad-btn', { style: { margin: '8px auto 0' } }, h('span.ad-play', '▶'), `Watch ad · Double rewards (+${fmtNum(rw.gold)} gold${rw.scrap ? `, +${rw.scrap} scrap` : ''})`) as HTMLButtonElement;
          btn.onclick = () =>
            onDoubleAd().then((ok) => {
              if (!ok) return;
              btn.disabled = true;
              btn.replaceChildren(`✓ Rewards doubled: +${fmtNum(rw.gold * 2)} gold`);
            });
          return h('div', { style: { textAlign: 'center' } }, btn);
        })()
      : null,
    h('div.next-goal', next),
    (() => {
      const tip = r.won ? null : deathTip(r.killedBy, r.killedByBoss);
      return tip ? h('div.death-tip', h('small', `Downed by ${tip[0]}`), h('span', tip[1])) : null;
    })(),
    powerUp
      ? h(
          'div.res-powerup',
          h('small', 'Power up before your next try'),
          h('button.btn.cyan.big', { onclick: onPowerUp }, '⚡ Power Up'),
          h('div.rp-hint', powerUp),
          h('button.btn.ghost.small', { onclick: onContinue }, 'Continue'),
        )
      : h('div.actions', h('button.btn.primary.big', { onclick: onContinue }, 'Continue')),
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
      h('p', 'Move with one thumb. Your weapons fire on their own. Grab the green shards to level up, and survive five minutes per sector.'),
      h('p', 'Max a weapon and pick up its partner gear to ', h('span.hl', 'evolve'), ' it from a chest.'),
    ),
    h('div.actions', h('button.btn.primary.big', { onclick: onGo }, "Let's go")),
  );
}

export function settingsModal(
  s: { sfx: boolean; music: boolean; haptics: boolean; controls?: string },
  onToggle: (k: 'sfx' | 'music' | 'haptics') => void,
  onReset: () => void,
  onClose: () => void,
  onControls: (m: 'drag' | 'left' | 'right') => void = () => {},
  graphics?: { on3d: boolean; toggle: () => void },
  cloud?: { status: string; open: () => void },
  stats?: { on: boolean; toggle: () => void },
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
      reset.textContent = cloud ? 'Tap again to erase (undo later in Cloud save)' : 'Tap again to erase everything';
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
      graphics
        ? h('button.toggle', { onclick: graphics.toggle }, h('span', { style: { textAlign: 'left' } }, '3D graphics', h('small', { style: { display: 'block', fontSize: '11px', opacity: 0.65, fontWeight: 400 } }, graphics.on3d ? 'On · turn off for the classic 2D art' : 'Off · classic 2D art')), h('span.sw' + (graphics.on3d ? '.on' : '')))
        : null,
      cloud
        ? h('button.toggle', { onclick: cloud.open }, h('span', { style: { textAlign: 'left' } }, 'Cloud save', h('small', { style: { display: 'block', fontSize: '11px', opacity: 0.65, fontWeight: 400 } }, `${cloud.status} · play on any device`)), h('span.chev', '›'))
        : null,
      stats
        ? (() => {
            const sw = h('span.sw' + (stats.on ? '.on' : ''));
            return h('button.toggle', { onclick: () => (stats.toggle(), sw.classList.toggle('on')) }, h('span', { style: { textAlign: 'left' } }, 'Share anonymous stats', h('small', { style: { display: 'block', fontSize: '11px', opacity: 0.65, fontWeight: 400 } }, 'Helps balance the game · no names, no ads tracking')), sw);
          })()
        : null,
      controlsPicker(s.controls ?? 'drag', onControls),
      h('div', { style: { textAlign: 'center' } }, reset),
      h('div.help', `Dead Signal · v${__APP_VERSION__.replace(/\.0$/, '')} · ${cloud ? 'progress backs up to the cloud' : 'progress is saved on this device'}`, ' · ', h('a', { href: './privacy.html', target: '_blank', rel: 'noopener', style: { color: 'inherit' } }, 'Privacy')),
      h('button.btn', { style: { width: '100%', marginTop: '12px' }, onclick: onClose }, 'Done'),
    ),
  );
}
