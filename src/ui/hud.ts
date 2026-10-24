import { BOSSES, MAX_PASSIVE_SLOTS, MAX_SKILL_LEVEL, MAX_WEAPON_SLOTS, PASSIVES, WEAPONS } from '../sim/data';
import type { Game } from '../sim/game';
import { offerDesc, offerTitle } from '../sim/offers';
import type { Offer, PassiveState, WeaponState } from '../sim/types';
import type { Banner } from '../render/fx';
import { skillIcon } from '../render/icons';
import { coin, fmtNum, fmtTime, h } from './dom';

/**
 * HUD values update at most when they change, and the skill row only rebuilds when the build
 * changes, so the DOM stays cheap even at 60fps.
 */
export class Hud {
  el: HTMLElement;
  private xpFill: HTMLElement;
  private lvl: HTMLElement;
  private timer: HTMLElement;
  private kills: HTMLElement;
  private gold: HTMLElement;
  private skills: HTMLElement;
  private boss: HTMLElement;
  private bossName: HTMLElement;
  private bossFill: HTMLElement;
  private banner: HTMLElement;
  private hint: HTMLElement;
  private score: HTMLElement;
  private runFill: HTMLElement;
  private runBest: HTMLElement;
  private runMarks: HTMLElement[] = [];
  private toasts: HTMLElement;
  private cache: Record<string, string> = {};
  private skillKey = '';
  private bannerKey = '';

  constructor(onPause: () => void) {
    this.xpFill = h('div.xpfill');
    this.lvl = h('div.lvl', 'LV 1');
    this.timer = h('span', '00:00');
    this.score = h('b.score-v', '0');
    this.runFill = h('i.rb-fill');
    this.runBest = h('span.rb-best', h('em', 'BEST'));
    this.toasts = h('div.hud-toasts');
    const mark = (pct: number, cls: string, label: string) => {
      const m = h('span.rb-mark.' + cls, { style: { left: `${pct}%` } }, h('span.rb-ico'), h('small', label));
      this.runMarks.push(m);
      return m;
    };
    this.kills = h('span', '0');
    this.gold = h('span', '0');
    this.skills = h('div.skills');
    this.bossName = h('div.name');
    this.bossFill = h('div.fill');
    this.boss = h('div.bossbar', this.bossName, h('div.bar', this.bossFill));
    this.banner = h('div.banner');
    const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    this.hint = h(
      'div.hint',
      touch ? h('div.hand') : null,
      touch ? 'Drag anywhere to move' : 'Move with WASD or arrow keys · or drag with the mouse',
    );
    this.el = h(
      'div.hud',
      h('div.xpbar', this.xpFill),
      this.lvl,
      h(
        'div.row',
        h(
          'div.scorebox',
          h('div.score-l', 'SCORE'),
          this.score,
          h('div.score-sub', h('span', '☠ ', this.kills), h('span', coin('gold'), this.gold)),
        ),
        h('div.timer', this.timer, h('small', ' / 10:00')),
        h('button.pause', { onclick: onPause, 'aria-label': 'Pause' }, 'II'),
      ),
      h(
        'div.runbar',
        h('div.rb-track', this.runFill),
        this.runBest,
        mark(50, 'star.boss', '5:00'),
        mark(80, 'star', '8:00'),
        mark(100, 'win', 'WIN'),
      ),
      this.toasts,
      this.skills,
      this.boss,
      this.banner,
      this.hint,
    );
  }

  private set(key: string, el: HTMLElement, v: string) {
    if (this.cache[key] !== v) {
      this.cache[key] = v;
      el.textContent = v;
    }
  }

  showHint(on: boolean) {
    this.hint.classList.toggle('on', on);
  }

  /** Called at run start with this sector's best survival time (for the BEST marker). */
  startRun(best: number) {
    this.toasts.replaceChildren();
    this.runBest.style.display = best > 5 && best < 600 ? '' : 'none';
    this.runBest.style.left = `${(best / 600) * 100}%`;
    for (const m of this.runMarks) m.classList.remove('hit');
  }

  /** Short encouragement pop (milestones, stars, kill counts). */
  toast(text: string, color: string, big = false) {
    const t = h('div.hud-toast' + (big ? '.big' : ''), { style: { color, borderColor: color } }, text);
    this.toasts.append(t);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild?.remove();
    setTimeout(() => t.classList.add('out'), big ? 2200 : 1400);
    setTimeout(() => t.remove(), big ? 2700 : 1900);
  }

  update(g: Game, banners: Banner[]) {
    const frac = Math.min(1, g.time / 600);
    this.runFill.style.width = `${(frac * 100).toFixed(2)}%`;
    this.runMarks[0].classList.toggle('hit', g.time >= 300);
    this.runMarks[1].classList.toggle('hit', g.time >= 480);
    this.runMarks[2].classList.toggle('hit', g.state === 'won');
    this.set('sc', this.score, g.score().toLocaleString());
    this.xpFill.style.width = `${Math.min(100, (g.xp / g.xpNeed) * 100).toFixed(1)}%`;
    this.set('lvl', this.lvl, `LV ${g.level}`);
    this.set('t', this.timer, fmtTime(Math.min(g.time, 600)));
    this.set('k', this.kills, fmtNum(g.kills));
    this.set('g', this.gold, fmtNum(g.gold));

    const key = g.weapons.map((w) => `${w.id}${w.level}${w.evolved ? 'e' : ''}`).join() + '|' + g.passives.map((p) => p.id + p.level).join();
    if (key !== this.skillKey) {
      this.skillKey = key;
      this.renderSkills(g.weapons, g.passives);
    }

    if (g.boss) {
      this.boss.classList.add('on');
      this.set('bn', this.bossName, BOSSES[g.boss.boss!].name.toUpperCase());
      this.bossFill.style.width = `${Math.max(0, (g.boss.hp / g.boss.maxHp) * 100).toFixed(1)}%`;
    } else this.boss.classList.remove('on');

    const b = banners[banners.length - 1];
    const bk = b ? b.text + b.sub + b.color : '';
    if (bk !== this.bannerKey) {
      this.bannerKey = bk;
      this.banner.replaceChildren();
      if (b) {
        if (b.text) this.banner.append(h('div.t', { style: { color: b.color, textShadow: `0 0 18px ${b.color}, 0 3px 0 #000` } }, b.text));
        if (b.sub) this.banner.append(h('div.s', b.sub));
      }
    }
    this.banner.style.opacity = b ? String(Math.min(1, b.t * 2)) : '0';
  }

  private renderSkills(ws: WeaponState[], ps: PassiveState[]) {
    this.skills.replaceChildren(...loadoutRows(ws, ps, 'hud'));
  }
}

// ------------------------------------------------------------------ loadout rows

/**
 * Two labelled rows of 6 slots: Attack (weapons) and Support (passives). Empty slots are drawn so
 * players always know how many abilities they can still add.
 */
export function loadoutRows(ws: WeaponState[], ps: PassiveState[], variant: 'hud' | 'big') {
  const row = (kind: 'atk' | 'sup', label: string, filled: HTMLElement[]) => {
    const slots: HTMLElement[] = [...filled];
    for (let i = filled.length; i < MAX_WEAPON_SLOTS; i++) slots.push(h('div.sk.empty'));
    return h(
      `div.line.${kind}`,
      h('span.ltag', variant === 'hud' ? h('b', label[0]) : h('b', label), h('small', `${filled.length}/${MAX_WEAPON_SLOTS}`)),
      slots,
    );
  };
  return [
    row(
      'atk',
      'Attack',
      ws.map((w) => h('div.sk', h('img', { src: skillIcon(w.id, w.evolved), alt: WEAPONS[w.id].name }), h('b', w.evolved ? '★' : w.level))),
    ),
    row(
      'sup',
      'Support',
      ps.map((p) => h('div.sk', h('img', { src: skillIcon(p.id), alt: PASSIVES[p.id].name }), h('b', p.level))),
    ),
  ];
}

// ------------------------------------------------------------------ modals

function pips(level: number, prevLevel: number) {
  const out: HTMLElement[] = [];
  for (let i = 1; i <= MAX_SKILL_LEVEL; i++) out.push(h(i <= prevLevel ? 'i.on' : i === level ? 'i.next' : 'i'));
  return h('div.pips', out);
}

function offerIcon(o: Offer) {
  if (o.type === 'weapon' || o.type === 'passive') return skillIcon(o.id);
  return skillIcon(o.type === 'heal' ? 'medkit' : 'magnet');
}

export function offerCard(g: Game, o: Offer, onPick: (() => void) | null) {
  let badge: HTMLElement | null = null;
  if (o.type === 'weapon' && o.isNew) badge = h('span.badge', 'NEW');
  if (o.type === 'passive') {
    const partner = PASSIVES[o.id].partnerOf;
    const w = g.weapons.find((x) => x.id === partner);
    if (w && !w.evolved && o.isNew) badge = h('span.badge.evo', w.level >= MAX_SKILL_LEVEL ? 'EVOLVES ' + WEAPONS[partner].name.toUpperCase() : 'EVO PARTNER');
    else if (o.isNew) badge = h('span.badge', 'NEW');
  }
  if (o.type === 'weapon' && !o.isNew && o.level === MAX_SKILL_LEVEL) {
    const has = g.passives.some((p) => p.id === WEAPONS[o.id].partner);
    badge = h('span.badge.evo', has ? 'MAX · READY TO EVOLVE' : `MAX · NEEDS ${PASSIVES[WEAPONS[o.id].partner].name.toUpperCase()}`);
  }
  const lvl = o.type === 'weapon' || o.type === 'passive' ? pips(o.level, o.level - 1) : null;
  const col = o.type === 'weapon' ? WEAPONS[o.id].color : o.type === 'passive' ? PASSIVES[o.id].color : '#43ffa4';
  return h(
    onPick ? 'button.card' : 'div.card',
    { onclick: onPick ?? undefined, style: { borderColor: col + '88' } },
    badge,
    h('img', { src: offerIcon(o), alt: '' }),
    h('div', h('div.ctag-row', ctag(g, o)), h('div.name', offerTitle(o)), h('div.desc', offerDesc(o)), lvl),
  );
}

/** Category chip: which slot row this upgrade fills, and whether it takes a new slot. */
function ctag(g: Game, o: Offer) {
  if (o.type === 'weapon') {
    const txt = o.isNew ? `ATTACK · new slot ${g.weapons.length + 1}/${MAX_WEAPON_SLOTS}` : `ATTACK · Lv ${o.level}`;
    return h('span.ctag.atk', txt);
  }
  if (o.type === 'passive') {
    const txt = o.isNew ? `SUPPORT · new slot ${g.passives.length + 1}/${MAX_PASSIVE_SLOTS}` : `SUPPORT · Lv ${o.level}`;
    return h('span.ctag.sup', txt);
  }
  return h('span.ctag.misc', 'BONUS');
}

export function levelUpModal(g: Game, onPick: (i: number) => void, onReroll: () => void) {
  const cards = h('div.cards', g.offers.map((o, i) => offerCard(g, o, () => onPick(i))));
  return h(
    'div.modal',
    h('h2', { style: { color: '#5ef2ff', textShadow: '0 0 20px rgba(94,242,255,.6)' } }, 'LEVEL UP'),
    h('div.sub', 'Choose one upgrade'),
    h('div.loadout-big', loadoutRows(g.weapons, g.passives, 'big')),
    cards,
    h(
      'div.actions',
      h('button.btn.small', { onclick: onReroll, disabled: g.rerolls <= 0 }, `↻ Reroll (${g.rerolls})`),
    ),
  );
}

export function chestModal(g: Game, onClose: () => void) {
  const c = g.chest!;
  const items: HTMLElement[] = [];
  for (const id of c.evolutions) {
    const w = WEAPONS[id];
    items.push(
      h(
        'div.card',
        { style: { borderColor: '#ffd34d' } },
        h('span.badge.evo', 'EVOLVED'),
        h('img', { src: skillIcon(id, true), alt: '' }),
        h('div', h('div.name', { style: { color: '#ffd34d' } }, w.evoName), h('div.desc', w.evoDesc)),
      ),
    );
  }
  for (const o of c.upgrades) items.push(offerCard(g, o, null));
  return h(
    'div.modal',
    h('div.chest-box', h('div.lid')),
    h('h2', { style: { color: '#ffd34d' } }, c.big ? 'BOSS CACHE' : 'SUPPLY CHEST'),
    h('div.sub', c.evolutions.length ? 'Your gear transformed.' : 'Free upgrades.'),
    h('div.cards', items),
    h('div.actions', h('button.btn.primary', { onclick: onClose }, 'Collect')),
  );
}

export function pauseModal(
  g: Game,
  settings: { sfx: boolean; music: boolean },
  onResume: () => void,
  onToggle: (k: 'sfx' | 'music') => void,
  onQuit: () => void,
) {
  const toggle = (label: string, key: 'sfx' | 'music') => {
    const sw = h('span.sw' + (settings[key] ? '.on' : ''));
    return h(
      'button.toggle',
      {
        onclick: () => {
          onToggle(key);
          sw.classList.toggle('on');
        },
      },
      label,
      sw,
    );
  };
  return h(
    'div.modal',
    h('h2', 'PAUSED'),
    h('div.sub', `${g.chapter.name} · ${fmtTime(g.time)} · ${fmtNum(g.kills)} kills`),
    h('div.loadout-big', loadoutRows(g.weapons, g.passives, 'big')),
    h('div', { style: { width: 'min(100%, 380px)' } }, toggle('Sound effects', 'sfx'), toggle('Music', 'music')),
    h(
      'div.actions',
      h('button.btn', { onclick: onQuit }, 'Retreat'),
      h('button.btn.primary.big', { onclick: onResume }, 'Resume'),
    ),
    h('div.help', 'Retreating keeps everything you earned so far.'),
  );
}

export function reviveModal(onYes: () => void, onNo: () => void, left: number) {
  return h(
    'div.modal',
    h('h2', { style: { color: '#43ffa4' } }, 'SECOND WIND'),
    h('div.sub', `Get back up with full HP and an EMP blast. (${left} left)`),
    h('div.actions', h('button.btn', { onclick: onNo }, 'Give up'), h('button.btn.cyan.big', { onclick: onYes }, 'Revive')),
  );
}
