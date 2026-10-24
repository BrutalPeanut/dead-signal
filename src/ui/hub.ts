import { audio } from '../audio';
import {
  GEAR,
  MAX_LEVEL,
  MERGE_COUNT,
  RARITIES,
  RARITY_COLORS,
  SLOTS,
  SLOT_NAMES,
  gearStat,
  levelCost,
  salvageValue,
  type GearItem,
  type Slot,
} from '../meta/gear';
import { RELAY_CAP_H, type Profile } from '../meta/profile';
import { LOGIN_DAYS, loginReward } from '../meta/login';
import { DAILY_TIERS, ENDLESS_BOSS_EVERY, dailyChallenge, type RunMode } from '../sim/modes';
import { MILESTONES, accountXpNeed, type TrackId } from '../meta/talents';
import { drawHero } from '../render/art';
import { gearIcon } from '../render/icons';
import { BOSSES, RUN_LENGTH, STAR1_TIME, STAR2_TIME, WEAPONS } from '../sim/data';
import { CHAPTER_COUNT, getChapter } from '../sim/chapters';
import { coin, fmtNum, fmtTime, h, haptic, toast } from './dom';
import { HomeScene } from './homeScene';
import { icon } from './svgicons';
import { MISSION_DEFS, dailyBonus, starReward, type Reward } from '../meta/missions';

export type Tab = 'deploy' | 'armory' | 'talents' | 'supply' | 'missions';

/** Features reveal gradually (Habby-style): visible but dimmed until the player has context for them. */
const UNLOCK: Partial<Record<Tab, { runs: number; text: string }>> = {
  talents: { runs: 1, text: 'Unlocks after your first deployment' },
  missions: { runs: 1, text: 'Unlocks after your first deployment' },
};

let avatarUrl = '';
function avatar(): string {
  if (avatarUrl) return avatarUrl;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 96, 96);
  g.addColorStop(0, '#2a3a5a');
  g.addColorStop(1, '#141a28');
  x.fillStyle = g;
  x.fillRect(0, 0, 96, 96);
  x.translate(44, 108);
  x.scale(2.7, 2.7);
  drawHero(x, { t: 0.4, moving: false, aim: 0 });
  avatarUrl = c.toDataURL();
  return avatarUrl;
}

export class Hub {
  el: HTMLElement;
  private body: HTMLElement;
  private top: HTMLElement;
  private nav: HTMLElement;
  tab: Tab = 'deploy';
  sector: number;
  private heroCanvas: HTMLCanvasElement | null = null;
  private t = 0;
  private modal: HTMLElement | null = null;
  private scene = new HomeScene();

  mode: RunMode = 'campaign';

  constructor(private p: Profile, private onDeploy: (sector: number, mode: RunMode) => void, private onSettings: () => void) {
    this.sector = p.data.unlocked;
    this.top = h('div.topbar');
    this.body = h('div.hub-body');
    this.nav = h('div.nav');
    this.el = h('div.hub', this.top, this.body, this.nav);
    p.onChange(() => this.refresh());
    this.refresh();
  }

  refresh() {
    this.el.classList.toggle('lobby', this.tab === 'deploy');
    this.renderTop();
    this.renderNav();
    this.renderBody();
  }

  private locked(t: Tab) {
    const u = UNLOCK[t];
    return u && this.p.data.stats.runs < u.runs ? u : null;
  }

  setTab(t: Tab) {
    const lock = this.locked(t);
    if (lock) {
      audio.click();
      toast(lock.text, '#8d97ab');
      return;
    }
    this.tab = t;
    audio.click();
    this.body.scrollTop = 0;
    this.refresh();
  }

  tick(dt: number) {
    this.t += dt;
    if (this.tab === 'deploy') this.scene.tick(dt);
    const c = this.heroCanvas;
    if (c && c.isConnected) {
      const x = c.getContext('2d')!;
      const w = (c.width = c.clientWidth * 2);
      const hh = (c.height = c.clientHeight * 2);
      x.clearRect(0, 0, w, hh);
      x.save();
      x.translate(w / 2, hh * 0.72);
      x.scale(hh / 78, hh / 78);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.beginPath();
      x.ellipse(0, 13, 12, 4, 0, 0, Math.PI * 2);
      x.fill();
      drawHero(x, { t: this.t, moving: false, aim: Math.sin(this.t * 0.6) * 0.5 });
      x.restore();
    }
  }

  // ------------------------------------------------------------------ chrome

  private renderTop() {
    const d = this.p.data;
    const need = accountXpNeed(d.accountLevel);
    const pill = (kind: 'gold' | 'scrap' | 'key', v: string, plus: boolean) =>
      h(
        'button.w',
        { onclick: () => this.setTab('supply'), 'aria-label': kind },
        coin(kind),
        h('span', v),
        plus ? h('i.plus', { html: icon('plus', 12) }) : null,
      );
    this.top.replaceChildren(
      h(
        'button.acct',
        { onclick: () => this.setTab('talents'), 'aria-label': 'Profile' },
        h(
          'div.ava',
          h('img', { src: avatar(), alt: '' }),
          h('span.lvb', d.accountLevel),
          h('span.ring', { html: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16.5" pathLength="100" stroke-dasharray="${Math.round((d.accountXp / need) * 100)} 100"/></svg>` }),
        ),
        h('div.who', h('div.nm', 'Courier'), h('div.pw', coin('power'), fmtNum(this.p.power()))),
      ),
      h('div.wallet', pill('gold', fmtNum(d.gold), true), pill('scrap', fmtNum(d.scrap), false), pill('key', String(d.keys), true)),
      h('button.icon-btn', { onclick: this.onSettings, 'aria-label': 'Settings', html: icon('settings', 20) }),
    );
  }

  private renderNav() {
    const p = this.p;
    const dots: Partial<Record<Tab, boolean>> = {
      supply: p.data.keys > 0 || p.dailyAvailable() || p.relayPending().hours >= 1,
      armory: p.data.gear.some((g) => p.mergeMates(g.uid).length >= MERGE_COUNT - 1),
      talents: p.trackInfo().some((t) => p.canBuyTrack(t.id)),
      missions: p.missionsClaimable() > 0,
      deploy: p.starChestsReady() > 0,
    };
    const b = (t: Tab, ico: string, label: string) => {
      const lock = this.locked(t);
      return h(
        'button' + (this.tab === t ? '.on' : '') + (lock ? '.locked' : '') + (t === 'deploy' ? '.battle' : ''),
        { onclick: () => this.setTab(t), 'aria-label': label },
        h('span.ico', { html: icon(lock ? 'lock' : ico, t === 'deploy' ? 30 : 22) }),
        h('span.lbl', label),
        dots[t] && !lock ? h('i.dot') : null,
      );
    };
    this.nav.replaceChildren(
      b('supply', 'supply', 'Supply'),
      b('armory', 'armory', 'Armory'),
      b('deploy', 'battle', 'Battle'),
      b('talents', 'talents', 'Talents'),
      b('missions', 'missions', 'Missions'),
    );
  }

  private renderBody() {
    this.heroCanvas = null;
    switch (this.tab) {
      case 'deploy':
        this.body.replaceChildren(this.deployTab());
        break;
      case 'armory':
        this.body.replaceChildren(this.armoryTab());
        break;
      case 'talents':
        this.body.replaceChildren(this.talentsTab());
        break;
      case 'supply':
        this.body.replaceChildren(this.supplyTab());
        break;
      case 'missions':
        this.body.replaceChildren(this.missionsTab());
        break;
    }
  }

  // ------------------------------------------------------------------ lobby

  private rewardChips(r: Reward) {
    return h(
      'span.rw',
      r.gold ? h('span', coin('gold'), fmtNum(r.gold)) : null,
      r.scrap ? h('span', coin('scrap'), r.scrap) : null,
      r.keys ? h('span', coin('key'), r.keys) : null,
    );
  }

  private toastReward(r: Reward, color = '#ffd34d') {
    const parts = [r.gold ? `+${fmtNum(r.gold)} gold` : '', r.scrap ? `+${r.scrap} scrap` : '', r.keys ? `+${r.keys} key${r.keys > 1 ? 's' : ''}` : ''].filter(Boolean);
    toast(parts.join(', '), color);
  }

  private deployTab() {
    const p = this.p;
    const d = p.data;
    const ch = getChapter(this.sector);
    const locked = this.sector > d.unlocked;
    const stars = d.stars[this.sector] ?? 0;
    const claims = d.starClaims[this.sector] ?? 0;
    const power = p.power();
    this.scene.setSector(this.sector);
    const go = (delta: number) => {
      const n = this.sector + delta;
      if (n < 0 || n >= CHAPTER_COUNT) return;
      this.sector = n;
      audio.click();
      haptic(8);
      this.renderBody();
    };
    const relay = p.relayPending();
    const missionsReady = p.missionsClaimable();
    const missionsLocked = this.locked('missions');
    const rail = (ico: string, label: string, onclick: () => void, badge: string | number | null, extra?: HTMLElement | null, cls = '') =>
      h(
        'button.rail-btn' + cls,
        { onclick, 'aria-label': label },
        h('span.ri', { html: icon(ico, 22) }),
        extra ?? null,
        h('span.rl', label),
        badge ? h('i.badge-n', badge) : null,
      );
    const relayFrac = relay.hours / RELAY_CAP_H;
    const relayRing = h('span.rring', { html: `<svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="16" pathLength="100" stroke-dasharray="${Math.round(relayFrac * 100)} 100"/></svg>` });

    // sector chest track
    const milestones: { bit: 1 | 2 | 4; label: string }[] = [
      { bit: 1, label: fmtTime(STAR1_TIME).replace(/^0/, '') },
      { bit: 2, label: fmtTime(STAR2_TIME).replace(/^0/, '') },
      { bit: 4, label: 'Clear' },
    ];
    const best = d.best[this.sector] ?? 0;
    const trackFill = stars & 4 ? 1 : Math.min(1, best / RUN_LENGTH);
    const track = h(
      'div.chest-track',
      h('div.ct-bar', h('i', { style: { width: `${trackFill * 100}%` } })),
      milestones.map((m, i) => {
        const earned = !!(stars & m.bit);
        const claimed = !!(claims & m.bit);
        const ready = earned && !claimed;
        return h(
          'button.ct-chest' + (ready ? '.ready' : '') + (claimed ? '.open' : '') + (i === 2 ? '.big' : ''),
          {
            style: { left: `${[50, 80, 100][i]}%` },
            'aria-label': `${m.label} chest`,
            onclick: () => {
              if (ready) {
                const r = p.claimStar(this.sector, m.bit);
                if (r) {
                  audio.pickup('chest');
                  haptic(30);
                  this.toastReward(r);
                }
              } else {
                const r = starReward(this.sector, m.bit);
                const parts = [r.gold ? `${fmtNum(r.gold)} gold` : '', r.scrap ? `${r.scrap} scrap` : '', r.keys ? `${r.keys} key` : ''].filter(Boolean).join(' + ');
                toast(claimed ? 'Already claimed' : `${m.label === 'Clear' ? 'Clear the sector' : 'Survive ' + m.label}: ${parts}`, '#8d97ab');
              }
            },
          },
          h('span.cc-box'),
          h('span.cc-l', m.label),
        );
      }),
    );

    return h(
      'div.lobby-body',
      h(
        'div.stage',
        this.scene.canvas,
        h(
          'div.rails.left',
          rail('relay', 'Relay', () => this.setTab('supply'), relay.hours >= 1 ? '!' : null, relayRing),
          rail('daily', 'Daily', () => this.calendar(), p.dailyAvailable() ? 1 : null),
        ),
        h(
          'div.rails.right',
          rail('missions', 'Missions', () => this.setTab('missions'), missionsLocked ? null : missionsReady || null, null, missionsLocked ? '.locked' : ''),
          rail('crate', 'Crates', () => this.setTab('supply'), d.keys || null),
        ),
      ),
      this.modeTabs(),
      ...(this.mode === 'campaign' ? [] : this.modeCard()),
      this.mode !== 'campaign' ? null : h(
        'div.sector-card',
        h(
          'div.sc-head',
          h('button.sc-arrow', { onclick: () => go(-1), disabled: this.sector === 0, 'aria-label': 'Previous sector', html: icon('chevL', 20) }),
          h(
            'button.sc-title',
            { onclick: () => this.sectorMap() },
            h('div.sc-num', `SECTOR ${this.sector + 1} · ${ch.biome.toUpperCase()}`),
            h('div.sc-name', ch.name),
            h('div.sc-sub', locked ? `Clear Sector ${this.sector} to unlock` : best ? `Best ${fmtTime(Math.min(best, RUN_LENGTH))} · ${(d.bestScore[this.sector] ?? 0).toLocaleString()} pts` : this.sector === 0 ? 'Training sector · free revive' : 'Not attempted', h('span.sc-map', { html: icon('map', 14) }), 'Map'),
          ),
          h('button.sc-arrow', { onclick: () => go(1), disabled: this.sector === CHAPTER_COUNT - 1, 'aria-label': 'Next sector', html: icon('chevR', 20) }),
        ),
        track,
        locked
          ? null
          : h(
              'div.sc-foot.' + (power >= ch.power ? 'ok' : power >= ch.power * 0.75 ? 'warn' : 'bad'),
              h('span', 'Your power ', h('b', coin('power'), fmtNum(power))),
              h('span', 'Recommended ', h('b', fmtNum(ch.power))),
            ),
      ),
      this.mode !== 'campaign' ? null : h(
        'div.battle-row',
        this.coachButton(),
        h(
          'button.btn.primary.big.go',
          {
            disabled: locked,
            onclick: () => {
              haptic(20);
              this.onDeploy(this.sector, 'campaign');
            },
          },
          locked ? h('span', h('i.lk', { html: icon('lock', 20) }), 'Locked') : h('span', 'BATTLE', h('small', `${BOSSES[ch.midBoss].name} · ${BOSSES[ch.finalBoss].name}`)),
        ),
      ),
    );
  }

  static readonly MODE_UNLOCK: Record<RunMode, number> = { campaign: 0, daily: 1, endless: 3 };

  private modeTabs() {
    const d = this.p.data;
    const tab = (m: RunMode, label: string) => {
      const need = Hub.MODE_UNLOCK[m];
      const lock = d.unlocked < need;
      const dot = m === 'daily' && !lock && this.p.dailyState().plays === 0;
      return h(
        'button.mt' + (this.mode === m ? '.on' : '') + (lock ? '.lock' : ''),
        {
          onclick: () => {
            if (lock) {
              audio.click();
              toast(`Clear Sector ${need} to unlock ${label}`, '#8d97ab');
              return;
            }
            this.mode = m;
            audio.click();
            haptic(8);
            this.renderBody();
          },
        },
        lock ? h('i.lk', { html: icon('lock', 12) }) : null,
        label,
        dot ? h('i.dot.static') : null,
      );
    };
    return h('div.mode-tabs', tab('campaign', 'Campaign'), tab('daily', 'Daily'), tab('endless', 'Endless'));
  }

  /** Sector-card + battle-row equivalents for Daily Challenge and Endless. */
  private modeCard(): HTMLElement[] {
    const p = this.p;
    const d = p.data;
    if (this.mode === 'daily') {
      const ch = dailyChallenge();
      const ds = p.dailyState();
      const top = DAILY_TIERS[DAILY_TIERS.length - 1].score;
      const dateTxt = new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return [
        h(
          'div.sector-card.mode-card',
          h('div.sc-num', `DAILY CHALLENGE · ${dateTxt.toUpperCase()}`),
          h('div.sc-name', ch.mods.map((m) => m.name).join(' + ')),
          h('div.mc-mods', ch.mods.map((m) => h('div', m.desc))),
          h(
            'div.chest-track.tiers',
            h('div.ct-bar', h('i', { style: { width: `${Math.min(1, ds.best / top) * 100}%` } })),
            DAILY_TIERS.map((t, i) =>
              h(
                'div.ct-chest.tier' + (ds.tiers & (1 << i) ? '.open' : ''),
                { style: { left: `${(t.score / top) * 100}%`, '--tc': t.color } as any },
                h('span.cc-box'),
                h('span.cc-l', `${t.name} ${Math.round(t.score / 1000)}K`),
              ),
            ),
          ),
          h('div.sc-foot', ds.best ? h('span', "Today's best ", h('b', ds.best.toLocaleString())) : h('span', 'Same run for everyone today'), h('span', ds.plays ? `${ds.plays} run${ds.plays === 1 ? '' : 's'}` : 'Standard kit')),
        ),
        h(
          'div.battle-row',
          h(
            'button.btn.primary.big.go',
            { onclick: () => (haptic(20), this.onDeploy(ch.sector, 'daily')) },
            h('span', 'CHALLENGE', h('small', `${BOSSES[ch.midBoss].name} · ${BOSSES[ch.finalBoss].name}`)),
          ),
        ),
      ];
    }
    const e = d.endless;
    return [
      h(
        'div.sector-card.mode-card',
        h('div.sc-num', 'ENDLESS · NO TIME LIMIT'),
        h('div.sc-name', 'Last Signal'),
        h('div.mc-mods', h('div', `Survive as long as you can. A boss every ${fmtTime(ENDLESS_BOSS_EVERY).replace(/^0/, '')}, each dropping a chest.`), h('div', 'Uses your gear · it only gets harder')),
        h(
          'div.mc-best',
          h('div', h('small', 'BEST TIME'), h('b', e.best ? fmtTime(e.best) : '—')),
          h('div', h('small', 'BEST SCORE'), h('b', e.bestScore ? fmtNum(e.bestScore) : '—')),
        ),
      ),
      h(
        'div.battle-row',
        h('button.btn.primary.big.go', { onclick: () => (haptic(20), this.onDeploy(2, 'endless')) }, h('span', 'ENDLESS', h('small', 'How long can you last?'))),
      ),
    ];
  }

  /** One-tap "Power Up" coach: the single best next upgrade, applied in place. */
  private coachButton() {
    if (this.p.data.stats.runs < 1) return null;
    const c = this.p.coach();
    if (!c) return null;
    return h(
      'button.coach',
      {
        onclick: () => {
          const label = c.label;
          const d = this.p.data;
          const before = { g: d.gold, s: d.scrap, k: d.keys };
          if (c.apply()) {
            audio.levelUp();
            haptic(25);
            if (c.kind === 'collect') {
              const parts = [
                d.gold > before.g ? `+${fmtNum(d.gold - before.g)} gold` : '',
                d.scrap > before.s ? `+${d.scrap - before.s} scrap` : '',
                d.keys > before.k ? `+${d.keys - before.k} key${d.keys - before.k > 1 ? 's' : ''}` : '',
              ].filter(Boolean);
              toast(`🎁 ${parts.join(' · ') || 'Rewards collected'}`, '#43ffa4');
            } else toast(`⚡ ${label}`, '#43ffa4');
          }
        },
      },
      h('span.ch-bolt', '⚡'),
      h('span.ch-t', h('small', 'POWER UP'), h('b', c.label)),
      h('span.ch-d', c.detail),
    );
  }

  /** Full sector list, opened from the sector card title. */
  private sectorMap() {
    this.closeModal();
    const d = this.p.data;
    const rows = Array.from({ length: CHAPTER_COUNT }, (_, i) => {
      const ch = getChapter(i);
      const st = d.stars[i] ?? 0;
      const lock = i > d.unlocked;
      const ready = [1, 2, 4].some((b) => this.p.canClaimStar(i, b as 1 | 2 | 4));
      return h(
        'button.map-row' + (i === this.sector ? '.sel' : '') + (lock ? '.lock' : ''),
        {
          onclick: () => {
            this.sector = i;
            audio.click();
            this.closeModal();
            this.renderBody();
          },
        },
        h('b.mr-n', i + 1),
        h('div', h('div.mr-name', ch.name), h('div.mr-sub', `${ch.biome} · ${BOSSES[ch.finalBoss].name}`)),
        ready ? h('i.dot.static') : null,
        lock ? h('span.mr-lock', { html: icon('lock', 16) }) : h('div.stars', [1, 2, 4].map((b) => h(st & b ? 'i.on' : 'i'))),
      );
    });
    this.modal = h(
      'div.modal',
      { onclick: () => this.closeModal() },
      h('div.sheet', { onclick: (e: Event) => e.stopPropagation() }, h('h2', { style: { fontSize: '22px', marginBottom: '10px' } }, 'Sector Map'), h('div.map-list', rows)),
    );
    document.getElementById('ui')!.append(this.modal);
    requestAnimationFrame(() => this.modal?.querySelector('.map-row.sel')?.scrollIntoView({ block: 'center' }));
  }

  // ------------------------------------------------------------------ missions

  private missionsTab() {
    const p = this.p;
    const m = p.missions();
    const done = m.list.filter((x) => x.claimed).length;
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const left = Math.max(0, midnight.getTime() - Date.now());
    const hrs = Math.floor(left / 3.6e6);
    const mins = Math.floor((left % 3.6e6) / 6e4);
    const bonus = dailyBonus(p.data.unlocked);
    return h(
      'div',
      h('div.section-h', 'Daily missions', h('span.reset', `Resets in ${hrs}h ${mins}m`)),
      h(
        'div.daily-bonus' + (p.bonusReady() ? '.ready' : ''),
        h('div.db-box'),
        h('div', h('b', 'Complete all 5'), h('div.db-prog', h('i', { style: { width: `${(done / 5) * 100}%` } })), h('small', `${done}/5 claimed`)),
        h(
          'button.btn.small' + (p.bonusReady() ? '.primary' : ''),
          {
            disabled: !p.bonusReady(),
            onclick: () => {
              const r = p.claimBonus();
              if (r) {
                audio.pickup('chest');
                haptic(40);
                this.toastReward(r, '#5ef2ff');
              }
            },
          },
          m.bonusClaimed ? 'Claimed' : this.rewardChips(bonus),
        ),
      ),
      m.list.map((ms, i) => {
        const def = MISSION_DEFS[ms.kind];
        const ready = !ms.claimed && ms.progress >= ms.target;
        const shown = def.mode === 'max' && ms.kind === 'survive' ? `${fmtTime(ms.progress)} / ${fmtTime(ms.target)}` : `${fmtNum(ms.progress)} / ${fmtNum(ms.target)}`;
        return h(
          'div.mission' + (ready ? '.ready' : '') + (ms.claimed ? '.done' : ''),
          h(
            'div.ms-main',
            h('div.ms-t', def.text(ms.target)),
            h('div.ms-bar', h('i', { style: { width: `${Math.min(100, (ms.progress / ms.target) * 100)}%` } })),
            h('div.ms-p', shown),
          ),
          h(
            'button.btn.small' + (ready ? '.primary' : ''),
            {
              disabled: !ready,
              onclick: () => {
                const r = p.claimMission(i);
                if (r) {
                  audio.pickup('gold');
                  haptic(20);
                  this.toastReward(r);
                }
              },
            },
            ms.claimed ? '✓' : this.rewardChips(ms.reward),
          ),
        );
      }),
      h('div.help', 'Missions refresh every day at midnight. Progress counts runs, crates, gear upgrades and relay claims.'),
    );
  }

  // ------------------------------------------------------------------ armory

  private armoryTab() {
    const p = this.p;
    const b = p.baseStats();
    const hero = h('canvas') as HTMLCanvasElement;
    this.heroCanvas = hero;
    const slotBtn = (s: Slot) => {
      const uid = p.data.equipped[s];
      const it = uid ? p.item(uid) : undefined;
      if (!it) return h('button.slot', { onclick: () => this.pickForSlot(s) }, h('div.empty', { style: { padding: '24px 0', textAlign: 'center' } }, SLOT_NAMES[s]));
      return h(
        'button.slot',
        { onclick: () => this.itemSheet(it.uid), style: { borderStyle: 'solid', borderColor: RARITY_COLORS[it.rarity] } },
        h('img', { src: gearIcon(s, RARITY_COLORS[it.rarity], it.def), alt: GEAR[it.def].name }),
        h('span.lv', `Lv${it.level}`),
      );
    };
    const left: Slot[] = ['weapon', 'visor', 'gloves'];
    const right: Slot[] = ['vest', 'belt', 'boots'];
    const items = p.data.gear
      .slice()
      .sort((a, b2) => b2.rarity - a.rarity || SLOTS.indexOf(GEAR[a.def].slot) - SLOTS.indexOf(GEAR[b2.def].slot) || b2.level - a.level);
    return h(
      'div',
      h(
        'div.loadout',
        h('div.col', left.map(slotBtn)),
        h('div.hero-view', hero),
        h('div.col', right.map(slotBtn)),
      ),
      h(
        'div.statline',
        h('span', h('small', 'ATK'), fmtNum(b.atk)),
        h('span', h('small', 'HP'), fmtNum(b.hp)),
        h('span', coin('power'), fmtNum(p.power())),
      ),
      h(
        'div.section-h',
        `Inventory (${items.length})`,
        h(
          'button.btn.small.cyan',
          {
            onclick: () => {
              const n = p.mergeAll();
              if (n) {
                audio.pickup('chest');
                haptic(30);
                toast(`Merged ${n} time${n > 1 ? 's' : ''}`, '#43ffa4');
              } else toast('Need 3 identical items to merge', '#8d97ab');
            },
          },
          'Merge all',
        ),
      ),
      h(
        'div.inv',
        items.map((it) => {
          const slot = GEAR[it.def].slot;
          const canMerge = p.mergeMates(it.uid).length >= MERGE_COUNT - 1;
          return h(
            'button.item',
            { onclick: () => this.itemSheet(it.uid), style: { borderColor: RARITY_COLORS[it.rarity] } },
            h('img', { src: gearIcon(slot, RARITY_COLORS[it.rarity], it.def), alt: GEAR[it.def].name }),
            h('span.lv', `Lv${it.level}`),
            p.isEquipped(it.uid) ? h('span.eq', 'E') : null,
            canMerge ? h('i.merge') : null,
          );
        }),
      ),
      h('div.help', 'Merge 3 identical items (same item + rarity) to raise rarity. Higher rarity unlocks perks and a higher level cap.'),
    );
  }

  private pickForSlot(s: Slot) {
    const first = this.p.data.gear.find((g) => GEAR[g.def].slot === s);
    if (!first) {
      toast(`No ${SLOT_NAMES[s].toLowerCase()} yet — open supply crates`, '#8d97ab');
      return;
    }
    const best = this.p.data.gear.filter((g) => GEAR[g.def].slot === s).sort((a, b) => gearStat(b) - gearStat(a))[0];
    this.itemSheet(best.uid);
  }

  closeModal() {
    this.modal?.remove();
    this.modal = null;
  }

  itemSheet(uid: string) {
    this.closeModal();
    const p = this.p;
    const it = p.item(uid);
    if (!it) return;
    const def = GEAR[it.def];
    const col = RARITY_COLORS[it.rarity];
    const cost = levelCost(it.level, it.rarity);
    const maxed = it.level >= MAX_LEVEL[it.rarity];
    const mates = p.mergeMates(uid).length;
    const eq = p.isEquipped(uid);
    const sv = salvageValue(it);
    const rerender = () => this.itemSheet(uid);
    const sheet = h(
      'div.sheet',
      { onclick: (e: Event) => e.stopPropagation() },
      h(
        'div.top',
        h('img', { src: gearIcon(def.slot, col, it.def), alt: '', style: { border: `2px solid ${col}` } }),
        h(
          'div',
          h('div.rar', { style: { color: col } }, `${RARITIES[it.rarity]} ${SLOT_NAMES[def.slot]}`),
          h('div.nm', def.name),
          h('div.flav', def.flavor),
        ),
      ),
      h(
        'div',
        { style: { marginTop: '12px' } },
        h('div.kv', h('span', 'Level'), h('b', `${it.level} / ${MAX_LEVEL[it.rarity]}`)),
        h('div.kv', h('span', def.stat === 'atk' ? 'Attack' : 'Health'), h('b', `+${fmtNum(gearStat(it))}`)),
        def.startWeapon ? h('div.kv', h('span', 'Starting weapon'), h('b', WEAPONS[def.startWeapon].name)) : null,
      ),
      h(
        'div.perks',
        def.perks.map((pk, i) =>
          h(
            'div.perk' + (it.rarity >= i + 2 ? '' : '.off'),
            h('span.tier', { style: { color: RARITY_COLORS[i + 2] } }, RARITIES[i + 2]),
            pk.text,
          ),
        ),
      ),
      h(
        'div.row',
        h(
          'button.btn.primary',
          {
            disabled: maxed || !p.canLevel(it),
            onclick: () => {
              if (p.levelUp(uid)) {
                audio.levelUp();
                haptic(15);
                rerender();
              }
            },
          },
          maxed ? 'Max level' : h('span', 'Level up ', coin('gold'), ` ${fmtNum(cost.gold)} `, coin('scrap'), ` ${cost.scrap}`),
        ),
        h(
          'button.btn.cyan',
          {
            disabled: mates < MERGE_COUNT - 1,
            onclick: () => {
              const r = p.merge(uid);
              if (r) {
                audio.pickup('chest');
                haptic(40);
                toast(`${def.name} → ${RARITIES[r.rarity]}!`, RARITY_COLORS[r.rarity]);
                rerender();
              }
            },
          },
          `Merge (${Math.min(mates, MERGE_COUNT - 1)}/${MERGE_COUNT - 1})`,
        ),
      ),
      h(
        'div.row',
        { style: { marginTop: '8px' } },
        h(
          'button.btn',
          {
            disabled: eq,
            onclick: () => {
              p.equip(uid);
              audio.click();
              rerender();
            },
          },
          eq ? 'Equipped' : 'Equip',
        ),
        h(
          'button.btn',
          {
            disabled: eq,
            onclick: () => {
              if (p.salvage(uid)) {
                toast(`Salvaged: +${sv.scrap} scrap${sv.gold ? `, +${fmtNum(sv.gold)} gold` : ''}`, '#9aa3b5');
                this.closeModal();
              }
            },
          },
          `Salvage (+${sv.scrap})`,
        ),
      ),
      h('button.btn.ghost', { style: { width: '100%', marginTop: '6px' }, onclick: () => this.closeModal() }, 'Close'),
    );
    this.modal = h('div.modal', { onclick: () => this.closeModal() }, sheet);
    document.getElementById('ui')!.append(this.modal);
  }

  // ------------------------------------------------------------------ talents

  private talentsTab() {
    const p = this.p;
    const d = p.data;
    const icons: Record<TrackId, string> = { atk: '✸', hp: '♥', def: '⛨', heal: '✚' };
    const colors: Record<TrackId, string> = { atk: '#ff7a1a', hp: '#ff3b5c', def: '#4da3ff', heal: '#43ffa4' };
    return h(
      'div',
      h('div.section-h', `Account level ${d.accountLevel}`),
      h('div.help', { style: { textAlign: 'left', marginBottom: '10px' } }, 'Runs and the Signal Relay earn account XP. Each level raises talent caps and can unlock a milestone.'),
      p.trackInfo().map((t) =>
        h(
          'div.track',
          h('div.ti', { style: { color: colors[t.id] } }, icons[t.id]),
          h('div', h('div.nm', `${t.name} `, h('span', { style: { color: 'var(--dim)', fontSize: '12px' } }, `${t.level}/${t.cap}`)), h('div.ds', t.desc(t.level))),
          h(
            'button.btn.small.primary',
            {
              disabled: !p.canBuyTrack(t.id),
              onclick: () => {
                if (p.buyTrack(t.id)) {
                  audio.levelUp();
                  haptic(15);
                }
              },
            },
            t.level >= t.cap ? 'Capped' : h('span', coin('gold'), ' ', fmtNum(t.cost)),
          ),
        ),
      ),
      h('div.section-h', 'Milestones'),
      MILESTONES.map((m) =>
        h(
          'div.mile' + (d.accountLevel >= m.level ? '' : '.off'),
          h('div.ml', `LV${m.level}`),
          h('div', h('b', m.name), h('div', { style: { color: 'var(--dim)', fontSize: '12px' } }, m.desc)),
          d.accountLevel >= m.level ? h('span.ok', '✓') : null,
        ),
      ),
    );
  }

  // ------------------------------------------------------------------ supply

  private supplyTab() {
    const p = this.p;
    const d = p.data;
    const relay = p.relayPending();
    const rates = p.relayRates();
    return h(
      'div',
      h(
        'div.crate-card',
        h('div.section-h', { style: { justifyContent: 'center', margin: '0' } }, 'Supply Crate'),
        h('div.crate-art', h('div.l'), h('div.b'), h('div.s')),
        h('div.help', { style: { marginTop: 0, marginBottom: '10px' } }, 'One random piece of gear. Better odds than field drops.'),
        h(
          'button.btn.cyan',
          {
            disabled: d.keys <= 0,
            onclick: () => {
              const it = p.openCrate();
              if (it) {
                audio.pickup('chest');
                haptic(40);
                this.revealItem(it);
              }
            },
          },
          h('span', 'Open ', coin('key'), ` 1  (have ${d.keys})`),
        ),
      ),
      h(
        'div.crate-card',
        h('div.section-h', { style: { justifyContent: 'center', margin: '0' } }, 'Signal Relay'),
        h('div.help', { style: { marginTop: '6px' } }, `Earns while you're away · up to ${RELAY_CAP_H}h`),
        h('div.relay-meter', h('i', { style: { width: `${(relay.hours / RELAY_CAP_H) * 100}%` } })),
        h(
          'div',
          { style: { display: 'flex', gap: '14px', justifyContent: 'center', fontWeight: '700', margin: '6px 0 10px' } },
          h('span', coin('gold'), ' ', fmtNum(relay.gold)),
          h('span', coin('scrap'), ' ', relay.scrap),
          h('span', coin('xp'), ' ', relay.xp),
        ),
        h('div.help', { style: { marginTop: 0, marginBottom: '10px' } }, `${rates.goldPerH} gold/h · ${rates.scrapPerH} scrap/h — rates grow as you unlock sectors`),
        h(
          'button.btn.primary',
          {
            disabled: relay.gold < 1,
            onclick: () => {
              const r = p.claimRelay();
              audio.pickup('gold');
              toast(`+${fmtNum(r.gold)} gold, +${r.scrap} scrap`, '#ffd34d');
            },
          },
          'Claim',
        ),
      ),
      h(
        'div.crate-card',
        h('div.section-h', { style: { justifyContent: 'center', margin: '0' } }, 'Sign-in Calendar'),
        h('div.help', { style: { marginTop: '6px', marginBottom: '10px' } }, `Day ${(d.login.claimed % LOGIN_DAYS) + 1} of 7 · Day 7 is a guaranteed Rare item`),
        h('button.btn' + (p.dailyAvailable() ? '.primary' : ''), { onclick: () => this.calendar() }, p.dailyAvailable() ? 'Claim today' : 'View calendar'),
      ),
    );
  }

  /** Open the sign-in calendar automatically once per day, the first time the lobby is shown. */
  private autoCalendarFor = '';
  maybeCalendar() {
    const today = new Date().toDateString();
    if (this.autoCalendarFor === today || !this.p.dailyAvailable() || !this.p.data.seenIntro || this.p.data.stats.runs < 1) return;
    if (document.querySelector('#ui > .modal')) return;
    this.autoCalendarFor = today;
    this.calendar();
  }

  calendar() {
    this.closeModal();
    const p = this.p;
    const lg = p.data.login;
    const today = lg.claimed % LOGIN_DAYS;
    const can = p.dailyAvailable();
    const cycleStart = lg.claimed - today; // claims before this 7-day page
    const tiles = Array.from({ length: LOGIN_DAYS }, (_, i) => {
      const r = loginReward(i, p.data.unlocked);
      const done = cycleStart + i < lg.claimed;
      const isToday = i === today && can;
      const big = i === LOGIN_DAYS - 1;
      return h(
        'div.cal-day' + (done ? '.done' : '') + (isToday ? '.today' : '') + (big ? '.big' : ''),
        h('small', `Day ${i + 1}`),
        h(
          'div.cal-rw',
          r.itemRarity !== undefined ? h('span.cal-item', { style: { borderColor: RARITY_COLORS[r.itemRarity], color: RARITY_COLORS[r.itemRarity] } }, '?') : null,
          r.gold ? h('span', coin('gold'), fmtNum(r.gold)) : null,
          r.scrap ? h('span', coin('scrap'), r.scrap) : null,
          r.keys ? h('span', coin('key'), r.keys) : null,
        ),
        big ? h('b.cal-tag', { style: { color: RARITY_COLORS[2] } }, 'RARE GEAR') : null,
        done ? h('i.cal-ok', '✓') : null,
      );
    });
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const left = Math.max(0, midnight.getTime() - Date.now());
    const claim = () => {
      const r = p.claimDaily();
      if (!r) return;
      audio.pickup('chest');
      haptic(40);
      if (r.item) this.revealItem(r.item);
      else {
        this.toastReward(r, '#5ef2ff');
        this.calendar();
      }
    };
    this.modal = h(
      'div.modal',
      { onclick: () => this.closeModal() },
      h(
        'div.sheet.cal',
        { onclick: (e: Event) => e.stopPropagation() },
        h('h2', 'Sign-in Calendar'),
        h('div.cal-sub', lg.streak > 1 ? `🔥 ${lg.streak}-day streak` : 'A reward every day you play', ' · missed days just wait for you'),
        h('div.cal-grid', tiles),
        h(
          'button.btn.big' + (can ? '.primary' : ''),
          { style: { width: '100%', marginTop: '12px' }, disabled: !can, onclick: claim },
          can ? `Claim Day ${today + 1}` : `Next reward in ${Math.floor(left / 3.6e6)}h ${Math.floor((left % 3.6e6) / 6e4)}m`,
        ),
        h('button.btn.ghost', { style: { width: '100%', marginTop: '6px' }, onclick: () => this.closeModal() }, 'Close'),
      ),
    );
    document.getElementById('ui')!.append(this.modal);
  }

  revealItem(it: GearItem) {
    this.closeModal();
    const def = GEAR[it.def];
    const col = RARITY_COLORS[it.rarity];
    this.modal = h(
      'div.modal',
      { onclick: () => this.closeModal() },
      h('div.chest-box', { style: { background: `radial-gradient(circle, ${col}88, transparent 70%)` } }, h('img', { src: gearIcon(def.slot, col, it.def), style: { width: '96px', height: '96px' } })),
      h('div.rar', { style: { color: col, fontWeight: '800', letterSpacing: '.14em' } }, RARITIES[it.rarity].toUpperCase()),
      h('h2', def.name),
      h('div.sub', def.flavor),
      h('div.actions', h('button.btn', { onclick: () => this.itemSheet(it.uid) }, 'Inspect'), h('button.btn.primary', { onclick: () => this.closeModal() }, 'Nice')),
    );
    document.getElementById('ui')!.append(this.modal);
  }
}
