# Dead Signal — ad kit

Vertical 9:16 videos (1080×1920, 30 fps, 15 s) for TikTok, Instagram/Facebook Reels, YouTube Shorts
and Reddit video ads. The soundtrack is the game's own: its sound effects, rendered in sync with
the footage, over its music, mixed to -14 LUFS. To test a trending sound instead, lower the
original audio in the platform's editor (TikTok's Commercial Music Library, Meta's Sound Collection).

| File | Hook (first 2 s) | Angle |
|---|---|---|
| `ads/dead-signal-horde.mp4` | Zoom-out reveal: 1 COURIER VS 500 ZOMBIES | Scale and chaos |
| `ads/dead-signal-flamethrower.mp4` | The real level-up card, then the evolution | Power fantasy, build choices |
| `ads/dead-signal-boss.mp4` | BOSS INCOMING → BOSS DOWN | Boss and challenge |
| `ads/dead-signal-minute1-vs-minute5.mp4` | MINUTE 1 → MINUTE 5 | Progression |

Every video has a running kill counter and ends on a 2.5 s card: **DEAD SIGNAL · FREE TO PLAY ·
PLAY NOW · deadsignal.info**. Nothing claims "browser only" or "no download", so the same videos
work once the game is on Google Play and the App Store (swap the URL line for store badges then).

## Tagged links (one per placement)

Our stats read `utm_source`, so each channel shows up separately in `stats.sources`
(new players and day-1 return). Use a different `utm_content` per video to find the winner.

```
https://deadsignal.info/?utm_source=tiktok&utm_content=horde
https://deadsignal.info/?utm_source=meta&utm_content=flamethrower
https://deadsignal.info/?utm_source=reddit&utm_content=boss
https://deadsignal.info/?utm_source=youtube&utm_content=minute5
```

Free posts too: `utm_source=tiktok_organic`, `reddit_webgames`, `crazygames` and so on.
No tracking pixels: the privacy policy promises no third-party trackers, and the tags are enough.

## Ad text

**Primary text (Meta / Reddit)**
- One thumb, a thousand zombies. Pick upgrades, evolve your guns, survive 5 minutes. Free to play.
- Your flamethrower just evolved. The horde didn't. Play Dead Signal free at deadsignal.info.
- 20 sectors, 4 bosses, and a horde that never stops. How long can you last?

**Headlines (≤ 40 chars)**
- Survive the horde. Free to play.
- Evolve your guns. Melt the horde.
- Can you survive 5 minutes?

**TikTok captions**
- how long would you last? 🧟 #survivorgame #zombiegame #indiegame #browsergame
- picked the right upgrade 😮‍💨 #roguelite #gaming #indiedev

**Call-to-action button:** Play Game (Meta), Play Now (TikTok), Play Now (Reddit).

## First test (about $50)

1. One platform (TikTok or Reddit), **$5–10 a day for 7 days**, all four videos in one ad group,
   targeting US/CA/UK/AU, ages 18–34, interests mobile games / action games.
2. After 3 days, pause any video with click-through under 0.8% or cost per click over $1.
3. After 7 days, ask Claude for a "stats report by source": cost per player (spend ÷ new players
   from that tag), minutes played, and day-1 return.
4. Scale the winning video only if those players come back (day-1 ≥ 25%). Otherwise fix the
   game first: a cheaper click doesn't help if players leave.

## Re-recording

The game records itself (exact frames, no screen capture):

```
npm run build && npx vite preview --port 5173 &
node scripts/admovie.mjs horde /tmp/rec/horde 12.5      # scenes: horde, flame, boss (12.5 s), start (5.5 s)
node scripts/admovie.mjs music /tmp/rec/music.wav 15.5
node scripts/admovie.mjs music /tmp/rec/music-boss.wav 15.5 boss
python3 scripts/admovie.py /tmp/rec marketing/ads        # or name ads: ... marketing/ads boss horde
```

Scenes (loadout, camera zoom curve, staged evolution/boss kill) live in `scripts/admovie.mjs`;
shot lists, captions and the end card in `scripts/admovie.py`.
