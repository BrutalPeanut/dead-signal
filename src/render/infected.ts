import { INK, SIGNAL, ao, ball, glow, hexA, limb, line, mat, paint, ragged, taper, veins, type C, type Mat } from './kit';

/**
 * The infected. Each is designed in a 100-unit-tall space (feet at y=0, facing +x) and scaled to its
 * on-screen size. Every type has its own silhouette so they read at a glance in a crowd:
 *   shambler: hunched, both arms reaching      runner: low sprint, hood up, arms pumping
 *   crawler:  spider-limbed, low and long       brute:  hulking hump, one giant spiked fist
 *   spitter:  thin lab coat, glowing throat sac bloater: swollen hazmat belly, gas mask
 */

export interface InfectedSpec {
  draw: (ctx: C, ph: number) => void;
  /** visual height in world units */
  h: number;
  /** visual width in world units */
  w: number;
  /** feet offset below the sim position (matches the renderer's shadow) */
  foot: number;
}

const skin = (base: string, dark: string, light: string) => mat(base, dark, light);

const SHAMBLER_SKIN = skin('#9cb187', '#4d6142', '#d0dfbd');
const RUNNER_SKIN = skin('#d2c1b8', '#7a625b', '#f2e7e0');
const CRAWLER_SKIN = skin('#a296b8', '#463c5c', '#d3c9e4');
const BRUTE_SKIN = skin('#86a272', '#3a4e2f', '#b4cc9e');
const SPITTER_SKIN = skin('#b0c08e', '#5a6942', '#d8e4bc');
const BLOATER_SKIN = skin('#b4c27a', '#5a6a2a', '#e0eaa6');

/** Zombie head: sphere skull, sunken cheek, brow, hair, glowing eyes, open jaw with teeth. */
function zhead(
  ctx: C,
  x: number,
  y: number,
  r: number,
  sk: Mat,
  o: { jaw?: number; hair?: string | null; seed?: number; eyes?: 1 | 2; eyeColor?: string; tilt?: number } = {},
) {
  const jaw = o.jaw ?? 0.6;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(o.tilt ?? 0);
  // lower jaw hanging open (behind the skull)
  if (jaw > 0) {
    paint(
      ctx,
      (c) => {
        c.moveTo(r * 0.05, r * 0.35);
        c.quadraticCurveTo(r * 0.55, r * (0.75 + jaw * 0.5), r * 1.0, r * (0.45 + jaw * 0.55));
        c.lineTo(r * 0.85, r * 0.3);
        c.closePath();
      },
      sk,
      0,
      r * 0.3,
      r,
      r * 0.8,
    );
  }
  ball(ctx, 0, 0, r, r * 0.95, sk);
  // sunken cheek + eye socket shading
  ctx.fillStyle = hexA('#1a0f1e', 0.28);
  ctx.beginPath();
  ctx.ellipse(r * 0.42, r * 0.22, r * 0.32, r * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexA('#1a0f1e', 0.45);
  ctx.beginPath();
  ctx.ellipse(r * 0.5, -r * 0.12, r * 0.26, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // mouth cavity + teeth
  if (jaw > 0) {
    ctx.fillStyle = '#2a0a16';
    ctx.beginPath();
    ctx.ellipse(r * 0.68, r * (0.5 + jaw * 0.12), r * 0.28, r * (0.12 + jaw * 0.14), 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efe6cf';
    for (let i = 0; i < 3; i++) ctx.fillRect(r * (0.5 + i * 0.13), r * 0.38, r * 0.08, r * 0.12);
  }
  // brow ridge
  line(ctx, [r * 0.22, -r * 0.3, r * 0.55, -r * 0.34, r * 0.82, -r * 0.22], 2.2, INK, 0.8);
  // hair tufts
  if (o.hair) {
    ctx.fillStyle = o.hair;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
      const a = -2.6 + i * 0.38 + Math.sin((o.seed ?? 1) * 3 + i) * 0.1;
      const hx = Math.cos(a) * r * 0.9;
      const hy = Math.sin(a) * r * 0.9;
      ctx.beginPath();
      ctx.moveTo(hx - 3, hy + 2);
      ctx.lineTo(hx + Math.cos(a) * r * 0.45, hy + Math.sin(a) * r * 0.45);
      ctx.lineTo(hx + 3, hy + 1);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
  // signal veins across the temple
  veins(ctx, -r * 0.2, r * 0.05, r * 0.9, 2.6, o.seed ?? 1);
  // eyes
  const ec = o.eyeColor ?? SIGNAL;
  glow(ctx, r * 0.55, -r * 0.1, r * 0.17, ec);
  if ((o.eyes ?? 2) === 2) glow(ctx, r * 0.12, -r * 0.15, r * 0.12, ec);
  ctx.restore();
}

/** Clawed hand at the end of an arm. */
function claw(ctx: C, x: number, y: number, a: number, size: number, sk: Mat) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  for (let i = -1; i <= 1; i++) {
    paint(ctx, taper(0, i * size * 0.35, size * 0.32, size * 1.25, i * size * 0.55, size * 0.12), sk, -size, -size, size * 2.5, size * 2);
  }
  ball(ctx, 0, 0, size * 0.7, size * 0.62, sk);
  ctx.restore();
}

function shoe(ctx: C, x: number, y: number, color: string) {
  paint(ctx, (c) => c.roundRect(x - 5, y - 5, 14, 7, [3, 5, 2, 2]), mat(color, '#0c0d10', '#5a5e68', null), x - 5, y - 5, 14, 7);
}

function rib(ctx: C, x: number, y: number, rx: number, ry: number, sk: Mat) {
  ball(ctx, x, y, rx, ry, mat(sk.dark, '#2a1420', sk.base, null, 2));
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = '#efe0d0';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(x + rx * 0.2, y - ry * 0.5 + i * ry * 0.5, rx * 0.9, ry * 0.25, 0.25, Math.PI * 0.95, Math.PI * 1.9);
    ctx.stroke();
  }
  ctx.restore();
}

// ------------------------------------------------------------------ shambler

const SH_SHIRT = mat('#3f7486', '#1d3a46', '#6fa6b8');
const SH_PANTS = mat('#3c3756', '#1b1828', '#5e5880');
const SH_PANTS_B = mat('#2f2b45', '#14121e', '#4a4566');

export function shambler(ctx: C, ph: number) {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const bob = -Math.abs(s) * 2.2;
  const sk = SHAMBLER_SKIN;
  // back leg: stiff drag with a bare foot
  limb(ctx, -3, -30 + bob, -5 - s * 4, -15, -7 - s * 7, -3, [6.8, 5.8, 4.8], SH_PANTS_B);
  ball(ctx, -5 - s * 7, -2, 5.5, 3.2, sk);
  // back arm reaching
  limb(ctx, 0, -56 + bob, 14, -52 + c * 2, 28, -49 + c * 3, [5.4, 4.6, 4], mat(sk.dark, '#2a3624', sk.base));
  claw(ctx, 29, -49 + c * 3, 0.15, 5.4, mat(sk.dark, '#2a3624', sk.base));
  // torso, hunched forward around the hips
  ctx.save();
  ctx.translate(0, -30 + bob);
  ctx.rotate(0.24 + s * 0.03);
  const torso = (cc: C) => {
    cc.moveTo(-14, 1);
    cc.quadraticCurveTo(-17, -16, -13, -31);
    cc.quadraticCurveTo(0, -38, 14, -32);
    cc.quadraticCurveTo(17, -15, 13, 1);
    const rg = ragged(13, -14, 1, 6, 3);
    for (let i = 0; i < rg.length; i += 2) cc.lineTo(rg[i], rg[i + 1]);
    cc.closePath();
  };
  paint(ctx, torso, SH_SHIRT, -15, -36, 30, 40);
  rib(ctx, -4, -12, 6, 7, sk);
  // blood/goo stains
  ctx.fillStyle = hexA('#5a1630', 0.55);
  ctx.beginPath();
  ctx.ellipse(8, -24, 4, 6, 0.5, 0, Math.PI * 2);
  ctx.fill();
  line(ctx, [-12, -6, -3, -2, 4, -8], 1.2, INK, 0.5);
  ctx.restore();
  // front leg with torn knee
  limb(ctx, 4, -30 + bob, 6 + s * 5, -16, 7 + s * 8, -3, [7, 6, 5], SH_PANTS);
  ball(ctx, 6 + s * 5 + 1, -16, 3.5, 3, sk);
  shoe(ctx, 7 + s * 8, -2, '#3a3028');
  // head pushed forward
  zhead(ctx, 17, -73 + bob, 18, sk, { jaw: 0.7 + c * 0.15, hair: '#2a2230', seed: 1, tilt: 0.12 });
  // front arm reaching forward, below the face
  limb(ctx, 7, -55 + bob, 22, -49 - c * 2, 37, -45 - c * 3, [6, 5.2, 4.4], sk);
  claw(ctx, 38, -45 - c * 3, 0.1, 6, sk);
  ao(ctx, 0, -1, 16, 3, 0.25);
}

// ------------------------------------------------------------------ runner

const RU_HOOD = mat('#c4384f', '#5e1424', '#ef6a7e');
const RU_HOOD_B = mat('#962638', '#460c18', '#c44a5e');
const RU_PANTS = mat('#2c2c3a', '#121218', '#4a4a5e');

export function runner(ctx: C, ph: number) {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const bob = -Math.abs(c) * 3;
  const sk = RUNNER_SKIN;
  const stride = (side: number) => {
    const sw = s * side;
    const lift = Math.max(0, sw) * 8;
    return { kx: sw * 11 + 4, ky: -16 - lift, fx: sw * 15 - Math.max(0, -sw) * 4, fy: -3 - Math.max(0, sw) * 6 };
  };
  const b = stride(-1);
  limb(ctx, -2, -33 + bob, b.kx, b.ky, b.fx, b.fy, [6, 5, 4.2], mat('#22222c', '#0c0c10', '#3a3a48'));
  shoe(ctx, b.fx, b.fy + 1, '#d8d8d8');
  // back arm pumping
  limb(ctx, -2, -60 + bob, -10 - c * 8, -50, -4 - c * 12, -40, [4.6, 4, 3.4], RU_HOOD_B);
  claw(ctx, -4 - c * 12, -40, 0.6, 4, sk);
  // torso: low sprint lean
  ctx.save();
  ctx.translate(0, -33 + bob);
  ctx.rotate(0.38);
  paint(
    ctx,
    (cc) => {
      cc.moveTo(-12, 2);
      cc.quadraticCurveTo(-15, -14, -11, -29);
      cc.quadraticCurveTo(0, -35, 12, -29);
      cc.quadraticCurveTo(15, -14, 11, 2);
      cc.quadraticCurveTo(0, 6, -12, 2);
      cc.closePath();
    },
    RU_HOOD,
    -14,
    -34,
    28,
    40,
  );
  // hoodie pocket + drawstrings
  line(ctx, [-8, -6, 7, -6], 1.6, INK, 0.6);
  line(ctx, [2, -28, 3, -18], 1.4, '#efe0e0');
  line(ctx, [6, -28, 7, -19], 1.4, '#efe0e0');
  ctx.fillStyle = hexA('#3a0a14', 0.5);
  ctx.beginPath();
  ctx.ellipse(-4, -18, 3, 5, 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const f = stride(1);
  limb(ctx, 3, -33 + bob, f.kx, f.ky, f.fx, f.fy, [6.4, 5.2, 4.4], RU_PANTS);
  shoe(ctx, f.fx, f.fy + 1, '#eeeeee');
  // head with the hood pulled back behind it, screaming
  const hx = 20;
  const hy = -67 + bob;
  ball(ctx, hx - 5, hy - 1, 18, 17, RU_HOOD_B);
  zhead(ctx, hx, hy, 15, sk, { jaw: 1, hair: '#3a2a26', seed: 2, tilt: 0.15 });
  ctx.save();
  ctx.strokeStyle = RU_HOOD.base;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(hx - 5, hy - 1, 17, Math.PI * 0.95, Math.PI * 1.45);
  ctx.stroke();
  ctx.restore();
  // front arm pumping forward
  limb(ctx, 6, -58 + bob, 16 + c * 8, -50, 26 + c * 10, -54, [4.8, 4.2, 3.6], RU_HOOD);
  claw(ctx, 26 + c * 10, -54, -0.4, 4.4, sk);
  ao(ctx, 0, -1, 16, 3, 0.25);
}

// ------------------------------------------------------------------ crawler

export function crawler(ctx: C, ph: number) {
  const s = Math.sin(ph * 1.3);
  const c = Math.cos(ph * 1.3);
  const sk = CRAWLER_SKIN;
  const skB = mat(sk.dark, '#221a32', sk.base);
  const leg = (hx: number, hy: number, kx: number, ky: number, fx: number, m: Mat) => {
    limb(ctx, hx, hy, kx, ky, fx, -2, [7.4, 6, 4.2], m);
  };
  // far legs
  leg(-24, -42, -44 + c * 4, -28, -34 + c * 8, skB);
  leg(14, -46, 30 - s * 4, -30, 40 - s * 8, skB);
  // body: emaciated ribcage held low
  ctx.save();
  ctx.translate(-6, -44 + Math.abs(s) * -2);
  ctx.rotate(-0.06);
  paint(
    ctx,
    (cc) => {
      cc.ellipse(0, 0, 36, 19, 0, 0, Math.PI * 2);
    },
    sk,
    -36,
    -19,
    72,
    38,
  );
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, 36, 19, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = hexA('#2a1a3a', 0.65);
  ctx.lineWidth = 2.4;
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.ellipse(-20 + i * 8, 6, 3.5, 12, 0.15, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();
  }
  ctx.restore();
  // glowing spine ridge
  for (let i = 0; i < 6; i++) {
    const x = -24 + i * 9;
    paint(ctx, taper(x, -12, 3.2, x - 2, -24 - (i % 2) * 4, 0.8), mat('#5a3a78', '#2a1638', '#9a6ac0', null, 2), x - 4, -28, 8, 18);
    glow(ctx, x - 1.5, -21 - (i % 2) * 4, 1.6, SIGNAL);
  }
  ctx.restore();
  // big low head with a huge jaw and four eyes
  const hx = 36;
  const hy = -38 + Math.abs(s) * -2;
  paint(
    ctx,
    (cc) => {
      cc.moveTo(hx - 6, hy + 6);
      cc.quadraticCurveTo(hx + 10, hy + 22 + c * 2, hx + 22, hy + 10);
      cc.lineTo(hx + 16, hy + 4);
      cc.closePath();
    },
    sk,
    hx - 6,
    hy,
    28,
    22,
  );
  ball(ctx, hx, hy, 20, 16, sk, 0.15);
  ctx.fillStyle = '#2a0a16';
  ctx.beginPath();
  ctx.ellipse(hx + 11, hy + 9, 9, 5 + c, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#efe6cf';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.moveTo(hx + 4 + i * 3.5, hy + 5);
    ctx.lineTo(hx + 5.5 + i * 3.5, hy + 10);
    ctx.lineTo(hx + 7 + i * 3.5, hy + 5);
    ctx.fill();
  }
  glow(ctx, hx + 9, hy - 5, 2.6);
  glow(ctx, hx + 2, hy - 7, 2.2);
  glow(ctx, hx + 12, hy - 1, 1.6);
  glow(ctx, hx - 4, hy - 4, 1.6);
  // near legs
  leg(-20, -40, -40 - c * 4, -26, -28 - c * 8, sk);
  leg(18, -42, 34 + s * 4, -28, 46 + s * 9, sk);
  ao(ctx, -4, -1, 34, 4, 0.25);
}

// ------------------------------------------------------------------ brute

const BR_TOP = mat('#5d6470', '#262a32', '#8a929f');
const BR_SHORTS = mat('#2f4058', '#141c28', '#4d6488');

export function brute(ctx: C, ph: number) {
  const s = Math.sin(ph * 0.8);
  const c = Math.cos(ph * 0.8);
  const bob = -Math.abs(s) * 2.5;
  const sk = BRUTE_SKIN;
  const skB = mat(sk.dark, '#1e2a18', sk.base);
  // back leg
  limb(ctx, -10, -26 + bob, -12 - s * 4, -13, -12 - s * 6, -3, [9, 8, 7], mat('#26364c', '#0f1620', '#3e5274'));
  ball(ctx, -11 - s * 6, -2, 9, 4.6, skB);
  // back arm hanging
  limb(ctx, -16, -72 + bob, -26, -52, -24 + c * 3, -32, [9, 8, 7], skB);
  ball(ctx, -24 + c * 3, -30, 8, 7, skB);
  // hulking torso: hump and gut
  const torso = (cc: C) => {
    cc.moveTo(-26, -24);
    cc.quadraticCurveTo(-36, -60, -22, -86);
    cc.quadraticCurveTo(-4, -100, 16, -86);
    cc.quadraticCurveTo(30, -66, 26, -40);
    cc.quadraticCurveTo(22, -20, 0, -20);
    cc.closePath();
  };
  ctx.save();
  ctx.translate(0, bob);
  paint(ctx, torso, sk, -34, -98, 64, 80);
  // straining tank top
  ctx.save();
  ctx.beginPath();
  torso(ctx);
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(-30, -62);
  ctx.lineTo(-14, -66);
  ctx.lineTo(-8, -54);
  ctx.lineTo(6, -56);
  ctx.lineTo(12, -70);
  ctx.lineTo(30, -66);
  ctx.lineTo(30, -18);
  ctx.lineTo(-30, -18);
  ctx.closePath();
  const tg = ctx.createLinearGradient(-30, -70, 30, -20);
  tg.addColorStop(0, BR_TOP.light);
  tg.addColorStop(0.45, BR_TOP.base);
  tg.addColorStop(1, BR_TOP.dark);
  ctx.fillStyle = tg;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  // rips in the top
  ctx.fillStyle = sk.base;
  ctx.beginPath();
  ctx.ellipse(-8, -36, 5, 3, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // stitched scar across the chest
  line(ctx, [-24, -78, -2, -66], 1.8, '#3a1a24');
  for (let i = 0; i < 5; i++) line(ctx, [-21 + i * 4.5, -79 + i * 2.6, -19 + i * 4.5, -74 + i * 2.6], 1.4, '#3a1a24');
  // signal tumours on the hump
  ball(ctx, -27, -66, 6, 5, mat('#8a2e7a', '#3a0a32', '#d06ac0', null, 2));
  ball(ctx, -24, -78, 4.6, 4, mat('#8a2e7a', '#3a0a32', '#d06ac0', null, 2));
  ball(ctx, -30, -54, 3.6, 3.2, mat('#8a2e7a', '#3a0a32', '#d06ac0', null, 2));
  glow(ctx, -27, -66, 1.8, SIGNAL);
  glow(ctx, -24, -78, 1.4, SIGNAL);
  // shorts
  paint(ctx, (cc) => cc.roundRect(-22, -30, 42, 12, 4), BR_SHORTS, -22, -30, 42, 12);
  ctx.restore();
  // front leg
  limb(ctx, 10, -26 + bob, 11 + s * 4, -13, 12 + s * 6, -3, [9, 8, 7], mat('#2f4058', '#141c28', '#4d6488'));
  ball(ctx, 13 + s * 6, -2, 9, 4.6, sk);
  // giant front arm and spiked fist dragging near the ground
  limb(ctx, 12, -66 + bob, 34, -48 + c * 2, 34 + c * 3, -24, [11, 9.5, 8.5], sk);
  ball(ctx, 35 + c * 3, -17, 13, 12, sk);
  for (let i = 0; i < 3; i++) {
    const a = -0.9 + i * 0.5;
    paint(ctx, taper(35 + c * 3 + Math.cos(a) * 10, -17 + Math.sin(a) * 10, 2.8, 35 + c * 3 + Math.cos(a) * 19, -17 + Math.sin(a) * 19, 0.6), mat('#efe4cc', '#a89a78', '#ffffff', null, 2), 20, -40, 40, 40);
  }
  // head thrust forward from the hump, heavy brow
  const bhx = 20;
  const bhy = -80 + bob;
  zhead(ctx, bhx, bhy, 15, sk, { jaw: 0.5, hair: null, seed: 3 });
  paint(
    ctx,
    (cc) => {
      cc.moveTo(bhx - 6, bhy - 9);
      cc.quadraticCurveTo(bhx + 4, bhy - 17, bhx + 16, bhy - 7);
      cc.lineTo(bhx + 14, bhy - 3);
      cc.quadraticCurveTo(bhx + 4, bhy - 10, bhx - 5, bhy - 5);
      cc.closePath();
    },
    skB,
    bhx - 6,
    bhy - 17,
    22,
    14,
  );
  ao(ctx, 0, -1, 30, 4, 0.3);
}

// ------------------------------------------------------------------ spitter

const SP_COAT = mat('#e2e6ea', '#8d959e', '#ffffff');
const SP_PANTS = mat('#3b4250', '#181c24', '#5c6476');

export function spitter(ctx: C, ph: number) {
  const s = Math.sin(ph);
  const c = Math.cos(ph);
  const pulse = (Math.sin(ph * 2) + 1) / 2;
  const bob = -Math.abs(s) * 2;
  const sk = SPITTER_SKIN;
  limb(ctx, -3, -30 + bob, -4 - s * 4, -15, -5 - s * 6, -3, [5.2, 4.4, 3.8], SP_PANTS);
  shoe(ctx, -5 - s * 6, -2, '#2a2420');
  // back arm, thin
  limb(ctx, -4, -56 + bob, -10, -44, -6 + c * 3, -34, [3.8, 3.2, 2.8], mat(sk.dark, '#2a3420', sk.base));
  // lab coat (long, hunched)
  ctx.save();
  ctx.translate(0, -30 + bob);
  ctx.rotate(0.14);
  const coat = (cc: C) => {
    cc.moveTo(-13, 10);
    cc.quadraticCurveTo(-15, -12, -11, -30);
    cc.quadraticCurveTo(0, -36, 11, -30);
    cc.quadraticCurveTo(15, -10, 14, 12);
    const rg = ragged(14, -13, 12, 5, 7);
    for (let i = 0; i < rg.length; i += 2) cc.lineTo(rg[i], rg[i + 1]);
    cc.closePath();
  };
  paint(ctx, coat, SP_COAT, -15, -35, 30, 48);
  // lapels + stains
  line(ctx, [2, -30, 0, -14, 3, 10], 1.6, INK, 0.5);
  ctx.fillStyle = hexA('#7aa82a', 0.55);
  ctx.beginPath();
  ctx.ellipse(-5, -6, 5, 9, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = hexA('#7a1a2a', 0.45);
  ctx.beginPath();
  ctx.ellipse(6, -20, 3, 5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // pocket with pen
  line(ctx, [-9, -22, -3, -22], 1.4, INK, 0.5);
  line(ctx, [-7, -26, -7, -22], 1.6, '#3a6ad8');
  ctx.restore();
  limb(ctx, 3, -30 + bob, 4 + s * 4, -15, 5 + s * 6, -3, [5.4, 4.6, 4], SP_PANTS);
  shoe(ctx, 5 + s * 6, -2, '#2a2420');
  // swollen, glowing throat sac
  const sr = 12 + pulse * 2.5;
  ctx.save();
  ctx.shadowColor = '#9dff4a';
  ctx.shadowBlur = 10 + pulse * 8;
  ball(ctx, 14, -60 + bob, sr, sr * 0.9, mat('#bdf56e', '#4e8a12', '#f2ffcc'));
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(14, -60 + bob, sr, sr * 0.9, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = hexA('#3a6a0a', 0.7);
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(4, -66 + bob + i * 4);
    ctx.quadraticCurveTo(14, -70 + bob + i * 5, 26, -60 + bob + i * 3);
    ctx.stroke();
  }
  ctx.restore();
  // head perched above the sac
  zhead(ctx, 9, -80 + bob, 14, sk, { jaw: 0.2, hair: '#3a3a2a', seed: 4, eyeColor: '#c6ff4a' });
  // dripping acid
  const drip = ((ph / (Math.PI * 2)) % 1) * 10;
  ctx.fillStyle = '#9dff4a';
  ctx.beginPath();
  ctx.ellipse(20, -70 + bob + drip, 1.6, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // front arm, clawed
  limb(ctx, 4, -56 + bob, 12, -44, 20 + c * 2, -38, [4, 3.4, 3], sk);
  claw(ctx, 21 + c * 2, -38, 0.4, 4, sk);
  ao(ctx, 0, -1, 14, 3, 0.25);
}

// ------------------------------------------------------------------ bloater

const BL_SUIT = mat('#e6c63a', '#8a6e10', '#fff09a');

export function bloater(ctx: C, ph: number) {
  const s = Math.sin(ph * 0.9);
  const wob = Math.sin(ph * 1.8);
  const sk = BLOATER_SKIN;
  // stubby legs
  limb(ctx, -10, -22, -11 - s * 3, -12, -12 - s * 4, -3, [7, 6.4, 6], mat('#a88a1c', '#4a3a08', '#d8b84a'));
  limb(ctx, 10, -22, 11 + s * 3, -12, 12 + s * 4, -3, [7, 6.4, 6], BL_SUIT);
  shoe(ctx, -12 - s * 4, -2, '#2a2a2a');
  shoe(ctx, 12 + s * 4, -2, '#2a2a2a');
  // swollen belly in a torn hazmat suit
  const rx = 31 + wob * 1.2;
  const ry = 30 - wob * 1.2;
  ball(ctx, 0, -46, rx, ry, BL_SUIT);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, -46, rx, ry, 0, 0, Math.PI * 2);
  ctx.clip();
  // hazard stripes on the suit
  ctx.strokeStyle = hexA('#1a1a1a', 0.7);
  ctx.lineWidth = 3;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(-40 + i * 12, -10);
    ctx.lineTo(-28 + i * 12, -22);
    ctx.stroke();
  }
  // rupture showing glowing flesh
  ctx.beginPath();
  const rg = ragged(-4, 26, -56, 6, 11, 6);
  ctx.moveTo(-4, -56);
  for (let i = 0; i < rg.length; i += 2) ctx.lineTo(rg[i], rg[i + 1] - 8);
  ctx.lineTo(28, -30);
  ctx.quadraticCurveTo(12, -22, -2, -32);
  ctx.closePath();
  const fg = ctx.createRadialGradient(12, -44, 2, 12, -44, 22);
  fg.addColorStop(0, sk.light);
  fg.addColorStop(0.6, sk.base);
  fg.addColorStop(1, sk.dark);
  ctx.fillStyle = fg;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = INK;
  ctx.stroke();
  ctx.restore();
  for (const [px, py, pr] of [
    [10, -46, 4.4],
    [18, -38, 3.2],
    [4, -38, 2.6],
    [20, -52, 2.4],
  ] as const) {
    ball(ctx, px, py, pr, pr, mat('#d8ff7a', '#5a8a12', '#ffffff', null, 1.6));
    glow(ctx, px, py, pr * 0.5, '#9dff4a');
  }
  // tiny arms
  limb(ctx, 22, -60, 30, -52, 32, -44, [4.4, 3.8, 3.4], BL_SUIT);
  ball(ctx, 32, -43, 4, 4, mat('#3a3a3a', '#111', '#5a5a5a', null, 2));
  // gas-mask head on top
  ball(ctx, 6, -80, 13, 12, sk);
  paint(ctx, (cc) => cc.roundRect(8, -84, 13, 14, 5), mat('#3e4048', '#16171c', '#6a6e78', null, 2.4), 8, -84, 13, 14);
  ball(ctx, 23, -76, 4.6, 4.6, mat('#5a5e68', '#22242a', '#8a8e98', null, 2));
  // cracked lens
  ball(ctx, 15, -83, 4.6, 4.6, mat('#3a3a3a', '#111', '#5a5a5a', null, 2));
  glow(ctx, 15, -83, 2.6);
  line(ctx, [12, -86, 15, -83, 13, -80], 1, '#ffd6f6');
  // hood seam
  line(ctx, [-6, -88, 0, -92, 8, -92], 2, INK, 0.6);
  ao(ctx, 0, -1, 28, 4, 0.3);
}

export const INFECTED: Record<string, InfectedSpec> = {
  shambler: { draw: shambler, h: 44, w: 54, foot: 11.5 },
  runner: { draw: runner, h: 42, w: 52, foot: 9.5 },
  crawler: { draw: crawler, h: 26, w: 46, foot: 7.4 },
  brute: { draw: brute, h: 68, w: 78, foot: 20 },
  spitter: { draw: spitter, h: 44, w: 46, foot: 11.5 },
  bloater: { draw: bloater, h: 50, w: 56, foot: 15.8 },
};

/** Draw an infected in world units, origin at its sim position. */
export function drawInfected(ctx: C, kind: string, ph: number) {
  const spec = INFECTED[kind];
  const k = spec.h / 100;
  ctx.save();
  ctx.translate(0, spec.foot);
  ctx.scale(k, k);
  spec.draw(ctx, ph);
  ctx.restore();
}
