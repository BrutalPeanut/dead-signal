import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Low-poly modelling kit for the 3D renderer. Every character is built in code (like the 2D art),
 * as merged, vertex-coloured primitives so a whole body part is one geometry and one draw call.
 * World units match the sim: 1 unit = 1 sim unit, sim (x, y) maps to world (x, 0, y), +Y is up.
 */

export const INK = '#0f0a12';
export const SIGNAL = '#ff3bd4';

const tmpC = new THREE.Color();

/**
 * Palette slots: a colour of '$skin', '$skinD', '$shirt' or '$pants' marks the vertices so the
 * crowd shader can recolour them per instance (variants without extra geometry or draw calls).
 */
export const SLOTS: Record<string, number> = { $skin: 1, $skinD: 2, $shirt: 3, $pants: 4 };

/** Paint a flat colour into a geometry's vertex colour attribute (non-destructive copy). */
export function tint(geo: THREE.BufferGeometry, color: string): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  const slot = SLOTS[color] ?? 0;
  tmpC.set(slot ? '#ffffff' : color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = tmpC.r;
    arr[i * 3 + 1] = tmpC.g;
    arr[i * 3 + 2] = tmpC.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.setAttribute('slot', new THREE.BufferAttribute(new Float32Array(n).fill(slot), 1));
  // per-vertex light multiplier (baked occlusion / painted shading); 1 = unchanged
  g.setAttribute('shade', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
  // uv attributes are dropped so every part merges cleanly
  g.deleteAttribute('uv');
  return g;
}

type V3 = [number, number, number];

function place(g: THREE.BufferGeometry, pos: V3, rot: V3 = [0, 0, 0], scl: V3 = [1, 1, 1]) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')),
    new THREE.Vector3(...scl),
  );
  g.applyMatrix4(m);
  return g;
}

let DETAIL = 1;
/** Build with finer tessellation (the hero, bosses and pickups are few, so they can afford it). */
export function detailed<T>(k: number, fn: () => T): T {
  const prev = DETAIL;
  DETAIL = k;
  try {
    return fn();
  } finally {
    DETAIL = prev;
  }
}
const sd = (n: number) => Math.max(3, Math.round(n * DETAIL));

/** A list of coloured primitives that becomes one merged geometry. */
export class Part {
  list: THREE.BufferGeometry[] = [];
  box(w: number, h: number, d: number, col: string, pos: V3, rot?: V3) {
    this.list.push(place(tint(new THREE.BoxGeometry(w, h, d), col), pos, rot));
    return this;
  }
  /** Ellipsoid. */
  ball(rx: number, ry: number, rz: number, col: string, pos: V3, rot?: V3, seg = 7) {
    this.list.push(place(tint(new THREE.SphereGeometry(1, sd(seg), sd(Math.max(4, seg - 2))), col), pos, rot, [rx, ry, rz]));
    return this;
  }
  cyl(rTop: number, rBot: number, h: number, col: string, pos: V3, rot?: V3, seg = 8) {
    this.list.push(place(tint(new THREE.CylinderGeometry(rTop, rBot, h, sd(seg)), col), pos, rot));
    return this;
  }
  cone(r: number, h: number, col: string, pos: V3, rot?: V3, seg = 6) {
    this.list.push(place(tint(new THREE.ConeGeometry(r, h, sd(seg)), col), pos, rot));
    return this;
  }
  torus(r: number, tube: number, col: string, pos: V3, rot?: V3, arc = Math.PI * 2) {
    this.list.push(place(tint(new THREE.TorusGeometry(r, tube, sd(5), sd(14), arc), col), pos, rot));
    return this;
  }
  /** Capsule limb between two points, radius r. */
  limb(a: V3, b: V3, r: number, col: string) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = tint(new THREE.CapsuleGeometry(r, Math.max(0.01, len), sd(2), sd(6)), col);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    this.list.push(g);
    return this;
  }
  /** Tapered limb: cylinder from radius r1 at a to r2 at b, with ball joints. */
  taper(a: V3, b: V3, r1: number, r2: number, col: string) {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const len = va.distanceTo(vb);
    const g = tint(new THREE.CylinderGeometry(r2, r1, Math.max(0.01, len), sd(7)), col);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(va.clone().add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    this.list.push(g);
    this.ball(r1, r1, r1, col, a, undefined, 6);
    this.ball(r2, r2, r2, col, b, undefined, 6);
    return this;
  }
  add(p: Part) {
    this.list.push(...p.list);
    return this;
  }
  build(): THREE.BufferGeometry {
    // primitives keep their own smooth normals (applyMatrix4 transforms them), which keeps the
    // shading soft and the outline hull closed
    const g = mergeGeometries(this.list, false)!;
    g.computeBoundingSphere();
    return g;
  }
}

let gradient: THREE.DataTexture | null = null;
/** Three-step cel ramp so characters read like the inked 2D art. */
export function toonRamp() {
  if (gradient) return gradient;
  const d = new Uint8Array([78, 78, 78, 255, 140, 140, 140, 255, 205, 205, 205, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

/**
 * Shared rim light: a cool fresnel edge on every character, like the 2D art's rim highlight.
 * The renderer retunes it per biome.
 */
export const RIM = {
  uRimColor: { value: new THREE.Color('#9fdcff') },
  uRimStrength: { value: 0.55 },
};

export function toonMat(opts: THREE.MeshToonMaterialParameters = {}) {
  const m = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), ...opts });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimColor = RIM.uRimColor;
    sh.uniforms.uRimStrength = RIM.uRimStrength;
    sh.fragmentShader = 'uniform vec3 uRimColor;\nuniform float uRimStrength;\n' + sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      `{ vec3 V = normalize(vViewPosition); float f = 1.0 - clamp(dot(normal, V), 0.0, 1.0);
         float rim = smoothstep(0.55, 0.95, f) * uRimStrength; outgoingLight += uRimColor * rim * (0.35 + 0.65 * diffuseColor.rgb); }
       #include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'toonrim';
  return m;
}

/** Inverted-hull ink outline: back faces pushed out along normals, drawn in near-black. */
export function outlineMat(width: number, color = INK) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: width };
    sh.vertexShader = 'uniform float uOutline;\n' + sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = vec3(position) + normalize(normal) * uOutline;');
  };
  m.customProgramCacheKey = () => 'outline' + width;
  return m;
}

/** Parse '#rrggbb' to 0..1 sRGB components (for custom shaders that output sRGB directly). */
export function rgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
}
const rgbCache = new Map<string, [number, number, number]>();
export function rgbC(hex: string) {
  let v = rgbCache.get(hex);
  if (!v) {
    v = hex.startsWith('#') ? rgb(hex) : parseRgba(hex);
    rgbCache.set(hex, v);
  }
  return v;
}
function parseRgba(s: string): [number, number, number] {
  const m = s.match(/[\d.]+/g);
  if (!m) return [1, 1, 1];
  return [+m[0] / 255, +m[1] / 255, +m[2] / 255];
}

/** Radial white→transparent texture for glows and soft discs. */
export function radialTexture(stops: [number, number][] = [[0, 1], [0.18, 0.9], [0.45, 0.35], [1, 0]], size = 64) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, a] of stops) g.addColorStop(o, `rgba(255,255,255,${a})`);
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

/** Viewport size in CSS px for screen-space outlines; the renderer updates it on resize. */
export const OUTLINE_RES = { value: new THREE.Vector2(1, 1) };

/**
 * Screen-space ink outline (inverted hull pushed out in clip space): a constant `px` thick on
 * screen whatever the zoom or bone scale, like the 2D art's ink line. Works on skinned meshes.
 */
export function screenOutlineMat(px: number, color = INK) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPx = { value: px };
    sh.uniforms.uRes = OUTLINE_RES;
    sh.vertexShader = 'uniform float uPx;\nuniform vec2 uRes;\n' + sh.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
       {
       #ifdef USE_SKINNING
         vec3 vn = normalize(transformedNormal);
       #else
         vec3 vn = normalize(normalMatrix * normal);
       #endif
         vec2 cn = (projectionMatrix * vec4(vn, 0.0)).xy;
         float l = length(cn);
         if (l > 1e-5) gl_Position.xy += cn / l * uPx * 2.0 / uRes * gl_Position.w;
       }`,
    );
  };
  m.customProgramCacheKey = () => 'soutline' + px;
  return m;
}
