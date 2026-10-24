import { INK, SIGNAL, ao, ball, glow, hexA, limb, line, mat, paint, taper, veins, type C } from './kit';

export interface BossPose {
  t: number;
  state: number;
  phase2: boolean;
}

/** Boss sizes in world units; feet sit at +foot below the sim position (matches the shadow). */
export const BOSS_SPEC = {
  warden: { h: 108, foot: 34 },
  hive: { h: 100, foot: 38 },
  colossus: { h: 102, foot: 44 },
  broadcaster: { h: 112, foot: 40 },
};

// ------------------------------------------------------------------ The Warden

const ARMOR = mat('#4a5a7a', '#1a2234', '#7c8cb0');
const ARMOR_D = mat('#38465f', '#141a28', '#5f6e8e');
const PLATE = mat('#7a8aac', '#2e3a54', '#b4c2de');
const SUIT = mat('#232b3c', '#0e121a', '#3c4760');

/**
 * The Warden: a riot officer the signal kept on duty. Riot shield, shock baton, cracked visor
 * leaking signal light. States: 0 stalk, 1 wind-up (baton raised), 2 charge (shield-first), 3 slam.
 */
function warden(ctx: C, p: BossPose) {
  const walk = p.state === 0 ? Math.sin(p.t * 2.2) : 0;
  const lean = p.state === 2 ? 0.3 : p.state === 1 ? -0.08 : 0;
  const crouch = p.state === 1 ? 4 : p.state === 3 ? 6 : 0;
  const shake = p.state === 1 ? Math.sin(p.t * 60) * 0.8 : 0;
  ctx.translate(shake, crouch);

  // legs
  const leg = (side: number, m = SUIT) => {
    const sw = walk * side;
    limb(ctx, side * 8, -34, side * 9 + sw * 5, -18, side * 9 + sw * 8, -4, [9, 8, 7], m);
    ball(ctx, side * 9 + sw * 5 + 2, -19, 6.5, 5.5, PLATE);
    paint(ctx, (c) => c.roundRect(side * 9 + sw * 8 - 8, -9, 20, 10, [3, 6, 2, 2]), mat('#1a1d24', '#08090c', '#3a3e48', null), 0, -9, 20, 10);
  };
  leg(-1, mat('#1a2030', '#0a0d14', '#2c3448'));

  ctx.save();
  ctx.translate(0, -34);
  ctx.rotate(lean);

  const drawShield = () => {
  limb(ctx, -14, -30, -24, -16, -24, -2, [8, 7, 6.5], ARMOR_D);
  ctx.save();
  ctx.translate(p.state === 2 ? 4 : -26, p.state === 2 ? -10 : 0);
  ctx.rotate(p.state === 2 ? -0.1 : 0.05);
  paint(ctx, (c) => c.roundRect(-12, -36, 24, 50, 7), mat('#5d6c8c', '#222a3c', '#9aaacc'), -12, -36, 24, 50);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-12, -36, 24, 50, 7);
  ctx.clip();
  ctx.fillStyle = 'rgba(180,220,255,0.18)';
  ctx.fillRect(-12, -36, 9, 50);
  line(ctx, [-9, -20, 2, -12, -4, 0], 1.4, '#ffffff', 0.5);
  line(ctx, [4, -30, 9, -22], 1.4, '#ffffff', 0.4);
  ctx.restore();
  ctx.fillStyle = '#e8eef5';
  ctx.font = '900 8px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RIOT', 0, -6);
  ctx.restore();

  };
  if (p.state !== 2) drawShield();
  // torso armour
  const torso = (c: C) => {
    c.moveTo(-24, -4);
    c.quadraticCurveTo(-28, -30, -22, -52);
    c.quadraticCurveTo(0, -62, 22, -52);
    c.quadraticCurveTo(28, -30, 22, -4);
    c.quadraticCurveTo(0, 4, -24, -4);
    c.closePath();
  };
  paint(ctx, torso, ARMOR, -28, -62, 56, 66);
  // chest plate with unit number
  paint(
    ctx,
    (c) => {
      c.moveTo(-15, -46);
      c.lineTo(15, -46);
      c.lineTo(12, -18);
      c.lineTo(0, -11);
      c.lineTo(-12, -18);
      c.closePath();
    },
    PLATE,
    -15,
    -46,
    30,
    35,
  );
  ctx.fillStyle = '#ffd34d';
  ctx.font = '900 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('07', 0, -26);
  // signal bursting through cracked armour
  veins(ctx, 8, -40, 22, 0.8, 3);
  veins(ctx, -18, -14, 18, -0.6, 5);
  glow(ctx, 10, -38, p.phase2 ? 3.4 : 2.4);
  glow(ctx, -17, -12, p.phase2 ? 2.8 : 2);
  // belt
  paint(ctx, (c) => c.roundRect(-23, -10, 46, 7, 3), mat('#2a2e38', '#101218', '#4a4e5a', null), -23, -10, 46, 7);
  // pauldrons
  ball(ctx, -22, -52, 11, 9, PLATE, -0.2);
  ball(ctx, 22, -52, 11, 9, PLATE, 0.2);

  if (p.state === 2) drawShield(); // charge: shield leads, in front of the body

  // helmet with cracked visor
  const hy = -70;
  ball(ctx, 3, hy, 17, 16, ARMOR);
  const visor = (c: C) => {
    c.moveTo(0, hy - 6);
    c.lineTo(19, hy - 7);
    c.quadraticCurveTo(21, hy + 2, 17, hy + 6);
    c.lineTo(1, hy + 5);
    c.closePath();
  };
  ctx.save();
  ctx.shadowColor = SIGNAL;
  ctx.shadowBlur = p.phase2 ? 16 : 10;
  ctx.beginPath();
  visor(ctx);
  const vg = ctx.createLinearGradient(0, hy - 7, 19, hy + 6);
  vg.addColorStop(0, '#ffd6f6');
  vg.addColorStop(0.4, '#ff6ae0');
  vg.addColorStop(1, '#8a0a6a');
  ctx.fillStyle = vg;
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  visor(ctx);
  ctx.lineWidth = 2.6;
  ctx.strokeStyle = INK;
  ctx.stroke();
  line(ctx, [7, hy - 6, 9, hy - 1, 6, hy + 4], 1.2, '#ffffff', 0.9);
  line(ctx, [9, hy - 1, 14, hy], 1.2, '#ffffff', 0.9);
  // helmet ridge
  paint(ctx, (c) => c.roundRect(-4, hy - 18, 10, 6, 3), PLATE, -4, hy - 18, 10, 6);

  // baton arm
  const baton = p.state === 1 ? -2.2 : p.state === 3 ? 0.9 : p.state === 2 ? 0.2 : -0.5 + walk * 0.15;
  ctx.save();
  ctx.translate(20, -48);
  ctx.rotate(baton);
  limb(ctx, 0, 0, 14, 6, 26, 4, [8, 7, 6.5], ARMOR);
  ball(ctx, 27, 4, 6, 6, mat('#2a2e38', '#101218', '#4a4e5a'));
  ctx.translate(28, 4);
  ctx.rotate(-1.35);
  paint(ctx, (c) => c.roundRect(-3, -4, 6, 34, 2.5), mat('#2a2e38', '#0a0b0e', '#5a606c', null), -3, -4, 6, 34);
  ctx.save();
  ctx.shadowColor = '#5ef2ff';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#bffbff';
  ctx.fillRect(-2, 18, 4, 11);
  ctx.restore();
  if (p.state === 1 || p.phase2) {
    line(ctx, [0, 30, 5, 36, -3, 40, 4, 46], 1.4, '#bffbff');
  }
  ctx.restore();

  ctx.restore(); // torso
  leg(1);
  ao(ctx, 0, -2, 30, 4, 0.3);
}

// ------------------------------------------------------------------ Hive Mother

const CHITIN = mat('#8a6aa8', '#2e1e40', '#c4a6dc');
const CHITIN_D = mat('#5a4274', '#1c1028', '#8a6aa8');
const QUEEN = mat('#c8b6d6', '#5e4874', '#efe4f6');

/** Hive Mother: a bloated queen dragging a glowing brood sac, four arms, a crown of antennae. */
function hive(ctx: C, p: BossPose) {
  const t = p.t;
  const breathe = Math.sin(t * 2) * 1.5;
  // insect legs (far side)
  for (let i = 0; i < 3; i++) {
    const sw = Math.sin(t * 3 + i * 2) * 3;
    limb(ctx, -30 + i * 14, -22, -40 + i * 14 + sw, -30, -42 + i * 14 + sw, -3, [4, 3.4, 2], CHITIN_D);
  }
  // brood abdomen
  ball(ctx, -18, -34, 36 + breathe, 25 - breathe * 0.5, CHITIN, -0.12);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(-18, -34, 36 + breathe, 25 - breathe * 0.5, -0.12, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = hexA('#1c1028', 0.55);
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.ellipse(-46 + i * 13, -34, 4, 26, 0.1, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
  }
  ctx.restore();
  // egg sacs
  for (let i = 0; i < 7; i++) {
    const ex = -40 + (i % 4) * 13 + (i > 3 ? 6 : 0);
    const ey = -38 + (i > 3 ? 14 : 0);
    const pulse = (Math.sin(t * 3 + i) + 1) / 2;
    ctx.save();
    ctx.shadowColor = '#c6ff4a';
    ctx.shadowBlur = 6 + pulse * (p.phase2 ? 14 : 8);
    ball(ctx, ex, ey, 5.5 + pulse, 4.5 + pulse * 0.7, mat('#e6ff9a', '#5e9612', '#ffffff', null, 2));
    ctx.restore();
  }
  // near legs
  for (let i = 0; i < 3; i++) {
    const sw = Math.sin(t * 3 + i * 2 + 1) * 3;
    limb(ctx, -24 + i * 14, -18, -30 + i * 14 + sw, -26, -28 + i * 14 + sw, -3, [4.6, 4, 2.4], CHITIN);
  }
  // humanoid upper body rising from the abdomen
  const torso = (c: C) => {
    c.moveTo(4, -28);
    c.quadraticCurveTo(-2, -52, 8, -68);
    c.quadraticCurveTo(22, -70, 24, -54);
    c.quadraticCurveTo(24, -34, 10, -26);
    c.closePath();
  };
  paint(ctx, torso, QUEEN, -2, -70, 26, 46);
  ctx.save();
  ctx.beginPath();
  torso(ctx);
  ctx.clip();
  ctx.strokeStyle = hexA('#5e4874', 0.7);
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(16, -58 + i * 6, 9, 3, 0.2, Math.PI * 0.1, Math.PI * 0.9);
    ctx.stroke();
  }
  ctx.restore();
  // four arms
  for (let i = 0; i < 4; i++) {
    const a = Math.sin(t * 4 + i) * 0.2;
    const sy = -62 + i * 7;
    const m = i % 2 ? QUEEN : mat('#a894b8', '#4a3660', '#d6c8e2');
    limb(ctx, 16, sy, 30 + Math.cos(-0.6 + i * 0.35 + a) * 4, sy + 4 + i * 2, 40, sy - 6 + i * 6 + a * 10, [3.4, 3, 2.4], m);
    paint(ctx, taper(40, sy - 6 + i * 6 + a * 10, 2.4, 46, sy - 10 + i * 6 + a * 10, 0.6), mat('#efe4cc', '#a89a78', '#ffffff', null, 1.6), 38, sy - 14, 12, 12);
  }
  // crowned head
  const hx = 16;
  const hy = -80;
  ball(ctx, hx, hy, 12, 11, QUEEN);
  for (let i = 0; i < 6; i++) {
    const a = -2.5 + i * 0.32;
    const x0 = hx + Math.cos(a) * 10;
    const y0 = hy + Math.sin(a) * 10;
    paint(ctx, taper(x0, y0, 2, x0 + Math.cos(a) * 12, y0 + Math.sin(a) * 12, 0.8), CHITIN_D, x0 - 14, y0 - 14, 28, 28);
    glow(ctx, x0 + Math.cos(a) * 13, y0 + Math.sin(a) * 13, 1.8, SIGNAL);
  }
  glow(ctx, hx + 6, hy - 1, 2.4);
  glow(ctx, hx + 1, hy - 2, 1.8);
  glow(ctx, hx + 8, hy + 4, 1.4);
  ctx.fillStyle = '#2a0a16';
  ctx.beginPath();
  ctx.ellipse(hx + 7, hy + 6, 4, 2.4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  if (p.phase2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(SIGNAL, 0.5);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(-18, -34, 44 + Math.sin(t * 6) * 3, 32, -0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ao(ctx, -14, -2, 44, 5, 0.3);
}

// ------------------------------------------------------------------ Signal Colossus

const STEEL = mat('#6e7686', '#2a2e38', '#a8b0c0');
const STEEL_D = mat('#4e5462', '#1c1f26', '#7e8696');
const FLESH = mat('#8fa880', '#3c4d36', '#bed2ae');

/** Signal Colossus: a broadcast tower fused onto a giant; the dish on its back is the source. */
function colossus(ctx: C, p: BossPose) {
  const t = p.t;
  const w = Math.sin(t * 1.6);
  // mech legs
  const leg = (side: number, m = STEEL) => {
    const sw = w * side;
    limb(ctx, side * 12, -36, side * 16 + sw * 4, -20, side * 13 + sw * 5, -6, [10, 8, 7], m);
    ball(ctx, side * 16 + sw * 4, -20, 6, 6, mat('#3a3e48', '#121418', '#5a5e68', null));
    paint(ctx, (c) => c.roundRect(side * 13 + sw * 5 - 12, -9, 24, 9, 3), mat('#2a2d35', '#0c0d10', '#4a4e58', null), 0, -9, 24, 9);
  };
  leg(-1, STEEL_D);
  // dish on the back
  ctx.save();
  ctx.translate(-24, -100);
  ctx.rotate(-0.55 + Math.sin(t * 0.7) * 0.15);
  limb(ctx, 0, 24, 0, 12, 0, 2, [3, 2.6, 2.4], STEEL_D);
  ball(ctx, 0, 0, 20, 15, mat('#eef1f6', '#7c8494', '#ffffff'));
  ctx.strokeStyle = hexA('#3a4050', 0.6);
  ctx.lineWidth = 1.2;
  for (const r of [0.35, 0.65]) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 20 * r, 15 * r, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  line(ctx, [-9, 8, 0, -2, 9, 8], 1.6, '#9aa3b5');
  glow(ctx, 0, -2, 3.2);
  ctx.restore();
  // broadcast rings
  const ring = (t * 0.8) % 1;
  ctx.strokeStyle = `rgba(255,59,212,${0.6 * (1 - ring)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(-26, -104, 8 + ring * 36, 0, Math.PI * 2);
  ctx.stroke();
  // torso: flesh bound in steel bands and cable
  const torso = (c: C) => {
    c.moveTo(-28, -36);
    c.quadraticCurveTo(-34, -70, -24, -92);
    c.quadraticCurveTo(0, -104, 26, -92);
    c.quadraticCurveTo(34, -66, 26, -36);
    c.quadraticCurveTo(0, -28, -28, -36);
    c.closePath();
  };
  paint(ctx, torso, FLESH, -34, -104, 68, 72);
  ctx.save();
  ctx.beginPath();
  torso(ctx);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    const y = -84 + i * 16;
    paint(ctx, (c) => c.roundRect(-34, y, 68, 7, 2), STEEL, -34, y, 68, 7);
    ctx.fillStyle = '#20232a';
    for (let k = 0; k < 7; k++) ctx.fillRect(-28 + k * 9, y + 2.5, 2, 2);
  }
  ctx.restore();
  line(ctx, [-22, -88, -32, -66, -14, -54, -24, -40], 2.6, '#16181e');
  line(ctx, [18, -90, 30, -72, 12, -58, 20, -42], 2.6, '#16181e');
  glow(ctx, 0, -62, p.phase2 ? 5 : 4);
  veins(ctx, 0, -62, 18, 2.4, 9);
  veins(ctx, 0, -62, 16, 0.4, 4);
  // cannon arm
  ctx.save();
  ctx.translate(24, -82);
  ctx.rotate(0.25 + Math.sin(t) * 0.05);
  limb(ctx, 0, 0, 12, 8, 18, 10, [10, 9, 8], STEEL);
  paint(ctx, (c) => c.roundRect(14, 0, 32, 16, 4), STEEL_D, 14, 0, 32, 16);
  paint(ctx, (c) => c.roundRect(40, 3, 10, 10, 3), mat('#2a2d35', '#0c0d10', '#4a4e58', null), 40, 3, 10, 10);
  glow(ctx, 50, 8, p.phase2 ? 4.6 : 3.6);
  ctx.restore();
  // caged head
  const hx = 4;
  const hy = -106;
  ball(ctx, hx, hy, 14, 13, FLESH);
  ctx.strokeStyle = '#2a2d35';
  ctx.lineWidth = 2.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(hx + i * 7, hy - 14);
    ctx.lineTo(hx + i * 7 + 2, hy + 12);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(hx, hy, 14, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  glow(ctx, hx + 7, hy - 2, 2.8);
  glow(ctx, hx, hy - 3, 2.2);
  ctx.fillStyle = '#2a0a16';
  ctx.beginPath();
  ctx.ellipse(hx + 7, hy + 6, 4, 2.4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  leg(1);
  ao(ctx, 0, -2, 34, 5, 0.3);
}


// ------------------------------------------------------------------ The Broadcaster

const SKIN = mat('#9aa48e', '#3e4636', '#c8d2ba');
const SKIN_D = mat('#6e7864', '#262c20', '#9aa48e');
const JACKET = mat('#2f4a52', '#0f1c20', '#4f7480');
const SHIRT = mat('#c9c2b0', '#6a6454', '#efe8d8');
const BRASS = mat('#c89a46', '#5e4216', '#f2d08a');
const MIC = mat('#3a3d44', '#101114', '#70747e');

/**
 * The Broadcaster: a gaunt late-night radio host grown three metres tall. A speaker cone has
 * burst through his chest, a crown of antennae blinks on his skull and he still clutches the mic.
 * Hovers slightly (cables hang from his back); the speaker pulses with each attack.
 */
function broadcaster(ctx: C, p: BossPose) {
  const t = p.t;
  const bob = Math.sin(t * 1.8) * 2;
  const pulse = (Math.sin(t * (p.phase2 ? 9 : 5)) + 1) / 2;
  // hanging cables behind (sway)
  for (let i = 0; i < 4; i++) {
    const x0 = -12 + i * 5;
    const sw = Math.sin(t * 2 + i) * 5;
    line(ctx, [x0, -78 + bob, x0 - 10 + sw, -50, x0 - 16 + sw * 1.4, -20, x0 - 12 + sw, -4], 2.2, '#16181e');
    if (i % 2 === 0) glow(ctx, x0 - 12 + sw, -4, 1.6, SIGNAL);
  }
  // long digitigrade legs (far leg darker)
  const leg = (side: number, m: typeof SKIN) => {
    const sw = Math.sin(t * 1.8 + (side > 0 ? 0 : Math.PI)) * 3;
    limb(ctx, side * 8, -44 + bob, side * 13 + 6 + sw, -24, side * 8 + sw, -4, [7.5, 5.6, 4.2], m);
    paint(ctx, (c) => c.roundRect(side * 7 + sw - 6, -6, 15, 6, 3), mat('#1e2026', '#08090b', '#3a3d46', null), side * 7 + sw - 6, -6, 15, 6);
  };
  // long coat tails flaring behind the legs
  const flap = Math.sin(t * 2.4) * 3;
  paint(ctx, (c) => (c.moveTo(-20, -60 + bob), c.lineTo(-30 - flap, -18), c.lineTo(-14, -24), c.lineTo(-6, -50 + bob), c.closePath()), mat('#24393f', '#0a1417', '#3d5c66'), -30, -60, 26, 42);
  paint(ctx, (c) => (c.moveTo(16, -60 + bob), c.lineTo(26 + flap * 0.6, -22), c.lineTo(12, -28), c.lineTo(6, -50 + bob), c.closePath()), mat('#24393f', '#0a1417', '#3d5c66'), 6, -60, 22, 38);
  leg(-1, SKIN_D);
  // trousers / hips
  paint(ctx, (c) => c.roundRect(-13, -54 + bob, 26, 14, 5), mat('#232832', '#0b0d11', '#3b4352'), -13, -54 + bob, 26, 14);
  leg(1, SKIN);
  // tall torso in a torn suit jacket
  const torso = (c: C) => {
    c.moveTo(-16, -50 + bob);
    c.quadraticCurveTo(-26, -76 + bob, -28, -96 + bob);
    c.quadraticCurveTo(0, -108 + bob, 30, -96 + bob);
    c.quadraticCurveTo(28, -74 + bob, 18, -50 + bob);
    c.quadraticCurveTo(0, -45 + bob, -16, -50 + bob);
    c.closePath();
  };
  paint(ctx, torso, JACKET, -28, -108 + bob, 58, 62);
  // shoulder pads
  ball(ctx, -22, -95 + bob, 9, 6, JACKET, -0.3);
  ball(ctx, 25, -95 + bob, 9, 6, JACKET, 0.3);
  // shirt + loosened tie down the middle
  paint(ctx, (c) => (c.moveTo(-5, -96 + bob), c.lineTo(8, -96 + bob), c.lineTo(5, -52 + bob), c.lineTo(-3, -52 + bob), c.closePath()), SHIRT, -5, -96 + bob, 13, 44);
  paint(ctx, (c) => (c.moveTo(0, -94 + bob), c.lineTo(4, -94 + bob), c.lineTo(5, -70 + bob), c.lineTo(2, -66 + bob), c.lineTo(-1, -70 + bob), c.closePath()), mat('#a3243a', '#4a0c18', '#e05a70'), -1, -94 + bob, 6, 28);
  // lapels
  line(ctx, [-6, -96 + bob, -12, -76 + bob, -4, -64 + bob], 2, '#0b1418');
  line(ctx, [9, -96 + bob, 15, -76 + bob, 7, -64 + bob], 2, '#0b1418');
  // the speaker that burst through his chest
  const sx = 3;
  const sy = -76 + bob;
  ctx.save();
  ctx.shadowColor = SIGNAL;
  ctx.shadowBlur = 10 + pulse * (p.phase2 ? 22 : 12);
  ball(ctx, sx, sy, 15, 15, mat('#2a2c33', '#0a0b0e', '#4a4e58'));
  ctx.restore();
  ball(ctx, sx, sy, 11.5 - pulse * 1.4, 11.5 - pulse * 1.4, mat('#3e2a44', '#120a16', '#6e4a7a', null, 1.4));
  ctx.strokeStyle = hexA('#ff9ae8', 0.35 + pulse * 0.4);
  ctx.lineWidth = 1.2;
  for (const r of [3.5, 6.5]) {
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  glow(ctx, sx, sy, 2.4 + pulse * 1.4);
  // torn flesh around the cone
  line(ctx, [sx - 14, sy - 4, sx - 11, sy - 8, sx - 13, sy - 12], 1.6, '#4a1a2a');
  line(ctx, [sx + 13, sy + 2, sx + 16, sy + 6, sx + 13, sy + 9], 1.6, '#4a1a2a');
  veins(ctx, sx - 10, sy + 8, 14, 2.2, 5);
  veins(ctx, sx + 10, sy - 8, 12, -0.6, 8);
  // far arm: long fingers spread (cable-like)
  const reach = Math.sin(t * 1.3) * 0.15;
  limb(ctx, -22, -94 + bob, -34, -72 + bob, -38, -52 + bob + reach * 20, [6.4, 5, 4], JACKET);
  for (let f = 0; f < 4; f++) {
    const a = 1.7 + f * 0.28 + reach;
    paint(ctx, taper(-38, -52 + bob, 2.2, -38 + Math.cos(a) * 16, -52 + bob + Math.sin(a) * 16, 0.7), SKIN_D, -56, -70, 34, 34);
  }
  // head: long skull, microphone-grille jaw, antenna crown
  const hx = 4;
  const hy = -114 + bob;
  limb(ctx, 2, -98 + bob, 3, -104 + bob, hx, hy + 6, [4, 4, 4], SKIN);
  ball(ctx, hx, hy, 12, 14, SKIN, 0.08);
  // grille jaw
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(hx + 3, hy + 6, 7, 5, 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1c22';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = '#6c7280';
  ctx.lineWidth = 0.9;
  for (let k = -8; k <= 8; k += 2.4) {
    ctx.beginPath();
    ctx.moveTo(hx + k, hy);
    ctx.lineTo(hx + k + 4, hy + 12);
    ctx.stroke();
  }
  ctx.restore();
  // hollow eyes
  glow(ctx, hx + 6, hy - 3, 2.6);
  glow(ctx, hx - 1, hy - 4, 2);
  // antenna crown with blinking tips
  const ant: [number, number, number][] = [[-8, -0.55, 16], [-2, -0.15, 28], [5, 0.12, 20], [10, 0.5, 14]];
  ant.forEach(([ox, a, len], i) => {
    const x0 = hx + ox;
    const y0 = hy - 10;
    const x1 = x0 + Math.sin(a) * len;
    const y1 = y0 - Math.cos(a) * len;
    ctx.save();
    ctx.strokeStyle = '#9aa0ac';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x0 - 1.6, y0);
    ctx.lineTo(x1, y1);
    ctx.lineTo(x0 + 1.6, y0);
    for (let q = 0.2; q < 0.9; q += 0.2) {
      const mx = x0 + (x1 - x0) * q;
      const my = y0 + (y1 - y0) * q;
      const w = 1.6 * (1 - q);
      ctx.moveTo(mx - w, my);
      ctx.lineTo(mx + w, my + 1.4);
    }
    ctx.stroke();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.restore();
    const on = Math.sin(t * 4 + i * 1.7) > 0.2;
    glow(ctx, x1, y1, on ? 2.2 : 1.2, on ? SIGNAL : '#7a2a6a');
  });
  // signal rings from the tallest antenna
  const ring = (t * 0.9) % 1;
  ctx.strokeStyle = `rgba(255,59,212,${0.55 * (1 - ring)})`;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(hx - 2 + Math.sin(-0.15) * 28, hy - 10 - Math.cos(-0.15) * 28, 4 + ring * 30, 0, Math.PI * 2);
  ctx.stroke();
  // near arm holding a vintage microphone on its cord
  const sway = Math.sin(t * 2.2) * 0.12;
  ctx.save();
  ctx.translate(18, -92 + bob);
  ctx.rotate(0.5 + sway);
  limb(ctx, 0, 0, 13, 15, 26, 21, [6.4, 5.2, 4.4], JACKET);
  ball(ctx, 28, 21, 5, 4.8, SKIN);
  // mic
  ctx.save();
  ctx.translate(30, 16);
  ctx.rotate(-1.1 - sway);
  paint(ctx, (c) => c.roundRect(-3, 0, 6, 14, 2), MIC, -3, 0, 6, 14);
  ball(ctx, 0, -4, 7, 7.6, BRASS);
  ctx.strokeStyle = hexA('#5e4216', 0.8);
  ctx.lineWidth = 0.8;
  for (let k = -4; k <= 4; k += 2) {
    ctx.beginPath();
    ctx.moveTo(-5, -3 + k);
    ctx.lineTo(5, -3 + k);
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  // mic cord trailing to the ground
  line(ctx, [36, -70 + bob, 42, -50, 34, -30, 40, -10, 30, -2], 1.4, '#16181e');
  if (p.phase2) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(SIGNAL, 0.45);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(sx, sy, 18 + pulse * 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ao(ctx, 0, -2, 30, 5, 0.32);
}

const DRAW = { warden, hive, colossus, broadcaster };

/** Draw a boss in world units with its origin at the sim position, facing +x. */
export function drawBoss(ctx: C, kind: keyof typeof DRAW, pose: BossPose) {
  const spec = BOSS_SPEC[kind];
  const k = spec.h / 100;
  ctx.save();
  ctx.translate(0, spec.foot);
  ctx.scale(k, k);
  DRAW[kind](ctx, pose);
  ctx.restore();
}
