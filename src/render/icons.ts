import { PASSIVES, WEAPONS, type PassiveId, type WeaponId } from '../sim/data';
import type { Slot } from '../meta/gear';

type C = CanvasRenderingContext2D;
const cache = new Map<string, string>();
const OUT = '#0d0a10';

function canvas(size = 96): [HTMLCanvasElement, C] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  x.scale(size / 64, size / 64);
  x.lineJoin = 'round';
  x.lineCap = 'round';
  return [c, x];
}

function stroke(x: C, w = 3) {
  x.lineWidth = w;
  x.strokeStyle = OUT;
  x.stroke();
}

function glyph(x: C, fill: string) {
  x.save();
  x.shadowColor = fill;
  x.shadowBlur = 8;
  x.fillStyle = fill;
  x.fill();
  x.restore();
  stroke(x, 2.6);
}

const SKILL_GLYPHS: Record<string, (x: C, col: string) => void> = {
  pistol(x, col) {
    x.beginPath();
    x.roundRect(14, 22, 30, 12, 3);
    x.roundRect(18, 32, 9, 14, 2);
    glyph(x, '#5a6478');
    x.beginPath();
    x.rect(42, 25, 10, 6);
    glyph(x, col);
    x.fillStyle = col;
    x.fillRect(20, 26, 18, 3);
  },
  blades(x, col) {
    x.beginPath();
    x.arc(32, 32, 7, 0, Math.PI * 2);
    glyph(x, '#5a6478');
    for (let i = 0; i < 3; i++) {
      x.save();
      x.translate(32, 32);
      x.rotate((i / 3) * Math.PI * 2);
      x.beginPath();
      x.moveTo(8, -18);
      x.quadraticCurveTo(26, -10, 20, 8);
      x.quadraticCurveTo(18, -6, 8, -18);
      glyph(x, col);
      x.restore();
    }
  },
  arc(x, col) {
    x.beginPath();
    x.moveTo(36, 8);
    x.lineTo(18, 34);
    x.lineTo(30, 34);
    x.lineTo(24, 56);
    x.lineTo(46, 26);
    x.lineTo(33, 26);
    x.closePath();
    glyph(x, col);
  },
  frag(x, col) {
    x.beginPath();
    x.ellipse(30, 36, 13, 15, 0, 0, Math.PI * 2);
    glyph(x, '#4a5a3a');
    x.beginPath();
    x.roundRect(25, 14, 10, 8, 2);
    glyph(x, '#8a95a8');
    x.beginPath();
    x.moveTo(35, 16);
    x.quadraticCurveTo(48, 10, 46, 22);
    x.lineWidth = 3;
    x.strokeStyle = col;
    x.stroke();
    x.fillStyle = col;
    x.beginPath();
    x.arc(47, 22, 3, 0, Math.PI * 2);
    x.fill();
  },
  field(x, col) {
    for (const r of [24, 16, 8]) {
      x.beginPath();
      x.arc(32, 32, r, 0, Math.PI * 2);
      x.lineWidth = 5;
      x.strokeStyle = OUT;
      x.stroke();
      x.lineWidth = 3;
      x.strokeStyle = col;
      x.stroke();
    }
  },
  disc(x, col) {
    x.beginPath();
    x.arc(32, 32, 18, 0, Math.PI * 2);
    glyph(x, col);
    x.beginPath();
    x.arc(32, 32, 7, 0, Math.PI * 2);
    x.fillStyle = OUT;
    x.fill();
    x.strokeStyle = '#fff';
    x.lineWidth = 2;
    x.beginPath();
    x.arc(32, 32, 13, -0.5, 1.2);
    x.stroke();
  },
  napalm(x, col) {
    x.beginPath();
    x.moveTo(32, 8);
    x.bezierCurveTo(46, 22, 50, 34, 44, 46);
    x.bezierCurveTo(38, 58, 22, 58, 18, 46);
    x.bezierCurveTo(14, 36, 22, 30, 24, 22);
    x.bezierCurveTo(28, 28, 30, 30, 32, 8);
    glyph(x, col);
    x.beginPath();
    x.moveTo(32, 30);
    x.bezierCurveTo(40, 38, 40, 48, 32, 52);
    x.bezierCurveTo(24, 48, 26, 40, 32, 30);
    x.fillStyle = '#fff3b0';
    x.fill();
  },
  drill(x, col) {
    x.beginPath();
    x.moveTo(54, 32);
    x.lineTo(20, 18);
    x.lineTo(20, 46);
    x.closePath();
    glyph(x, col);
    x.strokeStyle = OUT;
    x.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      x.beginPath();
      x.moveTo(26 + i * 8, 21 + i * 3.2);
      x.lineTo(30 + i * 8, 43 - i * 3.2);
      x.stroke();
    }
    x.beginPath();
    x.roundRect(10, 24, 10, 16, 2);
    glyph(x, '#5a6478');
  },
  chip(x, col) {
    x.beginPath();
    x.arc(32, 32, 18, 0, Math.PI * 2);
    x.lineWidth = 6;
    x.strokeStyle = OUT;
    x.stroke();
    x.lineWidth = 3.5;
    x.strokeStyle = col;
    x.stroke();
    for (const [a, b, c2, d] of [[32, 6, 32, 20], [32, 44, 32, 58], [6, 32, 20, 32], [44, 32, 58, 32]]) {
      x.beginPath();
      x.moveTo(a, b);
      x.lineTo(c2, d);
      x.lineWidth = 6;
      x.strokeStyle = OUT;
      x.stroke();
      x.lineWidth = 3.5;
      x.strokeStyle = col;
      x.stroke();
    }
    x.beginPath();
    x.arc(32, 32, 3.5, 0, Math.PI * 2);
    x.fillStyle = '#fff';
    x.fill();
  },
  plating(x, col) {
    x.beginPath();
    x.moveTo(32, 8);
    x.lineTo(52, 16);
    x.quadraticCurveTo(52, 44, 32, 56);
    x.quadraticCurveTo(12, 44, 12, 16);
    x.closePath();
    glyph(x, col);
    x.beginPath();
    x.moveTo(32, 16);
    x.lineTo(32, 48);
    x.moveTo(20, 28);
    x.lineTo(44, 28);
    x.lineWidth = 2.4;
    x.strokeStyle = 'rgba(0,0,0,0.45)';
    x.stroke();
  },
  capacitor(x, col) {
    x.beginPath();
    x.roundRect(18, 12, 28, 42, 5);
    glyph(x, '#2a3346');
    x.beginPath();
    x.roundRect(26, 7, 12, 6, 2);
    glyph(x, '#8a95a8');
    x.beginPath();
    x.roundRect(22, 34, 20, 16, 2);
    x.fillStyle = col;
    x.fill();
    x.beginPath();
    x.roundRect(22, 18, 20, 13, 2);
    x.fillStyle = col;
    x.globalAlpha = 0.45;
    x.fill();
    x.globalAlpha = 1;
  },
  fuel(x, col) {
    x.beginPath();
    x.roundRect(16, 18, 30, 38, 4);
    glyph(x, col);
    x.beginPath();
    x.roundRect(34, 8, 10, 12, 2);
    glyph(x, '#5a6478');
    x.fillStyle = OUT;
    x.beginPath();
    x.moveTo(31, 26);
    x.bezierCurveTo(38, 36, 38, 44, 31, 48);
    x.bezierCurveTo(24, 44, 24, 36, 31, 26);
    x.fill();
  },
  medkit(x, col) {
    x.beginPath();
    x.roundRect(10, 16, 44, 36, 6);
    glyph(x, '#e8eef5');
    x.beginPath();
    x.rect(28, 22, 8, 24);
    x.rect(20, 30, 24, 8);
    x.fillStyle = col;
    x.fill();
  },
  magnet(x, col) {
    x.beginPath();
    x.arc(32, 30, 16, Math.PI, 0);
    x.lineWidth = 14;
    x.strokeStyle = OUT;
    x.stroke();
    x.lineWidth = 9;
    x.strokeStyle = col;
    x.stroke();
    x.fillStyle = '#e6e9ef';
    x.strokeStyle = OUT;
    x.lineWidth = 2;
    x.beginPath();
    x.rect(11.5, 30, 9, 16);
    x.rect(43.5, 30, 9, 16);
    x.fill();
    x.stroke();
  },
  gel(x, col) {
    x.beginPath();
    x.moveTo(32, 6);
    x.bezierCurveTo(48, 28, 50, 38, 44, 48);
    x.bezierCurveTo(38, 58, 26, 58, 20, 48);
    x.bezierCurveTo(14, 38, 16, 28, 32, 6);
    glyph(x, col);
    x.fillStyle = 'rgba(255,255,255,0.7)';
    x.beginPath();
    x.ellipse(26, 38, 3, 6, 0.4, 0, Math.PI * 2);
    x.fill();
  },
  boots(x, col) {
    x.beginPath();
    x.moveTo(18, 10);
    x.lineTo(34, 10);
    x.lineTo(34, 36);
    x.lineTo(52, 40);
    x.lineTo(52, 50);
    x.lineTo(16, 50);
    x.closePath();
    glyph(x, '#5a6478');
    x.beginPath();
    x.moveTo(16, 50);
    x.lineTo(12, 60);
    x.lineTo(24, 60);
    x.lineTo(22, 50);
    glyph(x, col);
    x.fillStyle = col;
    x.fillRect(20, 20, 12, 3);
  },
};

function frame(x: C, col: string, evolved: boolean) {
  const g = x.createLinearGradient(0, 0, 64, 64);
  g.addColorStop(0, '#2a2f3d');
  g.addColorStop(1, '#14171f');
  x.beginPath();
  x.roundRect(1.5, 1.5, 61, 61, 12);
  x.fillStyle = g;
  x.fill();
  const rg = x.createRadialGradient(32, 32, 4, 32, 32, 40);
  rg.addColorStop(0, col + '55');
  rg.addColorStop(1, col + '00');
  x.fillStyle = rg;
  x.fill();
  x.lineWidth = evolved ? 3.5 : 2;
  x.strokeStyle = evolved ? '#ffd34d' : col + 'aa';
  x.stroke();
}

export function skillIcon(id: WeaponId | PassiveId, evolved = false): string {
  const key = `${id}:${evolved}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const col = (WEAPONS as any)[id]?.color ?? (PASSIVES as any)[id]?.color ?? '#ffffff';
  const [c, x] = canvas();
  frame(x, col, evolved);
  SKILL_GLYPHS[id]?.(x, evolved ? '#ffffff' : col);
  if (evolved) {
    x.fillStyle = '#ffd34d';
    x.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
      const r = i % 2 ? 3.5 : 8;
      x.lineTo(52 + Math.cos(a) * r, 12 + Math.sin(a) * r);
    }
    x.fill();
    stroke(x, 1.4);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

const SLOT_GLYPHS: Record<Slot, (x: C, col: string) => void> = {
  weapon: SKILL_GLYPHS.pistol,
  visor(x, col) {
    x.beginPath();
    x.arc(32, 34, 20, Math.PI, 0);
    x.lineTo(52, 42);
    x.lineTo(12, 42);
    x.closePath();
    glyph(x, '#c9d0db');
    x.beginPath();
    x.roundRect(18, 28, 28, 9, 4);
    glyph(x, col);
  },
  vest(x, col) {
    x.beginPath();
    x.moveTo(20, 10);
    x.lineTo(28, 16);
    x.lineTo(36, 16);
    x.lineTo(44, 10);
    x.lineTo(52, 20);
    x.lineTo(48, 56);
    x.lineTo(16, 56);
    x.lineTo(12, 20);
    x.closePath();
    glyph(x, col);
    x.fillStyle = '#e8f2f5';
    x.fillRect(15, 38, 34, 4);
  },
  gloves(x, col) {
    x.beginPath();
    x.roundRect(18, 22, 26, 30, 6);
    glyph(x, col);
    for (let i = 0; i < 4; i++) {
      x.beginPath();
      x.roundRect(18 + i * 6.5, 10 + (i === 0 || i === 3 ? 4 : 0), 6, 16, 3);
      glyph(x, col);
    }
    x.beginPath();
    x.roundRect(8, 30, 14, 7, 3);
    glyph(x, col);
  },
  belt(x, col) {
    x.beginPath();
    x.roundRect(6, 26, 52, 12, 3);
    glyph(x, '#6b5a44');
    x.beginPath();
    x.roundRect(25, 22, 14, 20, 3);
    glyph(x, col);
    for (const px of [10, 44]) {
      x.beginPath();
      x.roundRect(px, 36, 10, 12, 2);
      glyph(x, '#4a5468');
    }
  },
  boots: SKILL_GLYPHS.boots,
};

/** Per-item accents so two items in the same slot are distinguishable at a glance. */
const GEAR_GLYPH: Record<string, (x: C, col: string) => void> = {
  sidearm: SKILL_GLYPHS.pistol,
  gauntlet: SKILL_GLYPHS.arc,
  thrower: SKILL_GLYPHS.disc,
  tube: SKILL_GLYPHS.frag,
  drillrig: SKILL_GLYPHS.drill,
  optic(x, col) {
    SLOT_GLYPHS.visor(x, col);
    x.beginPath();
    x.arc(44, 20, 8, 0, Math.PI * 2);
    glyph(x, '#ff3b5c');
  },
  hazmat(x, col) {
    SLOT_GLYPHS.vest(x, '#d8c23a');
    x.beginPath();
    x.arc(32, 28, 6, 0, Math.PI * 2);
    glyph(x, col);
  },
  knuckles(x, col) {
    SLOT_GLYPHS.gloves(x, col);
    x.beginPath();
    x.moveTo(46, 30);
    x.lineTo(38, 44);
    x.lineTo(44, 44);
    x.lineTo(40, 56);
    x.lineTo(52, 40);
    x.lineTo(46, 40);
    x.closePath();
    glyph(x, '#5ef2ff');
  },
  ammorig(x, col) {
    SLOT_GLYPHS.belt(x, col);
    for (let i = 0; i < 5; i++) {
      x.beginPath();
      x.roundRect(12 + i * 9, 12, 5, 14, 2);
      glyph(x, '#d8a23a');
    }
  },
  treads(x, col) {
    SKILL_GLYPHS.boots(x, col);
    x.beginPath();
    x.arc(44, 18, 7, Math.PI, 0);
    x.lineWidth = 7;
    x.strokeStyle = OUT;
    x.stroke();
    x.lineWidth = 4;
    x.strokeStyle = '#e8304f';
    x.stroke();
  },
};

export function gearIcon(slot: Slot, color: string, def?: string): string {
  const key = `gear:${slot}:${color}:${def ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, x] = canvas();
  frame(x, color, false);
  (def && GEAR_GLYPH[def] ? GEAR_GLYPH[def] : SLOT_GLYPHS[slot])(x, color);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
