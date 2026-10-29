import {
  MAX_PASSIVE_SLOTS,
  MAX_SKILL_LEVEL,
  MAX_WEAPON_SLOTS,
  PASSIVE_IDS,
  PASSIVES,
  WEAPON_IDS,
  WEAPONS,
} from './data';
import type { Rng } from './math';
import type { Offer, PassiveState, WeaponState } from './types';

/**
 * Build level-up choices. Weighting is the heart of "it doesn't feel like luck":
 *  - owned skills are favoured so builds come together,
 *  - a maxed weapon's evolution partner is strongly favoured (players' #1 complaint is never seeing it),
 *  - new weapons are favoured early when slots are empty.
 */
export function buildOffers(
  rng: Rng,
  weapons: WeaponState[],
  passives: PassiveState[],
  n = 3,
  rules: { maxW: number; maxP: number; weapons: string[] | null } = { maxW: MAX_WEAPON_SLOTS, maxP: MAX_PASSIVE_SLOTS, weapons: null },
): Offer[] {
  // starter kit: only these weapons, and only the supports that pair with them
  const allowW = rules.weapons ? new Set([...rules.weapons, ...weapons.map((w) => w.id)]) : null;
  const allowP = allowW ? new Set([...allowW].map((id) => WEAPONS[id as keyof typeof WEAPONS].partner as string)) : null;
  const cands: { o: Offer; w: number }[] = [];
  const ownedW = new Map(weapons.map((w) => [w.id, w]));
  const hasGun = weapons.some((w) => WEAPONS[w.id].gun);
  const ownedP = new Map(passives.map((p) => [p.id, p]));
  const neededPartners = new Set(
    weapons.filter((w) => !w.evolved && w.level >= MAX_SKILL_LEVEL).map((w) => WEAPONS[w.id].partner),
  );
  const wantedPartners = new Set(weapons.filter((w) => !w.evolved).map((w) => WEAPONS[w.id].partner));

  for (const id of WEAPON_IDS) {
    const st = ownedW.get(id);
    if (st) {
      if (!st.evolved && st.level < MAX_SKILL_LEVEL)
        cands.push({ o: { type: 'weapon', id, level: st.level + 1, isNew: false }, w: 3.2 });
    } else if (WEAPONS[id].gun && (id !== 'pistol' || hasGun)) {
      // one primary gun at a time: guns are picked in the Armory, never found mid-run. (The Pulse
      // Pistol can still turn up for a run that started with non-gun weapon gear.)
      continue;
    } else if (weapons.length < rules.maxW && (!allowW || allowW.has(id))) {
      const early = weapons.length < 3 ? 1.6 : 1;
      cands.push({ o: { type: 'weapon', id, level: 1, isNew: true }, w: 1.4 * early });
    }
  }
  for (const id of PASSIVE_IDS) {
    const st = ownedP.get(id);
    let w = 0;
    let lvl = 1;
    let isNew = true;
    if (st) {
      if (st.level >= MAX_SKILL_LEVEL) continue;
      w = 2.2;
      lvl = st.level + 1;
      isNew = false;
    } else if (passives.length < rules.maxP && (!allowP || allowP.has(id))) {
      w = 1.1;
    } else continue;
    if (neededPartners.has(id) && isNew) w *= 16;
    else if (wantedPartners.has(id) && isNew) w *= 1.6;
    cands.push({ o: { type: 'passive', id, level: lvl, isNew }, w });
  }

  const out: Offer[] = [];
  const pool = cands.slice();
  while (out.length < n && pool.length) {
    const i = rng.weighted(pool.map((c) => c.w));
    out.push(pool[i].o);
    pool.splice(i, 1);
  }
  // Everything maxed: fillers so the screen is never empty.
  if (out.length === 0) out.push({ type: 'heal' }, { type: 'gold' });
  else if (out.length < n && !out.some((o) => o.type === 'heal')) out.push({ type: 'heal' });
  return out;
}

export function offerTitle(o: Offer): string {
  switch (o.type) {
    case 'weapon':
      return WEAPONS[o.id].name;
    case 'passive':
      return PASSIVES[o.id].name;
    case 'heal':
      return 'Field Ration';
    case 'gold':
      return 'Scavenged Cache';
  }
}

export function offerDesc(o: Offer): string {
  switch (o.type) {
    case 'weapon':
      return o.isNew ? WEAPONS[o.id].desc : WEAPONS[o.id].levelText[o.level - 1] ?? 'Upgrade';
    case 'passive': {
      const p = PASSIVES[o.id];
      return `${p.desc}.`;
    }
    case 'heal':
      return 'Restore 30% HP.';
    case 'gold':
      return '+40 gold.';
  }
}
