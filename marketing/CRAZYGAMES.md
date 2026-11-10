# Dead Signal on CrazyGames

The portal edition is the same game with CrazyGames' SDK at the edges (`src/portal.ts`).

## Build

```bash
npm run build:crazygames      # → dist-crazygames/ and dead-signal-crazygames.zip (about 1.6 MB)
```

Upload `dead-signal-crazygames.zip` in the CrazyGames developer portal. Test it there with their
QA tool before submitting. Locally: `VITE_PORTAL=crazygames npx vite preview --outDir dist-crazygames`
(on localhost the SDK runs in its "local" mode and shows overlay text instead of real ads).

## What's different from deadsignal.info

| Area | Portal edition |
|---|---|
| Ads | Rewarded ads through the CrazyGames SDK only. No Google ad script, no ads between runs. If CrazyGames has ads off for the session (basic launch, kids mode), ad-gated rewards become free, so no button is ever a dead end. |
| Saves | CrazyGames data module (syncs to the player's CrazyGames account). Our sync codes, Google Drive backup and the home-screen install offer are off. |
| Events | `loadingStart/Stop` around boot, `gameplayStart/Stop` whenever a run is actually in motion, `happytime` on clearing Sector 10 and Sector 20 for the first time. |
| Stats | Our anonymous stats stay on, tagged with source `crazygames`. |
| Site files | No `ads.txt`, web manifest or canonical link in the zip. |

## Submission answers

- **Orientation:** portrait (also fine on desktop; the game centres itself).
- **Controls:** touch drag / mouse drag / WASD or arrow keys; one-handed.
- **Does the game save progress?** Yes (data module).
- **Initial download:** about 3.4 MB (limit for the mobile homepage is 20 MB).
- **Multiplayer / chat / accounts:** none. Leaderboards show a random call sign the player can change.
- **In-game purchases:** none in this edition.

## Their rules we already follow

- Only SDK ads; rewarded ads are opt-in, on paused or menu screens, never needed to finish a level.
- The game works with an ad blocker (rewards just aren't available, with a notice).
- Audio is muted when an ad starts and restored when it ends.
- No external links in gameplay; the Settings footer links to the bundled privacy page.

If QA asks for changes, the likely ones are: making the "no thanks" option the same size as the
"watch ad" button on the results and revive screens, and using their User module for leaderboard names.
