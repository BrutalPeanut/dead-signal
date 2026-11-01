#!/usr/bin/env python3
"""
Cuts the recorded shots (scripts/admovie.mjs) into the finished ad videos.

    python3 scripts/admovie.py <recordingsDir> [outDir] [ad ...]

recordingsDir holds one folder per scene (f0000.jpg…, log.json, sfx.wav) plus music.wav and
music-boss.wav. Each ad: shots cut together with a white flash on every cut, the game's own sound
effects over a continuous music bed, pop-in captions placed inside TikTok/Reels safe zones, a
running kill counter, and a 2.5 s end card. Output 1080×1920, 30 fps, H.264 + AAC, -14 LUFS.
"""
import json, os, shutil, subprocess, sys, tempfile, wave
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

FPS = 30
END = 2.5  # end card seconds
SR = 44100

# ASS colours are &HAABBGGRR
C = {'W': '&H00FFFFFF&', 'Y': '&H004DD3FF&', 'O': '&H001F7AFF&', 'R': '&H003D4DFF&', 'C': '&H00FFF25E&'}

ADS = {
    'horde': {
        'shots': [('horde', 0, 6.5), ('flame', 6.0, 9.0), ('horde', 9.5, 12.5)],
        'music': 'music.wav',
        'caps': [
            (0.0, 1.5, '1 COURIER'),
            (1.5, 4.2, 'VS {Y}THE HORDE'),
            (4.2, 6.5, 'ONE THUMB.\\NALL CHAOS.'),
            (6.5, 9.5, '{\\fs100}{O}EVOLVE{W} YOUR GUNS'),
            (9.5, 12.5, 'HOW LONG\\NCAN YOU LAST?'),
        ],
    },
    'flamethrower': {
        'shots': [('flame', 0, 7.5), ('horde', 3.0, 5.5), ('flame', 10.0, 12.5)],
        'music': 'music.wav',
        'nocount': 1.3,  # the level-up card fills the screen
        'caps': [
            (1.35, 4.2, '{\\fs94}YOUR FLAMETHROWER\\N{O}{\\fs118}JUST EVOLVED'),
            (4.2, 7.5, 'BURN IT\\NALL DOWN'),
            (7.5, 10.0, '13 WEAPONS.\\N{Y}13 EVOLUTIONS.'),
            (10.0, 12.5, 'BUILD YOUR\\NPERFECT RUN'),
        ],
    },
    'boss': {
        'shots': [('boss', 0, 12.5)],
        'music': 'music-boss.wav',
        'caps': [
            (0.0, 2.6, '{R}BOSS INCOMING'),
            (2.6, 6.0, 'CAN YOU\\NTAKE IT DOWN?'),
            (6.0, 8.8, '{Y}4 BOSSES.\\N{W}20 SECTORS.'),
            (8.8, 12.5, '{Y}BOSS DOWN', 'big'),
        ],
    },
    'minute1-vs-minute5': {
        'shots': [('start', 0, 5.5), ('horde', 1.7, 8.7)],
        'music': 'music.wav',
        'caps': [
            (0.0, 5.5, 'MINUTE 1\\N{\\fs66}ONE PISTOL'),
            (5.5, 12.5, '{Y}MINUTE 5\\N{W}{\\fs66}EVERYTHING EVOLVED'),
        ],
    },
}

ASS_HEAD = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,Poppins,118,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,9,4,8,60,60,300,1
Style: Low,Poppins,96,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,0,0,1,9,4,2,60,60,330,1
Style: Kills,Poppins,66,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,1,0,1,7,3,5,60,60,0,1
Style: Title,Poppins,148,&H00FFF25E,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,2,0,1,10,5,5,40,40,0,1
Style: Body,Poppins,84,&H00FFFFFF,&H00FFFFFF,&H00000000,&H96000000,1,0,0,0,100,100,2,0,1,7,3,5,40,40,0,1
Style: Btn,Poppins,86,&H00201814,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,2,0,1,0,0,5,40,40,0,1
Style: Fx,Poppins,10,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def ts(t):
    t = max(0.0, t)
    h = int(t // 3600)
    m = int(t % 3600 // 60)
    s = t % 60
    return f'{h}:{m:02d}:{s:05.2f}'


def colour(text):
    for k, v in C.items():
        text = text.replace('{' + k + '}', '{\\c' + v + '}')
    return text


POP = '{\\fad(40,90)\\fscx62\\fscy62\\t(0,110,\\fscx112\\fscy112)\\t(110,200,\\fscx100\\fscy100)}'


def read_wav(path):
    with wave.open(path) as w:
        a = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2).astype(np.float32) / 32768
    return a


def main():
    rec = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else 'marketing/ads'
    want = sys.argv[3:] or list(ADS)
    os.makedirs(out, exist_ok=True)
    for name in want:
        ad = ADS[name]
        tmp = tempfile.mkdtemp()
        frames = os.path.join(tmp, 'f')
        os.makedirs(frames)
        n = 0
        ass = [ASS_HEAD]
        sfx_parts = []
        kills_shown = 0
        t_ad = 0.0
        cuts = []
        last_frame = None
        for si, (scene, a, b) in enumerate(ad['shots']):
            log = json.load(open(os.path.join(rec, scene, 'log.json')))
            f0, f1 = round(a * FPS), round(b * FPS)
            base = log[f0]['kills']
            prev = None
            for f in range(f0, f1):
                src = os.path.join(rec, scene, f'f{f:04d}.jpg')
                os.symlink(src, os.path.join(frames, f'{n:05d}.jpg'))
                last_frame = src
                k = kills_shown + log[f]['kills'] - base
                if n / FPS < ad.get('nocount', 0):
                    n += 1
                    continue
                if k != prev:
                    t = n / FPS
                    ass.append(f'Dialogue: 1,{ts(t)},{{END}},Kills,,0,0,0,,{{\\pos(540,1395)}}KILLS {{\\c{C["Y"]}\\fs112}}{k:,}\n')
                    prev = k
                n += 1
            kills_shown += log[f1 - 1]['kills'] - base
            sfx = read_wav(os.path.join(rec, scene, 'sfx.wav'))
            sfx_parts.append(sfx[int(a * SR):int(b * SR)])
            if si > 0:
                cuts.append(t_ad)
            t_ad += b - a
        game_t = n / FPS
        # each counter line ends where the next begins
        lines = ass[1:]
        for i, ln in enumerate(lines):
            nxt = lines[i + 1].split(',')[1] if i + 1 < len(lines) else ts(game_t)
            lines[i] = ln.replace('{END}', nxt)
        ass = [ASS_HEAD] + lines

        # white flash on every cut
        for t in cuts:
            ass.append(f'Dialogue: 3,{ts(t)},{ts(t + 0.2)},Fx,,0,0,0,,{{\\fad(0,170)\\1c&HFFFFFF&\\1a&H50&\\p1}}m 0 0 l 1080 0 1080 1920 0 1920{{\\p0}}\n')

        # captions
        for cap in ad['caps']:
            t0, t1, text = cap[0], cap[1], cap[2]
            kind = cap[3] if len(cap) > 3 else ''
            style = 'Low' if kind == 'low' else 'Cap'
            size = '{\\fs150}' if kind == 'big' else ''
            ass.append(f'Dialogue: 2,{ts(t0)},{ts(t1)},{style},,0,0,0,,{POP}{size}{colour(text)}\n')

        # end card: blurred, darkened last frame
        img = Image.open(last_frame).convert('RGB').resize((1080, 1920), Image.LANCZOS)
        img = ImageEnhance.Brightness(img.filter(ImageFilter.GaussianBlur(22))).enhance(0.45)
        endp = os.path.join(tmp, 'end.jpg')
        img.save(endp, quality=92)
        for _ in range(int(END * FPS)):
            os.symlink(endp, os.path.join(frames, f'{n:05d}.jpg'))
            n += 1
        e0, e1 = ts(game_t), ts(game_t + END)
        pop = lambda d: '{\\fad(80,0)\\fscx60\\fscy60\\t(%d,%d,\\fscx108\\fscy108)\\t(%d,%d,\\fscx100\\fscy100)}' % (d, d + 140, d + 140, d + 240)
        ass += [
            f'Dialogue: 2,{e0},{e1},Title,,0,0,0,,{{\\pos(540,700)}}{pop(0)}DEAD SIGNAL\n',
            f'Dialogue: 2,{e0},{e1},Body,,0,0,0,,{{\\pos(540,860)}}{pop(120)}FREE TO PLAY\n',
            f'Dialogue: 1,{e0},{e1},Fx,,0,0,0,,{{\\pos(540,1040)\\an5\\1c{C["Y"]}\\bord0\\shad0\\p1}}{pop(240)}m 40 0 l 680 0 b 702 0 720 18 720 40 l 720 140 b 720 162 702 180 680 180 l 40 180 b 18 180 0 162 0 140 l 0 40 b 0 18 18 0 40 0{{\\p0}}\n',
            f'Dialogue: 2,{e0},{e1},Btn,,0,0,0,,{{\\pos(540,1046)}}{pop(240)}PLAY NOW\n',
            f'Dialogue: 2,{e0},{e1},Body,,0,0,0,,{{\\pos(540,1235)\\fs70}}{pop(360)}deadsignal.info\n',
        ]
        assp = os.path.join(tmp, 'ad.ass')
        open(assp, 'w').write(''.join(ass))

        # sound: game sfx across the cuts (short crossfades) over one continuous music bed
        xf = int(0.02 * SR)
        mix = sfx_parts[0]
        for p in sfx_parts[1:]:
            ramp = np.linspace(0, 1, xf)[:, None]
            mix = np.concatenate([mix[:-xf], mix[-xf:] * (1 - ramp) + p[:xf] * ramp, p[xf:]])
        total = int((game_t + END) * SR)
        sfx = np.zeros((total, 2), np.float32)
        sfx[:min(total, len(mix))] = mix[:total]
        music = read_wav(os.path.join(rec, ad['music']))[:total]
        music = np.pad(music, ((0, total - len(music)), (0, 0)))
        fade = int(1.2 * SR)
        music[-fade:] *= np.linspace(1, 0, fade)[:, None]
        out_audio = sfx * 1.0 + music * 0.95
        out_audio /= max(1e-6, np.abs(out_audio).max() / 0.89)
        wavp = os.path.join(tmp, 'mix.wav')
        with wave.open(wavp, 'w') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(SR)
            w.writeframes((out_audio * 32767).astype(np.int16).tobytes())

        dst = os.path.join(out, f'dead-signal-{name}.mp4')
        subprocess.run([
            'ffmpeg', '-loglevel', 'error', '-y', '-framerate', str(FPS), '-i', os.path.join(frames, '%05d.jpg'), '-i', wavp,
            '-vf', f'scale=1080:1920:flags=lanczos,setsar=1,subtitles={assp}',
            '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-r', str(FPS),
            '-c:a', 'aac', '-b:a', '160k', '-ar', str(SR), '-shortest', '-movflags', '+faststart', dst,
        ], check=True)
        shutil.rmtree(tmp)
        print(dst)


if __name__ == '__main__':
    main()
