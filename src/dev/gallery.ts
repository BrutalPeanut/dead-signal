// Dev-only page that renders every character large, for art review.
import { BOSS_DRAW, ENEMY_DRAW, drawHero } from '../render/art';
import { Ground } from '../render/ground';

const c = document.getElementById('c') as HTMLCanvasElement;
const W = 1200;
const H = 900;
c.width = W;
c.height = H;
const ctx = c.getContext('2d')!;
const t = Number(new URLSearchParams(location.search).get('t') ?? 0.7);

const g = new Ground('downtown');
g.setScale(1);
ctx.save();
g.draw(ctx, 300, 225, 300, 225);
ctx.restore();
ctx.fillStyle = 'rgba(20,22,28,0.55)';
ctx.fillRect(0, 0, W, H);

function label(s: string, x: number, y: number) {
  ctx.fillStyle = '#cfd6e2';
  ctx.font = '600 14px system-ui';
  ctx.textAlign = 'center';
  ctx.fillText(s, x, y);
}

const S = 4;
const kinds = Object.keys(ENEMY_DRAW);
kinds.forEach((k, i) => {
  const x = 100 + i * 165;
  const y = 170;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(S * 0.8, S * 0.8);
  ENEMY_DRAW[k](ctx, t * 3 + i);
  ctx.restore();
  label(k, x, y + 90);
});

ctx.save();
ctx.translate(100, 420);
ctx.scale(S, S);
drawHero(ctx, { t, moving: true, aim: -0.3 });
ctx.restore();
label('courier (hero)', 100, 510);

ctx.save();
ctx.translate(250, 420);
ctx.scale(S, S);
drawHero(ctx, { t, moving: false, aim: Math.PI * 0.85 });
ctx.restore();
label('courier aiming left', 250, 510);

(['warden', 'hive', 'colossus'] as const).forEach((b, i) => {
  const x = 520 + i * 260;
  const y = 470;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(2.4, 2.4);
  BOSS_DRAW[b](ctx, { t: t * 2, state: 0, phase2: i === 2 });
  ctx.restore();
  label(b, x, y + 150);
});

// in-game scale strip
const strip = 760;
ctx.fillStyle = '#2b2e35';
ctx.fillRect(0, strip - 70, W, 160);
label('in-game scale (zoom ~1.8)', 120, strip - 50);
kinds.forEach((k, i) => {
  ctx.save();
  ctx.translate(80 + i * 70, strip + 20);
  ctx.scale(1.8, 1.8);
  ENEMY_DRAW[k](ctx, t * 3 + i);
  ctx.restore();
});
ctx.save();
ctx.translate(560, strip + 20);
ctx.scale(1.8, 1.8);
drawHero(ctx, { t, moving: true, aim: 0.2 });
ctx.restore();
ctx.save();
ctx.translate(700, strip + 10);
ctx.scale(1.8, 1.8);
BOSS_DRAW.warden(ctx, { t, state: 0, phase2: false });
ctx.restore();
