import * as THREE from 'three';
import type { HeroSkin } from '../render/hero';
import { Part, SIGNAL, outlineMat, toonMat } from './kit3d';

/**
 * 3D versions of every character. Each is modelled facing +X with feet at y = 0, at the same
 * world-unit size as its 2D sprite, and keeps the 2D palette so the cast reads the same.
 */

type V3 = [number, number, number];

export interface GlowSpec {
  part: number;
  at: V3;
  size: number;
  color: string;
}

/** An instanced, animated infected: a body plus limbs that swing around their pivots. */
export interface RigDef {
  parts: { geo: THREE.BufferGeometry; pivot: V3 }[];
  /** Write per-part [rz, rx] rotations into rot; return the body's vertical bob. */
  pose(ph: number, rot: Float32Array): number;
  glows: GlowSpec[];
  height: number;
}

const INKC = '#0f0a12';

// ------------------------------------------------------------------ shared bits

/** Zombie head: skull, open jaw, brow, glowing eyes (returned as glow specs for the given part). */
function zhead(p: Part, x: number, y: number, r: number, skin: string, dark: string, part: number, glows: GlowSpec[], eye = SIGNAL, opts: { hair?: string; jaw?: boolean } = {}) {
  p.ball(r, r * 0.95, r * 0.9, skin, [x, y, 0]);
  if (opts.jaw !== false) p.ball(r * 0.55, r * 0.35, r * 0.6, dark, [x + r * 0.55, y - r * 0.6, 0], [0, 0, -0.4]);
  p.box(r * 0.5, r * 0.18, r * 1.3, dark, [x + r * 0.62, y + r * 0.32, 0]);
  if (opts.hair) {
    for (let i = 0; i < 4; i++) p.cone(r * 0.28, r * 0.7, opts.hair, [x - r * 0.3 + i * 0.1, y + r * 0.85, (i - 1.5) * r * 0.35], [0.2 * (i - 1.5), 0, 0.5]);
  }
  glows.push({ part, at: [x + r * 0.82, y + r * 0.05, r * 0.32], size: r * 0.75, color: eye });
  glows.push({ part, at: [x + r * 0.82, y + r * 0.05, -r * 0.32], size: r * 0.6, color: eye });
}

function claw(p: Part, at: V3, r: number, skin: string) {
  p.ball(r, r * 0.8, r * 0.9, skin, at);
  for (let i = -1; i <= 1; i++) p.cone(r * 0.3, r * 1.3, '#e8dcc6', [at[0] + r * 0.9, at[1] - r * 0.2, at[2] + i * r * 0.5], [0, 0, -Math.PI / 2 - 0.3]);
}

function shoe(p: Part, at: V3, col = '#24262c') {
  p.box(8, 3.2, 4.6, col, [at[0] + 1.5, at[1] + 1.6, at[2]]);
}

/** Standard biped walk: legs swing opposite, arms counter-swing on top of a reach angle. */
function walker(legs: [number, number], arms: [number, number], stride: number, armSwing: number, reach: number, bobAmt: number) {
  return (ph: number, rot: Float32Array) => {
    rot.fill(0);
    const s = Math.sin(ph);
    rot[legs[0] * 2] = s * stride;
    rot[legs[1] * 2] = -s * stride;
    if (arms[0] >= 0) rot[arms[0] * 2] = -reach - s * armSwing;
    if (arms[1] >= 0) rot[arms[1] * 2] = -reach + s * armSwing;
    return Math.abs(Math.cos(ph)) * bobAmt;
  };
}

// ------------------------------------------------------------------ infected

function shambler(): RigDef {
  const SK = '#9cb187', SKD = '#4d6142', SHIRT = '#3f7486', PANTS = '#3c3756';
  const glows: GlowSpec[] = [];
  const body = new Part();
  body.ball(7.5, 9.5, 8, SHIRT, [1, 25, 0], [0, 0, -0.4]);
  body.ball(5, 4, 7.5, PANTS, [-0.5, 17, 0]);
  body.box(3, 6, 6, SKD, [6.5, 21, 3], [0, 0, -0.4]); // torn shirt flap / exposed ribs
  zhead(body, 8, 34, 6.2, SK, SKD, 0, glows, SIGNAL, { hair: '#3b2a2a' });
  const legL = new Part().limb([0, 17, -3.8], [1, 3, -3.8], 3.1, PANTS);
  shoe(legL, [1, 0, -3.8], '#2a2622');
  const legR = new Part().limb([0, 17, 3.8], [-1, 3, 3.8], 3.1, PANTS);
  shoe(legR, [-1, 0, 3.8], '#2a2622');
  // arms reach forward, zombie-style
  const armL = new Part().limb([3, 30, -7], [11, 26, -7.5], 2.3, SHIRT).limb([11, 26, -7.5], [19, 26, -6.5], 2.1, SK);
  claw(armL, [20, 26, -6.5], 2.4, SK);
  const armR = new Part().limb([3, 30, 7], [11, 27, 7.5], 2.3, SHIRT).limb([11, 27, 7.5], [19, 28, 6.5], 2.1, SK);
  claw(armR, [20, 28, 6.5], 2.4, SK);
  return {
    parts: [
      { geo: body.build(), pivot: [0, 0, 0] },
      { geo: legL.build(), pivot: [0, 17, -3.8] },
      { geo: legR.build(), pivot: [0, 17, 3.8] },
      { geo: armL.build(), pivot: [3, 30, -7] },
      { geo: armR.build(), pivot: [3, 30, 7] },
    ],
    pose: walker([1, 2], [3, 4], 0.45, 0.18, 0.05, 1.2),
    glows,
    height: 44,
  };
}

function runner(): RigDef {
  const SK = '#d2c1b8', SKD = '#7a625b', HOOD = '#c4384f', HOODD = '#962638', PANTS = '#2c2c3a';
  const glows: GlowSpec[] = [];
  const body = new Part();
  body.ball(6.5, 9, 7.2, HOOD, [2, 25, 0], [0, 0, -0.75]);
  body.box(4, 3, 8, HOODD, [6, 21, 0], [0, 0, -0.7]); // kangaroo pocket
  body.ball(4.5, 3.6, 6.4, PANTS, [-1, 17.5, 0]);
  zhead(body, 11, 30, 5.6, SK, SKD, 0, glows);
  body.ball(6.6, 6.2, 6.6, HOOD, [9.4, 31.5, 0]); // hood shell
  body.ball(4.6, 4.2, 5, HOODD, [7.6, 30.5, 0]);
  const legL = new Part().limb([0, 17, -3.4], [2, 3, -3.4], 2.8, PANTS);
  shoe(legL, [2, 0, -3.4], '#e8e8ec');
  const legR = new Part().limb([0, 17, 3.4], [-2, 3, 3.4], 2.8, PANTS);
  shoe(legR, [-2, 0, 3.4], '#e8e8ec');
  const armL = new Part().limb([6, 29, -6.4], [9, 22, -7], 2.2, HOOD).limb([9, 22, -7], [15, 20, -6.5], 2, SK);
  claw(armL, [16, 20, -6.5], 2, SK);
  const armR = new Part().limb([6, 29, 6.4], [9, 22, 7], 2.2, HOOD).limb([9, 22, 7], [15, 20, 6.5], 2, SK);
  claw(armR, [16, 20, 6.5], 2, SK);
  return {
    parts: [
      { geo: body.build(), pivot: [0, 0, 0] },
      { geo: legL.build(), pivot: [0, 17, -3.4] },
      { geo: legR.build(), pivot: [0, 17, 3.4] },
      { geo: armL.build(), pivot: [6, 29, -6.4] },
      { geo: armR.build(), pivot: [6, 29, 6.4] },
    ],
    pose: walker([1, 2], [3, 4], 0.85, 0.9, -0.1, 2.2),
    glows,
    height: 42,
  };
}

function crawler(): RigDef {
  const SK = '#a296b8', SKD = '#463c5c';
  const glows: GlowSpec[] = [];
  const body = new Part();
  body.ball(13, 5, 6.5, SK, [-2, 10, 0], [0, 0, 0.05]);
  body.ball(7, 4.6, 6, SKD, [-12, 10.5, 0]);
  for (let i = 0; i < 4; i++) body.cone(1.4, 4, SKD, [-10 + i * 5, 15, 0], [0, 0, 0.3]);
  zhead(body, 12, 11, 4.6, SK, SKD, 0, glows, SIGNAL, { jaw: true });
  for (let i = 0; i < 4; i++) glows.push({ part: 0, at: [-9 + i * 5, 15.5, 0], size: 2.6, color: SIGNAL });
  // four spider limbs: up-and-out knee, then down to the floor
  const leg = (x: number, side: number) => new Part().limb([x, 10, side * 5], [x + 3, 17, side * 12], 1.7, SK).limb([x + 3, 17, side * 12], [x + 7, 0.5, side * 16], 1.4, SK);
  return {
    parts: [
      { geo: body.build(), pivot: [0, 0, 0] },
      { geo: leg(6, -1).build(), pivot: [6, 10, -5] },
      { geo: leg(6, 1).build(), pivot: [6, 10, 5] },
      { geo: leg(-6, -1).build(), pivot: [-6, 10, -5] },
      { geo: leg(-6, 1).build(), pivot: [-6, 10, 5] },
    ],
    pose: (ph, rot) => {
      rot.fill(0);
      const s = Math.sin(ph * 1.4);
      // alternating gait: legs sweep around the vertical (lift via rx)
      rot[1 * 2 + 1] = s * 0.35;
      rot[4 * 2 + 1] = s * 0.35;
      rot[2 * 2 + 1] = -s * 0.35;
      rot[3 * 2 + 1] = -s * 0.35;
      rot[1 * 2] = s * 0.25;
      rot[4 * 2] = s * 0.25;
      rot[2 * 2] = -s * 0.25;
      rot[3 * 2] = -s * 0.25;
      return Math.abs(Math.cos(ph * 1.4)) * 0.8;
    },
    glows,
    height: 26,
  };
}

function brute(): RigDef {
  const SK = '#86a272', SKD = '#3a4e2f', TOP = '#5d6470', SHORTS = '#2f4058';
  const glows: GlowSpec[] = [];
  const body = new Part();
  body.ball(15, 17, 15, TOP, [0, 40, 0], [0, 0, -0.3]);
  body.ball(12, 10, 14, SK, [-6, 54, 0]); // hump
  for (let i = 0; i < 5; i++) body.cone(1.8, 7, '#d8ccb2', [-8 + i * 2.5, 63 - Math.abs(i - 2) * 1.5, (i - 2) * 3.5], [(i - 2) * 0.25, 0, 0.2]);
  body.ball(11, 8, 12, SHORTS, [-1, 24, 0]);
  zhead(body, 13, 50, 6.5, SK, SKD, 0, glows, SIGNAL, { jaw: true });
  glows.push({ part: 0, at: [-6, 64, 0], size: 4, color: SIGNAL });
  const legL = new Part().limb([0, 22, -7], [2, 5, -8], 5.2, SK);
  shoe(legL, [2, 0, -8], '#1d1d22');
  const legR = new Part().limb([0, 22, 7], [-1, 5, 8], 5.2, SK);
  shoe(legR, [-1, 0, 8], '#1d1d22');
  // small arm + the giant spiked fist
  const armL = new Part().limb([4, 46, -15], [10, 34, -17], 4, SK).limb([10, 34, -17], [16, 28, -15], 3.6, SK);
  claw(armL, [18, 27, -15], 4, SK);
  const armR = new Part().limb([4, 48, 15], [8, 34, 19], 6, SK).limb([8, 34, 19], [16, 22, 18], 5.6, SK);
  armR.ball(10, 9, 10, SKD, [20, 18, 18]);
  for (let i = 0; i < 6; i++) armR.cone(2, 8, '#e8dcc6', [20 + Math.cos(i) * 8, 18 + Math.sin(i * 1.7) * 7, 18 + Math.sin(i) * 8], [Math.sin(i) * 1.4, 0, -Math.PI / 2 + Math.cos(i * 1.7) * 1.2]);
  return {
    parts: [
      { geo: body.build(), pivot: [0, 0, 0] },
      { geo: legL.build(), pivot: [0, 22, -7] },
      { geo: legR.build(), pivot: [0, 22, 7] },
      { geo: armL.build(), pivot: [4, 46, -15] },
      { geo: armR.build(), pivot: [4, 48, 15] },
    ],
    pose: walker([1, 2], [3, 4], 0.35, 0.2, 0, 2),
    glows,
    height: 68,
  };
}

function spitter(): RigDef {
  const SK = '#b0c08e', SKD = '#5a6942', COAT = '#e2e6ea', PANTS = '#3b4250';
  const glows: GlowSpec[] = [];
  const body = new Part();
  body.cyl(5.5, 8, 18, COAT, [0, 23, 0], [0, 0, -0.12]); // lab coat
  body.box(1, 10, 1.2, '#9aa3ad', [5.5, 25, 0], [0, 0, -0.12]);
  body.ball(4.5, 4.5, 5, '#9dff4a', [6, 33.5, 0]); // throat sac
  zhead(body, 4, 38, 5.6, SK, SKD, 0, glows, SIGNAL, { hair: '#55505a' });
  glows.push({ part: 0, at: [7.5, 33.5, 0], size: 11, color: '#9dff4a' });
  const legL = new Part().limb([0, 15, -3.2], [0.5, 3, -3.2], 2.4, PANTS);
  shoe(legL, [0.5, 0, -3.2]);
  const legR = new Part().limb([0, 15, 3.2], [-0.5, 3, 3.2], 2.4, PANTS);
  shoe(legR, [-0.5, 0, 3.2]);
  const armL = new Part().limb([1, 30, -6.5], [4, 21, -7.5], 1.9, COAT).limb([4, 21, -7.5], [9, 17, -7], 1.6, SK);
  const armR = new Part().limb([1, 30, 6.5], [4, 21, 7.5], 1.9, COAT).limb([4, 21, 7.5], [9, 17, 7], 1.6, SK);
  return {
    parts: [
      { geo: body.build(), pivot: [0, 0, 0] },
      { geo: legL.build(), pivot: [0, 15, -3.2] },
      { geo: legR.build(), pivot: [0, 15, 3.2] },
      { geo: armL.build(), pivot: [1, 30, -6.5] },
      { geo: armR.build(), pivot: [1, 30, 6.5] },
    ],
    pose: walker([1, 2], [3, 4], 0.4, 0.3, 0, 1),
    glows,
    height: 44,
  };
}

function bloater(): RigDef {
  const SK = '#b4c27a', SUIT = '#e6c63a', SUITD = '#8a6e10';
  const glows: GlowSpec[] = [];
  const body = new Part();
  body.ball(13, 13, 13, SUIT, [1, 24, 0]);
  body.box(2, 4, 26.5, '#222', [1, 24, 0]); // waist strap
  body.ball(6, 6, 6.4, SUIT, [2, 40, 0]); // hood
  body.ball(4.2, 4, 5.4, '#2a2d33', [6.5, 39.5, 0]); // gas mask
  body.cyl(2.2, 2.2, 3.4, '#4a4e58', [9.6, 37.5, 0], [0, 0, Math.PI / 2 + 0.3]);
  body.box(0.6, 2.4, 1.6, SUITD, [12, 26, 7]);
  glows.push({ part: 0, at: [8.8, 41, 2], size: 2.8, color: '#9dff4a' });
  glows.push({ part: 0, at: [8.8, 41, -2], size: 2.8, color: '#9dff4a' });
  for (let i = 0; i < 3; i++) {
    body.ball(2.6, 2.6, 2.6, '#9dff4a', [6 + i * 2, 20 + i * 5, 10 - i * 4]); // leaking blisters
    glows.push({ part: 0, at: [6.5 + i * 2, 20 + i * 5, 11 - i * 4], size: 6, color: '#9dff4a' });
  }
  void SK;
  const legL = new Part().limb([0, 12, -5], [0, 3, -5], 3.4, SUIT);
  shoe(legL, [0, 0, -5], '#2a2d33');
  const legR = new Part().limb([0, 12, 5], [0, 3, 5], 3.4, SUIT);
  shoe(legR, [0, 0, 5], '#2a2d33');
  const armL = new Part().limb([2, 32, -12], [7, 24, -14], 2.8, SUIT).ball(2.8, 2.6, 2.8, '#2a2d33', [8, 23, -14]);
  const armR = new Part().limb([2, 32, 12], [7, 24, 14], 2.8, SUIT).ball(2.8, 2.6, 2.8, '#2a2d33', [8, 23, 14]);
  return {
    parts: [
      { geo: body.build(), pivot: [0, 0, 0] },
      { geo: legL.build(), pivot: [0, 12, -5] },
      { geo: legR.build(), pivot: [0, 12, 5] },
      { geo: armL.build(), pivot: [2, 32, -12] },
      { geo: armR.build(), pivot: [2, 32, 12] },
    ],
    pose: walker([1, 2], [3, 4], 0.3, 0.25, 0, 1.4),
    glows,
    height: 50,
  };
}

export const RIG_BUILDERS: Record<string, () => RigDef> = { shambler, runner, crawler, brute, spitter, bloater };

// ------------------------------------------------------------------ hero

export interface HeroModel {
  group: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  torso: THREE.Object3D;
  mat: THREE.MeshToonMaterial;
  glows: { obj: THREE.Object3D; at: THREE.Vector3; size: number; color: string }[];
}

/** Attach a part (and its ink hull) to a parent at a pivot, so it can rotate around that pivot. */
function mount(parent: THREE.Object3D, p: Part, pivot: V3, mat: THREE.Material, ink: THREE.Material): THREE.Object3D {
  const g = p.build();
  g.translate(-pivot[0], -pivot[1], -pivot[2]);
  const holder = new THREE.Object3D();
  holder.position.set(...pivot);
  const m = new THREE.Mesh(g, mat);
  const o = new THREE.Mesh(g, ink);
  holder.add(o, m);
  parent.add(holder);
  return holder;
}

export function buildHero(skin: HeroSkin): HeroModel {
  const mat = toonMat({ emissive: new THREE.Color(0, 0, 0) });
  const ink = outlineMat(0.75);
  const group = new THREE.Group();
  const glows: HeroModel['glows'] = [];
  const PANTS = skin.pants[0];

  const leg = (side: number) => {
    const p = new Part().limb([0, 24, side * 4], [0.5, 4, side * 4], 3.3, PANTS);
    p.ball(3.1, 2.6, 3, '#59647c', [2.6, 14, side * 4]);
    p.box(9, 4, 5, '#24262c', [2, 2, side * 4]);
    p.box(9.2, 1, 5.2, skin.accent, [2, 0.6, side * 4]);
    return mount(group, p, [0, 24, side * 4], mat, ink);
  };
  const legL = leg(-1);
  const legR = leg(1);

  const torso = new THREE.Object3D();
  group.add(torso);
  const t = new Part();
  t.box(11, 15, 14, skin.jacket[0], [0, 32, 0]);
  t.box(11.4, 3, 14.4, skin.pants[1], [0, 25.5, 0]); // belt
  t.box(9, 2.6, 13, skin.collar[0], [0.5, 40.5, 0]);
  t.box(0.6, 12, 1.2, skin.zip, [5.6, 33, 0]);
  if (skin.tape) {
    t.box(0.5, 1.4, 13.6, '#dfe7ee', [5.6, 30, 0]);
    t.box(0.5, 1.4, 13.6, '#dfe7ee', [5.6, 35.5, 0]);
  }
  const em = skin.accent;
  if (skin.emblem === 'cross') {
    t.box(0.6, 5, 1.6, em, [5.8, 34.5, -3.4]);
    t.box(0.6, 1.6, 5, em, [5.8, 34.5, -3.4]);
  } else if (skin.emblem === 'bolt') {
    t.box(0.6, 4, 1.4, '#1d1d1d', [5.8, 35.5, -3], [0.5, 0, 0]);
    t.box(0.6, 4, 1.4, '#1d1d1d', [5.8, 32.5, -3.8], [0.5, 0, 0]);
  } else if (skin.emblem === 'chevron') {
    t.box(0.6, 1.4, 4, em, [5.8, 35, -2.2], [0.7, 0, 0]);
    t.box(0.6, 1.4, 4, em, [5.8, 35, -5], [-0.7, 0, 0]);
  } else if (skin.emblem === 'shield') {
    t.box(0.6, 5, 4.4, em, [5.8, 34.8, -3.4]);
    t.box(0.7, 3, 2.4, skin.jacket[1], [5.9, 34.8, -3.4]);
  }
  // backpack + antenna
  t.box(6.5, 14, 11, skin.pack[0], [-8.5, 33, 0]);
  t.box(6.8, 1.6, 9, skin.pack[1], [-8.6, 30, 0]);
  t.cyl(0.5, 0.6, 15, '#1b2029', [-10, 47, 3.5]);
  glows.push({ obj: torso, at: new THREE.Vector3(-10, 55, 3.5), size: 5, color: skin.glow });
  // helmet + visor
  t.ball(7.4, 7.2, 7.4, skin.helmet[0], [0.5, 46.5, 0]);
  t.box(3.2, 4.4, 10.5, skin.visorDark, [5.4, 46.5, 0]);
  t.box(0.6, 1.4, 9, skin.glow, [7.1, 47.6, 0]);
  t.box(7, 1.6, 2, em, [-1, 53.2, 0]); // crest
  glows.push({ obj: torso, at: new THREE.Vector3(7.6, 47.4, 0), size: 9, color: skin.glow });
  // off arm (glove resting)
  t.limb([0.5, 39, -8], [2.5, 30, -8.6], 2.6, skin.jacket[0]);
  t.ball(2.6, 2.4, 2.6, '#30343d', [3, 28.5, -8.6]);
  // gun arm, pointing forward along +X
  t.limb([0.5, 39, 8], [7, 34, 8.6], 2.6, skin.jacket[0]);
  t.limb([7, 34, 8.6], [12.5, 34, 8.6], 2.3, skin.jacket[0]);
  t.ball(2.6, 2.4, 2.6, '#30343d', [13.5, 34, 8.6]);
  t.box(15, 4.8, 3.8, '#5a6478', [18, 35, 8.6]);
  t.box(5, 3, 3, '#2c323f', [26.5, 35.2, 8.6]);
  t.box(3, 5, 2.6, '#2c323f', [15, 31.5, 8.6]);
  t.box(5, 1, 0.4, skin.glow, [19, 36, 10.6]);
  glows.push({ obj: torso, at: new THREE.Vector3(29.5, 35.2, 8.6), size: 4, color: skin.glow });
  const g = t.build();
  torso.add(new THREE.Mesh(g, ink), new THREE.Mesh(g, mat));
  return { group, legL, legR, torso, mat, glows };
}

// ------------------------------------------------------------------ bosses

export interface BossModel {
  group: THREE.Group;
  mat: THREE.MeshToonMaterial;
  /** Animate from the sim's boss pose; returns live glow points in model space. */
  animate(t: number, state: number, phase2: boolean): void;
  glows: { obj: THREE.Object3D; at: THREE.Vector3; size: number; color: string; pulse?: number }[];
  height: number;
}

function bossBase() {
  return { mat: toonMat({ emissive: new THREE.Color(0, 0, 0) }), ink: outlineMat(1.4), group: new THREE.Group() };
}

/** The Warden: riot officer with shield and shock baton; charges shield-first, slams the baton. */
function warden(): BossModel {
  const { mat, ink, group } = bossBase();
  const ARMOR = '#4a5a7a', ARMOR_D = '#38465f', PLATE = '#7a8aac', SUIT = '#232b3c';
  const glows: BossModel['glows'] = [];
  const root = new THREE.Object3D();
  group.add(root);
  const leg = (side: number) => mount(root, new Part().limb([0, 36, side * 9], [1, 7, side * 10], 6.5, SUIT).ball(6, 5.5, 6.5, PLATE, [3, 20, side * 10]).box(17, 7, 10, '#1a1d24', [3, 3.5, side * 10]), [0, 36, side * 9], mat, ink);
  const legL = leg(-1);
  const legR = leg(1);
  const torso = new THREE.Object3D();
  torso.position.set(0, 36, 0);
  root.add(torso);
  const tb = new Part();
  tb.box(24, 34, 30, ARMOR, [0, 18, 0]);
  tb.box(25, 10, 31, ARMOR_D, [0, 4, 0]);
  tb.box(2, 22, 18, PLATE, [12.5, 20, 0]);
  tb.ball(9, 7, 9, PLATE, [0, 34, -16]);
  tb.ball(9, 7, 9, PLATE, [0, 34, 16]);
  tb.ball(11, 11, 11, ARMOR, [2, 47, 0]); // helmet
  tb.box(5, 7, 16, '#0e1626', [10, 46, 0]); // visor
  tb.box(0.6, 6, 1.2, '#ff9cec', [12.7, 46, 3], [0.6, 0, 0]); // crack
  tb.box(18, 2, 22, ARMOR_D, [1, 54, 0]);
  const tg = tb.build();
  tg.translate(0, 0, 0);
  torso.add(new THREE.Mesh(tg, ink), new THREE.Mesh(tg, mat));
  glows.push({ obj: torso, at: new THREE.Vector3(12.5, 46, 2), size: 12, color: SIGNAL, pulse: 1 });
  glows.push({ obj: torso, at: new THREE.Vector3(-13, 20, 0), size: 8, color: SIGNAL });
  // shield arm (left) and baton arm (right)
  const shield = mount(torso, new Part().limb([0, 28, -16], [10, 14, -22], 5, ARMOR_D).box(5, 52, 30, '#5d6c8c', [16, 10, -24]).box(5.4, 6, 31, '#222a3c', [16, 22, -24]).box(5.6, 3, 10, '#b4c2de', [16.2, 2, -24]), [0, 28, -16], mat, ink);
  const baton = mount(torso, new Part().limb([0, 28, 16], [8, 16, 20], 5, ARMOR_D).limb([8, 16, 20], [16, 18, 20], 4.4, ARMOR_D).cyl(1.6, 1.6, 34, '#1a1d24', [18, 34, 20]).cyl(2.2, 2.2, 5, '#ffd6f6', [18, 52, 20]), [0, 28, 16], mat, ink);
  glows.push({ obj: baton, at: new THREE.Vector3(18, 54, 20), size: 16, color: SIGNAL, pulse: 1 });
  return {
    group,
    mat,
    glows,
    height: 108,
    animate(t, state, phase2) {
      const walk = state === 0 ? Math.sin(t * 2.2) : 0;
      legL.rotation.z = walk * 0.4;
      legR.rotation.z = -walk * 0.4;
      root.position.y = state === 1 ? -4 : state === 3 ? -6 : Math.abs(walk) * 1.5;
      root.position.z = state === 1 ? Math.sin(t * 60) * 0.8 : 0;
      torso.rotation.z = state === 2 ? -0.3 : state === 1 ? 0.08 : 0;
      baton.rotation.z = state === 1 ? 2.0 : state === 3 ? -1.1 : state === 2 ? -0.3 : 0.3 + walk * 0.15;
      shield.rotation.y = state === 2 ? -0.9 : 0;
      shield.position.z = state === 2 ? 14 : -16;
      mat.emissive.setRGB(phase2 ? 0.08 : 0, 0, phase2 ? 0.06 : 0);
    },
  };
}

/** Hive Mother: a bloated queen dragging a glowing brood sac, four arms, crown of antennae. */
function hive(): BossModel {
  const { mat, ink, group } = bossBase();
  const CHITIN = '#8a6aa8', CHITIN_D = '#5a4274', QUEEN = '#c8b6d6';
  const glows: BossModel['glows'] = [];
  const sac = mount(group, new Part().ball(26, 22, 24, CHITIN_D, [-26, 26, 0]).ball(18, 15, 17, '#3c2a52', [-34, 24, 0]), [-8, 24, 0], mat, ink);
  for (let i = 0; i < 7; i++) glows.push({ obj: sac, at: new THREE.Vector3(-30 + Math.cos(i * 1.7) * 14, 30 + Math.sin(i * 2.3) * 12, Math.sin(i * 1.7) * 20), size: 9 + (i % 3) * 3, color: SIGNAL, pulse: 1 });
  const body = new THREE.Object3D();
  group.add(body);
  const b = new Part();
  b.ball(15, 22, 15, QUEEN, [4, 52, 0], [0, 0, -0.15]);
  for (let i = 0; i < 4; i++) b.torus(12 - i * 1.6, 1.4, CHITIN, [3 + i * 1.5, 40 + i * 9, 0], [Math.PI / 2, 0.15, 0]);
  b.ball(10, 9.5, 10, QUEEN, [12, 80, 0]); // head
  b.box(4, 3, 12, '#2a1a3a', [20, 78, 0]);
  for (let i = 0; i < 5; i++) b.cone(1.6, 14, CHITIN_D, [8 + i, 92, (i - 2) * 4], [(i - 2) * 0.35, 0, 0.3]);
  for (let i = 0; i < 4; i++) b.limb([0, 6, (i < 2 ? -1 : 1) * (6 + (i % 2) * 5)], [10, 0, (i < 2 ? -1 : 1) * (14 + (i % 2) * 6)], 2.4, CHITIN_D);
  const bg = b.build();
  body.add(new THREE.Mesh(bg, ink), new THREE.Mesh(bg, mat));
  glows.push({ obj: body, at: new THREE.Vector3(20, 82, 4), size: 7, color: SIGNAL });
  glows.push({ obj: body, at: new THREE.Vector3(20, 82, -4), size: 7, color: SIGNAL });
  for (let i = 0; i < 5; i++) glows.push({ obj: body, at: new THREE.Vector3(10 + i, 99, (i - 2) * 6), size: 5, color: SIGNAL, pulse: 1 });
  const arms: THREE.Object3D[] = [];
  for (let i = 0; i < 4; i++) {
    const side = i % 2 ? 1 : -1;
    const y = i < 2 ? 64 : 50;
    const arm = mount(body, new Part().limb([4, y, side * 13], [16, y - 8, side * 24], 3.2, CHITIN).limb([16, y - 8, side * 24], [30, y - 4, side * 22], 2.6, CHITIN).cone(2, 10, '#efe4f6', [35, y - 4, side * 22], [0, 0, -Math.PI / 2]), [4, y, side * 13], mat, ink);
    arms.push(arm);
  }
  return {
    group,
    mat,
    glows,
    height: 100,
    animate(t, state, phase2) {
      const pulse = Math.sin(t * (phase2 ? 6 : 3));
      sac.scale.setScalar(1 + pulse * 0.05);
      body.rotation.z = Math.sin(t * 1.3) * 0.05 + (state % 3 === 1 ? 0.12 : 0);
      arms.forEach((a, i) => {
        a.rotation.z = Math.sin(t * 2.5 + i * 1.3) * 0.35;
        a.rotation.y = Math.cos(t * 2 + i) * 0.2;
      });
      mat.emissive.setRGB(phase2 ? 0.08 : 0, 0, phase2 ? 0.08 : 0);
    },
  };
}

/** Signal Colossus: a broadcast tower fused onto a giant; the dish on its back is the source. */
function colossus(): BossModel {
  const { mat, ink, group } = bossBase();
  const STEEL = '#6e7686', STEEL_D = '#4e5462', FLESH = '#8fa880', FLESH_D = '#3c4d36';
  const glows: BossModel['glows'] = [];
  const root = new THREE.Object3D();
  group.add(root);
  const leg = (side: number) => mount(root, new Part().limb([0, 34, side * 12], [2, 8, side * 13], 9, FLESH).box(22, 9, 16, STEEL_D, [4, 4.5, side * 13]).ball(8, 7, 9, STEEL, [4, 20, side * 13]), [0, 34, side * 12], mat, ink);
  const legL = leg(-1);
  const legR = leg(1);
  const body = new THREE.Object3D();
  root.add(body);
  const b = new Part();
  b.ball(22, 24, 24, FLESH, [2, 54, 0]);
  b.box(16, 26, 28, STEEL, [10, 54, 0]);
  for (let i = 0; i < 3; i++) b.box(2, 3, 26, STEEL_D, [18.5, 46 + i * 8, 0]);
  b.ball(9, 8.5, 9, FLESH_D, [18, 78, 0]); // head sunk in the shoulders
  b.box(3, 3, 10, '#1a1f26', [26, 79, 0]);
  // tower lattice + dish on the back
  b.box(4, 46, 4, STEEL_D, [-16, 82, 6]);
  b.box(4, 46, 4, STEEL_D, [-16, 82, -6]);
  for (let i = 0; i < 5; i++) b.box(3, 2, 14, STEEL, [-16, 64 + i * 9, 0], [0, 0, 0.0]);
  b.cyl(14, 3, 6, '#b8c0cc', [-22, 100, 0], [0, 0, Math.PI / 2 + 0.5], 14);
  b.cyl(1, 1, 12, STEEL_D, [-16, 106, 0], [0, 0, 0.5]);
  const bg = b.build();
  body.add(new THREE.Mesh(bg, ink), new THREE.Mesh(bg, mat));
  glows.push({ obj: body, at: new THREE.Vector3(-12, 108, 0), size: 22, color: SIGNAL, pulse: 1 });
  glows.push({ obj: body, at: new THREE.Vector3(26, 80, 3), size: 8, color: SIGNAL });
  glows.push({ obj: body, at: new THREE.Vector3(-16, 105, 6), size: 5, color: '#ff3b5c', pulse: 1 });
  const arm = (side: number) =>
    mount(body, new Part().ball(10, 9, 10, STEEL, [0, 66, side * 24]).limb([0, 66, side * 26], [10, 46, side * 30], 7.5, FLESH).limb([10, 46, side * 30], [22, 30, side * 28], 7, FLESH).ball(10, 9, 10, STEEL_D, [25, 26, side * 28]), [0, 66, side * 24], mat, ink);
  const armL = arm(-1);
  const armR = arm(1);
  return {
    group,
    mat,
    glows,
    height: 102,
    animate(t, state, phase2) {
      const walk = Math.sin(t * 1.6);
      legL.rotation.z = walk * 0.3;
      legR.rotation.z = -walk * 0.3;
      root.position.y = Math.abs(walk) * 2;
      const wind = state % 3 === 1;
      armL.rotation.z = wind ? 1.2 : -walk * 0.25;
      armR.rotation.z = wind ? 1.2 : walk * 0.25;
      body.rotation.z = wind ? 0.12 : 0;
      mat.emissive.setRGB(phase2 ? 0.08 : 0, 0, phase2 ? 0.05 : 0);
    },
  };
}

/** The Broadcaster: a gaunt, three-metre radio host with a speaker cone through his chest. */
function broadcaster(): BossModel {
  const { mat, ink, group } = bossBase();
  const SKIN = '#9aa48e', JACKET = '#2f4a52', SHIRT = '#c9c2b0', BRASS = '#c89a46', MIC = '#3a3d44';
  const glows: BossModel['glows'] = [];
  const root = new THREE.Object3D();
  group.add(root);
  const b = new Part();
  b.taper([0, 18, -6], [1, 50, -6], 3.4, 4.4, JACKET); // dangling legs
  b.taper([0, 18, 6], [1, 50, 6], 3.4, 4.4, JACKET);
  b.box(6, 2.4, 4.6, '#1a1d22', [2, 17, -6]);
  b.box(6, 2.4, 4.6, '#1a1d22', [2, 17, 6]);
  b.box(14, 34, 22, JACKET, [0, 68, 0]);
  b.box(2, 30, 10, SHIRT, [7, 68, 0]);
  b.cone(11, 10, BRASS, [9, 70, 0], [0, 0, -Math.PI / 2], 16); // speaker cone
  b.cyl(5, 5, 2, '#14161a', [14, 70, 0], [0, 0, Math.PI / 2], 14);
  b.limb([0, 86, 0], [3, 94, 0], 3, SKIN); // neck
  b.ball(7.5, 9, 7.5, SKIN, [5, 101, 0]);
  b.box(3, 2, 9, '#14161a', [11.5, 99, 0]);
  for (let i = 0; i < 5; i++) b.cyl(0.5, 0.6, 12, BRASS, [3 + i, 115, (i - 2) * 3.5], [(i - 2) * 0.3, 0, 0.1]);
  for (let i = 0; i < 4; i++) b.cyl(0.8, 0.8, 30, '#16181c', [-8, 48, (i - 1.5) * 5], [0, 0, 0.25 + i * 0.05]); // cables
  const bg = b.build();
  root.add(new THREE.Mesh(bg, ink), new THREE.Mesh(bg, mat));
  glows.push({ obj: root, at: new THREE.Vector3(15, 70, 0), size: 26, color: SIGNAL, pulse: 1 });
  glows.push({ obj: root, at: new THREE.Vector3(11, 102, 2.5), size: 5, color: SIGNAL });
  glows.push({ obj: root, at: new THREE.Vector3(11, 102, -2.5), size: 5, color: SIGNAL });
  for (let i = 0; i < 5; i++) glows.push({ obj: root, at: new THREE.Vector3(3 + i, 121.5, (i - 2) * 5), size: 4.5, color: i % 2 ? '#ff3b5c' : SIGNAL, pulse: 1 });
  const mic = mount(root, new Part().limb([0, 82, 12], [8, 70, 15], 3, JACKET).limb([8, 70, 15], [16, 76, 12], 2.6, SKIN).cyl(1.6, 1, 10, MIC, [18, 80, 12], [0, 0, -0.4]).ball(2.6, 2.6, 2.6, '#70747e', [20, 85, 12]), [0, 82, 12], mat, ink);
  const armB = mount(root, new Part().limb([0, 82, -12], [2, 64, -15], 3, JACKET).limb([2, 64, -15], [6, 50, -14], 2.6, SKIN), [0, 82, -12], mat, ink);
  return {
    group,
    mat,
    glows,
    height: 112,
    animate(t, state, phase2) {
      root.position.y = 6 + Math.sin(t * 1.8) * 3; // hovers
      root.rotation.z = Math.sin(t * 1.1) * 0.04;
      mic.rotation.z = state % 3 === 1 ? 0.5 : Math.sin(t * 2) * 0.1;
      armB.rotation.z = Math.sin(t * 1.7) * 0.2;
      mat.emissive.setRGB(phase2 ? 0.1 : 0, 0, phase2 ? 0.07 : 0);
    },
  };
}

export const BOSS_BUILDERS: Record<string, () => BossModel> = { warden, hive, colossus, broadcaster };
export { INKC };
