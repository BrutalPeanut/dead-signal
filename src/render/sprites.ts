import { ENEMY_BOX, ENEMY_DRAW } from './art';

export const FRAMES = 8;

export interface Sprite {
  img: HTMLCanvasElement;
  white: HTMLCanvasElement;
  /** Offset (world units) from entity centre to the sprite's top-left. */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** Make a solid-white silhouette of a sprite for hit flashes. */
export function whiteOf(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = makeCanvas(src.width, src.height);
  const x = c.getContext('2d')!;
  x.drawImage(src, 0, 0);
  x.globalCompositeOperation = 'source-in';
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Pre-renders every enemy kind × animation frame at the current pixel density.
 * 6 kinds × 8 frames × 2 (normal + flash) ≈ 100 small canvases; drawing 400 enemies is then
 * just 400 drawImage calls.
 */
export class SpriteCache {
  private scale = 0;
  private enemy = new Map<string, Sprite[]>();

  ensure(scale: number) {
    // Re-render when density changes meaningfully (rotation, zoom, DPR change).
    if (Math.abs(scale - this.scale) < 0.01) return;
    this.scale = scale;
    this.enemy.clear();
    for (const kind of Object.keys(ENEMY_DRAW)) {
      const box = ENEMY_BOX[kind];
      const frames: Sprite[] = [];
      for (let f = 0; f < FRAMES; f++) {
        const ph = (f / FRAMES) * Math.PI * 2;
        const c = makeCanvas(box.w * scale, box.h * scale);
        const x = c.getContext('2d')!;
        x.scale(scale, scale);
        x.translate(box.w / 2, box.h / 2 - box.oy);
        ENEMY_DRAW[kind](x, ph);
        frames.push({ img: c, white: whiteOf(c), ox: -box.w / 2, oy: -box.h / 2 + box.oy, w: box.w, h: box.h });
      }
      this.enemy.set(kind, frames);
    }
  }

  get(kind: string, phase: number): Sprite {
    const frames = this.enemy.get(kind)!;
    const f = ((Math.floor((phase / (Math.PI * 2)) * FRAMES) % FRAMES) + FRAMES) % FRAMES;
    return frames[f];
  }

  /** Radial glow sprites for additive projectile rendering. */
  private glows = new Map<string, HTMLCanvasElement>();
  glow(color: string): HTMLCanvasElement {
    let g = this.glows.get(color);
    if (!g) {
      const size = 64;
      g = makeCanvas(size, size);
      const x = g.getContext('2d')!;
      const grad = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.18, color);
      grad.addColorStop(0.45, hexA(color, 0.35));
      grad.addColorStop(1, hexA(color, 0));
      x.fillStyle = grad;
      x.fillRect(0, 0, size, size);
      this.glows.set(color, g);
    }
    return g;
  }
}

export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export { makeCanvas };
