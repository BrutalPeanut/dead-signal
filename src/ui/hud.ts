import { BOSSES, RUN_LENGTH, starTimes, MAX_PASSIVE_SLOTS, MAX_SKILL_LEVEL, MAX_WEAPON_SLOTS, PASSIVES, WEAPONS } from '../sim/data';
import type { Game } from '../sim/game';
import { offerDesc, offerTitle } from '../sim/offers';
import type { Offer, PassiveState, WeaponState } from '../sim/types';
import type { Banner } from '../render/fx';
import { skillIcon } from '../render/icons';
import { coin, controlsPicker, fmtNum, fmtTime, h } from './dom';

/**
 * HUD values update at most when they change, and the skill row only rebuilds when the build
 * changes, so the DOM stays cheap even at 60fps.
 */
export class Hud {
  private timerSub = h('small', '');
  private dailyBest = 0;
  private endlessBest = 0;
  private beatShown = false;
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
        h('div.timer', this.timer, this.timerSub),
        h('button.pause', { onclick: onPause, 'aria-label': 'Pause' }, 'II'),
      ),
      h(
        'div.runbar',
        h('div.rb-track', this.runFill),
        this.runBest,
        mark(50, 'star.boss', '2:30'),
        mark(80, 'star', '4:00'),
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

  setHintText(t: string) {
    const last = this.hint.lastChild;
    if (last && last.nodeType === 3) last.textContent = t;
  }

  showHint(on: boolean) {
    this.hint.classList.toggle('on', on);
  }

  /** Called at run start with this sector's best survival time (for the BEST marker). */
  private mode: 'campaign' | 'daily' | 'endless' = 'campaign';

  private len = RUN_LENGTH;

  startRun(best: number, mode: 'campaign' | 'daily' | 'endless' = 'campaign', bestScore = 0, len = RUN_LENGTH) {
    this.mode = mode;
    this.len = len;
    const [s1, s2] = starTimes(len);
    this.runMarks[0].querySelector('small')!.textContent = fmtTime(s1).replace(/^0/, '');
    this.runMarks[1].querySelector('small')!.textContent = fmtTime(s2).replace(/^0/, '');
    this.el.classList.toggle('m-daily', mode === 'daily');
    this.el.classList.toggle('m-endless', mode === 'endless');
    this.timerSub.textContent = mode === 'endless' ? (best > 0 ? ` BEST ${fmtTime(best)}` : '') : ` / ${fmtTime(len)}`;
    this.dailyBest = bestScore;
    this.endlessBest = mode === 'endless' ? best : 0;
    this.beatShown = false;
    this.toasts.replaceChildren();
    this.runBest.style.display = mode === 'campaign' && best > 5 && best < len ? '' : 'none';
    this.runBest.style.left = `${(best / len) * 100}%`;
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
    const frac = Math.min(1, g.time / this.len);
    const [s1, s2] = starTimes(this.len);
    this.runFill.style.width = `${(frac * 100).toFixed(2)}%`;
    this.runMarks[0].classList.toggle('hit', g.time >= s1);
    this.runMarks[1].classList.toggle('hit', g.time >= s2);
    this.runMarks[2].classList.toggle('hit', g.state === 'won');
    this.set('sc', this.score, g.score().toLocaleString());
    this.xpFill.style.width = `${Math.min(100, (g.xp / g.xpNeed) * 100).toFixed(1)}%`;
    this.set('lvl', this.lvl, `LV ${g.level}`);
    this.set('t', this.timer, fmtTime(this.mode === 'endless' ? g.time : Math.min(g.time, this.len)));
    this.set('k', this.kills, fmtNum(g.kills));
    if (!this.beatShown && ((this.mode === 'daily' && this.dailyBest > 0 && g.score() > this.dailyBest) || (this.mode === 'endless' && this.endlessBest > 30 && g.time > this.endlessBest))) {
      this.beatShown = true;
      this.toast(this.mode === 'daily' ? "NEW BEST TODAY!" : 'NEW BEST TIME!', '#ffd34d', true);
    }
    this.set('g', this.gold, fmtNum(g.gold));

    const key = g.weapons.map((w) => `${w.id}${w.level}${w.evolved ? 'e' : ''}`).join() + '|' + g.passives.map((p) => p.id + p.level).join() + '|' + g.loadout.maxW;
    if (key !== this.skillKey) {
      this.skillKey = key;
      this.renderSkills(g.weapons, g.passives, g.loadout.maxW, g.loadout.maxP);
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

  private renderSkills(ws: WeaponState[], ps: PassiveState[], maxW = MAX_WEAPON_SLOTS, maxP = MAX_PASSIVE_SLOTS) {
    this.skills.replaceChildren(...loadoutRows(ws, ps, 'hud', maxW, maxP));
  }
}

// ------------------------------------------------------------------ loadout rows

/**
 * Two labelled rows of 6 slots: Attack (weapons) and Support (passives). Empty slots are drawn so
 * players always know how many abilities they can still add.
 */
export function loadoutRows(ws: WeaponState[], ps: PassiveState[], variant: 'hud' | 'big', maxW = MAX_WEAPON_SLOTS, maxP = MAX_PASSIVE_SLOTS) {
  const row = (kind: 'atk' | 'sup', label: string, filled: HTMLElement[]) => {
    const max = kind === 'atk' ? maxW : maxP;
    const slots: HTMLElement[] = [...filled];
    for (let i = filled.length; i < max; i++) slots.push(h('div.sk.empty'));
    return h(
      `div.line.${kind}`,
      h('span.ltag', variant === 'hud' ? h('b', label[0]) : h('b', label), h('small', `${filled.length}/${max}`)),
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
    if (w && !w.evolved && o.isNew) badge = h('span.badge.evo', w.level >= MAX_SKILL_LEVEL ? 'EVOLVES ' + WEAPONS[partner].name.toUpperCase() : '🔗 PAIRS WITH YOUR ' + WEAPONS[partner].name.toUpperCase());
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
    h('div', h('div.ctag-row', ctag(g, o)), h('div.name', offerTitle(o)), h('div.desc', offerDesc(o)), combo(g, o), lvl),
  );
}

/**
 * The evolution pairing spelled out: every weapon has one support item; max the weapon while
 * holding its partner and the next chest evolves it. Shows exactly what this card pairs with.
 */
function combo(g: Game, o: Offer) {
  if (o.type === 'passive') {
    const wid = PASSIVES[o.id].partnerOf;
    const wd = WEAPONS[wid];
    const w = g.weapons.find((x) => x.id === wid);
    let txt: string;
    let cls = '';
    if (w?.evolved) return null;
    if (!w) txt = `Pairs with ${wd.name} (you don't have it yet) to evolve it into ${wd.evoName}`;
    else if (w.level >= MAX_SKILL_LEVEL) {
      txt = `Pairs with your maxed ${wd.name}: your next chest evolves it into ${wd.evoName}!`;
      cls = '.hot';
    } else {
      txt = `Pairs with your ${wd.name} (Lv ${w.level}/${MAX_SKILL_LEVEL}). Max it while holding this to evolve it into ${wd.evoName}`;
      cls = '.warm';
    }
    return h('div.combo' + cls, h('i', '🔗'), txt);
  }
  if (o.type === 'weapon') {
    const wd = WEAPONS[o.id];
    if (g.weapons.find((x) => x.id === o.id)?.evolved) return null;
    const has = g.passives.some((p) => p.id === wd.partner);
    const pname = PASSIVES[wd.partner].name;
    return h(
      'div.combo' + (has ? '.warm' : ''),
      h('i', '🔗'),
      has ? `You have its partner ${pname}. Max this to evolve it into ${wd.evoName}` : `Pairs with ${pname} (support): max both to evolve into ${wd.evoName}`,
    );
  }
  return null;
}

/** Category chip: which slot row this upgrade fills, and whether it takes a new slot. */
function ctag(g: Game, o: Offer) {
  if (o.type === 'weapon') {
    const txt = o.isNew ? `ATTACK · new slot ${g.weapons.length + 1}/${g.loadout.maxW}` : `ATTACK · Lv ${o.level}`;
    return h('span.ctag.atk', txt);
  }
  if (o.type === 'passive') {
    const txt = o.isNew ? `SUPPORT · new slot ${g.passives.length + 1}/${g.loadout.maxP}` : `SUPPORT · Lv ${o.level}`;
    return h('span.ctag.sup', txt);
  }
  return h('span.ctag.misc', 'BONUS');
}

export function levelUpModal(g: Game, onPick: (i: number) => void, onReroll: () => void, tip?: string) {
  const cards = h('div.cards', g.offers.map((o, i) => offerCard(g, o, () => onPick(i))));
  return h(
    'div.modal',
    h('h2', { style: { color: '#5ef2ff', textShadow: '0 0 20px rgba(94,242,255,.6)' } }, 'LEVEL UP'),
    tip ? h('div.lvl-tip', tip) : h('div.sub', 'Choose one upgrade'),
    h('div.loadout-big', loadoutRows(g.weapons, g.passives, 'big', g.loadout.maxW, g.loadout.maxP)),
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
  controls = 'drag',
  onControls: (m: 'drag' | 'left' | 'right') => void = () => {},
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
    h('div.loadout-big', loadoutRows(g.weapons, g.passives, 'big', g.loadout.maxW, g.loadout.maxP)),
    h('div', { style: { width: 'min(100%, 380px)' } }, toggle('Sound effects', 'sfx'), toggle('Music', 'music'), controlsPicker(controls, onControls)),
    h(
      'div.actions',
      h('button.btn', { onclick: onQuit }, 'Retreat'),
      h('button.btn.primary.big', { onclick: onResume }, 'Resume'),
    ),
    h('div.help', 'Retreating keeps everything you earned so far.'),
  );
}

export function reviveModal(onYes: () => void, onNo: () => void, left: number, onAd?: () => void) {
  const byAd = left <= 0 && !!onAd;
  return h(
    'div.modal',
    h('h2', { style: { color: '#43ffa4' } }, 'SECOND WIND'),
    h('div.sub', byAd ? 'Watch a short ad to get back up with full HP and an EMP blast.' : `Get back up with full HP and an EMP blast. (${left} left)`),
    h(
      'div.actions',
      h('button.btn', { onclick: onNo }, 'Give up'),
      byAd ? h('button.btn.cyan.big.ad-btn', { onclick: onAd }, h('span.ad-play', '▶'), 'Watch ad · Revive') : h('button.btn.cyan.big', { onclick: onYes }, 'Revive'),
    ),
  );
}
