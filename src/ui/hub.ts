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
import { ads, adsOn } from '../ads/ads';
import { DAILY_TIERS, ENDLESS_BOSS_EVERY, dailyChallenge, type RunMode } from '../sim/modes';
import { MILESTONES, accountXpNeed, type TrackId } from '../meta/talents';
import { drawHero } from '../render/art';
import { setHeroSkin } from '../render/hero';
import { CHARACTERS, charById } from '../meta/characters';
import { PASS_TIERS, SP_PER_TIER, passLevel, passReward, seasonOf } from '../meta/pass';
import { ENDLESS_BOARD, dailyBoard, getBoard, newCrewCode, validCrew, validName, type BoardRow } from '../net/leaderboard';
import { gearIcon, skillIcon } from '../render/icons';
import { BOSSES, GUN_IDS, WEAPONS, gunUnlock, isGun, runLengthFor, starTimes } from '../sim/data';
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

const avatarUrls = new Map<string, string>();
let currentSkin = 'courier';
/** Portrait of a character (cached per skin). Leaves the active skin as it found it. */
function portrait(id: string): string {
  const hit = avatarUrls.get(id);
  if (hit) return hit;
  setHeroSkin(id);
  const url = renderAvatar();
  setHeroSkin(currentSkin);
  avatarUrls.set(id, url);
  return url;
}
export function useSkin(id: string) {
  currentSkin = id;
  setHeroSkin(id);
}
function avatar(): string {
  return portrait(currentSkin);
}
function renderAvatar(): string {
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
  return c.toDataURL();
}

export class Hub {
  el: HTMLElement;
  private body: HTMLElement;
  private top: HTMLElement;
  private nav: HTMLElement;
  tab: Tab = 'deploy';
  private heroGun = 'pistol';
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
    // while a sheet is open the page behind it is hidden: rebuild it once, on close
    if (this.modal) this.bodyDirty = true;
    else this.renderBody();
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
      drawHero(x, { t: this.t, moving: false, aim: Math.sin(this.t * 0.6) * 0.5, gun: this.heroGun });
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
        h('div.who', h('div.nm', charById(d.character).name), h('div.pw', coin('power'), fmtNum(this.p.power()))),
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
    const ps = p.pass();
    const passFrac = (ps.sp % SP_PER_TIER) / SP_PER_TIER;
    const passRing = h('span.rring.pass', { html: `<svg viewBox="0 0 36 36" preserveAspectRatio="none"><polygon vector-effect="non-scaling-stroke" points="9.5,2.5 26.5,2.5 34.5,18 26.5,33.5 9.5,33.5 1.5,18" pathLength="100" stroke-dasharray="${Math.round(passFrac * 100)} 100"/></svg>` });
    const relayRing = h('span.rring', { html: `<svg viewBox="0 0 36 36" preserveAspectRatio="none"><polygon vector-effect="non-scaling-stroke" points="9.5,2.5 26.5,2.5 34.5,18 26.5,33.5 9.5,33.5 1.5,18" pathLength="100" stroke-dasharray="${Math.round(relayFrac * 100)} 100"/></svg>` });

    // sector chest track
    const milestones: { bit: 1 | 2 | 4; label: string }[] = [
      { bit: 1, label: fmtTime(starTimes(runLengthFor(this.sector))[0]).replace(/^0/, '') },
      { bit: 2, label: fmtTime(starTimes(runLengthFor(this.sector))[1]).replace(/^0/, '') },
      { bit: 4, label: 'Clear' },
    ];
    const best = d.best[this.sector] ?? 0;
    const trackFill = stars & 4 ? 1 : Math.min(1, best / runLengthFor(this.sector));
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
          missionsLocked
            ? rail('missions', 'Missions', () => this.setTab('missions'), null, null, '.locked')
            : rail('pass', 'Pass', () => this.passSheet(), p.passClaimable() || null, passRing),
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
            h('div.sc-sub', locked ? `Clear Sector ${this.sector} to unlock` : best ? `Best ${fmtTime(Math.min(best, runLengthFor(this.sector)))} · ${(d.bestScore[this.sector] ?? 0).toLocaleString()} pts` : this.sector === 0 ? 'Training · 2-minute run · free revive' : 'Not attempted', h('span.sc-map', { html: icon('map', 14) }), 'Map'),
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
          this.lbButton('daily'),
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
        this.lbButton('endless'),
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

  /** Signal Pass: season track with free + premium rewards. */
  passSheet() {
    const p = this.p;
    const ps = p.pass();
    const se = seasonOf();
    const lvl = passLevel(ps.sp);
    const cell = (i: number, prem: boolean) => {
      const r = passReward(i, prem, p.data.unlocked);
      const done = prem ? !!(ps.prem & (1 << i)) : !!(ps.free & (1 << i));
      const ready = p.canClaimPass(i, prem);
      const locked = prem && !ps.premium;
      return h(
        'button.ps-cell' + (prem ? '.prem' : '') + (done ? '.done' : '') + (ready ? '.ready' : '') + (locked ? '.locked' : ''),
        {
          onclick: () => {
            const got = p.claimPass(i, prem);
            if (got) {
              audio.pickup('chest');
              haptic(25);
              if (got.item) this.revealItem(got.item);
              else {
                this.toastReward(got.reward, '#ffd34d');
                this.passSheet();
              }
            } else if (locked) toast('Signal Pass+ arrives with the app store release', '#8d97ab');
            else if (!done) toast(`Reach tier ${i + 1} to claim`, '#8d97ab');
          },
        },
        r.itemRarity !== undefined ? h('span.cal-item', { style: { borderColor: RARITY_COLORS[r.itemRarity], color: RARITY_COLORS[r.itemRarity] } }, '?') : null,
        r.gold ? h('span', coin('gold'), fmtNum(r.gold)) : null,
        r.scrap ? h('span', coin('scrap'), r.scrap) : null,
        r.keys ? h('span', coin('key'), r.keys) : null,
        done ? h('i.cal-ok', '✓') : locked ? h('i.ps-lock', { html: icon('lock', 12) }) : null,
      );
    };
    const rows = Array.from({ length: PASS_TIERS }, (_, i) =>
      h('div.ps-row' + (i < lvl ? '.reached' : ''), cell(i, false), h('b.ps-tier', i + 1), cell(i, true)),
    );
    const sheet = h(
      'div.sheet.pass',
      { onclick: (e: Event) => e.stopPropagation() },
      h('div.ps-head', h('small', `SEASON ${se.number} · ${se.daysLeft} DAYS LEFT`), h('h2', `Signal Pass: ${se.name}`)),
      h(
        'div.ps-prog',
        h('b', `Tier ${lvl}`),
        h('div.ps-bar', h('i', { style: { width: `${lvl >= PASS_TIERS ? 100 : ((ps.sp % SP_PER_TIER) / SP_PER_TIER) * 100}%` } })),
        h('small', lvl >= PASS_TIERS ? 'Maxed!' : `${ps.sp % SP_PER_TIER} / ${SP_PER_TIER} SP`),
      ),
      h('div.help', { style: { margin: '2px 0 8px' } }, 'Earn Signal Points from every run, daily missions and Daily Challenge tiers.'),
      h('div.ps-cols', h('span', 'FREE'), h('span'), h('span.prem', 'PASS+')),
      h('div.ps-list', rows),
      ps.premium ? null : h('button.btn.big', { style: { width: '100%', marginTop: '10px' }, disabled: true }, 'Signal Pass+ · coming with the app'),
      h('button.btn.ghost', { style: { width: '100%', marginTop: '6px' }, onclick: () => this.closeModal() }, 'Close'),
    );
    if (this.present(sheet, 'pass')) requestAnimationFrame(() => sheet.querySelector('.ps-cell.ready, .ps-row:not(.reached)')?.scrollIntoView({ block: 'center' }));
  }

  private lbButton(mode: 'daily' | 'endless') {
    return h('button.lb-btn', { onclick: () => this.leaderboard(mode), 'aria-label': 'Leaderboard' }, '🏆', h('span', 'Ranks'));
  }

  /** Leaderboard sheet: call-sign setup on first open, then Crew / Everyone boards. */
  leaderboard(mode: 'daily' | 'endless', scope: 'crew' | 'all' | null = null) {
    this.closeModal();
    const p = this.p;
    const o = p.data.online;
    const sheet = h('div.sheet.lb', { onclick: (e: Event) => e.stopPropagation() });
    this.modal = h('div.modal', { onclick: this.backdrop }, sheet);
    document.getElementById('ui')!.append(this.modal);
    if (!o.name) return this.lbSetup(sheet, mode);
    const sc = scope ?? (o.crew ? 'crew' : 'all');
    const board = mode === 'daily' ? dailyBoard(p.dailyState().key) : ENDLESS_BOARD;
    const list = h('div.lb-list', h('div.lb-msg', 'Loading…'));
    const seg = (label: string, on: boolean, fn: () => void, dis = false) => h('button.mt' + (on ? '.on' : '') + (dis ? '.lock' : ''), { onclick: fn }, label);
    sheet.append(
      h('h2', '🏆 Leaderboard'),
      h(
        'div.mode-tabs.lb-tabs',
        seg('Daily', mode === 'daily', () => this.leaderboard('daily', sc)),
        seg('Endless', mode === 'endless', () => this.leaderboard('endless', sc)),
      ),
      h(
        'div.mode-tabs.lb-tabs',
        seg(o.crew ? `Crew ${o.crew}` : 'Crew', sc === 'crew', () => (o.crew ? this.leaderboard(mode, 'crew') : this.lbSetup(sheet, mode, true)), !o.crew),
        seg('Everyone', sc === 'all', () => this.leaderboard(mode, 'all')),
      ),
      list,
      o.crew
        ? h(
            'button.lb-share',
            {
              onclick: () => {
                const text = `Join my Dead Signal crew! Code: ${o.crew}  ${location.origin}${location.pathname}`;
                const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
                if (nav.share) nav.share({ text }).catch(() => {});
                else navigator.clipboard?.writeText(text).then(() => toast('Crew invite copied', '#43ffa4'));
              },
            },
            `Invite family · crew code ${o.crew}`,
          )
        : h('span'),
      h('button.btn.ghost', { style: { width: '100%', marginTop: '6px' }, onclick: () => this.lbSetup(sheet, mode, true) }, `${o.name} · edit name / crew`),
    );
    getBoard(board, sc === 'crew' ? o.crew : '', p.playerId(), 50).then((rows) => {
      if (!list.isConnected) return;
      if (rows === null) {
        list.replaceChildren(h('div.lb-msg', "Couldn't reach the leaderboard. Your scores upload automatically next time you're online."));
        return;
      }
      if (!rows.length) {
        list.replaceChildren(h('div.lb-msg', mode === 'daily' ? 'No scores yet today. Be the first!' : 'No Endless runs yet. Set the record!'));
        return;
      }
      list.replaceChildren(...rows.map((r) => this.lbRow(r, mode)));
      list.querySelector('.me')?.scrollIntoView({ block: 'center' });
    });
  }

  private lbRow(r: BoardRow, mode: 'daily' | 'endless') {
    const medal = r.rnk === 1 ? '🥇' : r.rnk === 2 ? '🥈' : r.rnk === 3 ? '🥉' : String(r.rnk);
    return h(
      'div.lb-row' + (r.me ? '.me' : ''),
      h('b.lb-rk', medal),
      h('img', { src: portrait(CHARACTERS.some((c) => c.id === r.hero) ? r.hero : 'courier'), alt: '' }),
      h('div.lb-nm', h('span', r.name), h('small', mode === 'endless' ? `${fmtTime(r.run_time)} survived` : charById(r.hero).name)),
      h('b.lb-sc', r.score.toLocaleString()),
    );
  }

  private lbSetup(sheet: HTMLElement, mode: 'daily' | 'endless', editing = false) {
    const o = this.p.data.online;
    const name = h('input.lb-in', { value: o.name, placeholder: 'Call sign (2–16 letters)', maxlength: '16' }) as HTMLInputElement;
    const crew = h('input.lb-in', { value: o.crew, placeholder: 'Crew code', maxlength: '8', style: { textTransform: 'uppercase' } }) as HTMLInputElement;
    sheet.replaceChildren(
      h('h2', editing ? 'Your call sign' : 'Join the leaderboard'),
      h('div.help', { style: { marginTop: 0 } }, 'Pick a name for the boards. Share a crew code with family to get your own private ranking.'),
      name,
      h('div.lb-crewrow', crew, h('button.btn.small.cyan', { onclick: () => (crew.value = newCrewCode()) }, 'New crew')),
      h(
        'button.btn.primary.big',
        {
          style: { width: '100%', marginTop: '10px' },
          onclick: () => {
            const c = crew.value.trim().toUpperCase();
            if (!validName(name.value)) return toast('Call sign needs 2–16 characters', '#ff5c7a');
            if (!validCrew(c)) return toast('Crew codes are 4–8 letters/numbers', '#ff5c7a');
            this.p.setOnline(name.value, c);
            audio.levelUp();
            this.p.flushScores();
            this.leaderboard(mode);
          },
        },
        'Save',
      ),
      h('button.btn.ghost', { style: { width: '100%', marginTop: '6px' }, onclick: () => this.closeModal() }, 'Not now'),
    );
    setTimeout(() => name.focus(), 50);
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
            if (c.kind === 'crate' && d.keys < before.k) {
              const got = d.gear.slice(-(before.k - d.keys));
              this.revealMany(got);
            } else if (c.kind === 'collect') {
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
      { onclick: this.backdrop },
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
    const sel = charById(p.data.character);
    const roster = h(
      'div.roster',
      CHARACTERS.map((c) => {
        const open = p.charUnlocked(c.id);
        const on = c.id === sel.id;
        return h(
          'button.ch-card' + (on ? '.on' : '') + (open ? '' : '.lock'),
          {
            onclick: () => {
              if (!open) {
                audio.click();
                toast(`Clear Sector ${c.unlock} to unlock ${c.name}`, '#8d97ab');
                return;
              }
              useSkin(c.id);
              if (p.selectCharacter(c.id)) {
                audio.levelUp();
                haptic(15);
              }
            },
          },
          h('img', { src: portrait(c.id), alt: c.name }),
          h('b', c.name),
          h('small', open ? c.role : `Sector ${c.unlock}`),
          open ? null : h('i.lk', { html: icon('lock', 14) }),
        );
      }),
    );
    const gunNow = p.gun();
    this.heroGun = isGun(b.startWeapon) ? b.startWeapon : 'pistol';
    const wgear = p.data.equipped.weapon ? GEAR[p.item(p.data.equipped.weapon)!.def] : undefined;
    const extra = wgear?.startWeapon && wgear.startWeapon !== 'pistol' ? WEAPONS[wgear.startWeapon].name : null;
    const guns = h(
      'div.roster.guns',
      GUN_IDS.map((id) => {
        const wd = WEAPONS[id];
        const open = p.gunsUnlocked().includes(id);
        const on = id === gunNow;
        return h(
          'button.ch-card.gun' + (on ? '.on' : '') + (open ? '' : '.lock'),
          {
            style: on ? { borderColor: wd.color, boxShadow: `0 0 14px ${wd.color}55` } : undefined,
            onclick: () => {
              if (!open) {
                audio.click();
                toast(`Clear Sector ${gunUnlock(id)} to unlock the ${wd.name}`, '#8d97ab');
                return;
              }
              if (on) return;
              p.setGun(id);
              audio.levelUp();
              haptic(15);
              toast(`${wd.name} equipped`, wd.color);
              this.renderBody();
            },
          },
          h('img', { src: skillIcon(id), alt: wd.name }),
          h('b', wd.name),
          h('small', open ? (on ? 'Equipped' : 'Tap to equip') : `Sector ${gunUnlock(id)}`),
          open ? null : h('i.lk', { html: icon('lock', 14) }),
        );
      }),
    );
    const gd = WEAPONS[gunNow];
    return h(
      'div',
      h('div.section-h', 'Primary Gun', h('span.reset', `${p.gunsUnlocked().length}/${GUN_IDS.length} unlocked`)),
      guns,
      h(
        'div.ch-perk',
        h('b', `${gd.name} · evolves into ${gd.evoName}`),
        h('span', extra ? `${gd.gun!.blurb} Your ${wgear!.name} adds the ${extra} as a second weapon.` : gd.gun!.blurb),
      ),
      h('div.section-h', 'Couriers', h('span.reset', `${CHARACTERS.filter((c) => p.charUnlocked(c.id)).length}/${CHARACTERS.length} unlocked`)),
      roster,
      h('div.ch-perk', h('b', `${sel.name} · ${sel.role}`), h('span', sel.perk)),
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
    this.modalKey = '';
    if (this.bodyDirty) {
      this.bodyDirty = false;
      this.renderBody();
    }
  }

  private modalKey = '';
  /**
   * Close only when the dim backdrop itself is tapped. Without this, a button inside a modal
   * that opens another sheet (e.g. "Inspect" on a crate reveal) had its click bubble up to the old
   * backdrop and immediately close the sheet it had just opened.
   */
  private backdrop = (e: Event) => {
    if (e.target === e.currentTarget) this.closeModal();
  };
  private bodyDirty = false;

  /**
   * Show a sheet. Re-showing the same sheet (after an upgrade, a claim...) swaps its contents in
   * place: no fade, no re-blur, scroll kept. Re-creating the modal on every tap made the gear
   * screen flash and stall on phones.
   */
  private present(sheet: HTMLElement, key: string) {
    if (this.modal && this.modalKey === key) {
      const old = this.modal.querySelector('.sheet');
      const scrolls = old ? [old, ...Array.from(old.querySelectorAll('.ps-list, .map-list, .lb-list'))].map((e) => e.scrollTop) : [];
      this.modal.replaceChildren(sheet);
      [sheet, ...Array.from(sheet.querySelectorAll('.ps-list, .map-list, .lb-list'))].forEach((e, i) => (e.scrollTop = scrolls[i] ?? 0));
      return false;
    }
    this.closeModal();
    this.modal = h('div.modal', { onclick: this.backdrop }, sheet);
    this.modalKey = key;
    document.getElementById('ui')!.append(this.modal);
    return true;
  }

  itemSheet(uid: string) {
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
        def.startWeapon && def.startWeapon !== 'pistol' ? h('div.kv', h('span', 'Bonus weapon'), h('b', WEAPONS[def.startWeapon].name)) : null,
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
    this.present(sheet, 'item:' + uid);
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
        adsOn()
          ? h(
              'button.btn.ad-btn',
              {
                style: { marginTop: '8px' },
                disabled: p.adKeysLeft() <= 0,
                onclick: () =>
                  ads.showRewarded('key').then((ok) => {
                    if (ok && p.grantAdKey()) {
                      audio.pickup('chest');
                      toast('+1 crate key', '#5ef2ff');
                    }
                  }),
              },
              h('span.ad-play', '▶'),
              p.adKeysLeft() > 0 ? `Watch ad · Free key (${p.adKeysLeft()} left today)` : 'Free keys: back tomorrow',
            )
          : null,
        d.keys > 1
          ? h(
              'button.btn.primary',
              {
                style: { marginTop: '8px' },
                onclick: () => {
                  const items = p.openAllCrates();
                  if (items.length) {
                    audio.pickup('chest');
                    haptic(60);
                    this.revealMany(items);
                  }
                },
              },
              h('span', 'Open all ', coin('key'), ` ${d.keys}`),
            )
          : null,
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
    this.present(
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
      'cal',
    );
  }

  /** Results of "Open all": every item at once, best first, with the haul summarised. */
  revealMany(items: GearItem[]) {
    if (items.length === 1) return this.revealItem(items[0]);
    this.closeModal();
    const sorted = items.slice().sort((a, b) => b.rarity - a.rarity);
    const best = sorted[0];
    const counts = RARITIES.map((name, r) => [name, items.filter((i) => i.rarity === r).length] as const).filter(([, n]) => n > 0).reverse();
    const bc = RARITY_COLORS[best.rarity];
    const mergeable = this.p.data.gear.some((g) => this.p.mergeMates(g.uid).length >= MERGE_COUNT - 1);
    this.modal = h(
      'div.modal',
      { onclick: this.backdrop },
      h(
        'div.sheet.haul',
        { onclick: (e: Event) => e.stopPropagation() },
        h('h2', `${items.length} crates opened`),
        h('div.haul-sum', counts.map(([name, n]) => h('span', { style: { color: RARITY_COLORS[RARITIES.indexOf(name)] } }, `${n} ${name}`))),
        h(
          'button.haul-best',
          { style: { borderColor: bc, background: `radial-gradient(circle at 30% 50%, ${bc}33, transparent 70%)` }, onclick: () => this.itemSheet(best.uid) },
          h('img', { src: gearIcon(GEAR[best.def].slot, bc, best.def) }),
          h('div', h('small', { style: { color: bc } }, `BEST · ${RARITIES[best.rarity].toUpperCase()}`), h('b', GEAR[best.def].name)),
        ),
        h(
          'div.haul-grid',
          sorted.map((it, i) =>
            h(
              'button.item',
              { onclick: () => this.itemSheet(it.uid), style: { borderColor: RARITY_COLORS[it.rarity], animationDelay: `${Math.min(i, 30) * 35}ms` } },
              h('img', { src: gearIcon(GEAR[it.def].slot, RARITY_COLORS[it.rarity], it.def), alt: GEAR[it.def].name }),
            ),
          ),
        ),
        h(
          'div.row',
          { style: { marginTop: '10px' } },
          mergeable
            ? h(
                'button.btn.cyan',
                {
                  onclick: () => {
                    const n = this.p.mergeAll();
                    audio.pickup('chest');
                    haptic(30);
                    toast(n ? `Merged ${n} time${n > 1 ? 's' : ''}` : 'Nothing to merge', '#43ffa4');
                    this.closeModal();
                    this.setTab('armory');
                  },
                },
                'Merge all',
              )
            : h('button.btn', { onclick: () => (this.closeModal(), this.setTab('armory')) }, 'Armory'),
          h('button.btn.primary', { onclick: () => this.closeModal() }, 'Nice'),
        ),
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
      { onclick: this.backdrop },
      h('div.chest-box', { style: { background: `radial-gradient(circle, ${col}88, transparent 70%)` } }, h('img', { src: gearIcon(def.slot, col, it.def), style: { width: '96px', height: '96px' } })),
      h('div.rar', { style: { color: col, fontWeight: '800', letterSpacing: '.14em' } }, RARITIES[it.rarity].toUpperCase()),
      h('h2', def.name),
      h('div.sub', def.flavor),
      h('div.actions', h('button.btn', { onclick: () => this.itemSheet(it.uid) }, 'Inspect'), h('button.btn.primary', { onclick: () => this.closeModal() }, 'Nice')),
    );
    document.getElementById('ui')!.append(this.modal);
  }
}
