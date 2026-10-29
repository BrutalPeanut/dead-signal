import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SLOTS, type Part } from './kit3d';

/**
 * Sculpted parts for the horde: each body part is one continuous, smooth-shaded mesh deformed
 * from a sphere or a tapered capsule, instead of a pile of overlapping primitives. Surface detail
 * (sockets, teeth, wounds, torn cloth, ribs, rot, occlusion) is painted into vertex colours, so it
 * costs nothing at draw time. Output merges with the kit's Part primitives.
 */

type V3 = [number, number, number];

/** What a vertex looks like: a palette slot ('$skin', ...) or a fixed colour, and a light multiplier. */
export interface Ink {
  col: string;
  shade?: number;
}
/** p: the vertex in the part's unit space (before scale/placement), n: its smooth normal. */
export type Paint = (p: THREE.Vector3, n: THREE.Vector3) => Ink;

// ------------------------------------------------------------------ noise

function hash3(x: number, y: number, z: number) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}
/** Smooth 3D value noise in 0..1. */
export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const L = (a: number, b: number, t: number) => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number) => hash3(xi + dx, yi + dy, zi + dz);
  return L(
    L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v),
    L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  );
}
export const fbm = (x: number, y: number, z: number) => noise3(x, y, z) * 0.65 + noise3(x * 2.3 + 7, y * 2.3, z * 2.3) * 0.35;

// ------------------------------------------------------------------ building

const tmpC = new THREE.Color();
const tmpV = new THREE.Vector3();
const tmpN = new THREE.Vector3();

/**
 * Deform an indexed unit-space geometry, smooth its normals, paint it, then place it and add it
 * to a Part. Normals are computed after deforming, so bulges and dents shade correctly.
 */
function finish(part: Part, g: THREE.BufferGeometry, deform: ((v: THREE.Vector3) => void) | undefined, paint: Paint, scale: V3, at: V3, rot: V3 = [0, 0, 0]) {
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-4);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const unit = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    tmpV.fromBufferAttribute(pos, i);
    unit[i * 3] = tmpV.x;
    unit[i * 3 + 1] = tmpV.y;
    unit[i * 3 + 2] = tmpV.z;
    deform?.(tmpV);
    pos.setXYZ(i, tmpV.x * scale[0], tmpV.y * scale[1], tmpV.z * scale[2]);
  }
  g.computeVertexNormals();
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  const slot = new Float32Array(pos.count);
  const shade = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    tmpV.set(unit[i * 3], unit[i * 3 + 1], unit[i * 3 + 2]);
    tmpN.fromBufferAttribute(nrm, i);
    const ink = paint(tmpV, tmpN);
    const sl = SLOTS[ink.col] ?? 0;
    tmpC.set(sl ? '#ffffff' : ink.col);
    col[i * 3] = tmpC.r;
    col[i * 3 + 1] = tmpC.g;
    col[i * 3 + 2] = tmpC.b;
    slot[i] = sl;
    shade[i] = ink.shade ?? 1;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('slot', new THREE.BufferAttribute(slot, 1));
  g.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
  g.applyMatrix4(
    new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)),
  );
  // non-indexed to match the kit's primitives (attributes still interpolate smoothly)
  part.list.push(g.toNonIndexed());
}

/** A sculpted ellipsoid: unit sphere → deform → scale by s, placed at `at`. */
export function blob(part: Part, o: { s: V3; at: V3; rot?: V3; seg?: [number, number]; deform?: (v: THREE.Vector3) => void; paint: Paint }) {
  const [w, h] = o.seg ?? [16, 12];
  finish(part, new THREE.SphereGeometry(1, w, h), o.deform, o.paint, o.s, o.at, o.rot);
}

/**
 * A tapered limb hanging from the origin down -Y for `len`, radius r × taper(t) (t: 0 top → 1
 * bottom), rounded at both ends. In paint, p.y runs 0 (top) → -1 (bottom); p.x/p.z are the
 * unit radial direction (x = front).
 */
export function limb(part: Part, o: { r: number; len: number; taper?: (t: number) => number; radial?: number; at?: V3; rot?: V3; dir?: V3; paint: Paint }) {
  const g = new THREE.CapsuleGeometry(1, 1, 2, o.radial ?? 8);
  const taper = o.taper ?? (() => 1);
  // CapsuleGeometry(1, 1): body spans y ∈ [-0.5, 0.5], hemispherical caps beyond it
  const tOf = (y: number) => (y > 0.5 ? 0 : y < -0.5 ? 1 : 0.5 - y);
  finish(
    part,
    g,
    (v) => {
      const t = tOf(v.y);
      const k = o.r * taper(t);
      const y = v.y > 0.5 ? (v.y - 0.5) * k : v.y < -0.5 ? -o.len + (v.y + 0.5) * k : -t * o.len;
      v.set(v.x * k, y, v.z * k);
    },
    (p, n) => o.paint(tmpP.set(p.x, -tOf(p.y), p.z), n),
    [1, 1, 1],
    o.at ?? [0, 0, 0],
    o.dir ? dirToEuler(o.dir) : o.rot,
  );
}
/** Euler rotation that points the limb (which hangs down -Y) along `dir`. */
function dirToEuler(dir: V3): V3 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(...dir).normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z];
}
const tmpP = new THREE.Vector3();
