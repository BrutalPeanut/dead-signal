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
import { MILESTONES, accountXpNeed, type TrackId } from '../meta/talents';
import { drawHero } from '../render/art';
import { gearIcon, skillIcon } from '../render/icons';
import { BOSSES, WEAPONS } from '../sim/data';
import { CHAPTER_COUNT, getChapter } from '../sim/chapters';
import { coin, fmtNum, fmtTime, h, haptic, toast } from './dom';
import { HomeScene } from './homeScene';

export type Tab = 'deploy' | 'armory' | 'talents' | 'supply';

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

  constructor(private p: Profile, private onDeploy: (sector: number) => void, private onSettings: () => void) {
    this.sector = p.data.unlocked;
    this.top = h('div.topbar');
    this.body = h('div.hub-body');
    this.nav = h('div.nav');
    this.el = h('div.hub', this.top, this.body, this.nav);
    p.onChange(() => this.refresh());
    this.refresh();
  }

  refresh() {
    this.renderTop();
    this.renderNav();
    this.renderBody();
  }

  setTab(t: Tab) {
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
      x.translate(w / 2, hh * 0.62);
      x.scale(hh / 70, hh / 70);
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
    this.top.replaceChildren(
      h(
        'div.acct',
        h('div.lv', d.accountLevel),
        h(
          'div',
          h('div.pw', coin('power'), fmtNum(this.p.power())),
          h('div.bar', h('i', { style: { width: `${(d.accountXp / need) * 100}%` } })),
        ),
      ),
      h(
        'div.wallet',
        h('div.w', coin('gold'), fmtNum(d.gold)),
        h('div.w', coin('scrap'), fmtNum(d.scrap)),
        h('div.w', coin('key'), d.keys),
      ),
      h('button.btn.small.ghost', { onclick: this.onSettings, 'aria-label': 'Settings', style: { padding: '6px 8px', fontSize: '18px' } }, '⚙'),
    );
  }

  private renderNav() {
    const supplyDot = this.p.data.keys > 0 || this.p.dailyAvailable() || this.p.relayPending().hours >= 1;
    const armoryDot = this.p.data.gear.some((g) => this.p.mergeMates(g.uid).length >= MERGE_COUNT - 1);
    const talentDot = this.p.trackInfo().some((t) => this.p.canBuyTrack(t.id));
    const b = (t: Tab, ico: string, label: string, dot = false) =>
      h('button' + (this.tab === t ? '.on' : ''), { onclick: () => this.setTab(t) }, h('span.ico', ico), label, dot ? h('i.dot') : null);
    this.nav.replaceChildren(
      b('armory', '🛡️', 'Armory', armoryDot),
      b('deploy', '☢️', 'Deploy'),
      b('talents', '⚡', 'Talents', talentDot),
      b('supply', '📦', 'Supply', supplyDot),
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
    }
  }

  // ------------------------------------------------------------------ deploy

  private deployTab() {
    const d = this.p.data;
    const ch = getChapter(this.sector);
    const locked = this.sector > d.unlocked;
    const stars = d.stars[this.sector] ?? 0;
    const power = this.p.power();
    this.scene.setSector(this.sector);
    const select = (i: number) => {
      if (i === this.sector) return;
      this.sector = i;
      audio.click();
      haptic(8);
      this.renderBody();
    };
    const relay = this.p.relayPending();
    const daily = this.p.dailyAvailable();
    const powerCls = power >= ch.power ? 'ok' : power >= ch.power * 0.75 ? 'warn' : 'bad';
    const route = h(
      'div.route',
      Array.from({ length: CHAPTER_COUNT }, (_, i) => {
        const st = d.stars[i] ?? 0;
        const lock = i > d.unlocked;
        const cls = ['node', i === this.sector ? 'sel' : '', lock ? 'lock' : '', st & 4 ? 'clear' : '', i === d.unlocked ? 'next' : ''].filter(Boolean).join('.');
        return h(
          'button.' + cls,
          { onclick: () => select(i), 'aria-label': `Sector ${i + 1}` },
          h('b', lock ? '🔒' : i + 1),
          h('span.pips', [1, 2, 4].map((bit) => h(st & bit ? 'i.on' : 'i'))),
        );
      }),
    );
    requestAnimationFrame(() => route.querySelector('.sel')?.scrollIntoView({ inline: 'center', block: 'nearest' }));
    return h(
      'div.home',
      h(
        'div.stage',
        this.scene.canvas,
        h('div.logo-sm', 'DEAD SIGNAL'),
        h(
          'div.stage-info',
          h('div.sec', `SECTOR ${this.sector + 1} · ${ch.biome.toUpperCase()}`),
          h('div.nm', ch.name),
          h('div.stars', [1, 2, 4].map((bit) => h(stars & bit ? 'i.on' : 'i'))),
        ),
      ),
      route,
      h(
        'div.brief',
        h('div.chip', h('small', '5:00'), BOSSES[ch.midBoss].name),
        h('div.chip.final', h('small', '10:00'), BOSSES[ch.finalBoss].name),
        h('div.chip.pow.' + powerCls, h('small', 'Rec. power'), coin('power'), fmtNum(ch.power)),
      ),
      h(
        'div.deploy',
        h(
          'button.btn.primary.big.go',
          {
            disabled: locked,
            onclick: () => {
              haptic(20);
              this.onDeploy(this.sector);
            },
          },
          locked ? `🔒 Clear Sector ${this.sector}` : h('span', 'Deploy', h('small', d.best[this.sector] ? `Best ${fmtTime(d.best[this.sector])}` : 'Survive 10:00')),
        ),
      ),
      h(
        'div.tiles',
        h(
          'button.tile' + (relay.hours >= 1 ? '.ready' : ''),
          { onclick: () => this.setTab('supply') },
          h('div.ti-h', 'Relay'),
          h('div.ti-v', coin('gold'), fmtNum(relay.gold)),
          h('div.relay-meter', h('i', { style: { width: `${(relay.hours / RELAY_CAP_H) * 100}%` } })),
        ),
        h(
          'button.tile' + (daily ? '.ready' : ''),
          { onclick: () => this.setTab('supply') },
          h('div.ti-h', 'Daily'),
          h('div.ti-v', daily ? 'Ready!' : 'Claimed'),
        ),
        h(
          'button.tile' + (d.keys > 0 ? '.ready' : ''),
          { onclick: () => this.setTab('supply') },
          h('div.ti-h', 'Crates'),
          h('div.ti-v', coin('key'), d.keys),
        ),
      ),
      h(
        'button.loadline',
        { onclick: () => this.setTab('armory') },
        h('img', { src: skillIcon(this.p.baseStats().startWeapon) }),
        h('span', 'Starting weapon: ', h('b', WEAPONS[this.p.baseStats().startWeapon].name)),
        h('span.arrow', '›'),
      ),
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
        h('div.section-h', { style: { justifyContent: 'center', margin: '0' } }, 'Daily Ration'),
        h('div.help', { style: { marginTop: '6px', marginBottom: '10px' } }, 'Gold and a crate key, once a day.'),
        h(
          'button.btn',
          {
            disabled: !p.dailyAvailable(),
            onclick: () => {
              const r = p.claimDaily();
              if (r) {
                audio.pickup('chest');
                toast(`+${fmtNum(r.gold)} gold, +1 key`, '#5ef2ff');
              }
            },
          },
          p.dailyAvailable() ? 'Claim' : 'Come back tomorrow',
        ),
      ),
    );
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
