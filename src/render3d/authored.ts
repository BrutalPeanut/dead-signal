import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HeroSkin } from '../render/hero';
import { Part, SIGNAL, detailed, screenOutlineMat } from './kit3d';
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

/**
 * Give every opaque lit mesh under `root` an ink outline (skinned meshes get a skinned twin on
 * the same skeleton). Glows and glass are skipped. The courier read soft and blobby without it,
 * especially against the dark floors.
 */
let heroInk: THREE.Material | null = null;
const HERO_INK = () => (heroInk ??= screenOutlineMat(2.1));
const mixHex = (a: string, b: string, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();

function inkOutline(root: THREE.Object3D, mat: THREE.Material) {
  const todo: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.outline || m.userData.inked) return;
    const mt = m.material as THREE.Material;
    if (mt.transparent || (mt as THREE.MeshBasicMaterial).isMeshBasicMaterial) return;
    todo.push(m);
  });
  for (const m of todo) {
    m.userData.inked = true;
    let o: THREE.Mesh;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
      const sm = m as THREE.SkinnedMesh;
      const so = new THREE.SkinnedMesh(sm.geometry, mat);
      so.bindMode = sm.bindMode;
      so.bind(sm.skeleton, sm.bindMatrix);
      so.position.copy(sm.position);
      so.quaternion.copy(sm.quaternion);
      so.scale.copy(sm.scale);
      sm.parent!.add(so);
      o = so;
    } else {
      o = new THREE.Mesh(m.geometry, mat);
      m.add(o);
    }
    o.userData.outline = true;
    o.castShadow = false;
    o.frustumCulled = false;
  }
}

const smoothstep = THREE.MathUtils.smoothstep;
const bump = (t: number, c: number, w: number) => Math.exp(-((t - c) * (t - c)) / (w * w));

/**
 * Reshape the courier's body from KayKit's soft, round build into an athletic V-taper: broad
 * shoulders and chest, a narrow waist with no belly, thick arms and solid thighs. Done once on the
 * bind-pose vertices (KayKit space: +Y up, +Z front, arms out along ±X), so the rig and every
 * animation clip just follow.
 */
function jacked(model: THREE.Object3D) {
  const v = new THREE.Vector3();
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    const name = mesh.name;
    const part = /Body/.test(name) ? 'body' : /ArmLeft|ArmRight/.test(name) ? 'arm' : /LegLeft|LegRight/.test(name) ? 'leg' : null;
    if (!part) return;
    mesh.geometry = mesh.geometry.clone();
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (part === 'body') {
        // torso spans y 0.38 (belt) → 1.25 (shoulders)
        const t = THREE.MathUtils.clamp((v.y - 0.38) / 0.87, 0, 1);
        const cx = 0.05;
        // narrow from the belt up to the ribs, then flare into the chest and shoulders
        const waist = 1 - 0.3 * (1 - smoothstep(t, 0.32, 0.72));
        const chest = 1 + 0.22 * smoothstep(t, 0.58, 0.95);
        v.x = cx + (v.x - cx) * waist * chest;
        if (v.z > 0) v.z *= (1 - 0.3 * (1 - smoothstep(t, 0.35, 0.7))) * (1 + 0.12 * bump(t, 0.8, 0.13)); // flat gut, pecs
        else v.z *= 1 - 0.14 * (1 - smoothstep(t, 0.35, 0.7)) + 0.07 * smoothstep(t, 0.6, 0.95); // lats
      } else if (part === 'arm') {
        // arms lie along ±X at shoulder height; thicken around their axis, biggest at the biceps
        const ax = Math.abs(v.x);
        const k = ax > 0.82 ? 1 : 1 + 0.32 * bump(ax, 0.38, 0.2) + 0.18 * bump(ax, 0.66, 0.12);
        v.y = 1.105 + (v.y - 1.105) * k;
        v.z *= k;
        v.x += Math.sign(v.x) * 0.035 * smoothstep(ax, 0.1, 0.3); // sit on the wider shoulders
      } else {
        // thighs: thicker toward the hip
        const cx = Math.sign(v.x) * 0.17;
        const k = 1 + 0.16 * smoothstep(v.y, 0.15, 0.45);
        v.x = cx + (v.x - cx) * k;
        v.z = 0.06 + (v.z - 0.06) * k;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingSphere();
  });
}

const AIM_ARM = ['upperarmr', 'lowerarmr', 'wristr', 'handr', 'handslotr'];
/**
 * Adult proportions for the courier. KayKit is a chibi build (head ≈ half the body, stub legs):
 * the head shrinks and the legs grow, so the figure reads as a person in a helmet, not a bobblehead.
 * Uniform scales on the thigh bones (undone on the feet) lengthen the legs without shearing them.
 */
const HEAD_SCALE = 0.47;
const LEG_SCALE = 1.36;
const ARM_SCALE = 1.12;

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
  private head: THREE.Object3D;
  private hips: THREE.Object3D;
  private legs: THREE.Object3D[];
  private feet: THREE.Object3D[];
  private arms: THREE.Object3D[];
  private hands: THREE.Object3D[];
  /** How far the longer legs push the feet below the floor (bone space), added back to the hips. */
  private lift = 0;
  private muzzle!: THREE.Object3D;
  private acts: Record<string, THREE.AnimationAction> = {};
  private mode = '';
  private hitT = 0;

  constructor(src: Gltf, readonly skin: HeroSkin) {
    this.r = instantiate(src, 62, {
      r1c0: skin.jacket[0],
      r2c5: skin.jacketBack[0],
      r1c1: skin.collar[0],
      r0c5: '#30343d',
      r0c6: '#24262c',
      r0c3: '#c9ced6',
      // a notch lighter than the 2D art: dark trousers vanished against the dark floors
      r1c7: mixHex(skin.pants[1], skin.pants[0], 0.5),
      r2c3: mixHex(skin.pants[0], skin.pants[2], 0.45),
      r0c1: '#3a2a22',
    });
    this.group = this.r.group;
    // a little sheen so the suit's forms (shoulders, arms, chest) read under the top-down light
    for (const mt of this.r.mats) {
      mt.roughness = 0.48;
      mt.metalness = 0.08;
    }
    const m = this.r.model;
    jacked(m);
    this.chest = bone(m, 'chest');
    this.spine = bone(m, 'spine');
    this.head = bone(m, 'head');
    this.hips = bone(m, 'hips');
    this.legs = ['upperleg.l', 'upperleg.r'].map((n) => bone(m, n));
    this.feet = ['foot.l', 'foot.r'].map((n) => bone(m, n));
    this.arms = ['upperarm.l', 'upperarm.r'].map((n) => bone(m, n));
    this.hands = ['hand.l', 'hand.r'].map((n) => bone(m, n));
    // measure in the bind pose how much lower the soles sit once the legs are stretched
    const sole = () => {
      m.updateMatrixWorld(true);
      return Math.min(...this.feet.map((f) => f.getWorldPosition(new THREE.Vector3()).y));
    };
    const y0 = sole();
    this.reshape();
    const y1 = sole();
    this.lift = (y0 - y1) / this.hips.parent!.getWorldScale(new THREE.Vector3()).y;
    this.hips.position.y += this.lift;
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
    inkOutline(this.group, HERO_INK());
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
        new THREE.SphereGeometry(0.575, 28, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.05),
        new THREE.MeshStandardMaterial({ color: s.helmet[0], roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide }),
      );
      shell.position.set(0.01, 0.44, 0);
      shell.scale.set(1, 0.95, 1);
      shell.castShadow = true;
      head.add(shell);
      head.add(
        solid(
          new Part()
            .box(0.09, 0.1, 0.85, s.accent, [0.01, 0.96, -0.05])
            .cyl(0.08, 0.08, 0.08, '#2c323f', [0.58, 0.5, 0], [0, 0, Math.PI / 2])
            .cyl(0.08, 0.08, 0.08, '#2c323f', [-0.56, 0.5, 0], [0, 0, Math.PI / 2]),
        ),
      );
      const glass = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 24, 6, Math.PI / 2 - 0.95, 1.9, 1.02, 0.42),
        new THREE.MeshStandardMaterial({ color: s.visorDark, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
      );
      glass.position.copy(shell.position);
      head.add(glass);
      const line = new THREE.Mesh(new THREE.SphereGeometry(0.615, 24, 2, Math.PI / 2 - 0.8, 1.6, 1.3, 0.05), glow);
      line.position.copy(shell.position);
      head.add(line);

      this.chest.add(
        solid(
          new Part()
            .box(0.42, 0.5, 0.2, s.pack[0], [0, 0.18, -0.33])
            .box(0.44, 0.07, 0.22, s.pack[1], [0, 0.02, -0.33])
            .box(0.44, 0.07, 0.22, s.pack[1], [0, 0.3, -0.33])
            .cyl(0.02, 0.025, 0.7, '#1b2029', [0.16, 0.75, -0.42]),
        ),
      );
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow);
      tip.position.set(0.16, 1.12, -0.42);
      this.chest.add(tip);
      this.glows.push({ obj: this.chest, at: tip.position.clone(), size: 5, color: s.glow });

      this.hand = bone(m, 'handslot.r');
      this.muzzle = new THREE.Object3D();
      this.hand.add(this.muzzle);
      this.setGun('pistol');
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
    // undo last frame's lift first: clips that don't key the hips would otherwise accumulate it
    this.hips.position.y -= this.lift;
    this.r.mixer.update(dt);
    // applied after the mixer so clips can't undo it
    this.reshape();
    this.hips.position.y += this.lift;
    // upper body turns toward the target while the legs keep running
    if (aiming) {
      const tw = Math.max(-1.3, Math.min(1.3, s.twist));
      this.spine.rotation.y += tw * 0.45;
      this.chest.rotation.y += tw * 0.55;
    }
  }

  private reshape() {
    this.head.scale.setScalar(HEAD_SCALE);
    for (const b of this.legs) b.scale.setScalar(LEG_SCALE);
    for (const b of this.feet) b.scale.setScalar(1 / LEG_SCALE);
    for (const b of this.arms) b.scale.setScalar(ARM_SCALE);
    for (const b of this.hands) b.scale.setScalar(1 / ARM_SCALE);
  }

  private hand!: THREE.Object3D;
  private gunMesh: THREE.Object3D | null = null;
  gunId = '';
  /** Swap the gun in the courier's hand (Pulse Pistol or one of the primary guns). */
  setGun(id: string) {
    if (id === this.gunId) return;
    this.gunId = id;
    this.gunMesh?.parent?.remove(this.gunMesh);
    const [part, muzzle] = detailed(2.2, () => gunModel(id, this.skin.glow));
    this.gunMesh = solid(part);
    if (id === 'bazooka') {
      // shoulder-mounted on the chest so it points where the upper body aims, instead of
      // swinging with the running hand like a club
      const mount = new THREE.Object3D();
      mount.position.set(SHOULDER_MOUNT[0], SHOULDER_MOUNT[1], SHOULDER_MOUNT[2]);
      mount.rotation.x = Math.PI / 2;
      mount.add(this.gunMesh);
      this.gunMesh = mount;
      this.chest.add(mount);
      mount.add(this.muzzle);
    } else {
      this.hand.add(this.gunMesh);
      this.hand.add(this.muzzle);
    }
    this.muzzle.position.set(0, muzzle, 0);
    inkOutline(this.gunMesh, HERO_INK());
  }

  /** World position of the gun muzzle. */
  muzzleWorld(out: THREE.Vector3) {
    return this.muzzle.getWorldPosition(out);
  }

  setHurt(k: number) {
    for (const m of this.r.mats) m.emissive.setRGB(0.6 * k, 0.05 * k, 0.1 * k);
  }
}

/** Chest-space spot on the right shoulder where the bazooka rests. */
const SHOULDER_MOUNT: [number, number, number] = [-0.34, 0.62, 0.05];

/**
 * Hand-held guns in the courier's right-hand slot space: the barrel runs along +Y, the grip
 * sits at the origin and +Z is the grip side. Returns the model and the muzzle height.
 */
function gunModel(id: string, glow: string): [Part, number] {
  const p = new Part();
  const steel = '#5a6478', dark = '#2c323f', black = '#1b2029';
  switch (id) {
    case 'smg':
      p.box(0.13, 0.5, 0.17, steel, [0, 0.2, 0])
        .box(0.08, 0.14, 0.12, dark, [0, -0.02, 0.1]) // grip
        .box(0.07, 0.08, 0.26, black, [0, 0.3, 0.2]) // magazine
        .cyl(0.035, 0.035, 0.22, dark, [0, 0.56, 0])
        .box(0.06, 0.26, 0.06, dark, [0, -0.14, -0.05]) // folded stock
        .box(0.02, 0.32, 0.05, glow, [0.07, 0.22, 0]);
      return [p, 0.7];
    case 'mg':
      p.box(0.15, 0.62, 0.2, steel, [0, 0.16, 0])
        .box(0.09, 0.15, 0.12, dark, [0, -0.04, 0.11])
        .box(0.16, 0.16, 0.18, '#3d4a2e', [0.13, 0.12, 0.05]) // ammo can
        .cyl(0.045, 0.045, 0.66, dark, [0, 0.78, 0])
        .cyl(0.065, 0.065, 0.2, black, [0, 0.62, 0]) // barrel shroud
        .box(0.08, 0.3, 0.1, dark, [0, -0.28, 0]) // stock
        .box(0.02, 0.4, 0.05, glow, [0.08, 0.18, -0.02]);
      return [p, 1.13];
    case 'flamer':
      p.cyl(0.07, 0.08, 0.62, steel, [0, 0.26, 0])
        .box(0.08, 0.14, 0.12, dark, [0, -0.02, 0.1])
        .cyl(0.11, 0.11, 0.34, '#9a3b14', [0, 0.14, -0.16]) // fuel tank
        .cyl(0.05, 0.09, 0.14, black, [0, 0.62, 0]) // nozzle
        .box(0.02, 0.3, 0.05, '#ff7a1f', [0.075, 0.28, 0]);
      return [p, 0.72];
    case 'bazooka':
      p.cyl(0.13, 0.13, 1.25, '#4b5a3a', [0, 0.25, -0.03])
        .cyl(0.17, 0.13, 0.16, black, [0, -0.4, -0.03]) // flared back end
        .cyl(0.15, 0.13, 0.08, black, [0, 0.87, -0.03])
        .box(0.08, 0.14, 0.12, dark, [0, 0.0, 0.14])
        .box(0.08, 0.13, 0.11, dark, [0, 0.32, 0.15]) // front grip
        .box(0.05, 0.12, 0.08, steel, [0.12, 0.45, -0.03]) // sight
        .box(0.02, 0.5, 0.04, '#ff4d3d', [0.135, 0.15, -0.03]);
      return [p, 0.95];
    default:
      p.box(0.12, 0.42, 0.16, steel, [0, 0.18, 0])
        .box(0.09, 0.14, 0.11, dark, [0, 0.44, 0])
        .box(0.08, 0.12, 0.14, dark, [0, 0.02, 0.1])
        .box(0.02, 0.2, 0.05, glow, [0.065, 0.2, 0]);
      return [p, 0.55];
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
