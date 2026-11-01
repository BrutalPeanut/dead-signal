# Dead Signal

A Survivor.io-style sci-fi zombie survivor (auto-aim, level-up picks, gun evolutions, gear meta,
Ascension) for phones and PC, built with Vite + TypeScript + Three.js. Live at
https://deadsignal.info. Owner: Brian (BShack).

## Ground rules

- **Every change goes through a PR.** Branch from `main`, open a PR, merge it. A push to `main`
  auto-deploys to GitHub Pages (`.github/workflows/deploy.yml` runs `npm test` and `npm run build`
  first; CI does not run on PRs, so run both locally before merging).
- **Don't break gameplay.** Test balance and progression changes with the bots (below), not by feel.
- **Ads must never interrupt gameplay.** Rewarded, opt-in, lobby/results screens only. No
  interstitials, no banners, nothing mid-run.
- **Always give Brian the play link** (https://deadsignal.info, or a `?playtest=N` link) when
  reporting work.
- Players' saves are sacred: any save-format change needs a migration in `normalizeSave`
  (`src/meta/profile.ts`) and a test.

## Commands

```bash
npm run dev          # local dev server
npm test             # vitest (all tests must pass)
npm run build        # tsc --noEmit + vite build
npm run progression -- 140 1   # bot plays the whole campaign (env: NAIVE=1, COACH=1, ECON=free|ads)
npm run ascension    # Ascension climb bot
npm run pacing / sim / weapons / builds   # other balance sims
```

Headless browser checks use Playwright (`scripts/*.mjs`). Use the 2D renderer (`?r=2d` or
`settings.graphics='2d'`) for speed; 3D under software GL is very slow. Set test saves with
`addInitScript`, click via DOM `evaluate`, and use `window.__ds.advance(seconds)` to fast-forward
a run on the autopilot.

## Test / dev URLs

- `?playtest=N`: drop into sector N on a separate test save (`&gun=smg|flamer|mg|bazooka|pistol`,
  `&atk=`, `&hp=`). Real save untouched.
- `?fresh`: brand-new player every load. `?profile=name`: separate named save.
- `?ads=demo|test|off`: fake ads / Google test ads / no ads. `?nostats`, `?nosync`.
- `?utm_source=…`: tags a launch channel in stats.

## Layout

- `src/sim/`: deterministic fixed-step game sim (`game.ts`, `weapons.ts`, `bosses.ts`,
  `chapters.ts` difficulty curve, `bot.ts` autopilot). No DOM here.
- `src/meta/`: progression and save (`profile.ts` is the save + economy; `gear.ts`, `talents.ts`,
  `ascension.ts`, `pass.ts`, `login.ts`, `missions.ts`, `sync.ts`).
- `src/render3d/` (default) and `src/render/` (classic 2D) renderers.
- `src/ui/`: lobby (`hub.ts`), in-run HUD (`hud.ts`), modals (`screens.ts`), tutorial.
- `src/net/`: Supabase leaderboards, cloud save, Google Drive backup (`drive.appdata` scope only),
  anonymous stats (`stats.ts`).
- `src/ads/ads.ts`: rewarded-ad providers. `LIVE_ADS = false` until Google approves AdSense +
  H5 Games Ads; then flip it in a PR. With ads on, `Profile.adEcon` trims base gold/scrap to
  `FREE_ECON` (85%); ads off = no trim.
- `src/main.ts`: app loop, run lifecycle, stats wiring, test hooks (`window.__ds`), and the ad
  recorder hook (`filmFrame`).
- `supabase/migrations/`: SQL for the `dead-signal` Supabase project (tables are locked; clients
  only call RPCs). Reporting views live in the `stats` schema (`stats.retention`, `stats.sectors`,
  `stats.funnel`, `stats.ads`, `stats.playtime`, `stats.exits`, `stats.features`, `stats.perf`,
  `stats.sources`, `stats.run_quits`).
- `marketing/`: ad videos and kit. `scripts/admovie.mjs` records scenes; `scripts/admovie.py`
  edits them (see `marketing/README.md`).
- `public/privacy.html`: keep it in sync with anything new the game collects.

## Privacy promises (don't break these)

Stats are anonymous (random player id, no IP, no names), off under Global Privacy Control / DNT,
and switchable in Settings. No third-party trackers or pixels. Never put personal data in URLs.
