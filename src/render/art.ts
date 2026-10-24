/**
 * Public art API used by the renderer, sprite cache and lobby. The characters themselves live in
 * hero.ts, infected.ts and bosses.ts, painted with the toolkit in kit.ts.
 */
import { drawBoss, BOSS_SPEC, type BossPose } from './bosses';
import { drawHero, HERO_FOOT, HERO_H, type HeroPose } from './hero';
import { INFECTED, drawInfected } from './infected';

export { drawHero, HERO_FOOT, HERO_H, BOSS_SPEC };
export type { HeroPose, BossPose };
export { SIGNAL, INK as OUT } from './kit';
export const SIGNAL_SOFT = 'rgba(255,59,212,0.55)';

export const ENEMY_DRAW: Record<string, (ctx: CanvasRenderingContext2D, ph: number) => void> = Object.fromEntries(
  Object.keys(INFECTED).map((k) => [k, (ctx: CanvasRenderingContext2D, ph: number) => drawInfected(ctx, k, ph)]),
);

/**
 * Sprite bounds per kind (world units). The cached canvas is centred on the sim position shifted
 * by `oy`, sized to include the tallest pose plus glow bloom.
 */
export const ENEMY_BOX: Record<string, { w: number; h: number; oy: number }> = Object.fromEntries(
  Object.entries(INFECTED).map(([k, s]) => {
    const top = -(s.h * 1.02) + s.foot - 4; // highest point (hair, spikes, bloom)
    const bottom = s.foot + 4;
    const h = bottom - top;
    return [k, { w: s.w + 10, h, oy: (top + bottom) / 2 }];
  }),
);

export const BOSS_DRAW = {
  warden: (ctx: CanvasRenderingContext2D, p: BossPose) => drawBoss(ctx, 'warden', p),
  hive: (ctx: CanvasRenderingContext2D, p: BossPose) => drawBoss(ctx, 'hive', p),
  colossus: (ctx: CanvasRenderingContext2D, p: BossPose) => drawBoss(ctx, 'colossus', p),
  broadcaster: (ctx: CanvasRenderingContext2D, p: BossPose) => drawBoss(ctx, 'broadcaster', p),
};
