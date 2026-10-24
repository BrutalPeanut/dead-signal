// Dev page: new character art, big and at in-game scale. ?view=infected|hero|bosses|crowd&t=
import { drawHero } from '../render/hero';
import { drawInfected } from '../render/infected';
import { BOSS_DRAW, ENEMY_DRAW } from './artV1';
import { drawBoss } from '../render/bosses';
import { Ground } from '../render/ground';

const q = new URLSearchParams(location.search);
const t = Number(q.get('t') ?? 0.3);
const view = q.get('view') ?? 'infected';
const c = document.getElementById('c') as HTMLCanvasElement;
c.width = 1200;
c.height = 760;
const ctx = c.getContext('2d')!;
const g = new Ground((q.get('biome') as any) ?? 'downtown');
g.setScale(2);
ctx.save();
ctx.scale(2, 2);
g.draw(ctx, 300, 190, 300, 190);
ctx.restore();
ctx.fillStyle = 'rgba(15,17,22,0.3)';
ctx.fillRect(0, 0, 1200, 760);
const lab = (s: string, x: number, y: number) => {
  ctx.fillStyle = '#e6ebf3';
  ctx.font = '600 15px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(s, x, y);
};
const shadow = (r: number, fy: number) => {
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.beginPath();
  ctx.ellipse(0, fy, r, r * 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
};
const kinds: [string, number, number][] = [
  ['shambler', 11, 11.5],
  ['runner', 9, 9.5],
  ['crawler', 7, 7.4],
  ['brute', 19, 20],
  ['spitter', 11, 11.5],
  ['bloater', 15, 15.8],
];
if (view === 'infected') {
  kinds.forEach(([k, r, fy], i) => {
    const x = 110 + i * 195;
    // old (small, top)
    ctx.save();
    ctx.translate(x, 130);
    ctx.scale(2.6, 2.6);
    ENEMY_DRAW[k](ctx, t * 3 + i);
    ctx.restore();
    // new (big)
    ctx.save();
    ctx.translate(x, 420);
    ctx.scale(3.2, 3.2);
    shadow(r * 1.1, fy);
    drawInfected(ctx, k, t * 3 + i);
    ctx.restore();
    lab(k, x, 520);
  });
  lab('old ↑', 40, 200);
  lab('new ↓', 40, 260);
  ctx.fillStyle = 'rgba(43,46,53,0.92)';
  ctx.fillRect(0, 560, 1200, 200);
  lab('in-game scale', 90, 585);
  kinds.forEach(([k, r, fy], i) => {
    ctx.save();
    ctx.translate(120 + i * 170, 690);
    ctx.scale(2.3, 2.3);
    shadow(r * 1.1, fy);
    drawInfected(ctx, k, t * 4 + i);
    ctx.restore();
  });
} else if (view === 'crowd') {
  // a horde around the courier at true in-game scale
  const S = 2.3;
  const items: { x: number; y: number; k: string; ph: number; f: number }[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 70 + rnd() * 160;
    const k = ['shambler', 'shambler', 'runner', 'crawler', 'spitter', 'bloater', 'brute', 'shambler'][i % 8];
    items.push({ x: 300 + Math.cos(a) * d * 1.6, y: 190 + Math.sin(a) * d * 0.75, k, ph: rnd() * 6, f: Math.cos(a) > 0 ? -1 : 1 });
  }
  items.push({ x: 300, y: 190, k: 'hero', ph: 0, f: 1 });
  items.sort((a, b) => a.y - b.y);
  ctx.save();
  ctx.scale(S, S);
  for (const it of items) {
    ctx.save();
    ctx.translate(it.x / 1.15, it.y);
    if (it.k === 'hero') {
      shadow(10, 13);
      drawHero(ctx, { t, moving: true, aim: 2.6 });
    } else {
      const spec = kinds.find((k) => k[0] === it.k)!;
      shadow(spec[1] * 1.1, spec[2]);
      ctx.scale(it.f, 1);
      drawInfected(ctx, it.k, it.ph);
    }
    ctx.restore();
  }
  ctx.restore();
}

if (view === 'bosses') {
  const bosses = ['warden', 'hive', 'colossus'] as const;
  bosses.forEach((b, i) => {
    const x = 200 + i * 400;
    ctx.save();
    ctx.translate(x - 90, 250);
    ctx.scale(1.2, 1.2);
    BOSS_DRAW[b](ctx, { t: t * 2, state: 0, phase2: false });
    ctx.restore();
    ctx.save();
    ctx.translate(x + 70, 300);
    ctx.scale(1.9, 1.9);
    shadow(36, 36);
    drawBoss(ctx, b, { t: t * 2, state: 0, phase2: i === 2 });
    ctx.restore();
    lab(b + ' (old · new)', x, 380);
  });
  ['stalk', 'wind-up', 'charge', 'slam'].forEach((nm, st) => {
    const x = 160 + st * 290;
    ctx.save();
    ctx.translate(x, 640);
    ctx.scale(1.55, 1.55);
    shadow(34, 34);
    drawBoss(ctx, 'warden', { t: t * 2, state: st, phase2: st === 3 });
    ctx.restore();
    lab('warden · ' + nm, x, 740);
  });
}
