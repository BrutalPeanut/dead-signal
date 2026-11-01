# Dead Signal — ad kit

Vertical 9:16 videos (1080×1920, 30 fps, 15 s) for TikTok, Instagram/Facebook Reels, YouTube Shorts
and Reddit video ads. They ship with a **silent audio track on purpose**: add a trending or
licensed track in each platform's ad editor (TikTok's Commercial Music Library, Meta's Sound
Collection). A good sound usually beats any music we could add ourselves.

| File | Hook (first 2 s) | Angle |
|---|---|---|
| `ads/dead-signal-horde.mp4` | 1 COURIER VS 500 ZOMBIES | Scale and chaos |
| `ads/dead-signal-flamethrower.mp4` | POV: YOUR FLAMETHROWER JUST EVOLVED | Power fantasy |
| `ads/dead-signal-boss.mp4` | THE TOWER WALKS | Boss and challenge |
| `ads/dead-signal-minute1-vs-minute5.mp4` | MINUTE 1 → MINUTE 5 | Progression |

Every video ends on a 2.5 s card: **DEAD SIGNAL · Free in your browser · No download · deadsignal.info**.

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
- One thumb, a thousand zombies. Pick upgrades, evolve your guns, survive 5 minutes. Free in your browser, no download.
- Your flamethrower just evolved. The horde didn't. Play Dead Signal free at deadsignal.info.
- 20 sectors, 5 bosses, and a horde that never stops. How long can you last?

**Headlines (≤ 40 chars)**
- Survive the horde. Free, no download.
- Evolve your guns. Melt the horde.
- Can you survive 5 minutes?

**TikTok captions**
- how long would you last? 🧟 #survivorgame #zombiegame #indiegame #browsergame
- the evolution at 0:08 😮‍💨 #roguelite #gaming #indiedev

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
node scripts/admovie.mjs horde /tmp/frames/horde 12.5   # scenes: horde, flame, boss, start (5.5 s)
scripts/admovie.sh /tmp/frames marketing/ads
```

Edit the scene loadouts in `scripts/admovie.mjs` and the captions in `scripts/admovie.sh`.
