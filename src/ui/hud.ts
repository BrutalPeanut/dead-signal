import { BOSSES, RUN_LENGTH, starTimes, MAX_PASSIVE_SLOTS, MAX_SKILL_LEVEL, MAX_WEAPON_SLOTS, PASSIVES, WEAPONS } from '../sim/data';
import type { Game } from '../sim/game';
import { offerDesc, offerTitle } from '../sim/offers';
import type { Offer, PassiveState, WeaponState } from '../sim/types';
import type { PassiveId, WeaponId, WeaponLevel } from '../sim/data';
import { weaponStats, withPartner } from '../sim/weapons';
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

  /** The 1×/2× game speed button. */
  private speedBtn: HTMLButtonElement;

  constructor(onPause: () => void, onSpeed: () => void = () => {}) {
    this.speedBtn = h('button.speed', { onclick: onSpeed, 'aria-label': 'Game speed' }, '1×') as HTMLButtonElement;
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
        this.speedBtn,
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

  /** Show the current speed; `allowed` = false hides the button (e.g. the guided tutorial). */
  setSpeed(speed: number, allowed = true, unlocked = true) {
    this.speedBtn.textContent = unlocked ? `${speed}×` : '2×';
    this.speedBtn.classList.toggle('locked', !unlocked);
    this.speedBtn.classList.toggle('on', speed > 1);
    this.speedBtn.style.display = allowed ? '' : 'none';
    this.speedBtn.setAttribute('aria-pressed', String(speed > 1));
  }

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

  /** Tapping a weapon/support in the HUD row (the app pauses and opens its stats). */
  onSkillTap?: (kind: 'weapon' | 'passive', id: string) => void;

  private renderSkills(ws: WeaponState[], ps: PassiveState[], maxW = MAX_WEAPON_SLOTS, maxP = MAX_PASSIVE_SLOTS) {
    this.skills.replaceChildren(...loadoutRows(ws, ps, 'hud', maxW, maxP, this.onSkillTap));
  }
}

// ------------------------------------------------------------------ loadout rows

/**
 * Two labelled rows of 6 slots: Attack (weapons) and Support (passives). Empty slots are drawn so
 * players always know how many abilities they can still add.
 */
export function loadoutRows(
  ws: WeaponState[],
  ps: PassiveState[],
  variant: 'hud' | 'big',
  maxW = MAX_WEAPON_SLOTS,
  maxP = MAX_PASSIVE_SLOTS,
  onTap?: (kind: 'weapon' | 'passive', id: string) => void,
) {
  const tap = (kind: 'weapon' | 'passive', id: string) => (onTap ? { onclick: () => onTap(kind, id), role: 'button', title: 'Show stats' } : {});
  const cls = onTap ? 'div.sk.tap' : 'div.sk';
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
      ws.map((w) => h(cls, tap('weapon', w.id), h('img', { src: skillIcon(w.id, w.evolved), alt: WEAPONS[w.id].name }), h('b', w.evolved ? '★' : w.level))),
    ),
    row(
      'sup',
      'Support',
      ps.map((p) => h(cls, tap('passive', p.id), h('img', { src: skillIcon(p.id), alt: PASSIVES[p.id].name }), h('b', p.level))),
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

export function offerCard(g: Game, o: Offer, onPick: (() => void) | null, onInfo?: () => void) {
  let badge: HTMLElement | null = null;
  if (o.type === 'weapon' && o.isNew) badge = h('span.badge', 'NEW');
  if (o.type === 'passive') {
    const w = g.weapons.find((x) => WEAPONS[x.id].partner === o.id && !x.evolved) ?? g.weapons.find((x) => x.id === PASSIVES[o.id].partnerOf);
    const partner = w?.id ?? PASSIVES[o.id].partnerOf;
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
    onInfo && (o.type === 'weapon' || o.type === 'passive')
      ? h(
          'span.info-ico',
          {
            title: 'Show stats',
            // the card itself is the pick button: tapping the icon only opens the stats
            onclick: (e: Event) => {
              e.stopPropagation();
              onInfo();
            },
          },
          h('img', { src: offerIcon(o), alt: '' }),
          h('i', 'i'),
        )
      : h('img', { src: offerIcon(o), alt: '' }),
    h('div', h('div.ctag-row', ctag(g, o)), h('div.name', offerTitle(o)), h('div.desc', offerDesc(o)), combo(g, o), lvl),
  );
}

// ------------------------------------------------------------------ skill stats

const pct = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
/** Per-level effect of each support item, for "now → after" lines. */
const PASSIVE_FX: Partial<Record<PassiveId, [number, string]>> = {
  chip: [0.12, 'Damage'],
  plating: [-0.07, 'Damage taken'],
  capacitor: [-0.07, 'Cooldowns'],
  fuel: [0.1, 'Area'],
  medkit: [0.12, 'Max HP'],
  magnet: [0.3, 'Pickup range'],
  gel: [0.12, 'Duration'],
  boots: [0.08, 'Move speed'],
  extmag: [0.08, 'Damage (all weapons)'],
  injector: [0.08, 'Damage (all weapons)'],
  beltfeed: [0.08, 'Damage (all weapons)'],
  warhead: [0.08, 'Damage (all weapons)'],
};

/** What the stats sheet needs: a live run, or a lobby stand-in built from the profile. */
export type StatCtx = Pick<Game, 'base' | 'dmgMul' | 'cdMul' | 'areaMul' | 'durMul' | 'weapons' | 'passives' | 'passiveLevel'>;

/** Stats context outside a run (Armory, results): your ATK, no supports picked yet. */
export function lobbyCtx(atk: number): StatCtx {
  return { base: { atk } as Game['base'], dmgMul: 1, cdMul: 1, areaMul: 1, durMul: 1, weapons: [], passives: [], passiveLevel: () => 0 };
}

/** Open the stats sheet over whatever is on screen (level-up, pause, chest, lobby, results). */
export function showSkillInfo(g: StatCtx, kind: 'weapon' | 'passive', id: string, toLevel?: number, range = false) {
  (document.getElementById('ui') ?? document.body).append(skillInfo(g, kind, id, toLevel, range));
}

/** One weapon level's numbers as they'd play in this run (your ATK, supports and partner). */
function weaponNumbers(g: StatCtx, id: WeaponId, level: number, evolved: boolean) {
  const w: WeaponState = { id, level, evolved, timer: 0 } as WeaponState;
  const s: WeaponLevel = withPartner(g as Game, w, weaponStats(w));
  const rows: [string, string][] = [
    ['Damage per hit', fmtNum(s.dmg * g.base.atk * g.dmgMul)],
    ['Attacks every', `${(s.cd * g.cdMul).toFixed(2)}s`],
  ];
  if (s.count > 1 || level > 1) rows.push([id === 'blades' ? 'Blades' : 'Projectiles', String(s.count)]);
  if (s.pierce > 0) rows.push(['Pierce', s.pierce >= 999 ? 'Everything' : String(s.pierce)]);
  // for bullet guns `area` is the bullet's hit size and `dur` its flight time: not worth showing
  const bullet = id === 'pistol' || id === 'smg' || id === 'mg';
  if (!bullet && s.area > 0) rows.push(['Area', String(Math.round(s.area * g.areaMul))]);
  if (!bullet && id !== 'bazooka' && s.dur > 0 && s.dur < 60) rows.push(['Duration', `${(s.dur * g.durMul).toFixed(1)}s`]);
  return rows;
}

/**
 * Stats sheet for a weapon or support item, opened from the level-up screen (tap a loadout icon,
 * or the icon on an upgrade card). Shows the real numbers for this run and, when `toLevel` is
 * given, what picking the upgrade would change. Closing it never picks anything.
 */
export function skillInfo(g: StatCtx, kind: 'weapon' | 'passive', id: string, toLevel?: number, range = false) {
  const close = () => sheet.remove();
  let body: HTMLElement[];
  let title: string;
  let color: string;
  let icon: string;
  if (kind === 'weapon') {
    const d = WEAPONS[id as WeaponId];
    const have = g.weapons.find((w) => w.id === id);
    const evo = !!have?.evolved;
    title = evo ? d.evoName : d.name;
    color = d.color;
    icon = skillIcon(d.id, evo);
    const now = have ? weaponNumbers(g, d.id, have.level, evo) : null;
    const next = toLevel && !evo ? weaponNumbers(g, d.id, toLevel, false) : null;
    let head: string[];
    let cols: [string, string][][];
    if (range) {
      // outside a run: how the weapon grows from a fresh pick to evolved
      head = ['', 'Lv 1', `Lv ${MAX_SKILL_LEVEL}`, 'Evolved'];
      cols = [weaponNumbers(g, d.id, 1, false), weaponNumbers(g, d.id, MAX_SKILL_LEVEL, false), weaponNumbers(g, d.id, MAX_SKILL_LEVEL, true)];
    } else {
      head = now && next ? ['', `Lv ${have!.level}`, `Lv ${toLevel}`] : now ? ['', evo ? 'Evolved' : `Lv ${have!.level}`] : ['', `Lv ${toLevel ?? 1}`];
      cols = now && next ? [now, next] : [now ?? next ?? weaponNumbers(g, d.id, 1, false)];
    }
    // match rows by stat name: a level can add a stat (pierce, more projectiles) the other lacks
    const ORDER = ['Damage per hit', 'Attacks every', 'Projectiles', 'Blades', 'Pierce', 'Area', 'Duration'];
    const labels = [...new Set(cols.flatMap((c) => c.map(([l]) => l)))].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
    const rows = labels.map((label) => {
      const vals = cols.map((c) => c.find(([l]) => l === label)?.[1] ?? '—');
      return h('tr', h('th', label), vals.map((v, j) => h(j > 0 && v !== vals[j - 1] ? 'td.up' : 'td', v)));
    });
    body = [
      h('p.si-desc', evo ? d.evoDesc : d.desc),
      ...(range ? [h('p.si-note', 'With your current ATK, before any supports from the run.')] : []),
      h('table.si-table', h('tr.si-head', head.map((x) => h('td', x))), rows),
      ...(toLevel && !evo && d.levelText[toLevel - 1] ? [h('p.si-next', `Lv ${toLevel}: ${d.levelText[toLevel - 1]}`)] : []),
      evo
        ? h('p.si-evo', '★ Fully evolved')
        : h('p.si-evo', `🔗 Evolves into ${d.evoName} at Lv ${MAX_SKILL_LEVEL} while you hold ${PASSIVES[d.partner].name}. ${d.evoDesc}`),
    ];
  } else {
    const d = PASSIVES[id as PassiveId];
    const lv = g.passives.find((p) => p.id === id)?.level ?? 0;
    title = d.name;
    color = d.color;
    icon = skillIcon(d.id);
    const fx = PASSIVE_FX[d.id];
    const after = toLevel ?? lv;
    body = [
      h('p.si-desc', `Each level: ${d.desc}`),
      h(
        'table.si-table',
        h('tr.si-head', h('td', ''), h('td', `Lv ${lv}`), toLevel ? h('td', `Lv ${after}`) : null),
        fx ? h('tr', h('th', fx[1]), h('td', pct(fx[0] * lv)), toLevel ? h('td.up', pct(fx[0] * after)) : null) : null,
        h('tr', h('th', 'Level'), h('td', `${lv}/${MAX_SKILL_LEVEL}`), toLevel ? h('td.up', `${after}/${MAX_SKILL_LEVEL}`) : null),
      ),
      h('p.si-evo', `🔗 Partner of ${WEAPONS[d.partnerOf].name}: hold this when it hits Lv ${MAX_SKILL_LEVEL} to evolve it into ${WEAPONS[d.partnerOf].evoName}.`),
    ];
  }
  const sheet: HTMLElement = h(
    'div.si-wrap',
    { onclick: (e: Event) => e.target === sheet && close() },
    h(
      'div.si',
      { style: { borderColor: color + 'aa' } },
      h('div.si-top', h('img', { src: icon, alt: '' }), h('b', { style: { color } }, title), h('button.tt-x', { 'aria-label': 'Close', onclick: close }, '✕')),
      body,
      h('button.btn.small', { style: { marginTop: '10px', width: '100%' }, onclick: close }, 'Back'),
    ),
  );
  return sheet;
}

/**
 * The evolution pairing spelled out: every weapon has one support item; max the weapon while
 * holding its partner and the next chest evolves it. Shows exactly what this card pairs with.
 */
function combo(g: Game, o: Offer) {
  if (o.type === 'passive') {
    // the Targeting Chip pairs with every primary gun: name the one you actually carry
    const owned = g.weapons.find((x) => WEAPONS[x.id].partner === o.id && !x.evolved);
    const wid = owned?.id ?? PASSIVES[o.id].partnerOf;
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

export function levelUpModal(g: Game, onPick: (i: number) => void, onReroll: () => void, tip?: string, onCloseTip?: () => void) {
  const info = (kind: 'weapon' | 'passive', id: string, toLevel?: number) => showSkillInfo(g, kind, id, toLevel);
  const cards = h(
    'div.cards',
    g.offers.map((o, i) => offerCard(g, o, () => onPick(i), o.type === 'weapon' || o.type === 'passive' ? () => info(o.type as 'weapon' | 'passive', o.id, o.level) : undefined)),
  );
  return h(
    'div.modal',
    h('h2', { style: { color: '#5ef2ff', textShadow: '0 0 20px rgba(94,242,255,.6)' } }, 'LEVEL UP'),
    tip
      ? (() => {
          const box: HTMLElement = h(
            'div.lvl-tip',
            h('span', tip),
            h(
              'button.tt-x',
              {
                'aria-label': 'Dismiss tip',
                title: 'Dismiss tip',
                onclick: () => {
                  onCloseTip?.();
                  box.replaceWith(h('div.sub', 'Choose one upgrade'));
                },
              },
              '✕',
            ),
          );
          return box;
        })()
      : h('div.sub', 'Choose one upgrade'),
    h('div.loadout-big', loadoutRows(g.weapons, g.passives, 'big', g.loadout.maxW, g.loadout.maxP, (kind, id) => info(kind, id))),
    h('div.si-hint', 'Tap an icon to see its stats'),
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
        h('span.info-ico', { title: 'Show stats', onclick: () => showSkillInfo(g, 'weapon', id) }, h('img', { src: skillIcon(id, true), alt: '' }), h('i', 'i')),
        h('div', h('div.name', { style: { color: '#ffd34d' } }, w.evoName), h('div.desc', w.evoDesc)),
      ),
    );
  }
  for (const o of c.upgrades) items.push(offerCard(g, o, null, o.type === 'weapon' || o.type === 'passive' ? () => showSkillInfo(g, o.type as 'weapon' | 'passive', o.id) : undefined));
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
    h('div.loadout-big', loadoutRows(g.weapons, g.passives, 'big', g.loadout.maxW, g.loadout.maxP, (kind, id) => showSkillInfo(g, kind, id))),
    h('div.si-hint', 'Tap an icon to see its stats'),
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
