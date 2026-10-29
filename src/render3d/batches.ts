import * as THREE from 'three';

/**
 * Dynamic geometry batches, rebuilt every frame. They carry everything that is cheap to describe
 * but numerous: glows, sparks, beams, ground rings, telegraphs, shadows. One draw call each.
 * Colours are given as sRGB 0..1, converted to linear in the shader, and pass through the same
 * output conversion as the rest of the scene (so bloom and tone mapping treat them correctly).
 */

/** Shared HDR boost for additive light: raised when bloom is on so hot cores spill into a halo. */
export const GLOW = { uBoost: { value: 1 }, uGain: { value: 1 } };

export type Blend = 'add' | 'alpha';

function blendInto(m: THREE.ShaderMaterial, mode: Blend) {
  m.blending = THREE.CustomBlending;
  m.blendEquation = THREE.AddEquation;
  m.blendSrc = THREE.OneFactor;
  m.blendDst = mode === 'add' ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor;
  m.transparent = true;
  m.depthWrite = false;
}

/** Upload only the part of a dynamic buffer that was written this frame. */
function touch(a: THREE.BufferAttribute, items: number) {
  a.clearUpdateRanges();
  a.addUpdateRange(0, Math.max(1, items * a.itemSize));
  a.needsUpdate = true;
}

// ------------------------------------------------------------------ point sprites

/** Camera-facing glows sized in world units. 'glow' has a white-hot core; 'soft' is a plain soft disc. */
export class GlowBatch {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private n = 0;
  readonly mat: THREE.ShaderMaterial;

  constructor(readonly cap: number, mode: Blend, kind: 'glow' | 'soft') {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 }, uBoost: GLOW.uBoost, uGain: GLOW.uGain },
      vertexShader: /* glsl */ `
        attribute vec4 col; attribute float size; uniform float uScale; varying vec4 vCol;
        void main(){ vCol = col; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mv;
          gl_PointSize = max(1.0, size * uScale / -mv.z); }`,
      fragmentShader:
        kind === 'glow'
          ? /* glsl */ `varying vec4 vCol; uniform float uBoost; uniform float uGain;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float a = d < 0.18 ? 1.0 : d < 0.45 ? mix(1.0, 0.35, (d - 0.18) / 0.27) : mix(0.35, 0.0, (d - 0.45) / 0.55);
          vec3 c = mix(pow(vCol.rgb, vec3(2.2)), vec3(1.0), smoothstep(0.2, 0.0, d)) * mix(1.0, uBoost, smoothstep(0.45, 0.0, d));
          float al = a * vCol.a; gl_FragColor = vec4(c * al * uGain, al);
          #include <colorspace_fragment>
        }`
          : /* glsl */ `varying vec4 vCol;
        void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard;
          float al = smoothstep(1.0, 0.55, d) * vCol.a; gl_FragColor = vec4(pow(vCol.rgb, vec3(2.2)) * al, al);
          #include <colorspace_fragment>
        }`,
    });
    blendInto(this.mat, mode);
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }

  setScale(viewportH: number, fovDeg: number) {
    this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  begin() {
    this.n = 0;
  }

  /** size = diameter in world units. */
  add(x: number, y: number, z: number, size: number, c: [number, number, number], a = 1) {
    if (this.n >= this.cap || a <= 0.003) return;
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c[0];
    this.col[i * 4 + 1] = c[1];
    this.col[i * 4 + 2] = c[2];
    this.col[i * 4 + 3] = a;
    this.size[i] = size;
  }

  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    touch(g.attributes.position as THREE.BufferAttribute, this.n);
    touch(g.attributes.col as THREE.BufferAttribute, this.n);
    touch(g.attributes.size as THREE.BufferAttribute, this.n);
  }
}

// ------------------------------------------------------------------ triangles

/** Generic coloured-triangle batch. Ribbons face the camera; flat shapes lie on the ground. */
export class TriBatch {
  readonly mesh: THREE.Mesh;
  private pos: Float32Array;
  private col: Float32Array;
  private n = 0; // vertices
  /** Normalised camera forward vector, used to orient ribbons toward the viewer. */
  view = new THREE.Vector3(0, -1, -1).normalize();

  constructor(readonly cap: number, mode: Blend) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('col', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const m = new THREE.ShaderMaterial({
      uniforms: { uGain: mode === 'add' ? GLOW.uGain : { value: 1 } },
      vertexShader: /* glsl */ `attribute vec4 col; varying vec4 vCol;
        void main(){ vCol = col; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `varying vec4 vCol; uniform float uGain;
        void main(){ gl_FragColor = vec4(pow(vCol.rgb, vec3(2.2)) * vCol.a * uGain, vCol.a);
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide,
    });
    blendInto(m, mode);
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
  }

  begin() {
    this.n = 0;
  }

  end() {
    const g = this.mesh.geometry;
    g.setDrawRange(0, this.n);
    touch(g.attributes.position as THREE.BufferAttribute, this.n);
    touch(g.attributes.col as THREE.BufferAttribute, this.n);
  }

  private v(x: number, y: number, z: number, c: ArrayLike<number>, a: number) {
    const i = this.n++;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.col[i * 4] = c[0];
    this.col[i * 4 + 1] = c[1];
    this.col[i * 4 + 2] = c[2];
    this.col[i * 4 + 3] = a;
  }

  private room(verts: number) {
    return this.n + verts <= this.cap;
  }

  /** Raw triangle with per-vertex alpha. */
  tri(
    ax: number, ay: number, az: number, aa: number,
    bx: number, by: number, bz: number, ba: number,
    cx: number, cy: number, cz: number, ca: number,
    c: ArrayLike<number>,
  ) {
    if (!this.room(3)) return;
    this.v(ax, ay, az, c, aa);
    this.v(bx, by, bz, c, ba);
    this.v(cx, cy, cz, c, ca);
  }

  // ---- flat (ground-plane) shapes; sim coords: x → X, y → Z

  /** Filled disc with a radial alpha gradient (centre alpha a0, rim alpha a1). */
  disc(x: number, z: number, r: number, h: number, c: ArrayLike<number>, a0: number, a1 = a0, seg = 28) {
    if (r <= 0 || !this.room(seg * 3)) return;
    for (let i = 0; i < seg; i++) {
      const t0 = (i / seg) * Math.PI * 2;
      const t1 = ((i + 1) / seg) * Math.PI * 2;
      this.tri(x, h, z, a0, x + Math.cos(t0) * r, h, z + Math.sin(t0) * r, a1, x + Math.cos(t1) * r, h, z + Math.sin(t1) * r, a1, c);
    }
  }

  /** Annulus band between radii, optional arc, with inner/outer alpha. */
  band(x: number, z: number, r0: number, r1: number, h: number, c: ArrayLike<number>, aIn: number, aOut = aIn, a0 = 0, a1 = Math.PI * 2, seg = 36) {
    if (r1 <= 0 || !this.room(seg * 6)) return;
    r0 = Math.max(0, r0);
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + ((a1 - a0) * i) / seg;
      const t1 = a0 + ((a1 - a0) * (i + 1)) / seg;
      const c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
      this.tri(x + c0 * r0, h, z + s0 * r0, aIn, x + c0 * r1, h, z + s0 * r1, aOut, x + c1 * r1, h, z + s1 * r1, aOut, c);
      this.tri(x + c0 * r0, h, z + s0 * r0, aIn, x + c1 * r1, h, z + s1 * r1, aOut, x + c1 * r0, h, z + s1 * r0, aIn, c);
    }
  }

  /** Rectangle from (x,z) along angle a for len, half-width w. */
  rect(x: number, z: number, a: number, len: number, w: number, h: number, c: ArrayLike<number>, alpha: number, alphaEnd = alpha) {
    if (!this.room(6)) return;
    const dx = Math.cos(a), dz = Math.sin(a), nx = -dz * w, nz = dx * w;
    const ex = x + dx * len, ez = z + dz * len;
    this.tri(x + nx, h, z + nz, alpha, ex + nx, h, ez + nz, alphaEnd, ex - nx, h, ez - nz, alphaEnd, c);
    this.tri(x + nx, h, z + nz, alpha, ex - nx, h, ez - nz, alphaEnd, x - nx, h, z - nz, alpha, c);
  }

  /** Rectangle outline. */
  rectLine(x: number, z: number, a: number, len: number, w: number, h: number, lw: number, c: ArrayLike<number>, alpha: number) {
    const dx = Math.cos(a), dz = Math.sin(a), nx = -dz, nz = dx;
    this.rect(x + nx * w, z + nz * w, a, len, lw / 2, h, c, alpha);
    this.rect(x - nx * w, z - nz * w, a, len, lw / 2, h, c, alpha);
    this.rect(x - nx * w, z - nz * w, a + Math.PI / 2, w * 2, lw / 2, h, c, alpha);
    this.rect(x + dx * len - nx * w, z + dz * len - nz * w, a + Math.PI / 2, w * 2, lw / 2, h, c, alpha);
  }

  // ---- camera-facing ribbons (3D polylines)

  private side = new THREE.Vector3();
  private dir = new THREE.Vector3();

  /** One camera-facing segment with width w (world units). */
  seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, w: number, c: ArrayLike<number>, a0: number, a1 = a0) {
    if (!this.room(6)) return;
    this.dir.set(x1 - x0, y1 - y0, z1 - z0);
    if (this.dir.lengthSq() < 1e-6) return;
    this.side.crossVectors(this.dir, this.view).normalize().multiplyScalar(w / 2);
    const sx = this.side.x, sy = this.side.y, sz = this.side.z;
    this.tri(x0 + sx, y0 + sy, z0 + sz, a0, x1 + sx, y1 + sy, z1 + sz, a1, x1 - sx, y1 - sy, z1 - sz, a1, c);
    this.tri(x0 + sx, y0 + sy, z0 + sz, a0, x1 - sx, y1 - sy, z1 - sz, a1, x0 - sx, y0 - sy, z0 - sz, a0, c);
  }

  /** Polyline at constant height; pts are sim [x, y, x, y, ...]. */
  line(pts: ArrayLike<number>, h: number, w: number, c: ArrayLike<number>, a: number) {
    for (let i = 2; i < pts.length; i += 2) this.seg(pts[i - 2], h, pts[i - 1], pts[i], h, pts[i + 1], w, c, a);
  }
}
