import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroSkin } from '../render/hero';
import { Part, SIGNAL, detailed } from './kit3d';
import courierUrl from '../assets/models/courier.glb?url';
import animsUrl from '../assets/models/skel_anims.glb?url';
import warriorUrl from '../assets/models/skel_warrior.glb?url';
import mageUrl from '../assets/models/skel_mage.glb?url';
import rogueUrl from '../assets/models/skel_rogue.glb?url';

/**
 * Option D: authored, rigged characters (KayKit by Kay Lousberg, CC0, see scripts/build-models.mjs)
 * restyled as Dead Signal's cast. Rigs and hand-made clips are kept; palettes are repainted at
 * runtime (per courier skin / per boss) and sci-fi gear is bolted onto the bones.
 * KayKit models face +Z and stand ~2.2 units tall: we turn them to face +X and scale to sim units.
 */

export type Gltf = { scene: THREE.Group; animations: THREE.AnimationClip[] };
const cache = new Map<string, Promise<Gltf>>();

export function loadGlb(url: string): Promise<Gltf> {
  let p = cache.get(url);
  if (!p) {
    const loader = new GLTFLoader();
    const job = url.startsWith('data:') ? parseNoFetch(loader, dataToBuffer(url)) : loader.loadAsync(url);
    p = job.then((g) => ({ scene: g.scene, animations: g.animations }));
    cache.set(url, p);
  }
  return p;
}

/**
 * GLTFLoader decodes textures with createImageBitmap(fetch(blob:)), which strict CSPs (artifact
 * viewers, app wrappers) block. With it hidden while the parser is built it uses plain <img>.
 */
function parseNoFetch(loader: GLTFLoader, buf: ArrayBuffer) {
  const w = window as unknown as { createImageBitmap?: typeof createImageBitmap };
  const saved = w.createImageBitmap;
  w.createImageBitmap = undefined;
  try {
    return loader.parseAsync(buf, '');
  } finally {
    w.createImageBitmap = saved;
  }
}

function dataToBuffer(uri: string): ArrayBuffer {
  const bin = atob(uri.slice(uri.indexOf(',') + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export function bone(root: THREE.Object3D, name: string) {
  // GLTFLoader strips '.' from node names (handslot.r → handslotr)
  const b = root.getObjectByName(name) ?? root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
  if (!b) throw new Error('missing bone ' + name);
  return b;
}

// ------------------------------------------------------------------ palette repainting

/**
 * KayKit textures are swatch atlases: 8 columns × 4 rows, each a vertical light→dark gradient.
 * Repaint chosen swatches to a new colour while keeping each gradient's shading.
 */
function repaint(img: CanvasImageSource & { width: number; height: number }, map: Record<string, string>): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0);
  const cw = c.width / 8, ch = c.height / 4;
  const col = new THREE.Color();
  for (const [cell, hex] of Object.entries(map)) {
    const [r, k] = cell.slice(1).split('c').map(Number);
    const d = x.getImageData(k * cw, r * ch, cw, ch);
    let sum = 0;
    for (let i = 0; i < d.data.length; i += 4) sum += 0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2];
    const avg = sum / (d.data.length / 4) || 1;
    col.set(hex).convertLinearToSRGB(); // canvas pixels are sRGB
    for (let i = 0; i < d.data.length; i += 4) {
      const l = Math.pow((0.3 * d.data[i] + 0.59 * d.data[i + 1] + 0.11 * d.data[i + 2]) / avg, 0.8);
      d.data[i] = Math.min(255, col.r * 255 * l);
      d.data[i + 1] = Math.min(255, col.g * 255 * l);
      d.data[i + 2] = Math.min(255, col.b * 255 * l);
    }
    x.putImageData(d, k * cw, r * ch);
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = false; // glTF UV convention
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function solid(p: Part) {
  const m = new THREE.Mesh(p.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }));
  m.castShadow = true;
  return m;
}

interface Rigged {
  group: THREE.Group;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  mats: THREE.MeshStandardMaterial[];
}

/** Clone a glTF scene with its own skeleton and materials, turned to face +X at a given height. */
function instantiate(src: Gltf, height: number, recolor?: Record<string, string>): Rigged {
  const model = cloneSkinned(src.scene);
  const mats: THREE.MeshStandardMaterial[] = [];
  let tex: THREE.Texture | null = null;
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    if (recolor && mat.map) {
      tex ??= repaint(mat.map.image as HTMLImageElement, recolor);
      mat.map = tex;
    }
    mat.roughness = 0.7;
    mat.metalness = 0.05;
    m.material = mat;
    mats.push(mat);
  });
  const group = new THREE.Group();
  const holder = new THREE.Object3D();
  holder.rotation.y = Math.PI / 2; // +Z → +X
  holder.scale.setScalar(height / 2.25);
  holder.add(model);
  group.add(holder);
  return { group, model, mixer: new THREE.AnimationMixer(model), mats };
}

/** A copy of a clip with some bones' tracks removed (or kept), for layering body parts. */
function filterClip(clip: THREE.AnimationClip, bones: string[], keep: boolean) {
  const tracks = clip.tracks.filter((t) => bones.some((b) => t.name.startsWith(b + '.')) === keep);
  return new THREE.AnimationClip(clip.name + (keep ? '_only' : '_without'), clip.duration, tracks);
}

// ------------------------------------------------------------------ the courier

const AIM_ARM = ['upperarmr', 'lowerarmr', 'wristr', 'handr', 'handslotr'];

export interface HeroState {
  moving: boolean;
  dead: boolean;
  won: boolean;
  hit: boolean;
  /** Angle between where the courier runs and where it shoots (three.js yaw, radians). */
  twist: number;
}

export type GlowAt = { obj: THREE.Object3D; at: THREE.Vector3; size: number; color: string; pulse?: number };

export class AuthoredHero {
  group: THREE.Group;
  glows: GlowAt[] = [];
  private r: Rigged;
  private chest: THREE.Object3D;
  private spine: THREE.Object3D;
  private muzzle!: THREE.Object3D;
  private acts: Record<string, THREE.AnimationAction> = {};
  private mode = '';
  private hitT = 0;

  constructor(src: Gltf, readonly skin: HeroSkin) {
    this.r = instantiate(src, 50, {
      r1c0: skin.jacket[0],
      r2c5: skin.jacketBack[0],
      r1c1: skin.collar[0],
      r0c5: '#30343d',
      r0c6: '#24262c',
      r0c3: '#c9ced6',
      r1c7: skin.pants[1],
      r2c3: skin.pants[0],
      r0c1: '#3a2a22',
    });
    this.group = this.r.group;
    const m = this.r.model;
    this.chest = bone(m, 'chest');
    this.spine = bone(m, 'spine');
    const clip = (n: string) => src.animations.find((c) => c.name === n)!;
    const mixer = this.r.mixer;
    // legs and torso play the body clip; the gun arm holds an aim on top of it
    this.acts.idle = mixer.clipAction(filterClip(clip('Idle'), AIM_ARM, false));
    this.acts.run = mixer.clipAction(filterClip(clip('Running_A'), AIM_ARM, false));
    this.acts.aim = mixer.clipAction(filterClip(clip('1H_Ranged_Aiming'), AIM_ARM, true));
    this.acts.hit = mixer.clipAction(filterClip(clip('Hit_A'), AIM_ARM, false));
    this.acts.death = mixer.clipAction(clip('Death_A'));
    this.acts.cheer = mixer.clipAction(clip('Cheer'));
    for (const k of ['hit', 'death']) {
      this.acts[k].setLoop(THREE.LoopOnce, 1);
      this.acts[k].clampWhenFinished = true;
    }
    this.acts.aim.play();
    this.acts.idle.play();
    this.mode = 'idle';
    this.gear();
  }

  /** Helmet, visor, rig pack and pulse pistol, coloured by the skin. */
  private gear() {
    const s = this.skin;
    const m = this.r.model;
    const glow = new THREE.MeshBasicMaterial({ color: s.glow });
    detailed(2.2, () => {
      const head = bone(m, 'head');
      // open-face shell: everything but a window over the face (+Z)
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.62, 28, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.05),
        new THREE.MeshStandardMaterial({ color: s.helmet[0], roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }),
      );
      shell.position.set(0.01, 0.44, 0);
      shell.scale.set(1, 0.95, 1);
      shell.castShadow = true;
      head.add(shell);
      head.add(
        solid(
          new Part()
            .box(0.1, 0.12, 0.95, s.accent, [0.01, 1.02, -0.05])
            .cyl(0.09, 0.09, 0.08, '#2c323f', [0.62, 0.5, 0], [0, 0, Math.PI / 2])
            .cyl(0.09, 0.09, 0.08, '#2c323f', [-0.6, 0.5, 0], [0, 0, Math.PI / 2]),
        ),
      );
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.645, 24, 6, Math.PI / 2 - 0.95, 1.9, 1.02, 0.42),
        new THREE.MeshStandardMaterial({ color: s.visorDark, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
      );
      glass.position.copy(shell.position);
      head.add(glass);
      const line = new THREE.Mesh(new THREE.SphereGeometry(0.66, 24, 2, Math.PI / 2 - 0.8, 1.6, 1.3, 0.05), glow);
      line.position.copy(shell.position);
      head.add(line);

      this.chest.add(
        solid(
          new Part()
            .box(0.5, 0.55, 0.26, s.pack[0], [0, 0.18, -0.36])
            .box(0.52, 0.08, 0.28, s.pack[1], [0, 0.02, -0.36])
            .box(0.52, 0.08, 0.28, s.pack[1], [0, 0.3, -0.36])
            .cyl(0.02, 0.025, 0.7, '#1b2029', [0.16, 0.75, -0.42]),
        ),
      );
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow);
      tip.position.set(0.16, 1.12, -0.42);
      this.chest.add(tip);
      this.glows.push({ obj: this.chest, at: tip.position.clone(), size: 5, color: s.glow });

      const hand = bone(m, 'handslot.r');
      hand.add(
        solid(
          new Part()
            .box(0.12, 0.42, 0.16, '#5a6478', [0, 0.18, 0])
            .box(0.09, 0.14, 0.11, '#2c323f', [0, 0.44, 0])
            .box(0.08, 0.12, 0.14, '#2c323f', [0, 0.02, 0.1])
            .box(0.02, 0.2, 0.05, s.glow, [0.065, 0.2, 0]),
        ),
      );
      this.muzzle = new THREE.Object3D();
      this.muzzle.position.set(0, 0.55, 0);
      hand.add(this.muzzle);
    });
  }

  private to(mode: string, fade = 0.18) {
    if (mode === this.mode) return;
    const next = this.acts[mode];
    const prev = this.acts[this.mode];
    next.reset().play();
    if (prev) next.crossFadeFrom(prev, fade, false);
    this.mode = mode;
  }

  update(dt: number, s: HeroState) {
    this.hitT -= dt;
    if (s.dead) this.to('death', 0.12);
    else if (s.won) this.to('cheer', 0.3);
    else if (s.hit && this.hitT <= 0 && !s.moving) {
      // flinch only when standing; a hit while running just shows the red tint
      this.hitT = 0.9;
      this.to('hit', 0.08);
    } else if (this.mode !== 'hit' || this.hitT < 0.5) this.to(s.moving ? 'run' : 'idle');
    const aiming = !s.dead && !s.won;
    this.acts.aim.weight = aiming ? 1 : 0;
    this.r.mixer.update(dt);
    // upper body turns toward the target while the legs keep running
    if (aiming) {
      const tw = Math.max(-1.3, Math.min(1.3, s.twist));
      this.spine.rotation.y += tw * 0.45;
      this.chest.rotation.y += tw * 0.55;
    }
  }

  /** World position of the pistol muzzle. */
  muzzleWorld(out: THREE.Vector3) {
    return this.muzzle.getWorldPosition(out);
  }

  setHurt(k: number) {
    for (const m of this.r.mats) m.emissive.setRGB(0.6 * k, 0.05 * k, 0.1 * k);
  }
}

// ------------------------------------------------------------------ bosses

export type BossAnim = 'idle' | 'walk' | 'run' | 'attack' | 'block' | 'taunt' | 'cast' | 'shoot' | 'rise' | 'death' | 'hit';
const BOSS_CLIPS: Record<BossAnim, string> = {
  idle: 'Idle_Combat',
  walk: 'Walking_D_Skeletons',
  run: 'Running_A',
  attack: '1H_Melee_Attack_Chop',
  block: 'Block',
  taunt: 'Taunt',
  cast: 'Spellcast_Shoot',
  shoot: '1H_Ranged_Shoot',
  rise: 'Spawn_Ground_Skeletons',
  death: 'Death_A',
  hit: 'Hit_A',
};
const ONCE: BossAnim[] = ['attack', 'shoot', 'rise', 'death', 'hit'];

export class AuthoredBoss {
  group: THREE.Group;
  glow: THREE.MeshBasicMaterial;
  glows: GlowAt[] = [];
  height: number;
  private r: Rigged;
  private acts = new Map<BossAnim, THREE.AnimationAction>();
  private cur: BossAnim | null = null;
  /** Seconds left on a one-shot clip; loops wait for it to finish. */
  private busy = 0;

  constructor(readonly kind: string, mesh: Gltf, anims: Gltf) {
    const spec = BOSS_LOOK[kind];
    this.height = spec.height;
    this.r = instantiate(mesh, spec.height, spec.palette);
    this.group = this.r.group;
    this.glow = new THREE.MeshBasicMaterial({ color: SIGNAL });
    this.r.model.traverse((o) => {
      if (o.name.includes('Eyes') && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = this.glow;
      if (spec.hide.some((h) => o.name.includes(h))) o.visible = false;
    });
    for (const [k, name] of Object.entries(BOSS_CLIPS) as [BossAnim, string][]) {
      const clip = anims.animations.find((c) => c.name === name);
      if (!clip) continue;
      const a = this.r.mixer.clipAction(clip);
      if (ONCE.includes(k)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.acts.set(k, a);
    }
    detailed(2, () => spec.gear(this.r.model, this));
  }

  get anim() {
    return this.cur;
  }

  play(anim: BossAnim, speed = 1) {
    const a = this.acts.get(anim);
    if (!a) return;
    if (this.cur === anim) {
      a.timeScale = speed;
      return;
    }
    if (this.busy > 0 && !ONCE.includes(anim)) return;
    const prev = this.cur ? this.acts.get(this.cur) : null;
    a.reset();
    a.timeScale = speed;
    a.play();
    if (prev) a.crossFadeFrom(prev, 0.2, false);
    this.cur = anim;
    this.busy = ONCE.includes(anim) ? a.getClip().duration / speed - 0.15 : 0;
  }

  update(dt: number, flash: boolean, phase2: boolean) {
    this.busy -= dt;
    this.r.mixer.update(dt);
    for (const m of this.r.mats) {
      if (flash) m.emissive.setRGB(0.22, 0.22, 0.22);
      else if (phase2) m.emissive.setRGB(0.1, 0.0, 0.07);
      else m.emissive.setRGB(0, 0, 0);
    }
  }
}

type BossLook = {
  height: number;
  palette: Record<string, string>;
  hide: string[];
  gear: (m: THREE.Object3D, b: AuthoredBoss) => void;
};

const glassMat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide });

const BOSS_LOOK: Record<string, BossLook> = {
  /** Riot Unit 07: riot helmet with a cracked face shield, riot shield, shock baton. */
  warden: {
    height: 120,
    palette: { r0c3: '#56688c', r0c4: '#38465f', r0c6: '#232b3c', r0c7: '#1a2030', r2c2: '#1a2234', r2c6: '#7a8aac', r1c1: '#cfc8b4', r0c2: '#20283a' },
    hide: ['Helmet'],
    gear(m, b) {
      bone(m, 'handslot.l').add(solid(new Part().box(0.08, 1.05, 0.62, '#5d6c8c', [0, 0.1, 0.08]).box(0.09, 0.14, 0.64, '#222a3c', [0, 0.35, 0.08]).box(0.1, 0.06, 0.26, '#b4c2de', [0, -0.2, 0.08])));
      const head = bone(m, 'head');
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.56, 26, 14, 0, Math.PI * 2, 0, 1.7), new THREE.MeshStandardMaterial({ color: '#4a5a7a', roughness: 0.4, metalness: 0.35 }));
      dome.position.set(0, 0.5, -0.02);
      dome.castShadow = true;
      head.add(dome, solid(new Part().torus(0.55, 0.05, '#38465f', [0, 0.42, -0.02], [Math.PI / 2, 0, 0]).box(0.86, 0.1, 0.18, '#7a8aac', [0, 0.5, -0.5])));
      const shield = new THREE.Mesh(new THREE.SphereGeometry(0.6, 22, 8, Math.PI / 2 - 0.9, 1.8, 1.0, 0.9), glassMat('#2a3550'));
      shield.position.set(0, 0.5, -0.02);
      head.add(shield);
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.02), b.glow);
      crack.position.set(0.12, 0.42, 0.59);
      crack.rotation.z = 0.5;
      head.add(crack);
      const hand = bone(m, 'handslot.r');
      hand.add(solid(new Part().cyl(0.035, 0.035, 0.9, '#1a1d24', [0, 0.35, 0]).cyl(0.05, 0.05, 0.12, '#3a3f4a', [0, -0.05, 0])));
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), b.glow);
      tip.position.set(0, 0.84, 0);
      hand.add(tip);
      b.glows.push({ obj: hand, at: new THREE.Vector3(0, 0.84, 0), size: 16, color: SIGNAL, pulse: 1 });
      b.glows.push({ obj: head, at: new THREE.Vector3(0.12, 0.42, 0.62), size: 10, color: SIGNAL, pulse: 1 });
    },
  },
  /** Hive Mother: a hooded queen in chitin, brood sac on her back, crown of antennae, extra arms. */
  hive: {
    height: 116,
    palette: { r0c3: '#8a6aa8', r0c4: '#5a4274', r0c6: '#2e1e40', r0c7: '#2e1e40', r1c1: '#8e70a8', r2c2: '#5a4274', r0c5: '#3c2a52', r2c6: '#c4a6dc', r0c2: '#1c1028' },
    hide: [],
    gear(m, b) {
      const chest = bone(m, 'chest');
      chest.add(solid(new Part().ball(0.75, 0.62, 0.62, '#5a4274', [0, 0.1, -0.75]).ball(0.5, 0.42, 0.42, '#3c2a52', [0, -0.15, -1.15])));
      for (let i = 0; i < 6; i++) b.glows.push({ obj: chest, at: new THREE.Vector3(Math.sin(i * 1.7) * 0.5, 0.1 + Math.cos(i * 2.3) * 0.35, -0.95 - (i % 3) * 0.18), size: 10 + (i % 3) * 3, color: SIGNAL, pulse: 1 });
      for (const side of [-1, 1]) chest.add(solid(new Part().limb([side * 0.3, 0.05, 0.1], [side * 0.75, -0.15, 0.4], 0.07, '#8a6aa8').limb([side * 0.75, -0.15, 0.4], [side * 0.65, -0.35, 0.85], 0.06, '#8a6aa8').cone(0.05, 0.25, '#efe4f6', [side * 0.62, -0.38, 1.0], [Math.PI / 2, 0, 0])));
      const head = bone(m, 'head');
      const crown = new Part();
      for (let i = 0; i < 5; i++) crown.cone(0.035, 0.5, '#5a4274', [(i - 2) * 0.16, 1.05, -0.05], [(i - 2) * 0.05, 0, (i - 2) * -0.25]);
      head.add(solid(crown));
      for (let i = 0; i < 5; i++) b.glows.push({ obj: head, at: new THREE.Vector3((i - 2) * 0.24, 1.32, -0.05), size: 5, color: SIGNAL, pulse: 1 });
    },
  },
  /** Signal Colossus: the giant with a broadcast tower and dish welded to its back. */
  colossus: {
    height: 130,
    palette: { r0c3: '#6e7686', r0c4: '#4e5462', r0c6: '#2a2e38', r0c7: '#1c1f26', r2c2: '#3c4d36', r1c1: '#8fa880', r2c6: '#a8b0c0', r0c2: '#2a2e38' },
    hide: ['Helmet', 'Cloak'],
    gear(m, b) {
      const chest = bone(m, 'chest');
      const t = new Part();
      t.box(0.07, 1.6, 0.07, '#4e5462', [-0.18, 0.95, -0.45]).box(0.07, 1.6, 0.07, '#4e5462', [0.18, 0.95, -0.45]);
      for (let i = 0; i < 5; i++) t.box(0.42, 0.05, 0.06, '#6e7686', [0, 0.35 + i * 0.3, -0.45]);
      t.cyl(0.5, 0.1, 0.18, '#b8c0cc', [0, 1.85, -0.6], [-1.1, 0, 0], 16);
      t.box(0.5, 0.55, 0.3, '#4e5462', [0, 0.2, -0.38]);
      chest.add(solid(t));
      b.glows.push({ obj: chest, at: new THREE.Vector3(0, 1.95, -0.5), size: 26, color: SIGNAL, pulse: 1 });
      b.glows.push({ obj: chest, at: new THREE.Vector3(0, 1.78, -0.45), size: 8, color: '#ff3b5c', pulse: 1 });
      bone(m, 'handslot.r').add(solid(new Part().ball(0.28, 0.24, 0.26, '#4e5462', [0, 0.05, 0])));
      bone(m, 'handslot.l').add(solid(new Part().ball(0.28, 0.24, 0.26, '#4e5462', [0, 0.05, 0])));
    },
  },
  /** The Broadcaster: gaunt late-night host, speaker cone through the chest, antenna crown, mic. */
  broadcaster: {
    height: 128,
    palette: { r0c3: '#2f4a52', r0c4: '#0f1c20', r0c6: '#2f4a52', r0c7: '#1a2a30', r2c2: '#2f4a52', r1c1: '#9aa48e', r2c6: '#c89a46', r0c5: '#c9c2b0', r0c2: '#14161a' },
    hide: [],
    gear(m, b) {
      const chest = bone(m, 'chest');
      chest.add(solid(new Part().cone(0.32, 0.3, '#c89a46', [0, 0.25, 0.38], [Math.PI / 2, 0, 0], 16).cyl(0.14, 0.14, 0.06, '#14161a', [0, 0.25, 0.52], [Math.PI / 2, 0, 0], 14)));
      b.glows.push({ obj: chest, at: new THREE.Vector3(0, 0.25, 0.55), size: 30, color: SIGNAL, pulse: 1 });
      for (let i = 0; i < 4; i++) chest.add(solid(new Part().cyl(0.03, 0.03, 1.1, '#16181c', [(i - 1.5) * 0.12, -0.35, -0.42], [0.35, 0, 0])));
      const head = bone(m, 'head');
      const crown = new Part();
      for (let i = 0; i < 5; i++) crown.cyl(0.02, 0.025, 0.5, '#c89a46', [(i - 2) * 0.14, 1.0, 0], [0, 0, (i - 2) * -0.22]);
      head.add(solid(crown));
      for (let i = 0; i < 5; i++) b.glows.push({ obj: head, at: new THREE.Vector3((i - 2) * 0.2, 1.25, 0), size: 5, color: i % 2 ? '#ff3b5c' : SIGNAL, pulse: 1 });
      bone(m, 'handslot.r').add(solid(new Part().cyl(0.05, 0.035, 0.32, '#3a3d44', [0, 0.12, 0]).ball(0.08, 0.08, 0.08, '#70747e', [0, 0.32, 0])));
    },
  },
};

/** Which mesh each boss is built from. */
export const BOSS_MESH: Record<string, string> = { warden: warriorUrl, colossus: warriorUrl, hive: rogueUrl, broadcaster: mageUrl };
export const BOSS_ANIMS = animsUrl;
export const COURIER = courierUrl;

/** Start every download now so models are ready by the time a run (or a boss) needs them. */
export function preloadAuthored() {
  return Promise.all([courierUrl, animsUrl, warriorUrl, mageUrl, rogueUrl].map(loadGlb));
}
