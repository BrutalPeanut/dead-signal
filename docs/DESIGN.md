# Dead Signal — Design Doc

> A broadcast went out at 03:14 and turned the city. You're the last courier with a working signal rig.
> Survive the night, kill the source, move to the next sector.

Dead Signal is a portrait-first, one-thumb survivor-like ("bullet heaven") in the mold of Survivor.io,
built for mobile web (TypeScript + Canvas 2D, no engine). This doc records **why** each system exists,
grounded in research on what made Survivor.io and Vampire Survivors work — and where players say they fail.

---

## 1. What makes the genre work (research summary)

| Pillar | Evidence | How Dead Signal uses it |
|---|---|---|
| **One-finger control, auto-aim** | Survivor.io is played with one finger and auto-aim; camera zoomed out so movement matters more than aiming ([Naavik](https://naavik.co/deep-dives/survivorio-archeros-footsteps/)) | Floating virtual joystick anywhere on screen; all weapons auto-fire. Movement is the only skill input. |
| **Power fantasy, not bullet hell** | "Bullet heaven" — the player becomes an overwhelming force; low mechanical skill bar ([Boger](https://jboger.substack.com/p/the-secret-sauce-of-vampire-survivors)) | Late-run screens fill with evolved weapons deleting hundreds of zombies. Enemy count scales to ~400 on screen. |
| **Frequent small rewards + rare spikes** | Many small upgrades, occasional large ones, difficulty re-applies pressure | Level-up every ~10–20s early; evolutions and boss chests are the spikes. |
| **Pause on choice** | Pausing on level-up avoids attention fatigue | Game pauses on every level-up / chest. |
| **Strategy lives in combinations** | Single picks matter little; combos matter ([Boger]) | 8 weapons × 8 passives, each weapon has exactly one evolution partner. Readable 1:1 pairing like Survivor.io. |
| **Fixed boss arenas + warnings** | Habby replaced VS's shrinking ring with a stationary boss cage; clear warnings for waves and bosses ([PocketGamer.biz](https://www.pocketgamer.biz/how-innovation-and-iteration-has-transformed-survivorio/)) | Bosses spawn an energy cage you can't leave. Big red banners 5s before hordes and bosses. |
| **Light meta progression** | Gold carries over so failed runs aren't wasted ([Boger]) | Every run pays gold + account XP, even deaths. |
| **Gear with merging** | 6 slots, rarity tiers, merge duplicates to upgrade ([OCG](https://onechilledgamer.com/survivor-io-equipment-guide/)) | 6 slots, 6 rarities, merge 3 identical → next rarity, rarity unlocks perks. The weapon item picks your starting weapon. |
| **Passive income ("Patrol")** | Quick Patrol: hours of passive loot for a tap ([Gamigion](https://www.gamigion.com/survivor-io-the-progressive-monetization-masterclass/)) | "Signal Relay" accrues gold/scrap for up to 8h offline. |

### What players hate (and our fix)

| Complaint ([App Store analysis](https://kimola.com/reports/insightful-survivor-io-player-feedback-analysis-report-app-store-us-140531)) | Fix |
|---|---|
| Meat/bombs "almost never show up" | **Supply drops on a timer** (every ~40s) with pity: if HP < 40% the next drop is guaranteed meat. |
| Wins feel luck-based; evolution partner never offered | **Evolution-aware offers**: once a weapon is max, its partner passive gets heavy weight; elite/boss chests **always** evolve if eligible. 2 free rerolls per run (+talents). |
| 15-minute sessions are a big commitment ([Naavik]) | **10-minute chapters**, mid-boss at 5:00, final boss at 10:00. |
| Late rounds surround you with no hope | Spawns come from the camera edge in your movement direction *and* behind, with guaranteed escape gaps on horde waves (ring formations open a gap). |
| Spending money doesn't help | No IAP, no energy. Progress comes from play. |
| Progress wall / pace slows | Gear drop rates and gold scale with chapter; Signal Relay keeps trickling. |

## 2. Core run

- **Length:** 10:00. Timer counts up.
- **Beats:**
  - 0:00–1:30 warm-up (shamblers, runners).
  - 1:30 horde ring #1 (with gap).
  - 2:30 **Elite** → chest.
  - 4:00 horde.
  - 5:00 **Mid-boss** in a cage → chest (evolution if eligible).
  - 6:30 horde. 7:30 Elite. 8:30 horde (two rings).
  - 10:00 **Final boss** in a cage. Kill it = chapter clear.
- **Levels:** XP curve `need(L) = 5 + 6·L + 0.9·L²` → ~25–30 level-ups in a full run.
- **Choice:** 1 of 3 cards, weighted toward owned skills (finish what you started) and evolution partners.
- **Slots:** 6 weapons, 6 passives. Weapons and passives max at Lv5.
- **Evolution:** weapon Lv5 + its partner passive (any level) → next elite/boss chest upgrades it to the evolved form.
- **Pickups:** XP shards (green 1 / blue 5 / violet 25), gold chips, **Ration** (heal 30%), **Magnet** (vacuum all XP), **EMP** (kills non-boss enemies on screen).
- **Revive:** one per run if the *Second Wind* talent is owned.

## 3. Arsenal

| Weapon | Behaviour | Partner passive | Evolution |
|---|---|---|---|
| Pulse Pistol | Auto-aimed bolts at nearest enemy | Targeting Chip (+dmg) | **Railstorm** — piercing rail volleys |
| Orbit Blades | Blades orbit the player | Kinetic Plating (−dmg taken) | **Halo Saw** — permanent ring, double blades |
| Arc Coil | Lightning chains between enemies | Capacitor (−cooldown) | **Tesla Storm** — constant multi-chain |
| Frag Launcher | Lobbed explosive shells | Volatile Fuel (+area) | **Cluster Barrage** — shells split into bomblets |
| Plasma Field | Damaging aura, slows | Nano Medkit (+HP, regen) | **Event Horizon** — larger, pulls enemies in |
| Disc Launcher | Returning disc, pierces | Magnet Core (+pickup range) | **Gravity Disc** — 3 discs that drag enemies |
| Napalm | Fire pools | Thermal Gel (+duration) | **Inferno Grid** — pools chain-ignite |
| Ricochet Drill | Bounces off screen edges | Thruster Boots (+move speed) | **Hyperdrill** — multiple drills, never expire |

## 4. Enemies

| Type | Role |
|---|---|
| Shambler | baseline fodder |
| Runner | fast, fragile, punishes standing still |
| Crawler | tiny swarm packs |
| Brute | slow tank, knockback-resistant |
| Spitter | keeps range, lobs acid |
| Bloater | explodes on death — kill it at range |
| Elites | 8–12× HP, glowing, drop a chest |
| Bosses | **The Warden** (charge + shockwave), **Hive Mother** (brood + acid spray), **Signal Colossus** (laser sweeps + mortars) |

## 5. Meta progression

- **Sectors (chapters):** 3 biomes (Downtown, Biolab, Spaceport) × difficulty tiers. Each clear unlocks the next. Stars: survive 5:00, survive 8:00, clear.
- **Gold:** levels gear, buys talents.
- **Gear:** 6 slots — Weapon, Visor, Vest, Gloves, Belt, Boots.
  - Rarities: Common → Uncommon → Rare → Epic → Legendary → Mythic.
  - Merge **3 identical** (same item + rarity) → next rarity.
  - Max level per rarity: 10/20/30/40/50/60.
  - Rare+ unlock item perks (e.g. Vest at Epic: +15% Ration healing).
  - The **Weapon** item picks your starting weapon (variety without new heroes).
- **Talents:** account level gates stat tracks (ATK, HP, DEF, Heal) bought with gold, plus milestone talents (Reroll+, Second Wind revive, Head Start, Magnet+).
- **Supply crates:** keys from chapter clears and daily login open crates with random gear.
- **Signal Relay:** idle gold/scrap, up to 8 hours.

## 6. Tech

- `src/sim/` — deterministic simulation (no DOM). Runs headless for balance tests.
- `src/render/` — procedural vector art cached to offscreen sprites; particles; camera.
- `src/meta/` — save data, gear, talents, economy.
- `src/ui/` — DOM screens over the canvas.
- Spatial hash for collisions; object pools; ~400 enemies at 60fps on mid phones.
