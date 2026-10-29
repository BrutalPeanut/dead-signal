import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Part, SIGNAL, detailed } from './kit3d';

/**
 * Option D: authored, rigged characters (KayKit by Kay Lousberg, CC0) restyled as Dead Signal's
 * cast. The rig and its hand-made animation clips are kept; colours are repainted at build time
 * (see the asset pipeline) and sci-fi gear is bolted onto the bones here.
 *
 * KayKit models face +Z and stand ~2.2 units tall; we rotate to face +X and scale to sim units.
 */

export interface Authored {
  group: THREE.Group;
  mixer: THREE.AnimationMixer;
  play(name: string, fade?: number, once?: boolean): void;
  clips: string[];
  /** Emissive bits the renderer can glow / pulse. */
  glow: THREE.MeshBasicMaterial;
}

const cache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>>();

export function loadGlb(url: string) {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations }));
    cache.set(url, p);
  }
  return p;
}

function bone(root: THREE.Object3D, name: string) {
  // GLTFLoader strips '.' from node names (handslot.r → handslotr)
  const b = root.getObjectByName(name) ?? root.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(name));
  if (!b) throw new Error('missing bone ' + name);
  return b;
}

const solid = (p: Part) => {
  const m = new THREE.Mesh(p.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 }));
  m.castShadow = true;
  return m;
};

function wrap(src: { scene: THREE.Group; animations: THREE.AnimationClip[] }, height: number): Omit<Authored, 'glow'> & { model: THREE.Object3D } {
  const model = cloneSkinned(src.scene);
  model.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.frustumCulled = false;
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.roughness = 0.7;
      mat.metalness = 0.05;
    }
  });
  const group = new THREE.Group();
  const holder = new THREE.Object3D();
  holder.rotation.y = Math.PI / 2; // +Z → +X
  holder.scale.setScalar(height / 2.25);
  holder.add(model);
  group.add(holder);
  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map(src.animations.map((c) => [c.name, mixer.clipAction(c)]));
  let current: THREE.AnimationAction | null = null;
  return {
    group,
    model,
    mixer,
    clips: [...actions.keys()],
    play(name, fade = 0.2, once = false) {
      const a = actions.get(name);
      if (!a || a === current) return;
      a.reset();
      a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      a.clampWhenFinished = once;
      a.play();
      if (current) a.crossFadeFrom(current, fade, false);
      current = a;
    },
  };
}

/** The courier: KayKit rogue rig in courier colours, plus helmet, visor, rig pack and pulse pistol. */
export async function courier(url: string, glowColor = '#5ef2ff'): Promise<Authored> {
  const w = wrap(await loadGlb(url), 58);
  const glow = new THREE.MeshBasicMaterial({ color: glowColor });
  detailed(2.2, () => {
    // helmet over the (oversized, chibi) KayKit head; head bone sits at the neck
    const head = bone(w.model, 'head');
    // open-face shell: everything but a window over the face (+Z)
    const shellMat = new THREE.MeshStandardMaterial({ color: '#d6dde6', roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 16, Math.PI / 2 + 0.85, Math.PI * 2 - 1.7, 0, 2.05), shellMat);
    shell.position.set(0.01, 0.44, 0);
    shell.scale.set(1, 0.95, 1);
    shell.castShadow = true;
    head.add(shell);
    const trim = solid(
      new Part()
        .box(0.1, 0.12, 0.95, '#ff7a1a', [0.01, 1.02, -0.05]) // crest ridge
        .cyl(0.09, 0.09, 0.08, '#2c323f', [0.62, 0.5, 0], [0, 0, Math.PI / 2])
        .cyl(0.09, 0.09, 0.08, '#2c323f', [-0.6, 0.5, 0], [0, 0, Math.PI / 2]),
    );
    head.add(trim);
    // tinted visor over the eyes, with the glowing HUD line along it
    const glass = new THREE.Mesh(
      new THREE.SphereGeometry(0.645, 24, 6, Math.PI / 2 - 0.95, 1.9, 1.02, 0.42),
      new THREE.MeshStandardMaterial({ color: '#0a6f8a', roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.78, side: THREE.DoubleSide }),
    );
    glass.position.copy(shell.position);
    head.add(glass);
    const line = new THREE.Mesh(new THREE.SphereGeometry(0.66, 24, 2, Math.PI / 2 - 0.8, 1.6, 1.3, 0.05), glow);
    line.position.copy(shell.position);
    head.add(line);
    // rig pack + antenna on the chest bone (behind the courier)
    const chest = bone(w.model, 'chest');
    const pack = solid(
      new Part()
        .box(0.5, 0.55, 0.26, '#4b5568', [0, 0.18, -0.36])
        .box(0.52, 0.08, 0.28, '#20252f', [0, 0.02, -0.36])
        .box(0.52, 0.08, 0.28, '#20252f', [0, 0.3, -0.36])
        .cyl(0.02, 0.025, 0.7, '#1b2029', [0.16, 0.75, -0.42]),
    );
    chest.add(pack);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow);
    tip.position.set(0.16, 1.12, -0.42);
    chest.add(tip);
    // pulse pistol in the right hand slot (KayKit hand slots point the weapon along +Y)
    const gun = solid(
      new Part()
        .box(0.12, 0.42, 0.16, '#5a6478', [0, 0.18, 0])
        .box(0.09, 0.14, 0.11, '#2c323f', [0, 0.44, 0])
        .box(0.08, 0.12, 0.14, '#2c323f', [0, 0.02, 0.1]),
    );
    const hand = bone(w.model, 'handslot.r');
    hand.add(gun);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glow);
    muzzle.position.set(0, 0.52, 0);
    hand.add(muzzle);
  });
  return { ...w, glow };
}

/** The Warden: the KayKit skeleton warrior, still in riot gear: shield, shock baton, signal eyes. */
export async function warden(url: string): Promise<Authored> {
  const w = wrap(await loadGlb(url), 132);
  const glow = new THREE.MeshBasicMaterial({ color: SIGNAL });
  w.model.traverse((o) => {
    if (o.name.includes('Eyes') && (o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = glow;
    // the horned fantasy helm goes; a riot helmet replaces it below
    if (o.name.includes('Helmet')) o.visible = false;
  });
  detailed(2, () => {
    const shield = solid(
      new Part()
        .box(0.08, 1.05, 0.62, '#5d6c8c', [0, 0.1, 0.08])
        .box(0.09, 0.14, 0.64, '#222a3c', [0, 0.35, 0.08])
        .box(0.1, 0.06, 0.26, '#b4c2de', [0, -0.2, 0.08]),
    );
    bone(w.model, 'handslot.l').add(shield);
    // riot helmet: dome, brim, and a cracked face shield leaking signal light
    const head = bone(w.model, 'head');
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.56, 26, 14, 0, Math.PI * 2, 0, 1.7),
      new THREE.MeshStandardMaterial({ color: '#4a5a7a', roughness: 0.4, metalness: 0.35 }),
    );
    dome.position.set(0, 0.5, -0.02);
    dome.castShadow = true;
    head.add(dome);
    head.add(solid(new Part().torus(0.55, 0.05, '#38465f', [0, 0.42, -0.02], [Math.PI / 2, 0, 0]).box(0.86, 0.1, 0.18, '#7a8aac', [0, 0.5, -0.5])));
    const shieldGlass = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 22, 8, Math.PI / 2 - 0.9, 1.8, 1.0, 0.9),
      new THREE.MeshStandardMaterial({ color: '#2a3550', roughness: 0.05, metalness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
    );
    shieldGlass.position.set(0, 0.5, -0.02);
    head.add(shieldGlass);
    const crack = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.34, 0.02), glow);
    crack.position.set(0.12, 0.42, 0.59);
    crack.rotation.z = 0.5;
    head.add(crack);
    const baton = solid(new Part().cyl(0.035, 0.035, 0.9, '#1a1d24', [0, 0.35, 0]).cyl(0.05, 0.05, 0.12, '#3a3f4a', [0, -0.05, 0]));
    const hand = bone(w.model, 'handslot.r');
    hand.add(baton);
    const tipM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.14, 10), glow);
    tipM.position.set(0, 0.84, 0);
    hand.add(tipM);
  });
  return { ...w, glow };
}
