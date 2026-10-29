import * as THREE from 'three';
import { Part, SIGNAL, detailed } from './kit3d';
import { blob, fbm, limb } from './sculpt';

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

// ------------------------------------------------------------------ sculpted parts

const BLOOD = '#4a0810';
const BLOOD2 = '#6e0e16';
const BONE = '#d6ccb4';
const GUM = '#1a0508';
const SOCKET = '#160a0e';
const TEETH = '#d4c9a6';

const gauss = (d: number, w: number) => Math.exp(-(d * d) / (w * w));
const dist3 = (p: THREE.Vector3, x: number, y: number, z: number) => Math.hypot(p.x - x, p.y - y, p.z - z);
const smooth = THREE.MathUtils.smoothstep;
/** Ambient occlusion by height in unit space: undersides and lower parts a little darker. */
const ao = (y: number, lo = 0.72) => {
  const l = 1 - (1 - lo) * 0.55; // keep occlusion gentle: it stacks with lighting and shadows
  return l + (1 - l) * smooth(y, -1, 0.6);
};

/**
 * Zombie head: one sculpted skull (sunken sockets, brow ridge, hollow cheeks, lumpy cranium) plus a
 * slack jaw. Sockets, gums, teeth, scalp wound, matted hair and rot are painted on.
 */
function head(r: number, opts: { hood?: boolean; hair?: boolean } = {}) {
  const h = new Part();
  const sockets: V3[] = [[0.84, 0.1, 0.36], [0.84, 0.03, -0.37]];
  blob(h, {
    s: [r, r * 0.97, r * 0.9],
    at: [0, 0, 0],
    seg: [14, 10],
    deform(v) {
      if (v.x < 0) v.x *= 1.1; // cranium bulges back
      if (v.x > 0.55) v.x = 0.55 + (v.x - 0.55) * 0.6; // flatter face
      let k = 1;
      for (const s of sockets) k -= 0.13 * gauss(Math.hypot(v.x - s[0], v.y - s[1], v.z - s[2]), 0.26);
      k += 0.07 * gauss(Math.hypot(v.x - 0.8, v.y - 0.3, v.z * 0.6), 0.28); // brow ridge
      k -= 0.08 * gauss(Math.hypot(v.x - 0.45, v.y + 0.25, Math.abs(v.z) - 0.75), 0.3); // hollow cheeks
      k += 0.06 * gauss(Math.hypot(v.x - 0.93, v.y + 0.05, v.z), 0.16); // nose stub
      if (v.y < -0.35 && v.x > 0.25) k -= 0.12 * (v.x - 0.25); // the chin is on the jaw
      k += (fbm(v.x * 2.4, v.y * 2.4, v.z * 2.4) - 0.5) * 0.09; // lumpy, swollen skull
      if (opts.hood && v.x < 0.45) k += 0.1 * smooth(0.45 - v.x, 0, 0.3); // hood fabric
      v.multiplyScalar(k);
      if (v.y < -0.3) v.z *= 0.88;
    },
    paint(p) {
      for (const s of sockets) {
        const d = dist3(p, s[0], s[1], s[2]);
        if (d < 0.24) return { col: SOCKET, shade: 0.7 };
        if (d < 0.32) return { col: '$skinD', shade: 0.8 };
      }
      if (p.x > 0.62 && p.y < -0.28) {
        // upper teeth along the gumline, broken and gappy
        if (p.y > -0.42 && Math.abs(p.z) < 0.42 && Math.sin(p.z * 34) > -0.45 && Math.abs(p.z - 0.14) > 0.05) return { col: TEETH };
        return { col: GUM, shade: 0.7 };
      }
      if (opts.hood && p.x < 0.45 && p.y > -0.7) return { col: '$shirt', shade: ao(p.y, 0.8) };
      const wound = dist3(p, 0.1, 0.9, 0.22);
      if (wound < 0.17) return { col: BONE };
      if (wound < 0.3) return { col: fbm(p.x * 9, p.y * 9, p.z * 9) > 0.45 ? BLOOD : BLOOD2 };
      // a few matted clumps of hair on the back of the scalp (the crown stays mostly bald and readable)
      if (opts.hair !== false && !opts.hood && p.y > 0.15 && p.x < -0.05 && fbm(p.x * 5 + 3, p.y * 5, p.z * 5) > 0.6) return { col: '#2e2822' };
      const rot = fbm(p.x * 3.2, p.y * 3.2, p.z * 3.2);
      return { col: rot > 0.64 ? '$skinD' : '$skin', shade: ao(p.y, 0.8) };
    },
  });
  // slack, skewed jaw
  blob(h, {
    s: [r * 0.55, r * 0.3, r * 0.62],
    at: [r * 0.42, -r * 0.7, r * 0.05],
    rot: [0.12, 0, -0.5],
    seg: [9, 6],
    deform(v) {
      if (v.x > 0.3) v.z *= 0.8;
    },
    paint(p) {
      if (p.y > 0.45 && p.x > 0.2 && Math.sin(p.z * 30) > -0.3) return { col: TEETH };
      if (p.y > 0.3) return { col: GUM, shade: 0.7 };
      if (p.x > 0.55 && p.y < 0.1) return { col: BLOOD2 };
      return { col: '$skinD', shade: ao(p.y, 0.7) };
    },
  });
  // glowing pupils deep in the sockets
  for (const s of sockets) h.ball(r * 0.1, r * 0.1, r * 0.1, SIGNAL, [r * s[0] * 0.97, r * s[1], r * s[2] * 0.88], undefined, 5);
  return h;
}
/** Small glints in the sockets (the sockets themselves carry the menace, not a halo). */
const eyes = (j: number, r: number, size = 1) => [
  { j, at: [r * 0.86, r * 0.1, r * 0.34] as V3, size: r * 0.2 * size, color: SIGNAL },
  { j, at: [r * 0.86, r * 0.03, -r * 0.34] as V3, size: r * 0.2 * size, color: SIGNAL },
];

/** Torso: one hunched, lumpy mass with built-in shoulders; torn cloth, ribs and blood painted on. */
function torso(s: V3, at: V3, o: { hunch?: number; tear?: number; ribs?: boolean; cloth?: string; skin?: boolean; rot?: V3 } = {}) {
  const p = new Part();
  const hunch = o.hunch ?? 0.35;
  const tear = o.tear ?? 0.62;
  const cloth = o.cloth ?? '$shirt';
  blob(p, {
    s,
    at,
    rot: o.rot,
    seg: [13, 9],
    deform(v) {
      v.x += hunch * Math.max(0, v.y) ** 2; // hunched forward at the shoulders
      if (v.y > 0.25) v.z *= 1 + 0.32 * (v.y - 0.25); // shoulder breadth
      if (v.y > 0.8) v.y = 0.8 + (v.y - 0.8) * 0.6; // flat shoulder line
      if (v.x > 0 && v.y < 0.1) v.x *= 1.06; // gut
      v.multiplyScalar(1 + (fbm(v.x * 2.2 + 5, v.y * 2.2, v.z * 2.2) - 0.5) * 0.08);
    },
    paint(q) {
      const shade = ao(q.y, 0.7);
      if (q.y > 0.86 && Math.abs(q.z) < 0.4) return { col: '$skin', shade }; // neck
      if (o.skin) {
        const rot = fbm(q.x * 3, q.y * 3, q.z * 3);
        return { col: rot > 0.6 ? '$skinD' : '$skin', shade };
      }
      const n = fbm(q.x * 3.4 + 1, q.y * 3.4, q.z * 3.4);
      if (n > tear) {
        // a tear in the cloth: rotting skin, and ribs on the chest
        if (o.ribs && q.x > 0.45 && q.y > -0.2 && q.y < 0.6) return Math.sin(q.y * 26) > 0.35 ? { col: BONE } : { col: '#2a0e10', shade: 0.7 };
        return { col: n > tear + 0.08 ? '$skinD' : '$skin', shade };
      }
      if (n > tear - 0.035) return { col: '#2a2420', shade: 0.8 }; // frayed edge
      if (dist3(q, 0.78, 0.15, -0.45) < 0.32 + fbm(q.x * 8, q.y * 8, 1) * 0.12) return { col: BLOOD, shade };
      if (dist3(q, -0.6, 0.55, 0.55) < 0.25) return { col: BLOOD2, shade };
      return { col: cloth, shade: shade * (0.92 + fbm(q.x * 7, q.y * 7, q.z * 7) * 0.16) };
    },
  });
  return p;
}

function pelvis(s: V3, col = '$pants') {
  const p = new Part();
  blob(p, { s, at: [0, 0, 0], seg: [10, 7], paint: (q) => (q.y > 0.55 ? { col: '#2a2420' } : { col, shade: ao(q.y, 0.75) }) });
  return p;
}

/** Upper arm: a sleeve, frayed and torn at the elbow. */
function upperArm(len: number, r: number, col = '$shirt') {
  const p = new Part();
  limb(p, {
    r, len, taper: (t) => 1 - t * 0.18, radial: 8,
    paint: (q) => (q.y < -0.78 && fbm(q.x * 6, q.y * 6, q.z * 6) > 0.45 ? { col: '$skin' } : { col, shade: 0.85 + 0.15 * (q.x * 0.5 + 0.5) }),
  });
  return p;
}
/** Forearm: bare, mottled, bony at the wrist. */
function forearm(len: number, r: number, hand = true) {
  const p = new Part();
  limb(p, {
    r, len, taper: (t) => 1 - t * 0.3, radial: 8,
    paint: (q) => {
      const rot = fbm(q.x * 4 + 2, q.y * 5, q.z * 4);
      return { col: rot > 0.62 ? '$skinD' : '$skin', shade: 0.85 + 0.15 * (q.x * 0.5 + 0.5) };
    },
  });
  if (hand) claw(p, [0, -len - r * 0.5, 0], r * 1.1);
  return p;
}
function claw(p: Part, at: V3, r: number) {
  blob(p, {
    s: [r * 1.05, r * 0.8, r * 0.85],
    at,
    seg: [8, 6],
    deform(v) {
      if (v.x > 0.3) v.y += 0.12 * Math.sin(v.z * 9); // knuckles
    },
    paint: (q) => ({ col: '$skin', shade: ao(q.y, 0.8) }),
  });
  for (let i = -1; i <= 1; i++) p.cone(r * 0.24, r * 1.3, '#d8ccb0', [at[0] + r * 0.5, at[1] - r * 0.95, at[2] + i * r * 0.42], [0, 0, 0.35 + Math.PI], 5);
  return p;
}
/** Leg segment in trousers; shins fray to bare skin above the shoe. */
function legSeg(len: number, r: number, col = '$pants', shin = false) {
  const p = new Part();
  limb(p, {
    r, len, taper: (t) => (shin ? 1 - t * 0.25 : 1 - t * 0.12), radial: 8,
    paint: (q) => {
      if (shin && q.y < -0.8 && fbm(q.x * 6, q.y * 6, q.z * 6) > 0.5) return { col: '$skinD' };
      return { col, shade: (shin ? 0.82 : 0.9) + 0.1 * (q.x * 0.5 + 0.5) };
    },
  });
  return p;
}
function shoe(p: Part, len: number, col = '#2a2622', w = 4.8) {
  blob(p, {
    s: [4.3, 1.9, w / 2],
    at: [1.6, -len - 1.1, 0],
    seg: [9, 6],
    deform(v) {
      if (v.y < 0) v.y *= 0.45; // flat sole
      if (v.x > 0) v.x *= 1.12; // toe
    },
    paint: (q) => (q.y < -0.1 ? { col: '#121010' } : { col, shade: 0.9 }),
  });
  return p;
}

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
  const tor = torso([8.5, 11, 9.5], [0, 10, 0], { hunch: 0.4, ribs: true });
  return {
    joints: biped({
      hipY: 16, pelvis: pelvis([7, 5.5, 8]), torso: tor, headAt: [4.5, 25, 0], head: head(8.3),
      shoulder: [1, 18, -10], upper: upperArm(9, 3), fore: forearm(9, 2.7), upperLen: 9,
      hipZ: 4.5, thigh: legSeg(7.5, 3.4), shin: shoe(legSeg(7.5, 3, '$pants', true), 7.5), thighLen: 7.5,
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
      hipY: 17, pelvis: pelvis([6.5, 5, 7.5]),
      torso: torso([8, 10, 9], [0, 9, 0], { hunch: 0.5, tear: 0.68 }),
      headAt: [4.5, 23, 0], head: head(7.9, { hood: true }),
      shoulder: [0, 16, -9.5], upper: upperArm(8, 3), fore: forearm(8, 2.7), upperLen: 8,
      hipZ: 4, thigh: legSeg(8, 3.1), shin: shoe(legSeg(8, 2.8, '$pants', true), 8, '#d8d8dc', 4.6), thighLen: 8,
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
  // a long, emaciated torso on all fours: spine ridge and shoulder blades pushed through the skin
  const body = new Part();
  blob(body, {
    s: [13, 5.2, 6.5],
    at: [-2, 0, 0],
    seg: [18, 10],
    deform(v) {
      if (v.y > 0.4) v.y += 0.18 * Math.max(0, Math.sin(v.x * 11)) * gauss(v.z, 0.25); // vertebrae
      v.y += 0.12 * gauss(Math.hypot(v.x - 0.35, Math.abs(v.z) - 0.45), 0.2) * (v.y > 0 ? 1 : 0); // shoulder blades
      if (v.x < -0.4) v.multiplyScalar(0.92); // narrow hips
      v.multiplyScalar(1 + (fbm(v.x * 3, v.y * 3, v.z * 3) - 0.5) * 0.1);
    },
    paint(q) {
      if (q.y > 0.6 && Math.abs(q.z) < 0.22 && Math.sin(q.x * 11) > 0.2) return { col: BONE };
      const n = fbm(q.x * 3 + 4, q.y * 3, q.z * 3);
      if (q.x > -0.1 && q.x < 0.5 && n < 0.42) return { col: '$shirt', shade: ao(q.y, 0.7) }; // rags
      return { col: n > 0.6 ? '$skinD' : '$skin', shade: ao(q.y, 0.65) };
    },
  });
  const joints: Joint[] = [
    { parent: -1, at: [0, 0, 0] },
    { parent: 0, at: [0, 9, 0], part: body },
    { parent: 1, at: [12, 1, 0], part: head(5.5, { hair: false }) },
  ];
  // four spider limbs: up-and-out to the knee, then down to the floor
  for (const [x, side] of [[6, -1], [6, 1], [-6, -1], [-6, 1]] as const) {
    // spider limbs: up-and-out to a bony knee, then down to the floor
    const up = new Part();
    limb(up, { r: 1.8, len: Math.hypot(3, 7, 7), taper: (t) => 1 - t * 0.25, radial: 6, dir: [3, 7, side * 7], paint: (q) => ({ col: '$skin', shade: 0.85 + 0.15 * (q.x * 0.5 + 0.5) }) });
    joints.push({ parent: 1, at: [x, 0, side * 5], part: up });
    const low = new Part();
    limb(low, { r: 1.45, len: Math.hypot(4, 15.5, 4), taper: (t) => 1 - t * 0.45, radial: 6, dir: [4, -15.5, side * 4], paint: (q) => ({ col: q.y < -0.85 ? '#d8ccb0' : fbm(q.x * 4, q.y * 6, q.z * 4) > 0.6 ? '$skinD' : '$skin' }) });
    joints.push({ parent: joints.length - 1, at: [3, 7, side * 7], part: low });
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
  const tor = torso([15, 16, 15], [0, 14, 0], { hunch: 0.25, tear: 0.55 });
  // the hump: a swollen growth of muscle and bone spurs between the shoulders
  blob(tor, {
    s: [12, 10, 14],
    at: [-6, 27, 0],
    seg: [12, 9],
    deform: (v) => v.multiplyScalar(1 + (fbm(v.x * 2.5, v.y * 2.5, v.z * 2.5) - 0.5) * 0.22),
    paint: (q) => ({ col: fbm(q.x * 3, q.y * 3, q.z * 3) > 0.55 ? '$skinD' : '$skin', shade: ao(q.y, 0.7) }),
  });
  for (let i = 0; i < 5; i++) tor.cone(1.8, 7, '#d8ccb2', [-8 + i * 2.5, 36 - Math.abs(i - 2) * 1.5, (i - 2) * 3.5], [(i - 2) * 0.25, 0, 0.2], 6);
  // one arm swollen into a club of knuckles and bone
  const fist = new Part();
  limb(fist, { r: 6, len: 11, taper: (t) => 1 + t * 0.15, radial: 10, paint: (q) => ({ col: fbm(q.x * 3, q.y * 4, q.z * 3) > 0.58 ? '$skinD' : '$skin', shade: 0.85 + 0.15 * (q.x * 0.5 + 0.5) }) });
  blob(fist, {
    s: [9.5, 8.5, 9],
    at: [1, -16, 0],
    seg: [12, 9],
    deform(v) {
      if (v.x > 0.2) v.multiplyScalar(1 + 0.1 * Math.max(0, Math.sin(v.z * 8)) * v.x); // knuckle ridge
      v.multiplyScalar(1 + (fbm(v.x * 3, v.y * 3, v.z * 3) - 0.5) * 0.15);
    },
    paint: (q) => ({ col: q.x > 0.6 && Math.sin(q.z * 8) > 0.5 ? BONE : '$skinD', shade: ao(q.y, 0.75) }),
  });
  for (let i = 0; i < 6; i++) fist.cone(2, 7, '#e8dcc6', [1 + Math.cos(i) * 8, -16 + Math.sin(i * 1.7) * 7, Math.sin(i) * 8], [Math.sin(i) * 1.4, 0, Math.cos(i * 1.7) * 1.2 - Math.PI / 2], 6);
  return {
    joints: biped({
      hipY: 24, pelvis: pelvis([11, 8, 12]), torso: tor, headAt: [13, 24, 0], head: head(7.5),
      shoulder: [3, 20, -15], upper: forearm(11, 4.5, false), fore: forearm(11, 4), upperLen: 11,
      shoulderR: [3, 22, 16], upperR: forearm(12, 6.5, false), foreR: fist, upperLenR: 12,
      hipZ: 7, thigh: legSeg(11, 5.5, '$pants'), shin: shoe(legSeg(10, 5, '$pants', true), 10, '#1d1d22', 9), thighLen: 11,
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

/** A stained lab coat over a gaunt chest, with the swollen, glowing throat sac. */
function spitterTorso(COAT: string) {
  const p = torso([6, 10.5, 6.8], [0, 9, 0], { hunch: 0.2, tear: 0.8, cloth: COAT, rot: [0, 0, -0.1] });
  blob(p, {
    s: [4.4, 4.6, 5],
    at: [5.5, 17, 0],
    seg: [10, 7],
    deform: (v) => v.multiplyScalar(1 + (fbm(v.x * 3, v.y * 3, v.z * 3) - 0.5) * 0.2),
    paint: (q) => ({ col: fbm(q.x * 4, q.y * 4, q.z * 4) > 0.6 ? '#6fd030' : '#9dff4a' }),
  });
  return p;
}

function spitter(): CrowdRig {
  const COAT = '#e2e6ea';
  return {
    joints: biped({
      hipY: 15, pelvis: pelvis([5, 4, 6]),
      torso: spitterTorso(COAT),
      headAt: [3, 21.5, 0], head: head(6),
      shoulder: [1, 16, -6.5], upper: upperArm(8, 1.9, COAT), fore: forearm(8, 1.6), upperLen: 8,
      hipZ: 3.2, thigh: legSeg(7, 2.4), shin: shoe(legSeg(7, 2.2, '$pants', true), 7), thighLen: 7,
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

function gloved(len: number, r: number, suit: string) {
  const p = new Part();
  limb(p, { r, len, radial: 8, paint: () => ({ col: suit, shade: 0.9 }) });
  blob(p, { s: [r * 1.1, r, r * 1.1], at: [0, -len - r * 0.4, 0], seg: [8, 6], paint: () => ({ col: '#2a2d33' }) });
  return p;
}

function bloater(): CrowdRig {
  const SUIT = '#e6c63a';
  // a hazmat suit straining over a swollen, blistered belly
  const belly = new Part();
  blob(belly, {
    s: [13, 13, 13],
    at: [1, 10, 0],
    seg: [18, 13],
    deform(v) {
      v.multiplyScalar(1 + Math.max(0, fbm(v.x * 2.6, v.y * 2.6, v.z * 2.6) - 0.55) * 0.5); // blisters push the suit out
      if (v.y < -0.6) v.y = -0.6 + (v.y + 0.6) * 0.6;
    },
    paint(q) {
      const b = fbm(q.x * 2.6, q.y * 2.6, q.z * 2.6);
      if (b > 0.66) return { col: '#9dff4a' };
      if (b > 0.62) return { col: '#6a7a1a', shade: 0.85 };
      if (Math.abs(q.y) < 0.09) return { col: '#222222' }; // waist strap
      return { col: SUIT, shade: ao(q.y, 0.7) * (0.9 + fbm(q.x * 8, q.y * 8, q.z * 8) * 0.18) };
    },
  });
  const hd = new Part();
  blob(hd, { s: [6, 6, 6.4], at: [0, 0, 0], seg: [12, 8], paint: (q) => ({ col: SUIT, shade: ao(q.y, 0.75) }) });
  blob(hd, { s: [4.2, 4, 5.2], at: [4.5, -0.5, 0], seg: [9, 6], paint: (q) => ({ col: q.x > 0.55 && q.y > 0 ? '#3a4048' : '#24272c' }) });
  hd.cyl(2.2, 2.2, 3.4, '#4a4e58', [7.6, -2.5, 0], [0, 0, Math.PI / 2 + 0.3], 10);
  return {
    joints: biped({
      hipY: 12, pelvis: pelvis([6, 4, 7], SUIT), torso: belly, headAt: [2, 26, 0], head: hd,
      shoulder: [2, 20, -12], upper: upperArm(6, 2.8, SUIT), fore: gloved(5, 2.6, SUIT), upperLen: 6,
      hipZ: 5, thigh: legSeg(5, 3.4, SUIT), shin: shoe(legSeg(5, 3.2, SUIT), 5, '#2a2d33', 6), thighLen: 5,
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
  shambler: () => detailed(1, shambler),
  runner: () => detailed(1, runner),
  crawler: () => detailed(1, crawler),
  brute: () => detailed(1, brute),
  spitter: () => detailed(1, spitter),
  bloater: () => detailed(1, bloater),
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
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.02, envMapIntensity: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader =
      'attribute float slot;\nattribute float shade;\nattribute vec3 iSkin;\nattribute vec3 iSkinD;\nattribute vec3 iShirt;\nattribute vec3 iPants;\nvarying vec3 vObj;\nvarying float vSkin;\n' +
      sh.vertexShader.replace(
        '#include <color_vertex>',
        `vColor = color;
         if (slot > 0.5) vColor = slot < 1.5 ? iSkin : slot < 2.5 ? iSkinD : slot < 3.5 ? iShirt : iPants;
         vColor *= shade;
         #ifdef USE_INSTANCING_COLOR
           vColor *= instanceColor.xyz;
         #endif
         vObj = position;
         vSkin = (slot > 0.5 && slot < 2.5) ? 1.0 : 0.0;`,
      );
    // skin texture with no geometry: blotchy rot and fine pores from 3D value noise in body space
    sh.fragmentShader =
      `varying vec3 vObj;
       varying float vSkin;
       float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
       float n3(vec3 p) {
         vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
         return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
                    mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
       }
` +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
         {
           float blot = n3(vObj * 0.32);
           float pore = n3(vObj * 1.9);
           float skinK = mix(0.9, 1.12, blot) * mix(0.95, 1.05, pore);
           float clothK = mix(0.95, 1.05, n3(vObj * 1.2));
           diffuseColor.rgb *= mix(clothK, skinK, vSkin);
         }`,
      );
  };
  m.customProgramCacheKey = () => 'crowd3';
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
