// Option D preview: current 3D models vs authored hero/boss + rebuilt procedural crowd.
import '@fontsource/chakra-petch/latin-500.css';
import '@fontsource/chakra-petch/latin-700.css';
import '@fontsource/saira-stencil-one/latin-400.css';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import courierUrl from './assets/courier.glb?inline';
import wardenUrl from './assets/warden.glb?inline';
import { SKINS } from '../render/hero';
import { BOSS_BUILDERS, RIG_BUILDERS, buildHero, type RigDef } from '../render3d/models';
import { detailed, outlineMat, toonMat } from '../render3d/kit3d';
import { buildZombie2, type Zombie2 } from '../render3d/crowd2';
import { courier, warden, type Authored } from '../render3d/authored';

const css = `
:root{--bg:#0b0d12;--panel:rgba(14,18,26,.86);--line:#2b3346;--text:#e8edf5;--dim:#8d97ab;--cyan:#5ef2ff;--mag:#ff3bd4;--orange:#ff8a2a}
html,body{margin:0;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:'Chakra Petch',system-ui,sans-serif;-webkit-user-select:none;user-select:none}
canvas{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none}
.top{position:fixed;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 12px) max(16px,env(safe-area-inset-right,0px)) 0 max(16px,env(safe-area-inset-left,0px));pointer-events:none;display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.ttl{font-family:'Saira Stencil One',sans-serif;font-size:clamp(22px,4.4vw,34px);letter-spacing:.04em;line-height:1}
.ttl small{display:block;font-family:'Chakra Petch',sans-serif;font-size:12px;letter-spacing:.2em;color:var(--dim);margin-top:6px;text-transform:uppercase}
.dock{position:fixed;left:0;right:0;bottom:0;padding:10px max(12px,env(safe-area-inset-right,0px)) calc(env(safe-area-inset-bottom,0px) + 12px) max(12px,env(safe-area-inset-left,0px));display:flex;flex-wrap:wrap;gap:8px 14px;justify-content:center;background:linear-gradient(transparent,rgba(5,7,10,.92) 30%)}
.grp{display:flex;flex-direction:column;gap:4px;min-width:0}
.grp b{font-size:10px;letter-spacing:.22em;color:var(--dim);font-weight:600}
.seg{display:flex;border:1px solid var(--line);background:var(--panel);flex-wrap:wrap}
.seg button{font:600 12.5px 'Chakra Petch',sans-serif;color:var(--text);background:none;border:0;padding:8px 11px;cursor:pointer;letter-spacing:.04em}
.seg button.on{background:var(--orange);color:#140d00}
.seg button:focus-visible{outline:2px solid var(--cyan);outline-offset:-2px}
.tag{position:fixed;transform:translate(-50%,-100%);font:700 12px 'Chakra Petch',sans-serif;letter-spacing:.24em;padding:4px 9px;border:1px solid currentColor;background:rgba(10,12,16,.7);pointer-events:none;white-space:nowrap}
.tag.now{color:#8d97ab}.tag.d{color:var(--cyan)}
.note{font-size:11.5px;color:var(--dim);max-width:30ch;text-align:right;line-height:1.4}
@media (max-width:640px){.note{display:none}.seg button{padding:7px 8px;font-size:11.5px}}
`;
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

// ------------------------------------------------------------------ scene

const canvas = document.createElement('canvas');
document.body.append(canvas);
const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
gl.setPixelRatio(Math.min(devicePixelRatio, 2));
gl.outputColorSpace = THREE.SRGBColorSpace;
gl.toneMapping = THREE.NeutralToneMapping;
gl.shadowMap.enabled = true;
gl.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0d1016');
scene.fog = new THREE.Fog('#0d1016', 900, 1800);
const pm = new THREE.PMREMGenerator(gl);
scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;
const camera = new THREE.PerspectiveCamera(30, 1, 10, 5000);
scene.add(new THREE.HemisphereLight('#a8c0e0', '#1c2230', 1.3));
const sun = new THREE.DirectionalLight('#ffe2c4', 2.4);
sun.position.set(-400, 900, 300);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -500, right: 500, top: 500, bottom: -500, near: 50, far: 2500 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 1.2;
scene.add(sun);
const rim = new THREE.DirectionalLight('#7fc8ff', 1.2);
rim.position.set(300, 300, -600);
scene.add(rim);

// floor: spaceport deck plates
{
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const x = c.getContext('2d')!;
  x.fillStyle = '#20252e';
  x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.12)';
    x.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  x.strokeStyle = '#15181e';
  x.lineWidth = 4;
  for (let i = 0; i <= 512; i += 128) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 512); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(512, i); x.stroke();
  }
  x.fillStyle = '#3a414e';
  for (let i = 0; i < 512; i += 128) for (let j = 0; j < 512; j += 128) for (const [a, b] of [[8, 8], [120, 8], [8, 120], [120, 120]]) x.fillRect(i + a - 2, j + b - 2, 4, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(10, 10);
  t.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ map: t, bumpMap: t, bumpScale: 1.4, roughness: 0.8, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // divider between the two sides
  const div = new THREE.Mesh(new THREE.PlaneGeometry(3, 1600), new THREE.MeshBasicMaterial({ color: '#5ef2ff', transparent: true, opacity: 0.35 }));
  div.rotation.x = -Math.PI / 2;
  div.position.y = 0.3;
  scene.add(div);
}

const composer = new EffectComposer(gl);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.45, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ current (2D-derived) models

const ink = outlineMat(0.9);
function rigGroup(rig: RigDef) {
  const mat = toonMat();
  const g = new THREE.Group();
  const parts = rig.parts.map((p) => {
    const geo = p.geo.clone();
    geo.translate(-p.pivot[0], -p.pivot[1], -p.pivot[2]);
    const o = new THREE.Object3D();
    o.position.set(...p.pivot);
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    o.add(new THREE.Mesh(geo, ink), m);
    g.add(o);
    return o;
  });
  const rot = new Float32Array(rig.parts.length * 2);
  return {
    group: g,
    animate(ph: number) {
      const bob = rig.pose(ph, rot);
      parts.forEach((o, i) => o.rotation.set(rot[i * 2 + 1], 0, rot[i * 2]));
      g.position.y = bob;
    },
  };
}

// ------------------------------------------------------------------ actors

const SCALE = 1.3; // the game's ACTOR_SCALE
type Mover = { obj: THREE.Object3D; side: -1 | 1; base: THREE.Vector3; animate: (ph: number, t: number, hit: number) => void; speed: number; ph: number; kind: string };
const nowSide = new THREE.Group();
const dSide = new THREE.Group();
scene.add(nowSide, dSide);
const movers: Mover[] = [];
const hordeMovers: Mover[] = [];

let hero: Authored, boss: Authored;
let oldHero: ReturnType<typeof buildHero>;
const oldBoss = detailed(1.8, () => BOSS_BUILDERS.warden());
oldBoss.group.traverse((o) => ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== ink ? ((o as THREE.Mesh).castShadow = true) : 0));

const X = 190;
const LINEUP: [string, number, number][] = [
  ['shambler', -70, 10],
  ['runner', 70, 10],
  ['shambler', -125, -55],
  ['shambler', 125, -55],
];

function addZombies(target: Mover[], side: -1 | 1, list: [string, number, number][], seed0: number, parent: THREE.Group) {
  list.forEach(([kind, x, z], i) => {
    let obj: THREE.Object3D, animate: Mover['animate'];
    if (side === -1) {
      const r = rigGroup(RIG_BUILDERS[kind]());
      obj = new THREE.Group();
      obj.add(r.group);
      animate = (ph) => r.animate(ph);
    } else {
      const z2: Zombie2 = buildZombie2(kind as 'shambler' | 'runner', seed0 + i * 7.31);
      obj = z2.group;
      animate = z2.animate;
    }
    obj.scale.setScalar(SCALE);
    obj.position.set(side * X + x, 0, z);
    parent.add(obj);
    target.push({ obj, side, base: obj.position.clone(), animate, speed: kind === 'runner' ? 7 : 3.6, ph: Math.random() * 6, kind });
  });
}

async function init() {
  hero = await courier(courierUrl);
  boss = await warden(wardenUrl);
  hero.group.position.set(X, 0, 40);
  hero.group.scale.setScalar(SCALE);
  boss.group.position.set(X, 0, -150);
  boss.group.scale.setScalar(1.1);
  dSide.add(hero.group, boss.group);
  oldHero = detailed(2, () => buildHero(SKINS.courier));
  oldHero.group.traverse((o) => ((o as THREE.Mesh).isMesh && (o as THREE.Mesh).material !== ink ? ((o as THREE.Mesh).castShadow = true) : 0));
  oldHero.group.scale.setScalar(SCALE);
  oldHero.group.position.set(-X, 0, 40);
  oldBoss.group.scale.setScalar(1.15);
  oldBoss.group.position.set(-X, 0, -150);
  nowSide.add(oldHero.group, oldBoss.group);
  addZombies(movers, -1, LINEUP, 1, nowSide);
  addZombies(movers, 1, LINEUP, 1, dSide);
  const horde: [string, number, number][] = [];
  for (let i = 0; i < 26; i++) horde.push([i % 5 === 0 ? 'runner' : 'shambler', 0, 0]);
  addZombies(hordeMovers, -1, horde, 3, nowSide);
  addZombies(hordeMovers, 1, horde, 3, dSide);
  hero.play('Idle');
  boss.play('Walking_D_Skeletons');
  applyState();
  loop();
}

// ------------------------------------------------------------------ UI

const state = { view: 'close', show: 'both', scene: 'lineup', hero: 'Idle', boss: 'Walking_D_Skeletons' };
const top = document.createElement('div');
top.className = 'top';
top.innerHTML = `<div class="ttl">Option D<small>Authored hero + boss / rebuilt crowd</small></div><div class="note">Left: today's models. Right: KayKit rig (CC0, Kay Lousberg) in courier and Warden colours with bolted-on sci-fi gear, plus rebuilt procedural infected with knees and elbows.</div>`;
document.body.append(top);
const tagNow = Object.assign(document.createElement('div'), { className: 'tag now', textContent: 'NOW' });
const tagD = Object.assign(document.createElement('div'), { className: 'tag d', textContent: 'OPTION D' });
document.body.append(tagNow, tagD);

const dock = document.createElement('div');
dock.className = 'dock';
document.body.append(dock);
function seg(label: string, key: keyof typeof state, opts: [string, string][]) {
  const g = document.createElement('div');
  g.className = 'grp';
  g.innerHTML = `<b>${label}</b>`;
  const s = document.createElement('div');
  s.className = 'seg';
  for (const [v, t] of opts) {
    const b = document.createElement('button');
    b.textContent = t;
    b.onclick = () => {
      state[key] = v;
      applyState();
    };
    b.dataset.v = v;
    s.append(b);
  }
  g.append(s);
  dock.append(g);
  return () => s.querySelectorAll('button').forEach((b) => b.classList.toggle('on', (b as HTMLButtonElement).dataset.v === state[key]));
}
const syncs = [
  seg('VIEW', 'view', [['game', 'Game camera'], ['close', 'Close-up'], ['spin', 'Turntable']]),
  seg('SHOW', 'show', [['both', 'Side by side'], ['now', 'Now'], ['d', 'Option D']]),
  seg('SCENE', 'scene', [['lineup', 'Lineup'], ['horde', 'Horde']]),
  seg('COURIER', 'hero', [['Idle', 'Idle'], ['Running_A', 'Run'], ['1H_Ranged_Shooting', 'Shoot'], ['Hit_A', 'Hit'], ['Death_A', 'Death']]),
  seg('WARDEN', 'boss', [['Walking_D_Skeletons', 'Stalk'], ['1H_Melee_Attack_Chop', 'Slam'], ['Block', 'Shield'], ['Taunt', 'Taunt'], ['Spawn_Ground_Skeletons', 'Rise']]),
];

function applyState() {
  syncs.forEach((f) => f());
  if (!hero) return;
  const once = ['Hit_A', 'Death_A'].includes(state.hero);
  hero.play(state.hero, 0.2, once);
  boss.play(state.boss, 0.25, ['Spawn_Ground_Skeletons'].includes(state.boss));
  nowSide.visible = state.show !== 'd';
  dSide.visible = state.show !== 'now';
  const horde = state.scene === 'horde';
  for (const m of movers) m.obj.visible = !horde;
  for (const m of hordeMovers) m.obj.visible = horde;
  oldBoss.group.visible = boss.group.visible = !horde;
}

// ------------------------------------------------------------------ loop

const clock = new THREE.Clock();
let camT = 0;
function resize() {
  const w = innerWidth, h = innerHeight;
  gl.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const tmp = new THREE.Vector3();
function placeTag(el: HTMLElement, x: number, visible: boolean) {
  el.style.display = visible ? '' : 'none';
  tmp.set(x, 90, -200).project(camera);
  el.style.left = (tmp.x * 0.5 + 0.5) * innerWidth + 'px';
  el.style.top = Math.max(84, (-tmp.y * 0.5 + 0.5) * innerHeight) + 'px';
}

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;
  hero.mixer.update(dt);
  boss.mixer.update(dt);
  oldBoss.animate(t * 3, state.boss === '1H_Melee_Attack_Chop' ? 3 : state.boss === 'Block' ? 2 : 0, false);
  // the old hero only had a walk cycle and a bob
  const oldMoving = state.hero === 'Running_A';
  const ph = oldMoving ? t * 11 : 0;
  oldHero.legL.rotation.z = oldMoving ? Math.sin(ph) * 0.6 : 0;
  oldHero.legR.rotation.z = oldMoving ? -Math.sin(ph) * 0.6 : 0;
  oldHero.torso.position.y = oldMoving ? Math.abs(Math.cos(ph)) * 2.2 : Math.sin(t * 2.4) * 0.6;

  const horde = state.scene === 'horde';
  const list = horde ? hordeMovers : movers;
  list.forEach((m, i) => {
    m.ph += dt * m.speed;
    if (horde) {
      // the horde circles in on the courier
      const a = (i / (list.length / 2)) * Math.PI * 2 + t * 0.12 * (m.kind === 'runner' ? 2 : 1);
      const r = 75 + ((i * 37) % 70) + Math.sin(t * 0.7 + i) * 10;
      m.obj.position.set(m.side * X + Math.cos(a) * r, 0, Math.sin(a) * r);
      const toward = Math.atan2(-Math.sin(a), -Math.cos(a));
      m.obj.rotation.y = -toward + 0.35;
    } else {
      m.obj.position.copy(m.base);
      const dx = m.side * X - m.base.x, dz = 40 - m.base.z;
      m.obj.rotation.y = -Math.atan2(dz, dx);
    }
    const hit = Math.max(0, Math.sin(t * 1.7 + i * 2.1) - 0.93) * 12;
    m.animate(m.ph, t + i, Math.min(1, hit));
  });

  if (state.view === 'spin') {
    hero.group.rotation.y = oldHero.group.rotation.y = boss.group.rotation.y = oldBoss.group.rotation.y = t * 0.6;
  } else {
    hero.group.rotation.y = oldHero.group.rotation.y = 0;
    boss.group.rotation.y = oldBoss.group.rotation.y = Math.PI / 2 + 0.6;
  }

  // camera
  const both = state.show === 'both';
  const cx = both ? 0 : state.show === 'now' ? -X : X;
  const portrait = innerWidth < innerHeight;
  if (state.view === 'game') {
    const pitch = (50 * Math.PI) / 180;
    const d = (both ? 1100 : 620) * (portrait ? 1.9 : 1);
    camera.position.set(cx, Math.sin(pitch) * d, Math.cos(pitch) * d + 10);
    camera.lookAt(cx, 0, 10);
  } else {
    camT += dt * (state.view === 'spin' ? 0 : 0.25);
    const d = (both ? 820 : 430) * (portrait ? 1.8 : 1);
    const a = Math.sin(camT) * 0.35;
    camera.position.set(cx + Math.sin(a) * d, 150, Math.cos(a) * d);
    camera.lookAt(cx, 40, -20);
  }
  const ok = state.view === 'game' || both;
  placeTag(tagNow, -X, state.show !== 'd' && ok);
  placeTag(tagD, X, state.show !== 'now' && ok);
  composer.render(dt);
}

init().catch((e) => {
  // never fail silently: show what broke instead of an empty page
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:16px;right:16px;top:40%;text-align:center;color:#ff3b5c;font:600 14px Chakra Petch,sans-serif';
  box.textContent = 'Preview failed to load: ' + (e?.message ?? e);
  document.body.append(box);
});
(window as unknown as Record<string, unknown>).__pv = { state, applyState };
