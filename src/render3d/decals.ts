import * as THREE from 'three';
import { SPLAT_SCALE, SPLAT_SIZE, splat } from '../render/blood';

/** Splat variants used in 3D (a subset of the 2D pool, packed 4×2 into one atlas per colour). */
const VARIANTS = 8;
const COLS = 4;
const ROWS = 2;
const MAX = 200;

interface Layer {
  mesh: THREE.InstancedMesh;
  off: THREE.InstancedBufferAttribute;
  alpha: THREE.InstancedBufferAttribute;
  n: number;
}

export interface DecalLike {
  x: number;
  y: number;
  r: number;
  color: string;
  life: number;
  rot: number;
  v?: number;
  sy?: number;
}

/**
 * Blood splats on the floor, using the 2D renderer's splat sprites. One instanced draw per
 * blood colour (each colour's variants share an atlas), instead of one draw per splat.
 */
export class Decals {
  readonly group = new THREE.Group();
  private layers = new Map<string, Layer>();
  private geo: THREE.PlaneGeometry;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor() {
    // anchored like the 2D sprite: 42% from the left edge, lying flat on the floor
    this.geo = new THREE.PlaneGeometry(1, 1);
    this.geo.translate(0.08, 0, 0);
    this.geo.rotateX(-Math.PI / 2);
  }

  private layer(color: string): Layer {
    let l = this.layers.get(color);
    if (l) return l;
    const c = document.createElement('canvas');
    c.width = SPLAT_SIZE * COLS;
    c.height = SPLAT_SIZE * ROWS;
    const x = c.getContext('2d')!;
    for (let v = 0; v < VARIANTS; v++) x.drawImage(splat(color, v), (v % COLS) * SPLAT_SIZE, Math.floor(v / COLS) * SPLAT_SIZE);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.NoColorSpace;
    const off = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2).setUsage(THREE.DynamicDrawUsage);
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(MAX), 1).setUsage(THREE.DynamicDrawUsage);
    const g = this.geo.clone();
    g.setAttribute('iOff', off);
    g.setAttribute('iAlpha', alpha);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex } },
      vertexShader: /* glsl */ `attribute vec2 iOff; attribute float iAlpha; varying vec2 vUv; varying float vA;
        void main(){ vUv = (uv + iOff) * vec2(${(1 / COLS).toFixed(4)}, ${(1 / ROWS).toFixed(4)}); vA = iAlpha;
          gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform sampler2D map; varying vec2 vUv; varying float vA;
        void main(){ vec4 c = texture2D(map, vUv); float a = c.a * vA; if (a < 0.01) discard; gl_FragColor = vec4(c.rgb * a, a); }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.InstancedMesh(g, mat, MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.renderOrder = 0;
    mesh.count = 0;
    this.group.add(mesh);
    l = { mesh, off, alpha, n: 0 };
    this.layers.set(color, l);
    return l;
  }

  update(decals: DecalLike[]) {
    for (const l of this.layers.values()) l.n = 0;
    for (const d of decals) {
      if (d.v === undefined) continue;
      const l = this.layer(d.color);
      if (l.n >= MAX) continue;
      const i = l.n++;
      const S = d.r * SPLAT_SCALE * SPLAT_SIZE;
      this.q.setFromEuler(this.e.set(0, -d.rot, 0));
      this.m4.compose(this.p.set(d.x, 0.25 + (i % 16) * 0.004, d.y), this.q, this.s.set(S, 1, S * (d.sy ?? 0.8)));
      l.mesh.setMatrixAt(i, this.m4);
      const v = ((d.v % VARIANTS) + VARIANTS) % VARIANTS;
      // texture rows count from the bottom in UV space
      l.off.setXY(i, v % COLS, ROWS - 1 - Math.floor(v / COLS));
      l.alpha.setX(i, Math.min(1, d.life / 3) * 0.82);
    }
    for (const l of this.layers.values()) {
      l.mesh.count = l.n;
      l.mesh.instanceMatrix.needsUpdate = true;
      l.off.needsUpdate = true;
      l.alpha.needsUpdate = true;
    }
  }
}
