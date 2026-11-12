# Handoff: where things stand (2026-11-12, ~1:20 AM ET)

Read this first in a new session, then CLAUDE.md. Brian's prefs: always give direct links for anything he must do; end replies with the play link https://deadsignal.info; every change goes through a PR (merge = deploy).

## IDs you'll need
- Play Console: `https://play.google.com/console/u/1/developers/6425996072162808710/app/4975969990575533709/...` (Brian's account is `/u/1`). Closed test track ("Alpha") id `4699181359060635481`.
- App Store Connect: app id `6833741540`, team id `L82N84U35Y`, TestFlight groups: Team (internal), Public Beta `c3e9d084-bb09-4bdc-b902-55fdda575803` (team path `/teams/3f27a97a-3d18-4c8b-9b98-d192fdcad055/apps/6833741540/testflight/...`). Public TestFlight link: https://testflight.apple.com/join/Gp9nmxNC
- iOS IAP Apple ids: starter_pack 6833792023, skip_ads 6833792226, signal_pass_plus 6833792403.
- AdMob (use `?authuser=1`): Android app ~8554362492 / rewarded /2783161067; iOS app ~7477008563 / rewarded /6108086570 (both in src/native.ts).
- Tester Google Group: https://groups.google.com/g/deadsignal-beta-testers (owner = deadsignalsupportchannel@gmail.com, the `/u/0` Google account). Members can post; welcome post is up.
- Android opt-in: https://play.google.com/apps/testing/info.deadsignal.game

## Builds in flight
- Android: build 8 (all fixes incl. QA cloud-save fixes, leaner courier) is APPROVED and live on the closed track (checked 2026-11-12 ~3 AM ET). Upload method: in Play Console page, JS `fetch` the AAB from `https://raw.githubusercontent.com/BrutalPeanut/dead-signal/android-builds/<file>.aab` (workflow android.yml publishes it), set it on the release page's `input[type=file]` via DataTransfer, add notes in `<en-US>…</en-US>`, Save, then Publishing overview → Submit → Send changes for review.
- iOS: build 4 still in Beta App Review as of ~3 AM ET 2026-11-12 (distribute_build=9 tried; Apple said another build is in review; the distribute lane now exits cleanly in that case, PR 114) (Apple reviews one at a time). Builds 7 and 9 uploaded and waiting. When 4 is approved: dispatch ios.yml with `distribute_build=9` (newest). New iOS builds auto-distribute to Public Beta when nothing is in review.
- Scheduled check at 8:47 AM ET (2026-11-12) will try `distribute_build=9` and upload Android build 8 if needed.

## Done tonight
- Review fixes, auto-equip, no-scroll level-up, Gifts rail, rotate prompt, keyboard hints (PR 107)
- Leaner courier 2D/3D (PR 109); QA fixes: two-device cloud-save safety, retreat screen, evolution wording, keyboard access (PR 110)
- iOS: 3 in-app products created in App Store Connect with prices ($2.99 / $4.99 / $7.99), availability, US display names, review screenshot (marketing/ios/iap-shop.jpg)
- iOS AdMob app + rewarded unit, ids wired (PR 112)
- Play: 3 one-time products live; Brian's Core testers list are license testers (free test buys)

## Waiting on Brian (needs his clicks: legal/money/identity)
1. Apple Paid Apps agreement + bank + tax: https://appstoreconnect.apple.com/business (iOS purchases won't work until done)
2. Play bank test-deposit amount (PNC, 1 attempt left) + 15% fee enrollment: https://play.google.com/console/u/1/developers/6425996072162808710/paymentssettings
3. Android test purchase on his phone once build 8 is approved (he's a license tester)
4. Stripe live keys + live webhook when ready to sell on the web
5. Recruit 12+ Android testers for 14 days (group link above)

## Open ideas / next work
- Sector 12 is the balance wall (bots: 8-19 losses there across seeds). Consider easing it slightly (needs Brian's OK).
- Server-side compare-and-swap for cloud saves would close the last simultaneous-backup gap (DB migration).
- iOS: one permanent distribution cert (stops the "certificate revoked" email each build) — needs Brian to paste a .p12 secret.
- Google Play service account → one-click Android uploads without the browser.
- App Store listing (screenshots, description, privacy labels, age rating) before an App Store release.
