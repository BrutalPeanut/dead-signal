/**
 * Procedural character art. Everything is drawn with vector paths in world units, facing right,
 * origin at the body centre (the sim's collision centre). Style: chunky dark outline, gradient
 * cel-shading, and magenta "signal" glow on the infected so they read instantly against any floor.
 *
 * Enemy art is rendered once per animation frame into cached sprites (see sprites.ts); the hero and
 * bosses are drawn live because they animate in ways caching can't capture (aiming, attacks).
 */

export const OUT = '#120d14';
export const SIGNAL = '#ff3bd4';
export const SIGNAL_SOFT = 'rgba(255,59,212,0.55)';

type C = CanvasRenderingContext2D;

function lingrad(ctx: C, x0: number, y0: number, x1: number, y1: number, a: string, b: string) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
}

function fillOut(ctx: C, fill: string | CanvasGradient, lw = 1.6) {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUT;
  ctx.stroke();
}

/** A limb: outlined thick round-capped segment(s). */
function limb(ctx: C, pts: number[], w: number, color: string) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = w + 2.4;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.stroke();
}

function circle(ctx: C, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(ctx: C, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

function rrect(ctx: C, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function glowDot(ctx: C, x: number, y: number, r: number, color = SIGNAL) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = r * 4;
  ctx.fillStyle = '#fff';
  circle(ctx, x, y, r * 0.55);
  ctx.fill();
  ctx.fillStyle = color;
  circle(ctx, x, y, r);
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.restore();
}

/** Jagged torn hem along the bottom of a shirt. */
function tornHem(ctx: C, x0: number, x1: number, y: number, depth: number, color: string, seed: number) {
  ctx.beginPath();
  ctx.moveTo(x0, y - depth);
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    const d = ((Math.sin(seed * 9.1 + i * 2.3) + 1) / 2) * depth;
    ctx.lineTo(x, y + d * 0.8);
  }
  ctx.lineTo(x1, y - depth);
  ctx.closePath();
  fillOut(ctx, color, 1.2);
}

export interface ZPal {
  skin: string;
  skinDark: string;
  cloth: string;
  clothDark: string;
  pants: string;
}

export const PALETTES: Record<string, ZPal> = {
  shambler: { skin: '#8fa77c', skinDark: '#5f7553', cloth: '#3e6b7a', clothDark: '#24434e', pants: '#3a3550' },
  runner: { skin: '#c9b8b0', skinDark: '#8e7a74', cloth: '#b8324a', clothDark: '#6f1c2c', pants: '#2b2b38' },
  crawler: { skin: '#9a8fb0', skinDark: '#5c5370', cloth: '#444', clothDark: '#222', pants: '#333' },
  brute: { skin: '#7d9a6a', skinDark: '#4d6440', cloth: '#5b5f66', clothDark: '#33363b', pants: '#2c3a4a' },
  spitter: { skin: '#a8b98a', skinDark: '#6b7b55', cloth: '#d9dde0', clothDark: '#8f969c', pants: '#3b4250' },
  bloater: { skin: '#a2b06e', skinDark: '#66733f', cloth: '#e0c33a', clothDark: '#8f7a1c', pants: '#4a4434' },
};

// ------------------------------------------------------------------ infected

function zHead(ctx: C, x: number, y: number, r: number, p: ZPal, seed: number, jaw = true) {
  circle(ctx, x, y, r);
  fillOut(ctx, lingrad(ctx, x - r, y - r, x + r, y + r, p.skin, p.skinDark));
  // patchy hair
  ctx.fillStyle = 'rgba(30,20,30,0.75)';
  ctx.beginPath();
  ctx.arc(x - r * 0.15, y - r * 0.25, r * 0.85, Math.PI * 1.05, Math.PI * 1.75);
  ctx.lineTo(x - r * 0.2, y - r * 0.3);
  ctx.fill();
  // signal crack
  ctx.strokeStyle = SIGNAL;
  ctx.lineWidth = 0.9;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(x - r * 0.5, y + r * 0.1 + (seed % 3) * 0.3);
  ctx.lineTo(x - r * 0.1, y + r * 0.35);
  ctx.lineTo(x + r * 0.05, y + r * 0.15);
  ctx.stroke();
  ctx.globalAlpha = 1;
  if (jaw) {
    ctx.fillStyle = '#2a0f18';
    ellipse(ctx, x + r * 0.55, y + r * 0.45, r * 0.32, r * 0.22, 0.3);
    ctx.fill();
  }
  glowDot(ctx, x + r * 0.5, y - r * 0.15, r * 0.24);
}

export function drawShambler(ctx: C, ph: number, p = PALETTES.shambler) {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  limb(ctx, [-2, 3, -2 - s * 3.5, 12.5], 3.6, p.pants); // back leg
  limb(ctx, [1, -9, 9, -9 + c, 16, -7 + c * 1.5], 3, p.skinDark); // back arm
  ctx.save();
  ctx.translate(0, -3);
  ctx.rotate(0.25);
  rrect(ctx, -6.5, -9, 13, 15, 4);
  fillOut(ctx, lingrad(ctx, -6, -9, 6, 6, p.cloth, p.clothDark));
  tornHem(ctx, -6.5, 6.5, 6, 2.2, p.clothDark, 1);
  ctx.restore();
  limb(ctx, [2, 3, 2 + s * 3.5, 12.5], 3.6, p.pants); // front leg
  zHead(ctx, 6, -15, 6.2, p, 1);
  limb(ctx, [3, -8, 11, -7 - c, 18, -5 - c * 1.5], 3.2, p.skin); // front arm
  circle(ctx, 18.5, -5 - c * 1.5, 2.1);
  fillOut(ctx, p.skin, 1.2);
}

export function drawRunner(ctx: C, ph: number, p = PALETTES.runner) {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  limb(ctx, [-1, 2, -5 - s * 6, 8, -3 - s * 6, 13], 3, p.pants);
  limb(ctx, [0, -10, -8 + c * 4, -5, -12 + c * 4, -1], 2.6, p.skinDark); // arm swinging back
  ctx.save();
  ctx.translate(1, -4);
  ctx.rotate(0.55);
  rrect(ctx, -5, -9, 10, 14, 4);
  fillOut(ctx, lingrad(ctx, -5, -9, 5, 5, p.cloth, p.clothDark));
  // hood
  ctx.beginPath();
  ctx.arc(1, -10, 6, Math.PI * 0.9, Math.PI * 2.05);
  fillOut(ctx, p.clothDark, 1.2);
  ctx.restore();
  limb(ctx, [2, 2, 5 + s * 6, 7, 8 + s * 6, 12], 3, p.pants);
  zHead(ctx, 9, -14, 5.4, p, 2);
  limb(ctx, [3, -9, 9 - c * 4, -4, 14 - c * 4, -6], 2.6, p.skin);
}

export function drawCrawler(ctx: C, ph: number, p = PALETTES.crawler) {
  const s = Math.sin(ph * 1.4);
  const c = Math.cos(ph * 1.4);
  limb(ctx, [-6, 1, -9 - s * 3, 7], 2.2, p.skinDark);
  limb(ctx, [4, 0, 7 + c * 3, 7], 2.2, p.skinDark);
  ellipse(ctx, -1, -1, 9, 5, -0.1);
  fillOut(ctx, lingrad(ctx, -9, -6, 8, 4, p.skin, p.skinDark));
  // spine nubs glowing
  for (let i = 0; i < 4; i++) glowDot(ctx, -6 + i * 3.5, -5.2 + Math.abs(i - 1.5) * 0.4, 0.9);
  limb(ctx, [-5, 2, -7 + s * 3, 7], 2.2, p.skin);
  limb(ctx, [5, 1, 8 - c * 3, 7], 2.2, p.skin);
  // big head with two eyes
  circle(ctx, 9, -2, 4.6);
  fillOut(ctx, lingrad(ctx, 5, -6, 13, 2, p.skin, p.skinDark));
  ctx.fillStyle = '#2a0f18';
  ellipse(ctx, 12, 0.5, 2, 1.3, 0.2);
  ctx.fill();
  glowDot(ctx, 11, -3.5, 1.2);
  glowDot(ctx, 8.6, -3.8, 1.0);
}

export function drawBrute(ctx: C, ph: number, p = PALETTES.brute) {
  const s = Math.sin(ph * 0.8);
  const c = Math.cos(ph * 0.8);
  limb(ctx, [-5, 6, -5 - s * 3, 19], 6.5, p.pants);
  limb(ctx, [-6, -14, -2, -2, 4 + c, 6], 6, p.skinDark);
  // massive torso
  ctx.beginPath();
  ctx.moveTo(-14, -16);
  ctx.quadraticCurveTo(-4, -28, 12, -20);
  ctx.quadraticCurveTo(16, -6, 9, 8);
  ctx.lineTo(-9, 8);
  ctx.quadraticCurveTo(-17, -4, -14, -16);
  fillOut(ctx, lingrad(ctx, -14, -26, 12, 8, p.skin, p.skinDark), 2);
  // tank top with straps
  ctx.beginPath();
  ctx.moveTo(-11, -12);
  ctx.lineTo(-6, -12);
  ctx.lineTo(-3, -6);
  ctx.lineTo(4, -6);
  ctx.lineTo(6, -14);
  ctx.lineTo(10, -13);
  ctx.quadraticCurveTo(13, -2, 8, 8);
  ctx.lineTo(-8, 8);
  ctx.quadraticCurveTo(-13, -2, -11, -12);
  fillOut(ctx, lingrad(ctx, -10, -12, 8, 8, p.cloth, p.clothDark), 1.4);
  tornHem(ctx, -8, 8, 8, 2.6, p.clothDark, 3);
  // stitched scar across the chest
  ctx.strokeStyle = '#3a1a24';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-9, -15);
  ctx.lineTo(2, -9);
  for (let i = 0; i < 4; i++) {
    const x = -7 + i * 2.6;
    const y = -14 + i * 1.4;
    ctx.moveTo(x - 0.8, y - 1.4);
    ctx.lineTo(x + 0.8, y + 1.4);
  }
  ctx.stroke();
  // signal tumours on shoulder
  circle(ctx, -9, -20, 4.2);
  fillOut(ctx, '#7a2b6e', 1.2);
  glowDot(ctx, -9, -20, 2.2);
  glowDot(ctx, -4, -23, 1.4);
  limb(ctx, [5, 6, 5 + s * 3, 19], 6.5, p.pants);
  // head jutting forward from the hump, heavy brow
  zHead(ctx, 9, -24, 6.4, p, 3);
  ctx.fillStyle = p.skinDark;
  ctx.beginPath();
  ctx.moveTo(4, -27);
  ctx.quadraticCurveTo(10, -31, 15.5, -26);
  ctx.lineTo(14, -24.5);
  ctx.quadraticCurveTo(10, -27, 5, -25.5);
  ctx.fill();
  glowDot(ctx, 12.4, -25.2, 1.6);
  // giant fist arm
  limb(ctx, [6, -14, 15, -6 - c, 18, 3 - c], 7, p.skin);
  circle(ctx, 18.5, 5 - c, 5);
  fillOut(ctx, lingrad(ctx, 14, 0, 23, 10, p.skin, p.skinDark));
}

export function drawSpitter(ctx: C, ph: number, p = PALETTES.spitter) {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const pulse = (Math.sin(ph * 2) + 1) / 2;
  limb(ctx, [-2, 3, -2 - s * 3, 12.5], 3.2, p.pants);
  ctx.save();
  ctx.translate(0, -3);
  ctx.rotate(0.15);
  // lab coat
  ctx.beginPath();
  ctx.moveTo(-6, -9);
  ctx.lineTo(6, -9);
  ctx.lineTo(8, 9);
  ctx.lineTo(-8, 9);
  ctx.closePath();
  fillOut(ctx, lingrad(ctx, -6, -9, 6, 9, p.cloth, p.clothDark));
  ctx.strokeStyle = 'rgba(80,140,60,0.7)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, -6);
  ctx.lineTo(-1, 4);
  ctx.moveTo(3, -2);
  ctx.lineTo(4, 7);
  ctx.stroke();
  ctx.restore();
  limb(ctx, [2, 3, 2 + s * 3, 12.5], 3.2, p.pants);
  // throat sac
  ctx.save();
  ctx.shadowColor = '#9dff4a';
  ctx.shadowBlur = 6 + pulse * 4;
  circle(ctx, 8, -9, 4.5 + pulse * 1.2);
  fillOut(ctx, lingrad(ctx, 4, -14, 12, -4, '#d4ff8a', '#5ea81e'), 1.2);
  ctx.restore();
  zHead(ctx, 5, -16, 5.6, p, 4, false);
  ctx.fillStyle = '#9dff4a';
  ellipse(ctx, 9.6, -13.6, 1.8, 1.2, 0.3);
  ctx.fill();
  limb(ctx, [2, -8, 7, -2 + c, 10, 1 + c], 2.6, p.skin);
}

export function drawBloater(ctx: C, ph: number, p = PALETTES.bloater) {
  const s = Math.sin(ph * 0.9);
  const wob = Math.sin(ph * 1.8) * 0.6;
  limb(ctx, [-4, 8, -4 - s * 2, 15], 3.6, p.pants);
  limb(ctx, [4, 8, 4 + s * 2, 15], 3.6, p.pants);
  // swollen body in torn hazmat suit
  ellipse(ctx, 0, -2, 13 + wob, 12 - wob, 0);
  fillOut(ctx, lingrad(ctx, -12, -14, 12, 10, p.cloth, p.clothDark), 1.8);
  // ruptures showing skin + pustules
  ellipse(ctx, 4, 0, 6, 5, 0.4);
  fillOut(ctx, lingrad(ctx, 0, -4, 8, 4, p.skin, p.skinDark), 1.2);
  glowDot(ctx, 5, -1, 1.9, '#9dff4a');
  glowDot(ctx, 2, 3, 1.3, '#9dff4a');
  glowDot(ctx, -6, -7, 1.5, '#9dff4a');
  // hazard stripe
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-12, 3);
  ctx.quadraticCurveTo(-4, 8, 0, 9);
  ctx.stroke();
  // head with cracked respirator
  circle(ctx, 4, -15, 5.2);
  fillOut(ctx, lingrad(ctx, 0, -20, 9, -10, p.skin, p.skinDark));
  rrect(ctx, 5, -14, 5, 4, 1.5);
  fillOut(ctx, '#3a3a3a', 1);
  glowDot(ctx, 6.5, -17, 1.3);
  limb(ctx, [9, -6, 14, -2], 2.8, p.skin);
}

export const ENEMY_DRAW: Record<string, (ctx: C, ph: number) => void> = {
  shambler: drawShambler,
  runner: drawRunner,
  crawler: drawCrawler,
  brute: drawBrute,
  spitter: drawSpitter,
  bloater: drawBloater,
};

/** Bounding box of each sprite in world units (centered x, y offset to include head). */
export const ENEMY_BOX: Record<string, { w: number; h: number; oy: number }> = {
  shambler: { w: 48, h: 44, oy: -5 },
  runner: { w: 48, h: 42, oy: -5 },
  crawler: { w: 36, h: 24, oy: 0 },
  brute: { w: 60, h: 62, oy: -6 },
  spitter: { w: 44, h: 44, oy: -5 },
  bloater: { w: 44, h: 46, oy: -2 },
};

// ------------------------------------------------------------------ hero

export interface HeroPose {
  t: number; // time
  moving: boolean;
  aim: number; // world angle
}

/**
 * The courier: hazard-orange jacket with reflective tape, signal rig backpack with a blinking
 * antenna, helmet with a cyan visor. The gun arm tracks the auto-aim target.
 */
export function drawHero(ctx: C, pose: HeroPose) {
  const facing = Math.cos(pose.aim) < 0 ? -1 : 1;
  const ph = pose.moving ? pose.t * 12 : 0;
  const s = Math.sin(ph);
  const bob = pose.moving ? Math.abs(Math.cos(ph)) * -1.2 : Math.sin(pose.t * 2.5) * 0.4;
  ctx.save();
  ctx.scale(facing, 1);
  ctx.translate(0, bob);

  // backpack + antenna (behind)
  rrect(ctx, -10, -15, 8, 13, 2.5);
  fillOut(ctx, lingrad(ctx, -10, -15, -2, -2, '#4a5363', '#262c37'));
  ctx.fillStyle = '#5ef2ff';
  ctx.fillRect(-8.5, -11, 2, 2);
  limb(ctx, [-8, -15, -10, -27], 1.1, '#9aa3b5');
  const blink = (Math.sin(pose.t * 6) + 1) / 2;
  glowDot(ctx, -10, -28, 1.4 + blink * 0.5, '#5ef2ff');

  // legs
  limb(ctx, [-2, 3, -2 - s * 3.5, 11.5], 3.6, '#2b3140');
  circle(ctx, -2 - s * 3.5 + 1, 12.5, 2.4);
  fillOut(ctx, '#15181f', 1);
  limb(ctx, [2.5, 3, 2.5 + s * 3.5, 11.5], 3.6, '#363d4f');
  circle(ctx, 2.5 + s * 3.5 + 1, 12.5, 2.4);
  fillOut(ctx, '#1b1f28', 1);

  // jacket
  ctx.beginPath();
  ctx.moveTo(-7, -13);
  ctx.quadraticCurveTo(0, -16, 7, -13);
  ctx.lineTo(8, 4);
  ctx.quadraticCurveTo(0, 6, -8, 4);
  ctx.closePath();
  fillOut(ctx, lingrad(ctx, -7, -15, 7, 5, '#ff9a3d', '#c85314'));
  // reflective tape
  ctx.fillStyle = '#e8f2f5';
  ctx.fillRect(-7.5, -3, 15.5, 2.2);
  ctx.fillStyle = 'rgba(94,242,255,0.35)';
  ctx.fillRect(-7.5, -3, 15.5, 0.8);
  ctx.strokeStyle = OUT;
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-7.5, -3, 15.5, 2.2);
  // collar
  ctx.beginPath();
  ctx.moveTo(-5, -13);
  ctx.lineTo(0, -10);
  ctx.lineTo(5, -13);
  ctx.strokeStyle = '#8a3a0e';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // helmet + visor
  circle(ctx, 1, -20, 7);
  fillOut(ctx, lingrad(ctx, -6, -27, 8, -13, '#f2f5f8', '#9aa6b4'));
  ctx.save();
  ctx.shadowColor = '#5ef2ff';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(1, -23);
  ctx.quadraticCurveTo(9, -23.5, 8.3, -18);
  ctx.quadraticCurveTo(5, -16.5, 1.5, -18);
  ctx.closePath();
  fillOut(ctx, lingrad(ctx, 1, -23, 8, -17, '#bffbff', '#18b8d6'), 1.1);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(3, -22.3, 2.5, 1);
  // helmet stripe
  ctx.strokeStyle = '#ff7a1a';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(1, -20, 7, Math.PI * 1.15, Math.PI * 1.6);
  ctx.stroke();

  ctx.restore();

  // gun arm, rotated toward aim in world space (drawn after un-flipping)
  ctx.save();
  ctx.translate(0, bob - 7);
  ctx.rotate(pose.aim);
  const flipY = facing < 0 ? -1 : 1;
  ctx.scale(1, flipY);
  limb(ctx, [0, 0, 8, 1], 3.2, '#e07a2a');
  rrect(ctx, 6, -2.6, 11, 5, 1.5);
  fillOut(ctx, lingrad(ctx, 6, -3, 17, 3, '#5a6478', '#2a3040'), 1.2);
  ctx.fillStyle = '#5ef2ff';
  ctx.fillRect(9, -1.2, 5, 1.2);
  rrect(ctx, 8, 1.5, 3, 3.5, 1);
  fillOut(ctx, '#2a3040', 1);
  ctx.restore();
}

// ------------------------------------------------------------------ bosses

export interface BossPose {
  t: number;
  state: number;
  phase2: boolean;
}

/** The Warden: a riot officer the signal kept on duty. Shield plating, cracked visor, shock baton. */
export function drawWarden(ctx: C, pose: BossPose) {
  const s = Math.sin(pose.t * 2.2);
  const charging = pose.state === 2;
  const windup = pose.state === 1;
  ctx.save();
  if (charging) ctx.rotate(0.25);
  if (windup) ctx.translate(-3 + Math.sin(pose.t * 60) * 1.2, 0);
  // legs
  limb(ctx, [-9, 14, -10 - s * 4, 34], 10, '#1f2735');
  limb(ctx, [9, 14, 10 + s * 4, 34], 10, '#283244');
  circle(ctx, -9 - s * 4, 36, 6);
  fillOut(ctx, '#11151d');
  circle(ctx, 11 + s * 4, 36, 6);
  fillOut(ctx, '#11151d');
  // back arm with shield
  limb(ctx, [-16, -18, -26, -2], 9, '#2f3a50');
  ctx.save();
  ctx.translate(-27, 2);
  rrect(ctx, -9, -18, 18, 34, 5);
  fillOut(ctx, lingrad(ctx, -9, -18, 9, 16, '#5d6c88', '#2a3346'), 2.2);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  ctx.strokeRect(-5, -13, 10, 24);
  ctx.fillStyle = '#e8eef5';
  ctx.font = 'bold 7px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RIOT', 0, 2);
  ctx.restore();
  // torso armour
  ctx.beginPath();
  ctx.moveTo(-22, -26);
  ctx.quadraticCurveTo(0, -40, 22, -26);
  ctx.lineTo(18, 16);
  ctx.quadraticCurveTo(0, 22, -18, 16);
  ctx.closePath();
  fillOut(ctx, lingrad(ctx, -22, -38, 22, 18, '#3b4a66', '#151c2a'), 2.4);
  // chest plate
  ctx.beginPath();
  ctx.moveTo(-14, -20);
  ctx.lineTo(14, -20);
  ctx.lineTo(11, 6);
  ctx.lineTo(0, 11);
  ctx.lineTo(-11, 6);
  ctx.closePath();
  fillOut(ctx, lingrad(ctx, -14, -20, 14, 10, '#6a7b9c', '#2c3750'), 1.8);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('07', 0, -4);
  // signal growth bursting through
  glowDot(ctx, 9, -13, 3);
  glowDot(ctx, 13, -7, 2);
  glowDot(ctx, -16, 4, 2.2);
  // pauldrons
  circle(ctx, -20, -25, 8);
  fillOut(ctx, lingrad(ctx, -27, -32, -13, -18, '#7887a6', '#323d56'), 2);
  circle(ctx, 20, -25, 8);
  fillOut(ctx, lingrad(ctx, 13, -32, 27, -18, '#7887a6', '#323d56'), 2);
  // helmet
  circle(ctx, 2, -40, 12);
  fillOut(ctx, lingrad(ctx, -10, -52, 14, -28, '#4d5d7d', '#1b2233'), 2.2);
  ctx.save();
  ctx.shadowColor = SIGNAL;
  ctx.shadowBlur = pose.phase2 ? 18 : 10;
  ctx.beginPath();
  ctx.moveTo(-2, -45);
  ctx.lineTo(13, -45);
  ctx.lineTo(12, -36);
  ctx.lineTo(-1, -37);
  ctx.closePath();
  fillOut(ctx, lingrad(ctx, 0, -45, 12, -36, '#ff9cec', '#b1158f'), 1.6);
  ctx.restore();
  // visor crack
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(4, -45);
  ctx.lineTo(6, -41);
  ctx.lineTo(4, -38);
  ctx.moveTo(6, -41);
  ctx.lineTo(9, -40);
  ctx.stroke();
  // baton arm
  const baton = windup ? -1.2 : charging ? 0.4 : -0.3 + s * 0.15;
  ctx.save();
  ctx.translate(18, -18);
  ctx.rotate(baton);
  limb(ctx, [0, 0, 12, 10, 20, 12], 9, '#33405a');
  ctx.translate(22, 12);
  ctx.rotate(-1.2);
  rrect(ctx, -2.5, -4, 5, 26, 2);
  fillOut(ctx, '#20242d', 1.6);
  ctx.save();
  ctx.shadowColor = '#5ef2ff';
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#bffbff';
  ctx.fillRect(-1.5, 14, 3, 7);
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

/** Hive Mother: a bloated queen with a glowing brood sac and too many arms. */
export function drawHive(ctx: C, pose: BossPose) {
  const t = pose.t;
  const breathe = Math.sin(t * 2) * 1.5;
  // abdomen
  ctx.save();
  ellipse(ctx, -12, 10, 30 + breathe, 22 - breathe * 0.5, -0.15);
  fillOut(ctx, lingrad(ctx, -40, -10, 18, 32, '#8d6aa8', '#3d2650'), 2.4);
  // egg sacs
  for (let i = 0; i < 6; i++) {
    const ex = -26 + (i % 3) * 12 + Math.sin(i * 7) * 3;
    const ey = 4 + Math.floor(i / 3) * 12;
    const pulse = (Math.sin(t * 3 + i) + 1) / 2;
    ctx.save();
    ctx.shadowColor = '#c6ff4a';
    ctx.shadowBlur = 6 + pulse * 6;
    ellipse(ctx, ex, ey, 5 + pulse, 4 + pulse * 0.6, 0.3);
    fillOut(ctx, lingrad(ctx, ex - 5, ey - 4, ex + 5, ey + 4, '#f4ffb0', '#79b51c'), 1.2);
    ctx.restore();
  }
  ctx.restore();
  // legs (insectoid)
  for (let i = 0; i < 3; i++) {
    const lx = -20 + i * 14;
    const sw = Math.sin(t * 3 + i * 2) * 3;
    limb(ctx, [lx, 22, lx - 6 + sw, 34, lx - 2 + sw, 40], 3.2, '#2c1b3a');
  }
  // humanoid upper torso
  ctx.beginPath();
  ctx.moveTo(4, 4);
  ctx.quadraticCurveTo(-2, -16, 8, -28);
  ctx.quadraticCurveTo(22, -26, 22, -10);
  ctx.quadraticCurveTo(20, 4, 4, 4);
  fillOut(ctx, lingrad(ctx, 0, -28, 22, 4, '#b7a7c4', '#5f4a74'), 2);
  // arms (four)
  for (let i = 0; i < 4; i++) {
    const a = -0.9 + i * 0.45 + Math.sin(t * 4 + i) * 0.15;
    const sx = 14;
    const sy = -18 + i * 5;
    limb(ctx, [sx, sy, sx + Math.cos(a) * 14, sy + Math.sin(a) * 14, sx + Math.cos(a) * 24, sy + Math.sin(a + 0.6) * 20], 3.6, i % 2 ? '#9883ab' : '#7a6590');
  }
  // head with crown of antennae
  circle(ctx, 14, -34, 9);
  fillOut(ctx, lingrad(ctx, 5, -43, 23, -25, '#c9b8d6', '#6a557e'), 2);
  for (let i = 0; i < 5; i++) {
    const a = -2.4 + i * 0.35;
    const x0 = 14 + Math.cos(a) * 8;
    const y0 = -34 + Math.sin(a) * 8;
    limb(ctx, [x0, y0, x0 + Math.cos(a) * 9, y0 + Math.sin(a) * 9], 1.4, '#3d2650');
    glowDot(ctx, x0 + Math.cos(a) * 10, y0 + Math.sin(a) * 10, 1.6);
  }
  glowDot(ctx, 19, -35, 2.2);
  glowDot(ctx, 15, -36, 1.6);
  ctx.fillStyle = '#2a0f18';
  ellipse(ctx, 20, -29, 3.5, 2, 0.2);
  ctx.fill();
  if (pose.phase2) {
    ctx.strokeStyle = SIGNAL_SOFT;
    ctx.lineWidth = 2;
    circle(ctx, -12, 10, 36 + Math.sin(t * 6) * 3);
    ctx.stroke();
  }
}

/** Signal Colossus: a broadcast tower fused onto a giant. The dish on its back is the source. */
export function drawColossus(ctx: C, pose: BossPose) {
  const t = pose.t;
  const s = Math.sin(t * 1.6);
  // mech legs
  limb(ctx, [-12, 16, -14 - s * 4, 30, -12 - s * 4, 42], 9, '#4a4f5c');
  limb(ctx, [12, 16, 14 + s * 4, 30, 12 + s * 4, 42], 9, '#5b6170');
  rrect(ctx, -22 - s * 4, 40, 18, 7, 2);
  fillOut(ctx, '#2a2d35');
  rrect(ctx, 4 + s * 4, 40, 18, 7, 2);
  fillOut(ctx, '#2a2d35');
  // dish on back: mast, reflector bowl with rings, feed horn
  limb(ctx, [-14, -30, -20, -44], 3, '#5b6170');
  ctx.save();
  ctx.translate(-22, -50);
  ctx.rotate(-0.6 + Math.sin(t * 0.7) * 0.15);
  ellipse(ctx, 0, 0, 17, 13, 0);
  fillOut(ctx, lingrad(ctx, -17, -13, 17, 13, '#eef1f6', '#8a92a2'), 2);
  ctx.strokeStyle = 'rgba(60,66,80,0.6)';
  ctx.lineWidth = 1;
  for (const r of [0.35, 0.65]) {
    ellipse(ctx, 0, 0, 17 * r, 13 * r, 0);
    ctx.stroke();
  }
  limb(ctx, [-8, 6, 0, -2, 8, 6], 1.2, '#9aa3b5');
  glowDot(ctx, 0, -2, 3);
  ctx.restore();
  // broadcast rings
  const ring = (t * 0.8) % 1;
  ctx.strokeStyle = `rgba(255,59,212,${0.6 * (1 - ring)})`;
  ctx.lineWidth = 2;
  circle(ctx, -22, -52, 8 + ring * 34);
  ctx.stroke();
  // torso: flesh wrapped in steel and cable
  ctx.beginPath();
  ctx.moveTo(-26, -30);
  ctx.quadraticCurveTo(0, -46, 26, -30);
  ctx.lineTo(20, 18);
  ctx.quadraticCurveTo(0, 24, -20, 18);
  ctx.closePath();
  fillOut(ctx, lingrad(ctx, -26, -44, 26, 22, '#8aa27a', '#3c4d36'), 2.4);
  // steel bands
  for (let i = 0; i < 3; i++) {
    const y = -22 + i * 13;
    rrect(ctx, -24 + i, y, 48 - i * 2, 5, 2);
    fillOut(ctx, lingrad(ctx, -24, y, 24, y + 5, '#9aa3b5', '#4a5160'), 1.4);
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = '#2a2d35';
      ctx.fillRect(-18 + k * 9 + i, y + 1.5, 1.6, 1.6);
    }
  }
  // cables
  ctx.strokeStyle = '#1b1d24';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-20, -28);
  ctx.bezierCurveTo(-30, -10, -10, 0, -22, 14);
  ctx.moveTo(16, -30);
  ctx.bezierCurveTo(28, -14, 10, 4, 18, 16);
  ctx.stroke();
  glowDot(ctx, 0, -6, 4);
  // cannon arm
  ctx.save();
  ctx.translate(22, -22);
  ctx.rotate(0.2 + Math.sin(t) * 0.05);
  limb(ctx, [0, 0, 14, 6], 9, '#5b6170');
  rrect(ctx, 12, -2, 26, 13, 3);
  fillOut(ctx, lingrad(ctx, 12, -2, 38, 11, '#6e7686', '#2c3038'), 2);
  ctx.save();
  ctx.shadowColor = SIGNAL;
  ctx.shadowBlur = 12;
  circle(ctx, 38, 4.5, 4);
  fillOut(ctx, '#ff9cec', 1.4);
  ctx.restore();
  ctx.restore();
  // zombie head in a cage helmet
  circle(ctx, 2, -44, 11);
  fillOut(ctx, lingrad(ctx, -9, -55, 13, -33, '#9cb58a', '#4d6440'), 2);
  ctx.strokeStyle = '#3a3f4a';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(-8 + (i + 1) * 8, -55);
    ctx.lineTo(-8 + (i + 1) * 8, -34);
    ctx.stroke();
  }
  glowDot(ctx, 7, -46, 2.6);
  glowDot(ctx, 0, -47, 2);
  if (pose.phase2) glowDot(ctx, -16, 4, 3);
}

export const BOSS_DRAW = { warden: drawWarden, hive: drawHive, colossus: drawColossus };
