import * as THREE from 'three';
import type { Biome } from '../sim/chapters';
import { Rng } from '../sim/math';
import { CHUNK, Ground } from '../render/ground';
import { Part, detailed, toonMat } from './kit3d';

/** Per-biome lighting and atmosphere. */
export interface Atmos {
  bg: string;
  sky: string;
  floor: string;
  hemi: number;
  sun: string;
  sunI: number;
  fogNear: number;
  /** Character rim-light colour. */
  rim: string;
  /** Dark floors use the brighter infected palette so the horde doesn't melt into them. */
  darkFloor: boolean;
  /** Ambient weather drifting through the frame. */
  weather: 'rain' | 'spores' | 'dust' | 'embers';
  weatherCol: string;
}

export const ATMOS: Record<Biome, Atmos> = {
  downtown: { bg: '#121419', sky: '#b8c4dc', floor: '#2a2230', hemi: 1.45, sun: '#ffd2a0', sunI: 2.1, fogNear: 0.9, rim: '#8fd4ff', darkFloor: true, weather: 'rain', weatherCol: '#9fb4d8' },
  biolab: { bg: '#3a4249', sky: '#e8f2f6', floor: '#5a646c', hemi: 1.25, sun: '#ffffff', sunI: 1.6, fogNear: 0.95, rim: '#bff6e6', darkFloor: false, weather: 'spores', weatherCol: '#9dff4a' },
  spaceport: { bg: '#0d1016', sky: '#a8c0e0', floor: '#1c2230', hemi: 1.45, sun: '#cfe4ff', sunI: 2.0, fogNear: 0.9, rim: '#7fc8ff', darkFloor: true, weather: 'dust', weatherCol: '#cfd8e8' },
  reactor: { bg: '#090d0c', sky: '#a8d8c8', floor: '#14201c', hemi: 1.45, sun: '#d8ffe8', sunI: 1.9, fogNear: 0.9, rim: '#7dffcf', darkFloor: true, weather: 'embers', weatherCol: '#43ffa4' },
};

export interface StaticGlow {
  x: number;
  y: number;
  z: number;
  size: number;
  color: string;
}

interface Chunk {
  key: string;
  floor: THREE.Mesh;
  props: THREE.Mesh | null;
  ink: THREE.Mesh | null;
  glows: StaticGlow[];
  tex: THREE.CanvasTexture;
}

const TEX_SCALE = 2;
const BUMP: Record<Biome, number> = { downtown: 1.6, biolab: 0.9, spaceport: 1.4, reactor: 1.8 };

/**
 * Infinite floor: the 2D renderer's painted floor tiles become textures on 3D ground chunks,
 * so each sector keeps its exact floor art. Low props (rubble, barrels, vents) sit on top for depth.
 * Props are purely decorative and kept low, since the sim has no obstacles.
 */
export class World {
  readonly group = new THREE.Group();
  private ground: Ground;
  private chunks = new Map<string, Chunk>();
  private propMat = toonMat();
  private inkMat: THREE.Material;
  private floorGeo = new THREE.PlaneGeometry(CHUNK, CHUNK);
  glows: StaticGlow[] = [];

  constructor(readonly biome: Biome, private anisotropy: number, inkMat: THREE.Material) {
    this.ground = new Ground(biome);
    this.inkMat = inkMat;
  }

  /** Keep chunks covering the given sim-space rectangle. */
  update(x0: number, y0: number, x1: number, y1: number) {
    const cx0 = Math.floor(x0 / CHUNK), cx1 = Math.floor(x1 / CHUNK);
    const cy0 = Math.floor(y0 / CHUNK), cy1 = Math.floor(y1 / CHUNK);
    const want = new Set<string>();
    for (let cx = cx0; cx <= cx1; cx++)
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = cx + ',' + cy;
        want.add(k);
        if (!this.chunks.has(k)) this.chunks.set(k, this.make(cx, cy, k));
      }
    for (const [k, c] of this.chunks) {
      if (want.has(k)) continue;
      this.group.remove(c.floor);
      if (c.props) this.group.remove(c.props, c.ink!);
      c.tex.dispose();
      c.props?.geometry.dispose();
      this.chunks.delete(k);
    }
    this.glows.length = 0;
    for (const c of this.chunks.values()) for (const g of c.glows) this.glows.push(g);
  }

  dispose() {
    for (const c of this.chunks.values()) {
      c.tex.dispose();
      c.props?.geometry.dispose();
    }
    this.chunks.clear();
    this.group.clear();
  }

  private make(cx: number, cy: number, key: string): Chunk {
    // copy the painted tile: Ground recycles its canvas cache, a texture needs its own
    const src = this.ground.chunkCanvas(cx, cy, TEX_SCALE);
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    c.getContext('2d')!.drawImage(src, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = this.anisotropy;
    // the painted tile doubles as its own bump map: grates, seams and cracks catch the light
    const floor = new THREE.Mesh(
      this.floorGeo,
      new THREE.MeshStandardMaterial({ map: tex, bumpMap: tex, bumpScale: BUMP[this.biome], roughness: 0.8, metalness: 0.1 }),
    );
    floor.receiveShadow = true;
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx * CHUNK + CHUNK / 2, 0, cy * CHUNK + CHUNK / 2);
    this.group.add(floor);
    const glows: StaticGlow[] = [];
    const p = new Part();
    const rng = new Rng(((cx * 92837111) ^ (cy * 689287499) ^ 0x51ed) >>> 0);
    const n = rng.int(3, 7);
    detailed(1.6, () => {
      for (let i = 0; i < n; i++) PROPS[this.biome](p, rng, cx * CHUNK + rng.range(16, CHUNK - 16), cy * CHUNK + rng.range(16, CHUNK - 16), glows);
    });
    let props: THREE.Mesh | null = null;
    let ink: THREE.Mesh | null = null;
    if (p.list.length) {
      const g = p.build();
      props = new THREE.Mesh(g, this.propMat);
      props.castShadow = true;
      props.receiveShadow = true;
      ink = new THREE.Mesh(g, this.inkMat);
      this.group.add(ink, props);
    }
    return { key, floor, props, ink, glows, tex };
  }
}

type PropFn = (p: Part, rng: Rng, x: number, z: number, glows: StaticGlow[]) => void;

function rubble(p: Part, rng: Rng, x: number, z: number, cols: string[]) {
  const k = rng.int(3, 6);
  for (let i = 0; i < k; i++) {
    const s = rng.range(2, 6);
    p.box(s * rng.range(0.8, 1.6), s * 0.7, s, rng.pick(cols), [x + rng.range(-9, 9), s * 0.3, z + rng.range(-9, 9)], [rng.range(-0.3, 0.3), rng.range(0, 3), rng.range(-0.3, 0.3)]);
  }
}

const PROPS: Record<Biome, PropFn> = {
  downtown(p, rng, x, z, glows) {
    const r = rng.next();
    if (r < 0.35) rubble(p, rng, x, z, ['#4a4d55', '#3a3d44', '#5a5e68']);
    else if (r < 0.55) {
      // traffic cone, sometimes knocked over
      const down = rng.chance(0.4);
      p.cone(3.4, 10, '#ff7a1a', [x, down ? 3 : 5, z], down ? [Math.PI / 2, 0, rng.range(0, 3)] : [0, 0, 0]);
      if (!down) {
        p.box(8, 1.2, 8, '#2a2a2e', [x, 0.6, z]);
        p.cyl(2.1, 2.6, 1.6, '#f2f2f2', [x, 5, z]);
      }
    } else if (r < 0.75) {
      // concrete jersey barrier segment
      const a = rng.range(0, Math.PI);
      p.box(22, 7, 6, '#8a8e96', [x, 3.5, z], [0, a, 0]);
      p.box(22.2, 1.6, 6.2, '#ffcf2a', [x, 5.4, z], [0, a, 0]);
    } else if (r < 0.88) {
      p.torus(4, 1.8, '#18181c', [x, 1.8, z], [Math.PI / 2, 0, 0]);
    } else {
      // dead street light on the floor, its bulb still flickering
      const a = rng.range(0, Math.PI * 2);
      p.cyl(0.8, 1, 34, '#3a3d44', [x, 1, z], [Math.PI / 2, 0, a]);
      const bx = x + Math.sin(a) * 17;
      const bz = z - Math.cos(a) * 17;
      p.box(4, 2, 6, '#5a5e68', [bx, 1.2, bz]);
      glows.push({ x: bx, y: 2.5, z: bz, size: 14, color: '#ffcf7a' });
    }
  },
  biolab(p, rng, x, z, glows) {
    const r = rng.next();
    if (r < 0.35) {
      // hazard drum
      p.cyl(3.6, 3.6, 10, '#e6c63a', [x, 5, z]);
      p.cyl(3.7, 3.7, 1, '#2a2d33', [x, 7.5, z]);
      p.cyl(3.7, 3.7, 1, '#2a2d33', [x, 2.5, z]);
    } else if (r < 0.6) {
      // tipped lab crate
      p.box(12, 7, 9, '#e2e6ea', [x, 3.5, z], [0, rng.range(0, 3), 0]);
      p.box(12.2, 1.2, 9.2, '#43c0a0', [x, 5.5, z], [0, rng.range(0, 3), 0]);
    } else if (r < 0.8) {
      rubble(p, rng, x, z, ['#9aa4ad', '#c3cbd3', '#7a848d']);
    } else {
      // broken specimen tube leaking glow
      p.cyl(4.5, 4.5, 1.4, '#5a646c', [x, 0.7, z]);
      p.cyl(3.6, 3.6, 5, '#9de8d8', [x, 3, z]);
      glows.push({ x, y: 4, z, size: 18, color: '#7dffcf' });
    }
  },
  spaceport(p, rng, x, z, glows) {
    const r = rng.next();
    if (r < 0.35) {
      const a = rng.range(0, 3);
      p.box(14, 8, 10, '#4a5468', [x, 4, z], [0, a, 0]);
      p.box(14.2, 1.4, 10.2, '#ff7a1a', [x, 6, z], [0, a, 0]);
    } else if (r < 0.6) {
      // runway light
      p.cyl(1.6, 2, 3, '#2a2f3a', [x, 1.5, z]);
      p.ball(1.4, 1.2, 1.4, '#5ef2ff', [x, 3.4, z]);
      glows.push({ x, y: 3.6, z, size: 12, color: '#5ef2ff' });
    } else if (r < 0.8) {
      rubble(p, rng, x, z, ['#3a414e', '#6b7484', '#2a2f3a']);
    } else {
      // fuel line
      const a = rng.range(0, Math.PI);
      p.cyl(1.6, 1.6, 40, '#6b7484', [x, 1.6, z], [Math.PI / 2, 0, a]);
      p.box(5, 4, 5, '#ff3b5c', [x, 2, z], [0, -a, 0]);
    }
  },
  reactor(p, rng, x, z, glows) {
    const r = rng.next();
    if (r < 0.35) {
      // coolant pipe run
      const a = rng.range(0, Math.PI);
      p.cyl(2.4, 2.4, 50, '#3a4644', [x, 2.4, z], [Math.PI / 2, 0, a]);
      for (let i = -1; i <= 1; i++) p.cyl(2.9, 2.9, 2, '#6a7774', [x + Math.sin(a) * i * 18, 2.4, z - Math.cos(a) * i * 18], [Math.PI / 2, 0, a]);
    } else if (r < 0.6) {
      // floor vent with glowing coolant beneath
      p.box(12, 1.4, 12, '#2a3432', [x, 0.7, z]);
      for (let i = 0; i < 4; i++) p.box(11, 1.6, 1, '#6a7774', [x, 1.2, z - 4.5 + i * 3]);
      glows.push({ x, y: 1.5, z, size: 22, color: '#43ffa4' });
    } else if (r < 0.8) {
      p.cyl(3.6, 3.6, 10, '#2fbf75', [x, 5, z]);
      p.box(3, 3, 0.4, '#ffcf2a', [x, 6, z + 3.7]);
    } else {
      rubble(p, rng, x, z, ['#2a3432', '#3a4644', '#161b1a']);
    }
  },
};
