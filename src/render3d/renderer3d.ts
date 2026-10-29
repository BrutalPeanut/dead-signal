import { isGun } from '../sim/data';
import * as THREE from 'three';
import type { Game } from '../sim/game';
import type { Pickup } from '../sim/types';
import { bladePositions, bladesActive, weaponStats } from '../sim/weapons';
import { currentHeroSkin, type HeroSkin } from '../render/hero';
import { Fx } from '../render/fx';
import { Decals } from './decals';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GLOW, GlowBatch, TriBatch } from './batches';
import { OUTLINE_RES, Part, RIM, SIGNAL, detailed, outlineMat, rgbC, toonMat } from './kit3d';
import { BOSS_BUILDERS, buildHero, type BossModel, type HeroModel } from './models';
import { CROWD, CrowdKind, setCrowdPalette, variantScale } from './crowd2';
import { AuthoredBoss, AuthoredHero, BOSS_ANIMS, BOSS_MESH, COURIER, loadGlb, preloadAuthored, type Gltf } from './authored';
import type { Enemy } from '../sim/types';
import { drawOverlay } from './overlay';
import { ATMOS, World } from './world';

/** Muzzle flash colour per gun. */
const MUZZLE: Record<string, string> = { pistol: '#5ef2ff', smg: '#ffd34d', mg: '#ffb02e', flamer: '#ff7a1f', bazooka: '#ff4d3d' };

/** Same framing rule as the 2D renderer: this many world units across a portrait phone. */
const TARGET_VIEW = 360;
const FOV = 30;
/** Camera pitch below the horizon. Steep enough that the sim's view rectangle maps cleanly. */
const PITCH = (50 * Math.PI) / 180;
/**
 * Characters are drawn a bit larger than their sim footprint: seen from above, a standing figure
 * loses height to the camera tilt, and this keeps them as readable as the 2D sprites.
 */
const ACTOR_SCALE = 1.3;
const MAX_PER_KIND = 520;

// fx.ts particle kinds (a const enum there): Spark, Goo, Ring, Smoke, Flash, Chunk
const PK_SPARK = 0, PK_GOO = 1, PK_RING = 2, PK_SMOKE = 3, PK_FLASH = 4, PK_CHUNK = 5;

/**
 * Quality tiers, picked from the device and then adjusted from real frame times:
 * 0 = no shadows / no bloom, 1 = sun shadows for hero, bosses and props + half-res bloom,
 * 2 = every infected casts a shadow + full-res bloom.
 */
export type Tier = 0 | 1 | 2;

interface Corpse {
  seed: number;
  kind: string;
  x: number;
  y: number;
  yaw: number;
  ph: number;
  sc: number;
  t: number;
}

interface Light {
  x: number;
  y: number;
  r: number;
  c: [number, number, number];
  a: number;
  life: number;
  max: number;
}

interface Mote {
  x: number;
  y: number;
  h: number;
  s: number;
  p: number;
}

const WHITE = new THREE.Color(1, 1, 1);
const CORPSE = new THREE.Color(0.5, 0.46, 0.5);
const FLASH = new THREE.Color(2.6, 2.6, 2.6);
const FLASH_ELITE = new THREE.Color(1.7, 1.7, 1.7);


/**
 * Three.js renderer for Dead Signal. Drop-in replacement for the 2D Renderer: same public surface
 * (fx, joystick, guide, setGame, resize, adapt, render) and it reads the exact same sim state,
 * so gameplay, balance and UI are untouched; only the picture changes.
 */
export class Renderer3D {
  readonly fx = new Fx();
  joystick: { ox: number; oy: number; x: number; y: number } | null = null;
  padIdle: { x: number; y: number } | null = null;
  joystickFixed = false;
  guide: { x: number; y: number } | null = null;
  dprCap = 2;
  zoom = 1;
  cssW = 0;
  cssH = 0;
  dpr = 1;
  camX = 0;
  camY = 0;
  time = 0;

  private gl: THREE.WebGLRenderer;
  private glCanvas: HTMLCanvasElement;
  private octx: CanvasRenderingContext2D;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(FOV, 1, 10, 6000);
  private camDist = 900;
  private hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1.6);
  private sun = new THREE.DirectionalLight(0xffffff, 1.4);
  private world!: World;
  private ink = outlineMat(0.9);

  private glowAdd = new GlowBatch(5000, 'add', 'glow');
  private softAlpha = new GlowBatch(2500, 'alpha', 'soft');
  private flatAdd = new TriBatch(90000, 'add');
  private flatAlpha = new TriBatch(60000, 'alpha');
  private ribbons = new TriBatch(30000, 'add');

  private crowd = new Map<string, CrowdKind>();
  private hero: HeroModel | null = null;
  private authHero: AuthoredHero | null = null;
  private heroSkin: HeroSkin | null = null;
  private heroYaw = 0;
  private twist = 0;
  private moveAng = 0;
  private lastPx = 0;
  private lastPy = 0;
  private lastHurt = 0;
  /** Loaded authored models (Option D), by URL. Until loaded, procedural stand-ins draw. */
  private assets = new Map<string, Gltf>();
  private bossLive = new Map<number, { m: AuthoredBoss; prev: { state: number; stateT: number; shootCd: number }; x: number; y: number; phase2: boolean; dying: number }>();
  private bossDownAt = false;
  private oldBosses = new Map<string, BossModel>();
  private oldSeen = new Set<string>();
  private yaw = new Map<number, number>();
  private yawNext = new Map<number, number>();

  // pickups & projectiles
  private gemMesh: THREE.InstancedMesh;
  private gemInk: THREE.InstancedMesh;
  private coinMesh: THREE.InstancedMesh;
  private coinInk: THREE.InstancedMesh;
  private shellMesh: THREE.InstancedMesh;
  private discMesh: THREE.InstancedMesh;
  private drillMesh: THREE.InstancedMesh;
  private shotMesh: THREE.InstancedMesh;
  private bladeMesh: THREE.InstancedMesh;
  private sawMesh: THREE.InstancedMesh;
  private pylonMesh: THREE.InstancedMesh;
  private props = new Map<string, THREE.Object3D[]>();
  private beamGeo: THREE.CylinderGeometry;
  private beamMats: Record<string, THREE.MeshBasicMaterial> = {};
  private cageWall: THREE.Mesh;
  private decals = new Decals();
  /** Ground rectangle the camera can currently see (sim coords), for culling and streaming. */
  private view = { x0: 0, y0: 0, x1: 0, y1: 0 };

  private slowT = 0;
  private fastT = 0;
  tier: Tier = 1;
  private maxTier: Tier = 1;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private corpses: Corpse[] = [];
  private lights: Light[] = [];
  private motes: Mote[] = [];
  private muzzle = 0;
  private muzzleCol = '#5ef2ff';
  private corpseSeed = 1;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private e3 = new THREE.Euler();
  private pv = new THREE.Vector3();

  constructor(readonly canvas: HTMLCanvasElement, private game: Game) {
    // WebGL canvas sits behind the original canvas, which becomes the transparent 2D overlay
    // (and keeps receiving the touch input it always did).
    this.glCanvas = document.createElement('canvas');
    this.glCanvas.id = 'game3d';
    canvas.parentElement!.insertBefore(this.glCanvas, canvas);
    this.gl = new THREE.WebGLRenderer({ canvas: this.glCanvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.NeutralToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    const pm = new THREE.PMREMGenerator(this.gl);
    this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.18;
    pm.dispose();
    this.octx = canvas.getContext('2d')!;
    canvas.classList.add('overlay3d');

    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.position.set(-400, 900, 250);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.2;
    this.sun.shadow.camera.near = 50;
    this.sun.shadow.camera.far = 2600;

    this.flatAlpha.mesh.renderOrder = 1;
    this.flatAdd.mesh.renderOrder = 2;
    this.softAlpha.points.renderOrder = 6;
    this.glowAdd.points.renderOrder = 7;
    this.ribbons.mesh.renderOrder = 8;
    this.scene.add(this.flatAlpha.mesh, this.flatAdd.mesh, this.softAlpha.points, this.glowAdd.points, this.ribbons.mesh);

    const tm = toonMat();
    const inst = (geo: THREE.BufferGeometry, n: number, mat: THREE.Material = tm) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
      return m;
    };
    const withInk = (geo: THREE.BufferGeometry, n: number, color = true): [THREE.InstancedMesh, THREE.InstancedMesh] => {
      const main = inst(geo, n);
      const ink = inst(geo, n, this.ink);
      ink.instanceMatrix = main.instanceMatrix;
      if (color) {
        main.setColorAt(0, WHITE);
        main.instanceColor!.setUsage(THREE.DynamicDrawUsage);
      }
      return [main, ink];
    };
    [this.gemMesh, this.gemInk] = withInk(new Part().ball(1, 1, 1, '#ffffff', [0, 0, 0], undefined, 4).build(), 400);
    // the 4-segment sphere reads as a faceted crystal; stretch it into a shard
    this.gemMesh.geometry.scale(0.68, 1, 0.68);
    [this.coinMesh, this.coinInk] = withInk(new Part().cyl(4.5, 4.5, 1.4, '#ffd34d', [0, 0, 0], [Math.PI / 2, 0, 0], 14).cyl(1.8, 1.8, 1.6, '#fff4b8', [0, 0, 0], [Math.PI / 2, 0, 0], 8).build(), 300, false);
    this.shellMesh = inst(new Part().ball(5, 3, 3, '#3a3f4a', [0, 0, 0]).build(), 120);
    this.shellMesh.setColorAt(0, WHITE);
    this.discMesh = inst(new Part().torus(1, 0.22, '#ff4fd8', [0, 0, 0], [Math.PI / 2, 0, 0]).cyl(0.5, 0.5, 0.2, '#ffffff', [0, 0, 0]).build(), 60);
    this.drillMesh = inst(new Part().cone(0.7, 2, '#c9a21c', [0, 0, 0], [0, 0, -Math.PI / 2]).build(), 40);
    this.shotMesh = inst(new Part().ball(1, 1, 1, '#ffffff', [0, 0, 0], undefined, 8).build(), 400, new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.shotMesh.setColorAt(0, WHITE);
    this.bladeMesh = inst(new Part().torus(1, 0.22, '#ffb84d', [0, 0, 0], [Math.PI / 2, 0, 0], Math.PI * 0.85).build(), 16);
    const saw = new Part().cyl(1, 1, 0.25, '#ffb84d', [0, 0, 0], undefined, 16).cyl(0.36, 0.36, 0.3, '#fff2c8', [0, 0, 0]);
    for (let i = 0; i < 8; i++) saw.cone(0.22, 0.45, '#ffe9a8', [Math.cos(i * 0.785) * 1.1, 0, Math.sin(i * 0.785) * 1.1], [Math.PI / 2, 0, -Math.PI / 2 + i * 0.785 + 0.6]);
    this.sawMesh = inst(saw.build(), 16);
    this.pylonMesh = inst(new Part().box(6, 16, 6, '#2a2d35', [0, 8, 0]).box(4.4, 3, 6.4, SIGNAL, [0, 13, 0]).build(), 12);

    this.beamGeo = new THREE.CylinderGeometry(6, 6, 90, 12, 1, true);
    this.beamGeo.translate(0, 45, 0);
    const beamTex = gradientTex();
    for (const col of ['#ffd34d', '#5ef2ff']) this.beamMats[col] = new THREE.MeshBasicMaterial({ color: col, map: beamTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const wallGeo = new THREE.CylinderGeometry(1, 1, 60, 72, 1, true);
    wallGeo.translate(0, 30, 0);
    this.cageWall = new THREE.Mesh(wallGeo, new THREE.MeshBasicMaterial({ color: SIGNAL, map: beamTex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.cageWall.renderOrder = 5;
    this.cageWall.visible = false;
    this.scene.add(this.cageWall);

    this.scene.add(this.decals.group);

    // authored models stream in; procedural stand-ins draw until each one is ready
    preloadAuthored().catch(() => {});
    for (const url of [COURIER, BOSS_ANIMS, ...new Set(Object.values(BOSS_MESH))]) loadGlb(url).then((m) => this.assets.set(url, m)).catch((err) => console.warn('model load failed', url, err));
    const touch = matchMedia('(pointer:coarse)').matches;
    this.maxTier = touch ? 1 : 2;
    this.setGame(game);
    this.resize();
    this.setTier(this.maxTier);
  }

  /** Switch shadows and bloom for a quality tier. */
  setTier(t: Tier) {
    this.tier = t;
    const shadows = t >= 1;
    this.gl.shadowMap.enabled = shadows;
    this.sun.castShadow = shadows;
    const size = t === 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    for (const k of this.crowd.values()) k.setShadows(t === 2);
    if (t >= 1) {
      if (!this.composer) {
        this.composer = new EffectComposer(this.gl);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.4, 0.45, 1.02);
        this.composer.addPass(this.bloom);
        this.composer.addPass(new OutputPass());
      }
    } else if (this.composer) {
      this.composer.dispose();
      this.composer = null;
      this.bloom = null;
    }
    // additive light piles up faster in linear HDR with bloom on top: tone it down to match tier 0
    GLOW.uBoost.value = t >= 1 ? 1.35 : 1;
    GLOW.uGain.value = t >= 1 ? 0.55 : 1;
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) for (const x of Array.isArray(m) ? m : [m]) x.needsUpdate = true;
    });
    this.resize();
  }

  /** Cast shadows from a model's coloured meshes (not its ink hull). */
  private shadowCaster(o: THREE.Object3D) {
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.material !== this.ink) m.castShadow = true;
    });
  }

  // ------------------------------------------------------------------ lifecycle

  setGame(g: Game) {
    this.game = g;
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    this.world = new World(g.chapter.biome, Math.min(8, this.gl.capabilities.getMaxAnisotropy()), this.ink);
    this.scene.add(this.world.group);
    const at = ATMOS[g.chapter.biome];
    this.scene.background = new THREE.Color(at.bg);
    this.hemi.color.set(at.sky);
    this.hemi.groundColor.set(at.floor);
    this.hemi.intensity = at.hemi;
    this.sun.color.set(at.sun);
    this.sun.intensity = at.sunI;
    RIM.uRimColor.value.set(at.rim);
    setCrowdPalette(at.darkFloor);
    this.motes.length = 0;
    this.corpses.length = 0;
    this.lights.length = 0;
    this.camX = g.px;
    this.camY = g.py;
    this.yaw.clear();
    for (const s of this.bossLive.values()) this.scene.remove(s.m.group);
    this.bossLive.clear();
    for (const b of this.oldBosses.values()) this.scene.remove(b.group);
    this.oldBosses.clear();
    this.lastPx = g.px;
    this.lastPy = g.py;
    this.applyView();
  }

  adapt(frameMs: number) {
    if (frameMs > 22) {
      this.slowT += frameMs / 1000;
      this.fastT = 0;
    } else if (frameMs < 15) {
      this.fastT += frameMs / 1000;
      this.slowT = Math.max(0, this.slowT - frameMs / 2000);
    }
    const native = Math.min(window.devicePixelRatio || 1, 2);
    // slow: drop effects first (cheapest to lose), then resolution; fast: restore in reverse
    if (this.slowT > 1.5) {
      this.slowT = 0;
      if (this.tier > 0) this.setTier((this.tier - 1) as Tier);
      else if (this.dprCap > 1) {
        this.dprCap = Math.max(1, this.dprCap - 0.5);
        this.resize();
      }
    } else if (this.fastT > 8) {
      this.fastT = 0;
      if (this.dprCap < native) {
        this.dprCap = Math.min(native, this.dprCap + 0.5);
        this.resize();
      } else if (this.tier < this.maxTier) this.setTier((this.tier + 1) as Tier);
    }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, this.dprCap);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.gl.setPixelRatio(dpr);
    this.gl.setSize(w, h, false);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    OUTLINE_RES.value.set(w, h); // CSS pixels: outline widths are given in CSS px
    this.zoom = Math.max(Math.min(w, h) / TARGET_VIEW, 0.75);
    if (h > w) this.zoom = w / TARGET_VIEW;
    this.zoom = Math.min(this.zoom, 2.4);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const b of [this.glowAdd, this.softAlpha]) b.setScale(h * dpr, FOV);
    if (this.composer) {
      this.composer.setPixelRatio(dpr);
      this.composer.setSize(w, h);
      // bloom is blurry by nature: half resolution on the middle tier costs a quarter as much
      if (this.bloom && this.tier < 2) this.bloom.setSize(Math.round((w * dpr) / 2), Math.round((h * dpr) / 2));
    }
    this.applyView();
  }

  private applyView() {
    this.game.viewW = this.cssW / (2 * this.zoom);
    this.game.viewH = this.cssH / (2 * this.zoom);
    this.fitCamera();
  }

  /** Smallest camera distance at which the sim's whole view rectangle is on screen. */
  private fitCamera() {
    const hw = this.game.viewW, hh = this.game.viewH;
    if (!hw || !hh) return;
    const cam = this.camera;
    const fits = (d: number) => {
      cam.position.set(0, Math.sin(PITCH) * d, Math.cos(PITCH) * d);
      cam.lookAt(0, 0, 0);
      cam.updateMatrixWorld();
      // the view rectangle's centre cross must be on screen (its near corners may clip slightly)
      for (const [x, z] of [[-hw, 0], [hw, 0], [0, -hh], [0, hh]]) {
        this.pv.set(x, 0, z).project(cam);
        if (Math.abs(this.pv.x) > 1.0 || Math.abs(this.pv.y) > 1.0) return false;
      }
      return true;
    };
    let lo = 50, hi = 20000;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    this.camDist = hi;
    cam.near = Math.max(10, hi * 0.2);
    cam.far = hi * 3;
    cam.updateProjectionMatrix();
    const at = ATMOS[this.game.chapter.biome];
    this.scene.fog = new THREE.Fog(at.bg, hi * at.fogNear * 1.12, hi * 1.75);
    const S = Math.max(hw, hh) * 1.35 + 80;
    const sc = this.sun.shadow.camera;
    sc.left = -S;
    sc.right = S;
    sc.top = S;
    sc.bottom = -S;
    sc.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ frame

  render(dt: number) {
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    if (cw && ch && (Math.abs(cw - this.cssW) > 0.5 || Math.abs(ch - this.cssH) > 0.5)) this.resize();
    const g = this.game;
    this.time += dt;
    this.scanEvents(g, dt);
    this.fx.consume(g.fx, g);
    g.fx.length = 0;
    this.fx.update(dt);

    const k = 1 - Math.pow(0.0001, dt);
    this.camX += (g.px - this.camX) * k;
    this.camY += (g.py - this.camY) * k;
    const sh = this.fx.shake;
    const sx = sh ? (Math.random() - 0.5) * sh : 0;
    const sy = sh ? (Math.random() - 0.5) * sh : 0;
    const cx = this.camX + sx, cz = this.camY + sy;
    this.camera.position.set(cx, Math.sin(PITCH) * this.camDist, cz + Math.cos(PITCH) * this.camDist);
    this.camera.lookAt(cx, 0, cz);
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.ribbons.view);
    // follow the camera with the sun, snapped to whole shadow texels so edges don't shimmer
    const texel = (this.sun.shadow.camera.right * 2) / this.sun.shadow.mapSize.x;
    const sxs = Math.round(cx / texel) * texel, szs = Math.round(cz / texel) * texel;
    this.sun.target.position.set(sxs, 0, szs);
    this.sun.position.set(sxs - 400, 900, szs + 250);

    this.footprint();
    const v = this.view;
    this.world.update(v.x0 - 30, v.y0 - 30, v.x1 + 30, v.y1 + 30);

    this.glowAdd.begin();
    this.softAlpha.begin();
    this.flatAdd.begin();
    this.flatAlpha.begin();
    this.ribbons.begin();

    for (const sg of this.world.glows) {
      const fl = 0.85 + 0.15 * Math.sin(this.time * 3 + sg.x);
      this.glowAdd.add(sg.x, sg.y, sg.z, sg.size * fl, rgbC(sg.color), 0.5);
      this.light(sg.x, sg.z, sg.size * 2.2, rgbC(sg.color), 0.12 * fl);
    }
    this.drawLights(dt);
    this.drawWeather(dt);
    this.drawDecals();
    this.drawPools();
    this.drawField();
    this.drawTelegraphs();
    this.drawCage();
    this.drawShadows();
    this.drawPickups();
    this.drawEnemies();
    this.drawBosses(dt);
    this.drawHero(dt);
    this.drawBlades();
    this.drawProjectiles();
    this.drawShots();
    this.drawParticles();

    this.glowAdd.end();
    this.softAlpha.end();
    this.flatAdd.end();
    this.flatAlpha.end();
    this.ribbons.end();

    if (this.composer) this.composer.render(dt);
    else this.gl.render(this.scene, this.camera);

    drawOverlay({
      ctx: this.octx,
      w: this.cssW,
      h: this.cssH,
      dpr: this.dpr,
      time: this.time,
      game: g,
      fx: this.fx,
      project: this.project,
      joystick: this.joystick,
      joystickFixed: this.joystickFixed,
      padIdle: this.padIdle,
      guide: this.guide,
    });
  }

  /** World (sim x, sim y, height) → CSS pixels. */
  private project = (x: number, y: number, h: number) => {
    const v = this.pv.set(x, h, y).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.cssW, y: (-v.y * 0.5 + 0.5) * this.cssH, ok: v.z < 1 && v.z > -1 };
  };

  // ------------------------------------------------------------------ light & life

  /** Read this frame's sim events before Fx consumes them: corpses, muzzle flashes, flash lights. */
  private scanEvents(g: Game, dt: number) {
    for (const e of g.fx) {
      switch (e.t) {
        case 'death':
          if (CROWD[e.kind] && this.corpses.length < [40, 80, 140][this.tier] && this.seen(e.x, e.y, 60)) {
            const id = this.corpseSeed++;
            this.corpses.push({ kind: e.kind, x: e.x, y: e.y, yaw: -Math.atan2(g.py - e.y, g.px - e.x), ph: Math.random() * 6, sc: (e.elite ? 1.3 : 1) * ACTOR_SCALE, t: 0, seed: id });
          }
          break;
        case 'shoot':
          if (MUZZLE[e.weapon]) {
            this.muzzle = 0.07;
            this.muzzleCol = MUZZLE[e.weapon];
          }
          break;
        case 'explode':
          this.flashLight(e.x, e.y, e.r * 2.4, e.color, 0.5, 0.3);
          break;
        case 'bossDown':
          this.bossDownAt = true;
          this.flashLight(e.x, e.y, 420, '#ff3bd4', 1, 0.9);
          break;
        case 'emp':
          this.flashLight(e.x, e.y, 700, '#5ef2ff', 0.45, 0.6);
          break;
        case 'levelup':
          this.flashLight(g.px, g.py, 130, '#5ef2ff', 0.35, 0.45);
          break;
        case 'slash':
          this.flashLight(e.x, e.y, e.r * 1.6, e.evo ? '#ffb3c6' : '#ff5470', 0.35, 0.2);
          break;
      }
    }
    for (const c of this.corpses) c.t += dt;
    if (this.corpses.length && this.corpses[0].t > 1.1) this.corpses = this.corpses.filter((c) => c.t <= 1.1);
    this.muzzle = Math.max(0, this.muzzle - dt);
  }

  private flashLight(x: number, y: number, r: number, color: string, a: number, life: number) {
    if (this.lights.length > 60) this.lights.shift();
    this.lights.push({ x, y, r, c: rgbC(color), a, life, max: life });
  }

  /** A pool of coloured light on the floor: the cheap stand-in for hundreds of point lights. */
  private light(x: number, y: number, r: number, c: ArrayLike<number>, a: number) {
    a *= 0.6;
    if (a < 0.01 || !this.seen(x, y, r)) return;
    this.flatAdd.disc(x, y, r, 0.9, c, a, 0, 10);
  }

  private drawLights(dt: number) {
    for (const l of this.lights) {
      l.life -= dt;
      const k = Math.max(0, l.life / l.max);
      this.light(l.x, l.y, l.r * (1.15 - k * 0.15), l.c, l.a * k * k);
    }
    if (this.lights.length && this.lights[0].life <= 0) this.lights = this.lights.filter((l) => l.life > 0);
  }

  /** Per-biome ambient weather drifting through the frame (rain, spores, dust, embers). */
  private drawWeather(dt: number) {
    const at = ATMOS[this.game.chapter.biome];
    const v = this.view;
    const n = this.tier === 0 ? 50 : 110;
    while (this.motes.length < n) this.motes.push({ x: v.x0 + Math.random() * (v.x1 - v.x0), y: v.y0 + Math.random() * (v.y1 - v.y0), h: Math.random() * 140, s: 0.5 + Math.random(), p: Math.random() * 6 });
    this.motes.length = n;
    const c = rgbC(at.weatherCol);
    const W = v.x1 - v.x0, H = v.y1 - v.y0;
    for (const m of this.motes) {
      if (at.weather === 'rain') {
        m.h -= dt * 420 * m.s;
        m.x += dt * 40;
        if (m.h < 0) {
          this.flatAdd.band(m.x, m.y, 2, 3.4, 0.8, c, 0.25);
          m.h += 160;
        }
        this.ribbons.seg(m.x, m.h, m.y, m.x - 4, m.h + 22, m.y, 0.9, c, 0.22, 0);
      } else if (at.weather === 'embers') {
        m.h += dt * 26 * m.s;
        m.x += Math.sin(this.time + m.p) * dt * 12;
        if (m.h > 150) m.h = 0;
        this.glowAdd.add(m.x, m.h, m.y, 3.4 * m.s, c, 0.6 * Math.min(1, (150 - m.h) / 40));
      } else {
        // spores and dust hang in the air and drift
        m.x += Math.sin(this.time * 0.6 + m.p) * dt * 10 + dt * 6;
        m.y += Math.cos(this.time * 0.5 + m.p) * dt * 8;
        m.h = 20 + ((m.p * 37) % 100) + Math.sin(this.time + m.p) * 6;
        if (at.weather === 'spores') this.glowAdd.add(m.x, m.h, m.y, 4 * m.s, c, 0.45);
        else this.softAlpha.add(m.x, m.h, m.y, 3 * m.s, c, 0.25);
      }
      // wrap around the visible ground
      if (m.x < v.x0) m.x += W;
      else if (m.x > v.x1) m.x -= W;
      if (m.y < v.y0) m.y += H;
      else if (m.y > v.y1) m.y -= H;
    }
  }

  // ------------------------------------------------------------------ ground layers

  private drawDecals() {
    for (const d of this.fx.decals) {
      if (d.v !== undefined) continue;
      // explosion scorch marks
      const fade = Math.min(1, d.life / 3);
      this.flatAlpha.disc(d.x, d.y, d.r, 0.4, rgbC(d.color), fade * 0.55, fade * 0.4, 18);
    }
    this.decals.update(this.fx.decals);
  }

  /** Intersect the screen corners with the floor to get the visible ground rectangle. */
  private footprint() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const cam = this.camera.position;
    for (const [nx, ny] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const v = this.pv.set(nx, ny, 0.5).unproject(this.camera).sub(cam);
      // rays above the horizon would never land; clamp them to a long distance
      const t = v.y < -1e-3 ? -cam.y / v.y : this.camDist * 3;
      const x = cam.x + v.x * t, z = cam.z + v.z * t;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, z); y1 = Math.max(y1, z);
    }
    const v = this.view;
    v.x0 = x0; v.y0 = y0; v.x1 = x1; v.y1 = y1;
  }

  /** Is a sim point (with a radius margin) inside the visible ground rectangle? */
  private seen(x: number, y: number, m: number) {
    const v = this.view;
    return x > v.x0 - m && x < v.x1 + m && y > v.y0 - m && y < v.y1 + m * 1.6;
  }

  private drawPools() {
    const t = this.time;
    const pools = this.game.pools;
    for (const p of pools) {
      const a = Math.min(1, p.life / 0.4) * Math.min(1, (p.maxLife - p.life) / 0.15 + 0.2) * (p.evo || pools.length > 14 ? 0.55 : 0.85);
      this.flatAdd.disc(p.x, p.y, p.r * 0.5, 0.6, rgbC(p.evo ? '#fff2a8' : '#ffd36a'), a * 0.9, a * 0.6, 20);
      this.flatAdd.band(p.x, p.y, p.r * 0.5, p.r, 0.6, rgbC(p.evo ? '#ff5a1e' : '#ff781e'), a * 0.6, 0, 0, Math.PI * 2, 24);
      for (let i = 0; i < 5; i++) {
        const a2 = i * 1.26 + t * 2;
        const fl = (Math.sin(t * 13 + i * 3) + 1.5) * 3.5;
        this.glowAdd.add(p.x + Math.cos(a2) * p.r * 0.5, 3 + fl, p.y + Math.sin(a2) * p.r * 0.5, 7 + fl * 1.4, rgbC('#ffaa3c'), a * 0.8);
      }
      this.light(p.x, p.y, p.r * 1.9, rgbC('#ff8a2a'), a * (0.3 + 0.06 * Math.sin(t * 17 + p.x)));
    }
  }

  private drawField() {
    const g = this.game;
    const w = g.weapons.find((x) => x.id === 'field');
    if (!w) return;
    const s = weaponStats(w);
    const r = s.area * g.areaMul;
    const t = this.time;
    const col = rgbC(w.evolved ? '#b06bff' : '#43ffa4');
    this.flatAdd.band(g.px, g.py, r * 0.2, r * 0.75, 0.8, col, 0, 0.14, 0, Math.PI * 2, 40);
    this.flatAdd.band(g.px, g.py, r * 0.75, r, 0.8, col, 0.14, 0.38, 0, Math.PI * 2, 48);
    // dashed rim crawling around
    const dash = 18;
    const off = t * 30 * (w.evolved ? -1 : 1) / r;
    for (let i = 0; i < 2 * Math.PI * r / dash; i++) {
      const a0 = (i * dash) / r + off;
      this.flatAdd.band(g.px, g.py, r - 0.9, r + 0.9, 1, col, 0.6, 0.6, a0, a0 + (10 / r), 2);
    }
    if (w.evolved) {
      for (let i = 0; i < 3; i++) {
        const pts: number[] = [];
        for (let k = 0; k <= 20; k++) {
          const f = k / 20;
          const a = t * 1.5 + i * 2.09 + f * 2.5;
          const rr = r * (1 - f * 0.85);
          pts.push(g.px + Math.cos(a) * rr, g.py + Math.sin(a) * rr);
        }
        this.ribbons.line(pts, 3, 3, col, 0.35);
      }
    }
  }

  private drawTelegraphs() {
    const red = rgbC('#ff2850');
    for (const tg of this.game.telegraphs) {
      const prog = tg.total > 0 ? 1 - Math.max(0, tg.t) / tg.total : 1;
      if (tg.kind === 'circle') {
        this.flatAdd.disc(tg.x, tg.y, tg.r, 1.2, red, 0.16);
        this.flatAdd.band(tg.x, tg.y, tg.r - 1.5, tg.r + 1.5, 1.3, red, 0.85);
        this.flatAdd.disc(tg.x, tg.y, Math.max(0, tg.r * prog), 1.4, red, 0.35);
      } else if (tg.t > 0) {
        this.flatAdd.rect(tg.x, tg.y, tg.a, tg.len, tg.r, 1.2, red, 0.14);
        this.flatAdd.rect(tg.x, tg.y, tg.a, tg.len * prog, tg.r, 1.3, red, 0.32);
        this.flatAdd.rectLine(tg.x, tg.y, tg.a, tg.len, tg.r, 1.4, 1.5, red, 0.8);
        if (tg.sweep !== 0) {
          const a1 = tg.a + tg.sweep * tg.active;
          this.flatAdd.band(tg.x, tg.y, tg.len * 0.6 - 1, tg.len * 0.6 + 1, 1.4, red, 0.4, 0.4, Math.min(tg.a, a1), Math.max(tg.a, a1), 30);
        }
      } else if (tg.active > 0) {
        // live laser: a real beam at chest height plus its scorch on the floor
        const w = tg.r * (1 + Math.sin(this.time * 50) * 0.15);
        const ex = tg.x + Math.cos(tg.a) * tg.len, ez = tg.y + Math.sin(tg.a) * tg.len;
        this.ribbons.seg(tg.x, 30, tg.y, ex, 24, ez, w * 3.2, rgbC(SIGNAL), 0.45);
        this.ribbons.seg(tg.x, 30, tg.y, ex, 24, ez, w, rgbC('#ffd6f6'), 1);
        this.flatAdd.rect(tg.x, tg.y, tg.a, tg.len, w * 1.6, 1.5, rgbC(SIGNAL), 0.4);
        this.flatAdd.rect(tg.x, tg.y, tg.a, tg.len, w * 5, 1.4, rgbC(SIGNAL), 0.07);
      }
    }
  }

  private drawCage() {
    const c = this.game.cage;
    this.cageWall.visible = !!c;
    if (!c) {
      this.pylonMesh.count = 0;
      return;
    }
    const t = this.time;
    this.flatAlpha.band(c.x, c.y, c.r, c.r + 2400, 0.5, [0.04, 0, 0.04], 0.25, 0.25, 0, Math.PI * 2, 64);
    this.cageWall.position.set(c.x, 0, c.y);
    this.cageWall.scale.set(c.r, 1 + Math.sin(t * 4) * 0.06, c.r);
    (this.cageWall.material as THREE.MeshBasicMaterial).opacity = 0.42 + Math.sin(t * 9) * 0.06;
    this.flatAdd.band(c.x, c.y, c.r - 4, c.r + 4, 1, rgbC(SIGNAL), 0.35, 0.35, 0, Math.PI * 2, 96);
    const pts: number[] = [];
    for (let i = 0; i <= 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const rr = c.r + Math.sin(a * 17 + t * 9) * 2 + Math.sin(a * 5 - t * 4) * 1.5;
      pts.push(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr);
    }
    this.ribbons.line(pts, 3 + Math.sin(t * 7) * 1.5, 2.4, rgbC('#ff9cec'), 0.9);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const x = c.x + Math.cos(a) * c.r, z = c.y + Math.sin(a) * c.r;
      this.m4.makeTranslation(x, 0, z);
      this.pylonMesh.setMatrixAt(i, this.m4);
      this.glowAdd.add(x, 14, z, 14, rgbC(SIGNAL), 0.8 + Math.sin(t * 6 + i) * 0.2);
      this.light(x, z, 40, rgbC(SIGNAL), 0.25);
    }
    this.pylonMesh.count = 12;
    this.pylonMesh.instanceMatrix.needsUpdate = true;
  }

  private drawShadows() {
    const g = this.game;
    const black: [number, number, number] = [0, 0, 0];
    for (const e of g.enemies) {
      if (!this.seen(e.x, e.y, 30)) continue;
      const r = e.kind === 'boss' ? e.r * 1.2 : e.r * (e.elite ? 1.35 : 1.05);
      this.flatAlpha.disc(e.x, e.y, r, 0.5, black, 0.42, 0.12, 12);
    }
    this.flatAlpha.disc(g.px, g.py, 11, 0.5, black, 0.45, 0.12, 14);
    // ground ring so the courier never gets lost in a swarm
    const cyan = rgbC('#5ef2ff');
    this.flatAdd.disc(g.px, g.py, 24, 0.7, cyan, 0.28, 0, 24);
    this.flatAdd.band(g.px, g.py, 15, 16.6, 0.8, cyan, 0.55);
    if (this.fx.levelPulse > 0) this.glowAdd.add(g.px, 26, g.py, 90, cyan, this.fx.levelPulse * 0.6);
  }

  // ------------------------------------------------------------------ pickups

  private pool(key: string, n: number, make: () => THREE.Object3D): THREE.Object3D {
    let list = this.props.get(key);
    if (!list) this.props.set(key, (list = []));
    while (list.length <= n) {
      const o = make();
      this.scene.add(o);
      list.push(o);
    }
    const o = list[n];
    o.visible = true;
    return o;
  }

  private hidePools(used: Map<string, number>) {
    for (const [k, list] of this.props) {
      const n = used.get(k) ?? 0;
      for (let i = n; i < list.length; i++) list[i].visible = false;
    }
  }

  private drawPickups() {
    const g = this.game;
    const t = this.time;
    const used = new Map<string, number>();
    const take = (k: string, make: () => THREE.Object3D) => {
      const n = used.get(k) ?? 0;
      used.set(k, n + 1);
      return this.pool(k, n, make);
    };
    let gems = 0, coins = 0;
    const tierCol = ['#3dffa0', '#38d6ff', '#c77dff'];
    for (const p of g.pickups) {
      if (p.drop > 0) {
        this.drawAirdrop(p, take);
        continue;
      }
      switch (p.kind) {
        case 'xp': {
          if (gems >= 400) break;
          const tier = p.value >= 25 ? 2 : p.value >= 5 ? 1 : 0;
          const s = [4.6, 5.6, 7][tier] + (tier === 2 ? Math.min(4, Math.log10(p.value + 1) * 1.5) : 0);
          const tw = 0.75 + 0.25 * Math.sin(t * 6 + p.x * 0.37 + p.y * 0.21);
          const y = 7 + Math.sin(t * 3 + p.x) * 1.4;
          this.q.setFromEuler(this.e3.set(0, t * 2 + p.x, 0));
          this.m4.compose(this.v3.set(p.x, y, p.y), this.q, this.s3.set(s, s, s));
          this.gemMesh.setMatrixAt(gems, this.m4);
          this.gemMesh.setColorAt(gems, this.tmpCol.set(tierCol[tier]));
          gems++;
          this.glowAdd.add(p.x, y, p.y, s * 5.2, rgbC(tierCol[tier]), 0.75 * tw);
          this.light(p.x, p.y, s * 3.4, rgbC(tierCol[tier]), 0.14);
          break;
        }
        case 'gold': {
          if (coins >= 300) break;
          const y = 6 + Math.sin(t * 4 + p.x) * 1;
          this.q.setFromEuler(this.e3.set(0, t * 3 + p.y, 0));
          this.m4.compose(this.v3.set(p.x, y, p.y), this.q, this.s3.set(1, 1, 1));
          this.coinMesh.setMatrixAt(coins++, this.m4);
          break;
        }
        case 'ration':
        case 'magnet':
        case 'emp': {
          const bob = Math.sin(t * 3 + p.x) * 2;
          const col = p.kind === 'ration' ? '#43ffa4' : p.kind === 'magnet' ? '#ff4fd8' : '#ff8a2a';
          this.glowAdd.add(p.x, 9 + bob, p.y, 40, rgbC(col), 0.6 + Math.sin(t * 5) * 0.2);
          this.light(p.x, p.y, 34, rgbC(col), 0.22);
          const o = take(p.kind, () => this.powerupModel(p.kind));
          o.position.set(p.x, 7 + bob, p.y);
          o.rotation.y = t * 1.5;
          if (p.kind === 'emp') this.glowAdd.add(p.x + Math.cos(-t * 1.5) * 4.6, 7 + bob + 12.6, p.y + Math.sin(-t * 1.5) * 4.6 * 0, 6 * (0.7 + 0.3 * Math.sin(t * 30 + p.x)), rgbC('#ffbe3c'), 0.95);
          break;
        }
        case 'chest': {
          const col = p.big ? '#ffd34d' : '#5ef2ff';
          const bob = Math.sin(t * 3) * 1.5;
          this.glowAdd.add(p.x, 10 + bob, p.y, 68, rgbC(col), 0.7);
          this.light(p.x, p.y, 70, rgbC(col), 0.3);
          const o = take(p.big ? 'chestBig' : 'chest', () => this.chestModel(p.big));
          o.position.set(p.x, 1 + bob, p.y);
          o.rotation.y = Math.sin(t * 0.8) * 0.4;
          const beam = take('beam' + col, () => {
            const m = new THREE.Mesh(this.beamGeo, this.beamMats[col]);
            m.renderOrder = 5;
            return m;
          });
          beam.position.set(p.x, 0, p.y);
          break;
        }
      }
    }
    this.gemMesh.count = gems;
    this.gemInk.count = gems;
    this.coinMesh.count = coins;
    this.coinInk.count = coins;
    this.gemMesh.instanceMatrix.needsUpdate = true;
    if (this.gemMesh.instanceColor) this.gemMesh.instanceColor.needsUpdate = true;
    this.coinMesh.instanceMatrix.needsUpdate = true;
    this.hidePools(used);
  }

  private tmpCol = new THREE.Color();

  private drawAirdrop(p: Pickup, take: (k: string, make: () => THREE.Object3D) => THREE.Object3D) {
    const h = p.drop * 140;
    this.flatAdd.band(p.x, p.y, Math.max(0, 10 + p.drop * 6) - 1, Math.max(0, 10 + p.drop * 6) + 1, 1, rgbC('#5ef2ff'), 0.8);
    this.flatAlpha.disc(p.x, p.y, 8 + h * 0.03, 0.5, [0, 0, 0], 0.35, 0.05, 12);
    const o = take('airdrop', () => this.airdropModel());
    o.position.set(p.x, h + 4, p.y);
    o.rotation.y = this.time * 0.6;
    o.rotation.z = Math.sin(this.time * 2) * 0.08;
  }

  private propMat = toonMat();
  private groupOf(p: Part) {
    const geo = p.build();
    const o = new THREE.Group();
    o.add(new THREE.Mesh(geo, this.ink), new THREE.Mesh(geo, this.propMat));
    return o;
  }

  private powerupModel(kind: string) {
    const p = new Part();
    if (kind === 'ration') {
      p.cyl(6, 6, 14, '#c9ced6', [0, 0, 0], undefined, 14);
      p.cyl(6.15, 6.15, 7, '#2fbf75', [0, 0, 0], undefined, 14);
      p.box(1, 6, 2.4, '#ffffff', [6.1, 0, 0]);
      p.box(1, 2.4, 6, '#ffffff', [6.1, 0, 0]);
    } else if (kind === 'magnet') {
      p.torus(5.5, 2, '#e8304f', [0, 2, 0], [0, 0, 0], Math.PI);
      p.box(4, 3.6, 4, '#e6e9ef', [-5.5, 0, 0]);
      p.box(4, 3.6, 4, '#e6e9ef', [5.5, 0, 0]);
    } else {
      p.ball(7.2, 7.2, 7.2, '#2a2c33', [0, 0, 0], undefined, 12);
      p.ball(1.8, 1.2, 1.4, '#9aa0aa', [-3, 3.6, 3]);
      p.cyl(2.2, 2.2, 3.4, '#4a4e58', [0, 7.8, 0]);
      p.limb([0, 9.5, 0], [2.5, 12.5, 0], 0.6, '#c8a46a');
    }
    return this.groupOf(p);
  }

  private chestModel(big: boolean) {
    const col = big ? '#ffd34d' : '#5ef2ff';
    const p = new Part();
    p.box(22, 12, 15, big ? '#7a4a12' : '#24324a', [0, 6, 0]);
    p.box(24, 7, 16, big ? '#a8661c' : '#35496a', [0, 14.5, 0]);
    p.box(22.4, 2, 15.4, col, [0, 10.6, 0]);
    p.box(5, 7, 16.4, col, [0, 9, 0]);
    return this.groupOf(p);
  }

  private airdropModel() {
    const p = new Part();
    p.ball(17, 9, 17, '#e8eef5', [0, 30, 0], undefined, 12);
    p.box(4, 9.5, 34.2, '#ff7a1a', [0, 31, 0]);
    for (const [x, z] of [[-11, -11], [11, -11], [-11, 11], [11, 11]]) p.limb([x, 26, z], [x * 0.25, 6, z * 0.25], 0.35, '#2a2d35');
    p.box(12, 10, 12, '#4a5468', [0, 0, 0]);
    p.box(12.4, 2, 12.4, '#ff7a1a', [0, 2, 0]);
    return this.groupOf(p);
  }

  // ------------------------------------------------------------------ characters

  private crowdKind(kind: string): CrowdKind {
    let k = this.crowd.get(kind);
    if (!k) {
      k = new CrowdKind(kind, MAX_PER_KIND, this.scene);
      k.setShadows(this.tier === 2);
      this.crowd.set(kind, k);
    }
    return k;
  }

  private smoothYaw(id: number, target: number, rate: number) {
    let y = this.yaw.get(id);
    if (y === undefined) y = target;
    else {
      let d = (target - y) % (Math.PI * 2);
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      y += d * rate;
    }
    this.yawNext.set(id, y);
    return y;
  }

  private drawEnemies() {
    const g = this.game;
    for (const k of this.crowd.values()) k.begin();
    const yawRate = 0.25;
    for (const e of g.enemies) {
      if (e.kind === 'boss') continue;
      if (!this.seen(e.x, e.y, 40)) {
        const y = this.yaw.get(e.id);
        if (y !== undefined) this.yawNext.set(e.id, y);
        continue;
      }
      const ck = this.crowdKind(e.kind);
      const ang = Math.atan2(g.py - e.y, g.px - e.x);
      const yaw = this.smoothYaw(e.id, -ang, yawRate);
      const sc = (e.elite ? 1.3 : 1) * ACTOR_SCALE * variantScale(e.id);
      this.q.setFromEuler(this.e3.set(0, yaw, 0));
      this.m4.compose(this.v3.set(e.x, 0, e.y), this.q, this.s3.set(sc, sc, sc));
      // hit stagger: a quick recoil while the sim's hit-flash timer runs
      const hit = e.flash > 0 ? Math.min(1, e.flash / 0.08) : 0;
      const col = e.flash > 0 ? (e.elite ? FLASH_ELITE : FLASH) : WHITE;
      const W = ck.add(this.m4, e.anim, this.time + e.id * 0.37, hit, e.id, col);
      if (W) {
        for (const gl of ck.rig.glows) {
          this.v3.set(gl.at[0], gl.at[1], gl.at[2]).applyMatrix4(W[gl.j]);
          this.glowAdd.add(this.v3.x, this.v3.y, this.v3.z, gl.size * sc * 1.5, rgbC(gl.color), 0.9);
        }
      }
      if (e.elite) {
        const pulse = (Math.sin(this.time * 5 + e.id) + 1) / 2;
        this.glowAdd.add(e.x, ck.rig.height * 0.5 * sc, e.y, e.r * 6.4, rgbC('#ffc94d'), 0.35 + pulse * 0.25);
        this.flatAdd.band(e.x, e.y, e.r * 1.6, e.r * 1.6 + 2.5, 1, rgbC('#ffc94d'), 0.6 + pulse * 0.3);
      }
      if (e.burn > 0) this.glowAdd.add(e.x, 14, e.y, 26, rgbC('#ff8a1f'), 0.6);
    }
    // the fallen: tip over backwards, then sink into the floor
    for (const c of this.corpses) {
      const ck = this.crowdKind(c.kind);
      const tip = Math.min(1, c.t / 0.28);
      const ease = 1 - (1 - tip) * (1 - tip);
      const sink = Math.max(0, c.t - 0.45) * 40;
      this.q.setFromEuler(this.e3.set(0, c.yaw, ease * 1.45, 'YXZ'));
      this.m4.compose(this.v3.set(c.x, -sink, c.y), this.q, this.s3.set(c.sc, c.sc, c.sc));
      ck.add(this.m4, c.ph, c.ph, 0, c.seed, CORPSE);
    }
    for (const k of this.crowd.values()) k.end();
  }

  /** Pick a boss clip from what its sim state machine is doing right now. */
  private bossAnim(b: Enemy, m: AuthoredBoss, prev: { state: number; stateT: number; shootCd: number }) {
    const g = this.game;
    const reset = b.stateT > prev.stateT + 0.05; // a move just started
    const lines = g.telegraphs.filter((t) => t.kind === 'line');
    const charging = lines.some((t) => t.t > 0);
    const beaming = lines.some((t) => t.t <= 0 && t.active > 0);
    const walk = () => m.play(b.phase2 ? 'run' : 'walk', b.phase2 ? 0.9 : 1);
    switch (b.boss) {
      case 'warden':
        if (b.state === 1) m.play('block');
        else if (b.state === 2) m.play('run', 1.3);
        else if (b.state === 3 && prev.state !== 3) m.play('attack', 1.4);
        else if (b.state === 0) walk();
        break;
      case 'hive':
        if (reset) m.play('cast');
        else if (b.shootCd > prev.shootCd + 0.05) m.play('taunt');
        else walk();
        break;
      case 'colossus':
        if (charging) m.play('block');
        else if (beaming) m.play('cast');
        else if (reset) m.play('attack');
        else walk();
        break;
      case 'broadcaster':
        if (b.state === 9) m.play('taunt');
        else if (prev.state === 9) m.play('rise', 1.6);
        else if (charging || beaming) m.play('cast');
        else if (reset) m.play('shoot');
        else walk();
        break;
    }
  }

  private drawBosses(dt: number) {
    const g = this.game;
    const seen = new Set<number>();
    for (const b of g.enemies) {
      if (b.kind !== 'boss' || !b.boss) continue;
      seen.add(b.id);
      let s = this.bossLive.get(b.id);
      if (!s) {
        const mesh = this.assets.get(BOSS_MESH[b.boss]);
        const anims = this.assets.get(BOSS_ANIMS);
        if (mesh && anims) {
          const m = new AuthoredBoss(b.boss, mesh, anims);
          m.group.position.set(b.x, 0, b.y);
          this.scene.add(m.group);
          m.play('rise', 1.4);
          s = { m, prev: { state: b.state, stateT: b.stateT, shootCd: b.shootCd }, x: b.x, y: b.y, phase2: b.phase2, dying: -1 };
          this.bossLive.set(b.id, s);
        }
      }
      const pulse = 0.75 + 0.25 * Math.sin(this.time * (b.phase2 ? 9 : 5));
      const ang = Math.atan2(g.py - b.y, g.px - b.x);
      const yaw = this.smoothYaw(b.id, -ang, 0.08);
      let height = 110;
      if (s) {
        const m = s.m;
        this.bossAnim(b, m, s.prev);
        s.prev.state = b.state;
        s.prev.stateT = b.stateT;
        s.prev.shootCd = b.shootCd;
        s.x = b.x;
        s.y = b.y;
        s.phase2 = b.phase2;
        m.group.position.set(b.x, 0, b.y);
        m.group.rotation.y = yaw;
        m.update(dt, b.flash > 0, b.phase2);
        m.group.updateMatrixWorld();
        height = m.height;
        for (const gl of m.glows) {
          this.v3.copy(gl.at).applyMatrix4(gl.obj.matrixWorld);
          const sz = gl.size * 1.6 * (b.phase2 ? 1.25 : 1) * (gl.pulse ? pulse : 1);
          this.glowAdd.add(this.v3.x, this.v3.y, this.v3.z, sz, rgbC(gl.color), 0.95);
        }
      } else this.drawBossFallback(b, yaw, pulse);
      if (b.state === 1 || b.phase2) this.glowAdd.add(b.x, height * 0.5, b.y, height * 1.3, rgbC(SIGNAL), 0.12 + 0.08 * pulse);
      this.light(b.x, b.y, height * 1.4, rgbC(SIGNAL), (b.phase2 ? 0.26 : 0.16) * pulse);
    }
    // bosses gone from the sim: the one that was just killed plays its death, then sinks
    for (const [id, s] of this.bossLive) {
      if (seen.has(id)) continue;
      if (s.dying < 0) {
        if (!this.bossDownAt) {
          this.scene.remove(s.m.group);
          this.bossLive.delete(id);
          continue;
        }
        s.dying = 0;
        s.m.play('death', 0.9);
      }
      s.dying += dt;
      s.m.update(dt, false, false);
      if (s.dying > 1.8) s.m.group.position.y = -(s.dying - 1.8) * 60;
      if (s.dying > 3.2) {
        this.scene.remove(s.m.group);
        this.bossLive.delete(id);
      }
    }
    this.bossDownAt = false;
    for (const [k, m] of this.oldBosses) if (!this.oldSeen.has(k)) m.group.visible = false;
    this.oldSeen.clear();
  }

  /** Procedural boss, only used for the moment before the authored models finish loading. */
  private drawBossFallback(b: Enemy, yaw: number, pulse: number) {
    let m = this.oldBosses.get(b.boss!);
    if (!m) {
      const kind = b.boss!;
      m = detailed(1.8, () => BOSS_BUILDERS[kind]());
      this.shadowCaster(m.group);
      this.oldBosses.set(kind, m);
      this.scene.add(m.group);
    }
    this.oldSeen.add(b.boss!);
    m.group.visible = true;
    m.animate(b.anim, b.state, b.phase2);
    m.group.position.set(b.x, 0, b.y);
    m.group.rotation.y = yaw;
    m.group.scale.setScalar(1.15);
    if (b.flash > 0) m.mat.emissive.setRGB(0.2, 0.2, 0.2);
    m.group.updateMatrixWorld();
    for (const gl of m.glows) {
      this.v3.copy(gl.at).applyMatrix4(gl.obj.matrixWorld);
      this.glowAdd.add(this.v3.x, this.v3.y, this.v3.z, gl.size * 1.6 * (gl.pulse ? pulse : 1), rgbC(gl.color), 0.95);
    }
  }

  private drawHero(dt: number) {
    const g = this.game;
    const skin = currentHeroSkin();
    const src = this.assets.get(COURIER);
    if (src && (skin !== this.heroSkin || !this.authHero)) {
      if (this.authHero) this.scene.remove(this.authHero.group);
      if (this.hero) {
        this.scene.remove(this.hero.group);
        this.hero = null;
      }
      this.authHero = new AuthoredHero(src, skin);
      this.heroSkin = skin;
      this.scene.add(this.authHero.group);
    }
    if (!this.authHero) return this.drawHeroFallback(skin);
    const h = this.authHero;
    h.setGun(g.weapons.find((w) => isGun(w.id))?.id ?? 'pistol');
    // the courier faces where it runs; its upper body twists toward the auto-aim target
    const dx = g.px - this.lastPx, dy = g.py - this.lastPy;
    this.lastPx = g.px;
    this.lastPy = g.py;
    const moving = g.moving && dx * dx + dy * dy > 1e-4;
    if (moving) this.moveAng = Math.atan2(dy, dx);
    const want = moving ? -this.moveAng : -g.aim;
    let d = (want - this.heroYaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.heroYaw += d * Math.min(1, dt * 14);
    let tw = (-g.aim - this.heroYaw) % (Math.PI * 2);
    if (tw > Math.PI) tw -= Math.PI * 2;
    if (tw < -Math.PI) tw += Math.PI * 2;
    // ease the upper body toward each new target instead of snapping (fast guns retarget several
    // times a second, and a long bazooka tube made every snap obvious)
    tw = Math.max(-1.3, Math.min(1.3, tw));
    this.twist += (tw - this.twist) * Math.min(1, dt * 9);
    tw = this.twist;
    const hitNow = g.hurtT > 0 && this.lastHurt <= 0;
    this.lastHurt = g.hurtT;
    h.group.position.set(g.px, 0, g.py);
    h.group.rotation.y = this.heroYaw;
    h.group.scale.setScalar(ACTOR_SCALE);
    h.update(dt, { moving: g.moving, dead: g.state === 'dead' || g.state === 'revive', won: g.state === 'won', hit: hitNow, twist: tw });
    h.setHurt(g.hurtT > 0 ? 1 : 0);
    h.group.updateMatrixWorld();
    for (const gl of h.glows) {
      this.v3.copy(gl.at).applyMatrix4(gl.obj.matrixWorld);
      this.glowAdd.add(this.v3.x, this.v3.y, this.v3.z, gl.size * 1.6, rgbC(gl.color), 0.9);
    }
    this.light(g.px, g.py, 48, rgbC(skin.glow), 0.12);
    if (this.muzzle > 0) {
      h.muzzleWorld(this.v3);
      const k = this.muzzle / 0.07;
      const big = this.muzzleCol === MUZZLE.bazooka ? 1.7 : 1;
      this.glowAdd.add(this.v3.x, this.v3.y, this.v3.z, 34 * k * big, rgbC(this.muzzleCol === MUZZLE.pistol ? '#bffbff' : '#fff1c4'), 1);
      this.light(this.v3.x, this.v3.z, 70 * big, rgbC(this.muzzleCol), 0.35 * k);
    }
  }

  /** Procedural courier, shown only until the authored model has loaded. */
  private drawHeroFallback(skin: HeroSkin) {
    const g = this.game;
    if (skin !== this.heroSkin || !this.hero) {
      if (this.hero) this.scene.remove(this.hero.group);
      this.hero = detailed(2, () => buildHero(skin));
      this.shadowCaster(this.hero.group);
      this.heroSkin = skin;
      this.scene.add(this.hero.group);
    }
    const h = this.hero;
    let d = (-g.aim - this.heroYaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.heroYaw += d * 0.35;
    const ph = g.moving ? this.time * 11 : 0;
    h.group.position.set(g.px, 0, g.py);
    h.group.rotation.y = this.heroYaw;
    h.group.scale.setScalar(ACTOR_SCALE);
    h.torso.position.y = g.moving ? Math.abs(Math.cos(ph)) * 2.2 : Math.sin(this.time * 2.4) * 0.6;
    const sw = g.moving ? Math.sin(ph) * 0.6 : 0;
    h.legL.rotation.z = sw;
    h.legR.rotation.z = -sw;
    h.mat.emissive.setRGB(g.hurtT > 0 ? 0.6 : 0, 0, 0);
  }

  private drawBlades() {
    const g = this.game;
    const w = g.weapons.find((x) => x.id === 'blades');
    if (!w || !bladesActive(w)) {
      this.bladeMesh.count = 0;
      this.sawMesh.count = 0;
      return;
    }
    const pos = bladePositions(g, w, []);
    const r = 14 * (w.evolved ? 1.3 : 1) * Math.sqrt(g.areaMul);
    const col = rgbC(w.evolved ? '#ffe9a8' : '#ffb84d');
    const mesh = w.evolved ? this.sawMesh : this.bladeMesh;
    (w.evolved ? this.bladeMesh : this.sawMesh).count = 0;
    let n = 0;
    for (let k = 0; k < pos.length && n < 16; k += 2) {
      const x = pos[k], z = pos[k + 1];
      const a = Math.atan2(z - g.py, x - g.px);
      this.glowAdd.add(x, 16, z, r * 4, col, 0.45);
      this.light(x, z, r * 2.6, col, 0.2);
      this.q.setFromEuler(this.e3.set(0, w.evolved ? -this.time * 20 : -a - Math.PI / 2, 0));
      const s = w.evolved ? r : r * 0.9;
      this.m4.compose(this.v3.set(x, 16, z), this.q, this.s3.set(s, w.evolved ? r * 0.8 : r, s));
      mesh.setMatrixAt(n++, this.m4);
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ projectiles

  private drawProjectiles() {
    const g = this.game;
    let shells = 0, discs = 0, drills = 0;
    for (const p of g.projectiles) {
      switch (p.kind) {
        case 'bolt': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          this.glowAdd.add(p.x, 34, p.y, 20, rgbC('#5ef2ff'), 1);
          this.light(p.x, p.y, 30, rgbC('#5ef2ff'), 0.2);
          this.ribbons.seg(p.x, 34, p.y, p.x - (p.vx / sp) * 16, 34, p.y - (p.vy / sp) * 16, p.r * 1.1, rgbC('#bffbff'), 1, 0.1);
          break;
        }
        case 'rail': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const bx = p.x - (p.vx / sp) * 46, bz = p.y - (p.vy / sp) * 46;
          this.ribbons.seg(p.x, 34, p.y, bx, 34, bz, p.r * 2.4, rgbC('#5ef2ff'), 0.6, 0);
          this.ribbons.seg(p.x, 34, p.y, bx, 34, bz, p.r * 0.8, rgbC('#ffffff'), 1, 0.2);
          this.light(p.x, p.y, 40, rgbC('#5ef2ff'), 0.25);
          break;
        }
        case 'shell':
        case 'canister': {
          const k = 1 - Math.max(0, p.life) / p.maxLife;
          const hgt = 30 + Math.sin(k * Math.PI) * 70;
          const col = p.kind === 'shell' ? '#ff6a3d' : '#ff9a1f';
          this.flatAlpha.disc(p.x, p.y, 4, 0.5, [0, 0, 0], 0.3, 0.05, 10);
          if (shells < 120) {
            this.q.setFromEuler(this.e3.set(0, -Math.atan2(p.vy, p.vx), p.spin));
            this.m4.compose(this.v3.set(p.x, hgt, p.y), this.q, this.s3.set(1, 1, 1));
            this.shellMesh.setMatrixAt(shells, this.m4);
            this.shellMesh.setColorAt(shells++, this.tmpCol.set(p.kind === 'shell' ? '#ffffff' : '#ffb07a'));
          }
          this.glowAdd.add(p.x, hgt, p.y, 18, rgbC(col), 0.9);
          this.light(p.x, p.y, 26, rgbC(col), 0.12);
          break;
        }
        case 'bomblet':
          this.glowAdd.add(p.x, 10, p.y, 18, rgbC('#ffb03d'), 1);
          break;
        case 'bullet':
        case 'slug': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const slug = p.kind === 'slug';
          const l = slug ? 26 : 18;
          const col = slug ? '#ffb02e' : '#ffd34d';
          this.ribbons.seg(p.x, 32, p.y, p.x - (p.vx / sp) * l, 32, p.y - (p.vy / sp) * l, p.r * (slug ? 1.3 : 0.9), rgbC(col), 0.9, 0.1);
          this.glowAdd.add(p.x, 32, p.y, slug ? 16 : 11, rgbC('#fff1c4'), 0.8);
          break;
        }
        case 'flame': {
          const k = 1 - Math.max(0, p.life) / p.maxLife; // 0 fresh → 1 burnt out
          const col = k < 0.3 ? '#ffe08a' : k < 0.65 ? '#ff7a1f' : '#c2341a';
          const a = (1 - k * k) * 0.75;
          this.glowAdd.add(p.x, 22 + k * 14, p.y, p.r * (p.evo ? 3.2 : 2.8), rgbC(col), a);
          if ((p.id & 7) === 0) this.light(p.x, p.y, 60, rgbC('#ff7a1f'), 0.12 * (1 - k));
          break;
        }
        case 'rocket': {
          const sp = Math.hypot(p.vx, p.vy) || 1;
          const ux = p.vx / sp, uz = p.vy / sp;
          if (shells < 120) {
            this.q.setFromEuler(this.e3.set(0, -Math.atan2(p.vy, p.vx), 0));
            this.m4.compose(this.v3.set(p.x, 30, p.y), this.q, this.s3.set(2.1, 1.25, 1.25));
            this.shellMesh.setMatrixAt(shells, this.m4);
            this.shellMesh.setColorAt(shells++, this.tmpCol.set('#9aa874'));
          }
          // exhaust flame + smoke trail
          this.glowAdd.add(p.x - ux * 12, 30, p.y - uz * 12, 22, rgbC('#ffcf6a'), 1);
          this.ribbons.seg(p.x - ux * 10, 30, p.y - uz * 10, p.x - ux * 46, 30, p.y - uz * 46, 5, rgbC('#ff4d3d'), 0.55, 0);
          this.light(p.x, p.y, 50, rgbC('#ff7a3d'), 0.22);
          break;
        }
        case 'disc': {
          const col = p.evo ? '#ff8ff0' : '#ff4fd8';
          this.glowAdd.add(p.x, 18, p.y, p.r * 5, rgbC(col), 0.9);
          this.light(p.x, p.y, p.r * 4, rgbC(col), 0.22);
          if (discs < 60) {
            this.q.setFromEuler(this.e3.set(0, -p.spin, 0));
            this.m4.compose(this.v3.set(p.x, 18, p.y), this.q, this.s3.set(p.r * 0.85, p.r * 0.85, p.r * 0.85));
            this.discMesh.setMatrixAt(discs++, this.m4);
          }
          break;
        }
        case 'drill': {
          this.glowAdd.add(p.x, 16, p.y, p.r * 4.4, rgbC('#ffe14d'), 0.9);
          if (drills < 40) {
            this.q.setFromEuler(this.e3.set(p.spin, -Math.atan2(p.vy, p.vx), 0, 'YXZ'));
            this.m4.compose(this.v3.set(p.x, 16, p.y), this.q, this.s3.set(p.r, p.r, p.r));
            this.drillMesh.setMatrixAt(drills++, this.m4);
          }
          break;
        }
      }
    }
    this.shellMesh.count = shells;
    this.discMesh.count = discs;
    this.drillMesh.count = drills;
    for (const m of [this.shellMesh, this.discMesh, this.drillMesh]) m.instanceMatrix.needsUpdate = true;
    if (this.shellMesh.instanceColor) this.shellMesh.instanceColor.needsUpdate = true;
  }

  private drawShots() {
    let n = 0;
    for (const s of this.game.shots) {
      const col = s.kind === 'acid' ? '#9dff4a' : '#ff4fd8';
      this.glowAdd.add(s.x, 18, s.y, s.r * 5.2, rgbC(col), 1);
      this.light(s.x, s.y, s.r * 4.5, rgbC(col), 0.25);
      this.flatAlpha.disc(s.x, s.y, s.r * 0.8, 0.5, [0, 0, 0], 0.3, 0.05, 10);
      if (n >= 400) continue;
      const r = Math.max(0.5, s.r * 0.75);
      this.m4.compose(this.v3.set(s.x, 18, s.y), this.q.identity(), this.s3.set(r, r, r));
      this.shotMesh.setMatrixAt(n, this.m4);
      this.shotMesh.setColorAt(n++, this.tmpCol.set(s.kind === 'acid' ? '#d4ff8a' : '#ffc4f3'));
    }
    this.shotMesh.count = n;
    this.shotMesh.instanceMatrix.needsUpdate = true;
    if (this.shotMesh.instanceColor) this.shotMesh.instanceColor.needsUpdate = true;
  }

  // ------------------------------------------------------------------ particles

  private drawParticles() {
    for (const p of this.fx.parts) {
      const a = Math.max(0, p.life / p.max);
      const c = rgbC(p.color);
      switch (p.k as number) {
        case PK_SPARK: {
          const h = 16 + (1 - a) * 6;
          this.ribbons.seg(p.x, h, p.y, p.x - p.vx * 0.03, h - 1, p.y - p.vy * 0.03, p.size * 1.3, c, a, 0);
          break;
        }
        case PK_GOO:
        case PK_CHUNK: {
          // thrown in an arc, landing on the floor
          const h = 3 + Math.sin(a * Math.PI) * 18;
          this.softAlpha.add(p.x, h, p.y, p.size * (1 + a) * 1.7, c, Math.min(1, a * 1.6));
          break;
        }
        case PK_SMOKE:
          this.softAlpha.add(p.x, 10 + (1 - a) * 24, p.y, p.size * (1.6 - a * 0.6) * 2, c, a * 0.8 * 0.5);
          break;
        case PK_RING: {
          const r = Math.max(0, p.size * (1 - a * a));
          const w = (3 + a * 5) / 2;
          this.flatAdd.band(p.x, p.y, r - w, r + w, 1.6, c, a * 0.9, a * 0.9, 0, Math.PI * 2, p.size > 300 ? 96 : 40);
          break;
        }
        case PK_FLASH:
          this.glowAdd.add(p.x, 14, p.y, p.size * 5.2, c, a);
          break;
      }
    }
    for (const sl of this.fx.slashes) {
      const k = 1 - sl.life / 0.2;
      const half = Math.min(sl.arc, Math.PI);
      const a0 = sl.a - half;
      const a1 = sl.a - half + half * 2 * Math.min(1, k * 1.8);
      const al = Math.max(0, 1 - k * 0.9);
      this.flatAdd.band(sl.x, sl.y, sl.r * 0.62, sl.r, 12, rgbC(sl.evo ? '#ffb3c6' : '#ff5470'), al * 0.6, al, a0, a1, 24);
      this.flatAdd.band(sl.x, sl.y, sl.r - 1.2, sl.r + 1.2, 12.5, rgbC('#ffffff'), al, al, a0, a1, 24);
    }
    for (const arc of this.fx.arcs) {
      const a = arc.life / 0.16;
      this.ribbons.line(arc.pts, 22, 5, rgbC(arc.color), a);
      this.ribbons.line(arc.pts, 22, 1.8, rgbC('#ffffff'), a);
    }
    // bosses, elites and the hero above are swapped into yaw for next frame
    const t = this.yaw;
    this.yaw = this.yawNext;
    this.yawNext = t;
    this.yawNext.clear();
  }
}

/** Vertical fade for light beams and the cage wall (bright at the floor, gone at the top). */
function gradientTex() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,1)');
  x.fillStyle = g;
  x.fillRect(0, 0, 4, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
