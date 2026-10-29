import * as THREE from 'three';
import { Part, SIGNAL, detailed } from './kit3d';

/**
 * Option D crowd: the six infected rebuilt for the top-down camera (not traced from side-view
 * sprites). Chunky, big-headed proportions to sit beside the authored hero and bosses, two-bone
 * arms and legs, smooth lit shading, and per-instance colour variants.
 *
 * Each body part hangs off a joint; every joint is an InstancedMesh, so a whole horde of one kind
 * costs one draw call per joint. Colours marked '$skin' / '$skinD' / '$shirt' / '$pants' are
 * filled per instance by the shader, so variants need no extra geometry.
 * Facing +X, feet at y = 0, sim units.
 */

type V3 = [number, number, number];

export interface Joint {
  parent: number;
  at: V3;
  part?: Part;
}

export interface CrowdRig {
  joints: Joint[];
  /** Glowing points (eyes, sacs) as joint-local positions. */
  glows: { j: number; at: V3; size: number; color: string }[];
  /** Write [rx, ry, rz, dy] per joint. hit: 0..1 stagger weight. */
  pose(ph: number, t: number, hit: number, out: Float32Array): void;
  height: number;
  /** Whether skin/shirt/pants palette variants apply (hazmat suits and lab coats stay as-is). */
  variants: boolean;
}

// ------------------------------------------------------------------ shared parts

/**
 * Zombie head relative to its joint. Built to read from above (the camera mostly sees the scalp):
 * rotting skin, bald patches with stringy hair, a torn scalp showing skull, blood around a slack jaw,
 * sunken sockets with the signal glowing in them.
 */
const BLOOD = '#4a0810';
const BLOOD2 = '#6e0e16';
const BONE = '#d6ccb4';
function head(r: number, opts: { hood?: string; hair?: boolean } = {}) {
  const h = new Part();
  h.ball(r, r * 0.95, r * 0.92, '$skin', [0, 0, 0]);
  // mottled rot: darker blotches breaking up the skull
  h.ball(r * 0.45, r * 0.3, r * 0.42, '$skinD', [-r * 0.35, r * 0.62, r * 0.3], [0.3, 0, 0.4]);
  h.ball(r * 0.38, r * 0.26, r * 0.36, '$skinD', [r * 0.15, r * 0.7, -r * 0.42], [-0.4, 0, -0.2]);
  h.ball(r * 0.3, r * 0.22, r * 0.3, '#3e3a30', [-r * 0.6, r * 0.2, -r * 0.55], [0, 0.5, 0]);
  // torn scalp: a wound with skull showing through
  h.ball(r * 0.34, r * 0.18, r * 0.3, BLOOD, [r * 0.05, r * 0.86, r * 0.18], [0.2, 0, 0.1]);
  h.ball(r * 0.22, r * 0.12, r * 0.2, BONE, [r * 0.07, r * 0.92, r * 0.18], [0.2, 0, 0.1]);
  // slack, skewed jaw with blood down the chin
  h.ball(r * 0.55, r * 0.38, r * 0.72, '$skinD', [r * 0.42, -r * 0.66, r * 0.06], [0.15, 0, -0.55]);
  h.box(r * 0.28, r * 0.28, r * 0.85, '#1a0508', [r * 0.78, -r * 0.42, 0]);
  for (let i = -2; i <= 2; i++) if (i !== 1) h.box(r * 0.11, r * 0.15, r * 0.1, '#d9cfae', [r * 0.88, -r * 0.3 + (i % 2) * r * 0.04, i * r * 0.17]);
  h.box(r * 0.2, r * 0.5, r * 0.5, BLOOD2, [r * 0.82, -r * 0.82, r * 0.1], [0, 0, -0.3]);
  // sunken sockets, one lower than the other; brow ridge
  h.ball(r * 0.32, r * 0.24, r * 0.3, '#1a0a10', [r * 0.66, r * 0.12, r * 0.36]);
  h.ball(r * 0.3, r * 0.26, r * 0.28, '#1a0a10', [r * 0.66, r * 0.04, -r * 0.37]);
  h.ball(r * 0.12, r * 0.12, r * 0.12, SIGNAL, [r * 0.84, r * 0.12, r * 0.36]);
  h.ball(r * 0.1, r * 0.1, r * 0.1, SIGNAL, [r * 0.84, r * 0.04, -r * 0.37]);
  h.box(r * 0.36, r * 0.15, r * 1.35, '$skinD', [r * 0.7, r * 0.36, 0], [0.08, 0, -0.32]);
  if (opts.hood) h.ball(r * 1.12, r * 1.08, r * 1.08, opts.hood, [-r * 0.22, r * 0.08, 0]);
  else if (opts.hair !== false) {
    // what's left of the hair: thin, matted clumps clinging to one side of the scalp
    for (let i = 0; i < 6; i++) {
      const a = -0.9 + i * 0.32;
      h.box(r * 0.08, r * 0.55, r * 0.07, '#22201c', [-r * 0.55 + Math.sin(i * 2.1) * r * 0.15, r * 0.55, Math.sin(a) * r * 0.75], [a * 0.4, 0, 1.0 + (i % 3) * 0.2]);
    }
    h.ball(r * 0.55, r * 0.22, r * 0.5, '#2a2620', [-r * 0.5, r * 0.62, -r * 0.2], [0, 0, 0.5]);
  }
  return h;
}
const eyes = (j: number, r: number, size = 1) => [
  { j, at: [r * 0.9, r * 0.12, r * 0.36] as V3, size: r * 0.55 * size, color: SIGNAL },
  { j, at: [r * 0.9, r * 0.12, -r * 0.36] as V3, size: r * 0.55 * size, color: SIGNAL },
];

function claw(p: Part, at: V3, r: number) {
  p.ball(r, r * 0.8, r * 0.9, '$skin', at);
  for (let i = -1; i <= 1; i++) p.cone(r * 0.28, r * 1.2, '#e8dcc6', [at[0] + r * 0.4, at[1] - r * 0.9, at[2] + i * r * 0.45], [0, 0, 0.3 + Math.PI]);
  return p;
}
const seg = (len: number, r: number, col: string) => new Part().limb([0, 0, 0], [0, -len, 0], r, col);
const shoe = (p: Part, len: number, col = '#2a2622', w = 4.8) => p.box(8, 3.2, w, col, [2, -len - 1, 0]);

/** Biped skeleton indices: 0 root, 1 hips, 2 torso, 3 head, 4/5 left arm, 6/7 right arm, 8/9 left leg, 10/11 right leg. */
function biped(o: {
  hipY: number; pelvis: Part; torso: Part; headAt: V3; head: Part;
  shoulder: V3; upper: Part; fore: Part; upperLen: number;
  shoulderR?: V3; upperR?: Part; foreR?: Part; upperLenR?: number;
  hipZ: number; thigh: Part; shin: Part; thighLen: number;
}): Joint[] {
  const sR = o.shoulderR ?? [o.shoulder[0], o.shoulder[1], -o.shoulder[2]];
  return [
    { parent: -1, at: [0, 0, 0] },
    { parent: 0, at: [0, o.hipY, 0], part: o.pelvis },
    { parent: 1, at: [0, 2, 0], part: o.torso },
    { parent: 2, at: o.headAt, part: o.head },
    { parent: 2, at: o.shoulder, part: o.upper },
    { parent: 4, at: [0, -o.upperLen, 0], part: o.fore },
    { parent: 2, at: sR, part: o.upperR ?? o.upper },
    { parent: 6, at: [0, -(o.upperLenR ?? o.upperLen), 0], part: o.foreR ?? o.fore },
    { parent: 1, at: [0, -1, -o.hipZ], part: o.thigh },
    { parent: 8, at: [0, -o.thighLen, 0], part: o.shin },
    { parent: 1, at: [0, -1, o.hipZ], part: o.thigh },
    { parent: 10, at: [0, -o.thighLen, 0], part: o.shin },
  ];
}

const R = (o: Float32Array, j: number, rx: number, ry: number, rz: number, dy = 0) => {
  o[j * 4] = rx;
  o[j * 4 + 1] = ry;
  o[j * 4 + 2] = rz;
  o[j * 4 + 3] = dy;
};

/** Shared biped gait: legs swing, knees bend on the forward swing, hips bob. */
function legs(o: Float32Array, ph: number, stride: number, knee: number, bob: number) {
  const s = Math.sin(ph), c = Math.cos(ph);
  R(o, 1, s * 0.06, 0, 0, -Math.abs(s) * bob);
  R(o, 8, 0, 0, s * stride);
  R(o, 10, 0, 0, -s * stride);
  R(o, 9, 0, 0, -Math.max(0, c) * knee);
  R(o, 11, 0, 0, -Math.max(0, -c) * knee);
}

// ------------------------------------------------------------------ the six infected

function shambler(): CrowdRig {
  const tor = new Part()
    .ball(8.5, 11, 9.5, '$shirt', [0, 10, 0])
    .ball(6, 6, 8, '$skinD', [5, 6, 0])
    .box(1.2, 6, 1.2, BONE, [9.6, 7, 2.5], [0.3, 0, -0.2])
    .box(1.2, 6, 1.2, BONE, [9.6, 7, -1], [-0.2, 0, -0.2])
    .ball(4, 5, 3.5, BLOOD, [6, 13, -5], [0, 0, 0.3])
    .ball(3, 2.4, 3, BLOOD2, [-4, 16, 6])
    .ball(5, 3.4, 5, '$shirt', [-1, 19, -8.5])
    .ball(5, 3.4, 5, '$shirt', [-1, 19, 8.5]);
  return {
    joints: biped({
      hipY: 16, pelvis: new Part().ball(7, 5.5, 8, '$pants', [0, 0, 0]), torso: tor, headAt: [4.5, 25, 0], head: head(8.3),
      shoulder: [1, 18, -10], upper: seg(9, 3, '$shirt'), fore: claw(seg(9, 2.7, '$skin'), [0, -10, 0], 2.8), upperLen: 9,
      // (head radius 8.5: about a fifth of the body, so it reads as a zombie, not a bobblehead)
      hipZ: 4.5, thigh: seg(7.5, 3.4, '$pants'), shin: shoe(seg(7.5, 3, '$pants'), 7.5), thighLen: 7.5,
    }),
    glows: eyes(3, 8.3),
    height: 46,
    variants: true,
    pose(ph, t, hit, o) {
      o.fill(0);
      legs(o, ph, 0.45, 0.9, 1.4);
      R(o, 2, -Math.sin(ph) * 0.1, 0, -0.42 + hit * 0.55);
      R(o, 4, 0, 0, 1.25 + Math.sin(ph + 1) * 0.15 - hit * 0.8);
      R(o, 6, 0, 0, 1.35 + Math.sin(ph + 2.5) * 0.15 - hit * 0.8);
      R(o, 5, 0, 0, 0.25 + Math.sin(t * 2.3) * 0.12);
      R(o, 7, 0, 0, 0.35 + Math.sin(t * 1.9 + 1) * 0.12);
      R(o, 3, Math.sin(t * 1.3) * 0.15, 0, 0.25 + Math.sin(ph) * 0.06 - hit * 0.4);
    },
  };
}

function runner(): CrowdRig {
  return {
    joints: biped({
      hipY: 17, pelvis: new Part().ball(6.5, 5, 7.5, '$pants', [0, 0, 0]),
      torso: new Part().ball(8, 10, 9, '$shirt', [0, 9, 0]).box(4, 4, 9, '$skinD', [6.5, 5, 0]).ball(3.5, 4.5, 3, BLOOD, [6.5, 12, 3]).ball(5.5, 3.6, 5.5, '$shirt', [-1, 17, -8]).ball(5.5, 3.6, 5.5, '$shirt', [-1, 17, 8]),
      headAt: [4.5, 23, 0], head: head(7.9, { hood: '#c4384f' }),
      shoulder: [0, 16, -9.5], upper: seg(8, 3, '$shirt'), fore: claw(seg(8, 2.7, '$skin'), [0, -9, 0], 2.6), upperLen: 8,
      hipZ: 4, thigh: seg(8, 3.1, '$pants'), shin: shoe(seg(8, 2.8, '$pants'), 8, '#e8e8ec', 4.6), thighLen: 8,
    }),
    glows: eyes(3, 7.9),
    height: 44,
    variants: true,
    pose(ph, t, hit, o) {
      o.fill(0);
      const p = ph * 1.4;
      const s = Math.sin(p);
      legs(o, p, 0.85, 1.5, 2.4);
      R(o, 2, s * 0.06, 0, -0.65 + hit * 0.6);
      R(o, 4, 0, 0, -s * 1.0 + 0.2);
      R(o, 6, 0, 0, s * 1.0 + 0.2);
      R(o, 5, 0, 0, 1.5);
      R(o, 7, 0, 0, 1.5);
      R(o, 3, 0, 0, 0.5 + Math.sin(t * 9) * 0.04 - hit * 0.4);
    },
  };
}

function crawler(): CrowdRig {
  const body = new Part().ball(13, 5, 6.5, '$skin', [-2, 0, 0], [0, 0, 0.05]).ball(7, 4.6, 6, '$skinD', [-12, 0.5, 0]).ball(6, 3, 6.6, '$shirt', [2, 1, 0]);
  for (let i = 0; i < 4; i++) body.cone(1.4, 4, '#d8ccb2', [-10 + i * 5, 5, 0], [0, 0, 0.3]);
  const joints: Joint[] = [
    { parent: -1, at: [0, 0, 0] },
    { parent: 0, at: [0, 9, 0], part: body },
    { parent: 1, at: [12, 1, 0], part: head(5.5, { hair: false }) },
  ];
  // four spider limbs: up-and-out to the knee, then down to the floor
  for (const [x, side] of [[6, -1], [6, 1], [-6, -1], [-6, 1]] as const) {
    joints.push({ parent: 1, at: [x, 0, side * 5], part: new Part().limb([0, 0, 0], [3, 7, side * 7], 1.7, '$skin') });
    joints.push({ parent: joints.length - 1, at: [3, 7, side * 7], part: new Part().limb([0, 0, 0], [4, -15.5, side * 4], 1.4, '$skin').cone(1, 2.4, '#e8dcc6', [4.3, -16.5, side * 4.2], [Math.PI, 0, 0]) });
  }
  return {
    joints,
    glows: [...eyes(2, 5.5, 1.2), ...[0, 1, 2, 3].map((i) => ({ j: 1, at: [-9 + i * 5, 5.5, 0] as V3, size: 3, color: SIGNAL }))],
    height: 26,
    variants: true,
    pose(ph, t, hit, o) {
      o.fill(0);
      const s = Math.sin(ph * 1.4), c = Math.cos(ph * 1.4);
      R(o, 1, 0, 0, hit * 0.3, Math.abs(c) * 0.8);
      R(o, 2, 0, Math.sin(t * 3) * 0.2, 0);
      // alternating diagonal pairs sweep and lift
      const legsA = [3, 9], legsB = [5, 7];
      for (const j of legsA) R(o, j, s * 0.3, s * 0.3, Math.max(0, c) * 0.2);
      for (const j of legsB) R(o, j, -s * 0.3, -s * 0.3, Math.max(0, -c) * 0.2);
    },
  };
}

function brute(): CrowdRig {
  const tor = new Part().ball(15, 16, 15, '$shirt', [0, 14, 0]).ball(12, 10, 14, '$skin', [-6, 27, 0]).ball(6, 5, 7, '$skinD', [-8, 31, 5]).ball(5, 6, 5, BLOOD, [10, 18, -7]);
  for (let i = 0; i < 5; i++) tor.cone(1.8, 7, '#d8ccb2', [-8 + i * 2.5, 37 - Math.abs(i - 2) * 1.5, (i - 2) * 3.5], [(i - 2) * 0.25, 0, 0.2]);
  const fist = seg(12, 6, '$skin').ball(9, 8.5, 9, '$skinD', [1, -16, 0]);
  for (let i = 0; i < 6; i++) fist.cone(2, 7, '#e8dcc6', [1 + Math.cos(i) * 8, -16 + Math.sin(i * 1.7) * 7, Math.sin(i) * 8], [Math.sin(i) * 1.4, 0, Math.cos(i * 1.7) * 1.2 - Math.PI / 2]);
  return {
    joints: biped({
      hipY: 24, pelvis: new Part().ball(11, 8, 12, '$pants', [0, 0, 0]), torso: tor, headAt: [13, 24, 0], head: head(7.5),
      shoulder: [3, 20, -15], upper: seg(11, 4.5, '$skin'), fore: claw(seg(11, 4, '$skin'), [0, -12, 0], 4), upperLen: 11,
      shoulderR: [3, 22, 16], upperR: seg(12, 6.5, '$skin'), foreR: fist, upperLenR: 12,
      hipZ: 7, thigh: seg(11, 5.5, '$skin'), shin: shoe(seg(10, 5, '$skin'), 10, '#1d1d22', 9), thighLen: 11,
    }),
    glows: [...eyes(3, 7.5), { j: 2, at: [-6, 38, 0], size: 6, color: SIGNAL }],
    height: 70,
    variants: true,
    pose(ph, t, hit, o) {
      o.fill(0);
      legs(o, ph, 0.35, 0.7, 2);
      R(o, 2, Math.sin(ph) * 0.08, 0, -0.25 + hit * 0.3);
      R(o, 4, 0, 0, 0.5 - Math.sin(ph) * 0.25);
      R(o, 5, 0, 0, 0.5);
      // the big fist drags and swings
      R(o, 6, 0, 0, 0.3 + Math.sin(ph) * 0.35 - hit * 0.5);
      R(o, 7, 0, 0, 0.4 + Math.sin(t * 1.5) * 0.1);
      R(o, 3, 0, 0, 0.2 + Math.sin(t * 2) * 0.08);
    },
  };
}

function spitter(): CrowdRig {
  const COAT = '#e2e6ea';
  return {
    joints: biped({
      hipY: 15, pelvis: new Part().ball(5, 4, 6, '$pants', [0, 0, 0]),
      torso: new Part().cyl(5.5, 7.5, 18, COAT, [0, 8, 0], [0, 0, -0.1]).box(1, 10, 1.2, '#9aa3ad', [6, 9, 0], [0, 0, -0.1]).ball(4.5, 4.5, 5, '#9dff4a', [5.5, 17, 0]),
      headAt: [3, 21.5, 0], head: head(6),
      shoulder: [1, 16, -6.5], upper: seg(8, 1.9, COAT), fore: seg(8, 1.6, '$skin').ball(1.8, 1.6, 1.8, '$skin', [0, -8.5, 0]), upperLen: 8,
      hipZ: 3.2, thigh: seg(7, 2.4, '$pants'), shin: shoe(seg(7, 2.2, '$pants'), 7), thighLen: 7,
    }),
    glows: [...eyes(3, 6), { j: 2, at: [7, 17, 0], size: 14, color: '#9dff4a' }],
    height: 46,
    variants: true,
    pose(ph, t, hit, o) {
      o.fill(0);
      legs(o, ph, 0.4, 0.8, 1);
      R(o, 2, 0, 0, -0.3 + Math.sin(t * 3) * 0.05 + hit * 0.4);
      R(o, 4, 0, 0, 0.2 - Math.sin(ph) * 0.3);
      R(o, 6, 0, 0, 0.2 + Math.sin(ph) * 0.3);
      R(o, 5, 0, 0, 0.6);
      R(o, 7, 0, 0, 0.6);
      R(o, 3, 0, 0, -0.15 + Math.sin(t * 4) * 0.1);
    },
  };
}

function bloater(): CrowdRig {
  const SUIT = '#e6c63a';
  const belly = new Part().ball(13, 13, 13, SUIT, [1, 10, 0]).box(2, 4, 26.5, '#222222', [1, 10, 0]).box(0.6, 2.4, 1.6, '#8a6e10', [13, 12, 7]);
  for (let i = 0; i < 3; i++) belly.ball(2.6, 2.6, 2.6, '#9dff4a', [7 + i * 2, 6 + i * 5, 10 - i * 4]);
  const hd = new Part().ball(6, 6, 6.4, SUIT, [0, 0, 0]).ball(4.2, 4, 5.4, '#2a2d33', [4.5, -0.5, 0]).cyl(2.2, 2.2, 3.4, '#4a4e58', [7.6, -2.5, 0], [0, 0, Math.PI / 2 + 0.3]);
  return {
    joints: biped({
      hipY: 12, pelvis: new Part().ball(6, 4, 7, SUIT, [0, 0, 0]), torso: belly, headAt: [2, 26, 0], head: hd,
      shoulder: [2, 20, -12], upper: seg(6, 2.8, SUIT), fore: seg(5, 2.6, SUIT).ball(2.8, 2.6, 2.8, '#2a2d33', [0, -5.5, 0]), upperLen: 6,
      hipZ: 5, thigh: seg(5, 3.4, SUIT), shin: shoe(seg(5, 3.2, SUIT), 5, '#2a2d33', 6), thighLen: 5,
    }),
    glows: [
      { j: 3, at: [6.8, 1, 2], size: 3, color: '#9dff4a' },
      { j: 3, at: [6.8, 1, -2], size: 3, color: '#9dff4a' },
      ...[0, 1, 2].map((i) => ({ j: 2, at: [8 + i * 2, 6 + i * 5, 11 - i * 4] as V3, size: 7, color: '#9dff4a' })),
    ],
    height: 48,
    variants: false,
    pose(ph, t, hit, o) {
      o.fill(0);
      legs(o, ph, 0.35, 0.6, 1.2);
      // waddle: the whole body rolls side to side
      R(o, 1, Math.sin(ph) * 0.16, 0, 0, -Math.abs(Math.sin(ph)) * 1.2);
      R(o, 2, 0, 0, hit * 0.4 + Math.sin(t * 2) * 0.03);
      R(o, 4, 0.4, 0, Math.sin(ph) * 0.3);
      R(o, 6, -0.4, 0, -Math.sin(ph) * 0.3);
      R(o, 3, 0, 0, Math.sin(t * 1.4) * 0.08);
    },
  };
}

/**
 * Tessellation is kept at the kit's base level: a horde is hundreds of these, and ~2k triangles
 * each (×2 with sun shadows) is the budget that keeps a 420-strong horde phone-friendly.
 */
export const CROWD: Record<string, () => CrowdRig> = {
  shambler: () => detailed(0.85, shambler),
  runner: () => detailed(0.85, runner),
  crawler: () => detailed(0.85, crawler),
  brute: () => detailed(1, brute),
  spitter: () => detailed(0.85, spitter),
  bloater: () => detailed(0.9, bloater),
};

// ------------------------------------------------------------------ variants

/** Rotting skin: grey-greens, bruised blue-greys, jaundiced and necrotic tones. Nothing pale. */
const SKINS: [string, string][] = [
  ['#6f8460', '#3e4a34'],
  ['#7a8270', '#454a3c'],
  ['#64726c', '#363f3b'],
  ['#857c5c', '#4f4834'],
  ['#6c6680', '#3c384c'],
  ['#5e6b4e', '#343c2a'],
];
const SHIRTS: Record<string, string[]> = {
  shambler: ['#3f7486', '#7a3f52', '#5a6a3a', '#6b6f80', '#8a6a3a'],
  runner: ['#c4384f', '#3a6ac4', '#4a4a52', '#2f7a5a'],
  crawler: ['#5a4a6a', '#3a3a44', '#6a5040'],
  brute: ['#5d6470', '#4a3a30', '#3a4a5a'],
  spitter: ['#3f7486', '#5a6a3a'],
  bloater: ['#e6c63a'],
};
const PANTS = ['#3c3756', '#2f3a4a', '#4a3a30', '#2c2c3a', '#2f4058'];

/**
 * Dark floors (downtown, spaceport, reactor): the default palette's dark olive skin and navy
 * clothes sit at the floor's own brightness. These keep the rot but lift the value: mid-tone
 * sickly skin (not pale) and clothing in clearly separated, brighter hues.
 */
const SKINS_DARK: [string, string][] = [
  ['#9aae7c', '#5e6e48'],
  ['#a8a47a', '#6a6644'],
  ['#8fa496', '#56685c'],
  ['#b09a72', '#6e5c40'],
  ['#9890ac', '#5c5670'],
  ['#a3b07a', '#62703e'],
];
const SHIRTS_DARK: Record<string, string[]> = {
  shambler: ['#4f9ab0', '#a8506a', '#c08a3c', '#7d88a8', '#5aa078'],
  runner: ['#e04a62', '#4a86e8', '#d0a040', '#40b08a'],
  crawler: ['#8a6aa8', '#a07a5a', '#6a8aa8'],
  brute: ['#8a92a0', '#9a6a4a', '#5a7aa0'],
  spitter: ['#4f9ab0', '#a0b050'],
  bloater: ['#e6c63a'],
};
const PANTS_DARK = ['#5e5a8a', '#4a6488', '#7a5a44', '#56566a', '#4a6a8a'];

let dark = false;
/** Pick the horde palette for the current floor. */
export function setCrowdPalette(darkFloor: boolean) {
  dark = darkFloor;
}

function hash(n: number, k: number) {
  const x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

// ------------------------------------------------------------------ instanced renderer

const tmpC = new THREE.Color();

function crowdMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.02, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader =
      'attribute float slot;\nattribute vec3 iSkin;\nattribute vec3 iSkinD;\nattribute vec3 iShirt;\nattribute vec3 iPants;\n' +
      sh.vertexShader.replace(
        '#include <color_vertex>',
        `vColor = color;
         if (slot > 0.5) vColor = slot < 1.5 ? iSkin : slot < 2.5 ? iSkinD : slot < 3.5 ? iShirt : iPants;
         #ifdef USE_INSTANCING_COLOR
           vColor *= instanceColor.xyz;
         #endif`,
      );
  };
  m.customProgramCacheKey = () => 'crowd2';
  return m;
}

/** All instances of one infected kind: a joint hierarchy evaluated per instance on the CPU. */
export class CrowdKind {
  readonly rig: CrowdRig;
  readonly meshes: (THREE.InstancedMesh | null)[];
  count = 0;
  private rot: Float32Array;
  private world: THREE.Matrix4[];
  private local = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private attrs: Record<string, THREE.InstancedBufferAttribute>;

  constructor(kind: string, readonly max: number, scene: THREE.Object3D) {
    this.rig = CROWD[kind]();
    const mat = crowdMaterial();
    this.attrs = Object.fromEntries(['iSkin', 'iSkinD', 'iShirt', 'iPants'].map((k) => [k, new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage)]));
    this.meshes = this.rig.joints.map((j) => {
      if (!j.part) return null;
      const geo = j.part.build();
      for (const [k, a] of Object.entries(this.attrs)) geo.setAttribute(k, a);
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.setColorAt(0, tmpC.set(1, 1, 1));
      m.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      scene.add(m);
      return m;
    });
    this.rot = new Float32Array(this.rig.joints.length * 4);
    this.world = this.rig.joints.map(() => new THREE.Matrix4());
  }

  setShadows(on: boolean) {
    for (const m of this.meshes) if (m) m.castShadow = on;
  }

  begin() {
    this.count = 0;
  }

  /**
   * Add one instance. root = placement (position, yaw, scale); seed picks the colour variant.
   * Returns the instance's joint matrices (valid until the next add) for glow placement.
   */
  add(root: THREE.Matrix4, ph: number, t: number, hit: number, seed: number, tint: THREE.Color): THREE.Matrix4[] | null {
    if (this.count >= this.max) return null;
    const i = this.count++;
    const rig = this.rig;
    rig.pose(ph, t, hit, this.rot);
    const J = rig.joints;
    for (let j = 0; j < J.length; j++) {
      const r = this.rot;
      this.q.setFromEuler(this.e.set(r[j * 4], r[j * 4 + 1], r[j * 4 + 2]));
      const at = J[j].at;
      this.local.compose(this.p.set(at[0], at[1] + r[j * 4 + 3], at[2]), this.q, this.one);
      if (J[j].parent < 0) this.world[j].multiplyMatrices(root, this.local);
      else this.world[j].multiplyMatrices(this.world[J[j].parent], this.local);
      const m = this.meshes[j];
      if (m) {
        m.setMatrixAt(i, this.world[j]);
        m.setColorAt(i, tint);
      }
    }
    if (rig.variants) {
      const skins = dark ? SKINS_DARK : SKINS;
      const sk = skins[Math.floor(hash(seed, 1) * skins.length)];
      const table = dark ? SHIRTS_DARK : SHIRTS;
      const shirts = table[kindOf(rig)] ?? table.shambler;
      const pants = dark ? PANTS_DARK : PANTS;
      this.setC('iSkin', i, sk[0]);
      this.setC('iSkinD', i, sk[1]);
      this.setC('iShirt', i, shirts[Math.floor(hash(seed, 2) * shirts.length)]);
      this.setC('iPants', i, pants[Math.floor(hash(seed, 3) * pants.length)]);
    } else {
      this.setC('iSkin', i, '#b4c27a');
      this.setC('iSkinD', i, '#5a6a2a');
      this.setC('iShirt', i, '#e6c63a');
      this.setC('iPants', i, '#e6c63a');
    }
    return this.world;
  }

  private setC(k: string, i: number, hex: string) {
    tmpC.set(hex);
    this.attrs[k].setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
  }

  end() {
    for (const m of this.meshes) {
      if (!m) continue;
      m.count = this.count;
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor!.needsUpdate = true;
    }
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
  }
}

const kindNames = new WeakMap<CrowdRig, string>();
function kindOf(rig: CrowdRig) {
  return kindNames.get(rig) ?? 'shambler';
}
for (const k of Object.keys(CROWD)) {
  const make = CROWD[k];
  CROWD[k] = () => {
    const r = make();
    kindNames.set(r, k);
    return r;
  };
}

/** Variant scale for an enemy (kept small so hitboxes still read true). */
export const variantScale = (seed: number) => 0.92 + hash(seed, 4) * 0.16;
