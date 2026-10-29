import * as THREE from 'three';
import { Part, SIGNAL, detailed } from './kit3d';

/**
 * Option D crowd: infected rebuilt for the top-down camera rather than traced from side-view
 * sprites. Chunky, big-headed proportions (to sit next to the authored KayKit hero and bosses),
 * two-bone arms and legs with elbows and knees, smooth lit shading and no ink outline.
 * Facing +X, feet at y = 0, sim units.
 */

type V3 = [number, number, number];

export interface Zombie2 {
  group: THREE.Group;
  /** ph: walk phase (radians), t: time (s) for idle motion, hit: 0..1 hit-react weight. */
  animate(ph: number, t: number, hit: number): void;
}

export interface Variant {
  skin: string;
  skinDark: string;
  shirt: string;
  pants: string;
  scale: number;
  hunch: number;
}

const SKINS = [
  ['#9cb187', '#5d7350'],
  ['#a9b38a', '#6a7352'],
  ['#8fa58a', '#566a52'],
  ['#b2b69a', '#727560'],
];
const SHIRTS = ['#3f7486', '#7a3f52', '#5a6a3a', '#6b6f80', '#8a6a3a'];
const PANTS = ['#3c3756', '#2f3a4a', '#4a3a30', '#2c2c3a'];

export function variant(seed: number, kind: string): Variant {
  const r = (k: number) => {
    const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const s = SKINS[Math.floor(r(1) * SKINS.length)];
  return {
    skin: s[0],
    skinDark: s[1],
    shirt: kind === 'runner' ? ['#c4384f', '#3a6ac4', '#4a4a52'][Math.floor(r(2) * 3)] : SHIRTS[Math.floor(r(2) * SHIRTS.length)],
    pants: PANTS[Math.floor(r(3) * PANTS.length)],
    scale: 0.9 + r(4) * 0.2,
    hunch: r(5),
  };
}

const MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.02 });
const EYE = new THREE.MeshBasicMaterial({ color: SIGNAL });

function joint(parent: THREE.Object3D, at: V3, p: Part | null) {
  const o = new THREE.Object3D();
  o.position.set(...at);
  if (p) {
    const m = new THREE.Mesh(p.build(), MAT);
    m.castShadow = true;
    o.add(m);
  }
  parent.add(o);
  return o;
}

/** Two-bone limb: returns [upper joint, lower joint]. Segments hang along -Y in their own space. */
function limb(parent: THREE.Object3D, at: V3, l1: number, r1: number, c1: string, l2: number, r2: number, c2: string, end?: (p: Part) => void) {
  const up = joint(parent, at, new Part().limb([0, 0, 0], [0, -l1, 0], r1, c1));
  const low = new Part().limb([0, 0, 0], [0, -l2, 0], r2, c2);
  end?.(low);
  const lo = joint(up, [0, -l1, 0], low);
  return [up, lo] as const;
}

function head(parent: THREE.Object3D, at: V3, r: number, v: Variant, hood?: string) {
  const h = new Part();
  h.ball(r, r * 0.95, r * 0.92, v.skin, [0, 0, 0]);
  h.ball(r * 0.55, r * 0.4, r * 0.75, v.skinDark, [r * 0.45, -r * 0.62, 0], [0, 0, -0.5]); // slack jaw
  h.box(r * 0.25, r * 0.22, r * 0.9, '#2a0a16', [r * 0.78, -r * 0.42, 0]); // mouth
  for (let i = -2; i <= 2; i++) h.box(r * 0.12, r * 0.16, r * 0.1, '#efe6cf', [r * 0.86, -r * 0.3, i * r * 0.16]);
  h.ball(r * 0.3, r * 0.22, r * 0.28, v.skinDark, [r * 0.66, r * 0.12, r * 0.36]); // eye sockets
  h.ball(r * 0.3, r * 0.22, r * 0.28, v.skinDark, [r * 0.66, r * 0.12, -r * 0.36]);
  h.box(r * 0.4, r * 0.16, r * 1.4, v.skinDark, [r * 0.72, r * 0.38, 0], [0, 0, -0.3]); // brow
  if (hood) {
    h.ball(r * 1.12, r * 1.08, r * 1.08, hood, [-r * 0.22, r * 0.08, 0]);
  } else {
    for (let i = 0; i < 5; i++) h.cone(r * 0.2, r * 0.6, '#2e2622', [-r * 0.2 + i * r * 0.12, r * 0.9, (i - 2) * r * 0.32], [(i - 2) * 0.25, 0, 0.4]);
  }
  const o = joint(parent, at, h);
  // glowing eyes: real emissive geometry so bloom catches them
  for (const z of [r * 0.36, -r * 0.36]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(r * 0.14, 8, 6), EYE);
    e.position.set(r * 0.8, r * 0.12, z);
    o.add(e);
  }
  return o;
}

function claw(p: Part, at: V3, r: number, skin: string) {
  p.ball(r, r * 0.8, r * 0.9, skin, at);
  for (let i = -1; i <= 1; i++) p.cone(r * 0.28, r * 1.2, '#e8dcc6', [at[0] + r * 0.4, at[1] - r * 0.9, at[2] + i * r * 0.45], [0, 0, 0.3 + Math.PI]);
}

export function buildZombie2(kind: 'shambler' | 'runner', seed: number): Zombie2 {
  return detailed(1.6, () => (kind === 'runner' ? runner(variant(seed, kind)) : shambler(variant(seed, kind))));
}

function shambler(v: Variant): Zombie2 {
  const group = new THREE.Group();
  const rig = new THREE.Object3D();
  rig.scale.setScalar(v.scale * 0.88);
  group.add(rig);
  const hips = joint(rig, [0, 16, 0], new Part().ball(7, 5.5, 8, v.pants, [0, 0, 0]));
  const torsoP = new Part()
    .ball(8.5, 11, 9.5, v.shirt, [0, 10, 0])
    .ball(6, 6, 8, v.skin, [5, 6, 0]) // exposed belly through the torn shirt
    .box(3, 7, 2, v.skinDark, [7.5, 9, 4.5], [0, 0, -0.2])
    .ball(5, 3.4, 5, v.shirt, [-1, 19, -8.5])
    .ball(5, 3.4, 5, v.shirt, [-1, 19, 8.5]);
  const torso = joint(hips, [0, 2, 0], torsoP);
  torso.rotation.z = -0.35 - v.hunch * 0.2;
  const hd = head(torso, [5, 26, 0], 9.5, v);
  const [shL, elL] = limb(torso, [1, 18, -10], 9, 3, v.shirt, 9, 2.7, v.skin, (p) => claw(p, [0, -10, 0], 2.8, v.skin));
  const [shR, elR] = limb(torso, [1, 18, 10], 9, 3, v.shirt, 9, 2.7, v.skin, (p) => claw(p, [0, -10, 0], 2.8, v.skin));
  const shoe = (p: Part) => p.box(8, 3.2, 5, '#2a2622', [2, -8.5, 0]);
  const [hipL, knL] = limb(hips, [0, -1, -4.5], 7.5, 3.4, v.pants, 7.5, 3, v.pants, shoe);
  const [hipR, knR] = limb(hips, [0, -1, 4.5], 7.5, 3.4, v.pants, 7.5, 3, v.pants, shoe);
  return {
    group,
    animate(ph, t, hit) {
      const s = Math.sin(ph), c = Math.cos(ph);
      hipL.rotation.z = s * 0.45;
      hipR.rotation.z = -s * 0.45;
      knL.rotation.z = -Math.max(0, c) * 0.9;
      knR.rotation.z = -Math.max(0, -c) * 0.9;
      hips.position.y = 16 - Math.abs(s) * 1.4;
      hips.rotation.x = s * 0.08; // lurch side to side
      torso.rotation.x = -s * 0.1;
      torso.rotation.z = -0.35 - v.hunch * 0.2 + hit * 0.5;
      // arms reach for the courier, swaying out of step
      shL.rotation.z = 1.25 + Math.sin(ph + 1) * 0.15 - hit * 0.8;
      shR.rotation.z = 1.35 + Math.sin(ph + 2.5) * 0.15 - hit * 0.8;
      elL.rotation.z = 0.25 + Math.sin(t * 2.3) * 0.12;
      elR.rotation.z = 0.35 + Math.sin(t * 1.9 + 1) * 0.12;
      hd.rotation.x = Math.sin(t * 1.3) * 0.15;
      hd.rotation.z = 0.25 + Math.sin(ph) * 0.06 - hit * 0.4;
    },
  };
}

function runner(v: Variant): Zombie2 {
  const group = new THREE.Group();
  const rig = new THREE.Object3D();
  rig.scale.setScalar(v.scale * 0.85);
  group.add(rig);
  const hips = joint(rig, [0, 17, 0], new Part().ball(6.5, 5, 7.5, v.pants, [0, 0, 0]));
  const torso = joint(hips, [0, 2, 0], new Part().ball(8, 10, 9, v.shirt, [0, 9, 0]).box(4, 4, 9, '#2a2230', [6.5, 5, 0]).ball(5.5, 3.6, 5.5, v.shirt, [-1, 17, -8]).ball(5.5, 3.6, 5.5, v.shirt, [-1, 17, 8]));
  const hd = head(torso, [5, 24, 0], 9.5, v, v.shirt);
  const [shL, elL] = limb(torso, [0, 16, -9.5], 8, 3, v.shirt, 8, 2.7, v.skin, (p) => claw(p, [0, -9, 0], 2.6, v.skin));
  const [shR, elR] = limb(torso, [0, 16, 9.5], 8, 3, v.shirt, 8, 2.7, v.skin, (p) => claw(p, [0, -9, 0], 2.6, v.skin));
  const shoe = (p: Part) => p.box(8, 3, 4.6, '#e8e8ec', [2, -8.6, 0]);
  const [hipL, knL] = limb(hips, [0, -1, -4], 8, 3.1, v.pants, 8, 2.8, v.pants, shoe);
  const [hipR, knR] = limb(hips, [0, -1, 4], 8, 3.1, v.pants, 8, 2.8, v.pants, shoe);
  return {
    group,
    animate(ph, t, hit) {
      const p = ph * 1.4;
      const s = Math.sin(p), c = Math.cos(p);
      hipL.rotation.z = s * 0.85;
      hipR.rotation.z = -s * 0.85;
      knL.rotation.z = -Math.max(0, c) * 1.5 - 0.2;
      knR.rotation.z = -Math.max(0, -c) * 1.5 - 0.2;
      hips.position.y = 17 - Math.abs(c) * 2.4;
      torso.rotation.z = -0.65 + hit * 0.6;
      torso.rotation.x = s * 0.06;
      // pumping arms, elbows locked at a sprinter's 90°
      shL.rotation.z = -s * 1.0 + 0.2;
      shR.rotation.z = s * 1.0 + 0.2;
      elL.rotation.z = 1.5;
      elR.rotation.z = 1.5;
      hd.rotation.z = 0.5 + Math.sin(t * 9) * 0.04 - hit * 0.4;
    },
  };
}
