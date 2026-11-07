import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

import { BILLBOARDS } from "./constants";
import type { Crowd } from "./crowd";
import { hash } from "./random";
import { buildRig, cachedTexture, centreText, mat, mesh, type Rig, type RigLook, setPose, sloganText, standPose } from "./rig3d";
import { makeView, type Sky } from "./scene";

/**
 * Base for the 3D road and rail games. The engines use x across the road, y up and z forward
 * (away from the camera); in Three.js the same point is (x, y, -z).
 */

export const toWorld = (x: number, y: number, z: number, out = new THREE.Vector3()) => out.set(x, y, -z);

export interface WorldOptions {
  sky: Sky;
  fog: number;
  fogNear: number;
  fogFar: number;
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  sun: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  exposure?: number;
  /** Strength of the image-based light (reflections and soft fill). */
  env?: number;
}

/** Image-based lighting: a studio environment for reflections on metal, glass and paint. */
export function addEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity: number) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  scene.environment = pmrem.fromScene(room, 0.04).texture;
  scene.environmentIntensity = intensity;
  room.dispose();
  pmrem.dispose();
}

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  coarse: boolean;
  view: { w: number; h: number };
  resize(w: number, h: number, pixelRatio: number): void;
  project(x: number, y: number, z: number): { x: number; y: number; visible: boolean };
}

export function createWorld(canvas: HTMLCanvasElement, o: WorldOptions): World {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = o.exposure ?? 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(o.fog, o.fogNear, o.fogFar);
  addEnvironment(renderer, scene, o.env ?? 0.45);
  // Sky: a vertical gradient behind everything, and the skyline / hills painted on a far plane.
  scene.background = cachedTexture(`sky|${o.sky.top}|${o.sky.mid}|${o.sky.low}`, 4, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, o.sky.top);
    g.addColorStop(0.55, o.sky.mid);
    g.addColorStop(1, o.sky.low);
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
  });
  const backdrop = makeView(1400, 900, { height: 3.6, back: 6, sky: o.sky }).backdrop;
  if (backdrop) {
    const tex = new THREE.CanvasTexture(backdrop);
    tex.colorSpace = THREE.SRGBColorSpace;
    const width = 620;
    const height = (width * backdrop.height) / backdrop.width;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: tex, fog: false, depthWrite: false }));
    plane.position.set(0, height / 2 - 4, -230);
    plane.renderOrder = -1;
    scene.add(plane);
  }

  scene.add(new THREE.HemisphereLight(o.hemiSky, o.hemiGround, o.hemi));
  const sun = new THREE.DirectionalLight(o.sun, o.sunIntensity);
  sun.position.set(...o.sunPos);
  sun.target.position.set(0, 0, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  const sc = sun.shadow.camera;
  sc.left = -16;
  sc.right = 16;
  sc.top = 30;
  sc.bottom = -14;
  sc.near = 1;
  sc.far = 120;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 400);
  const view = { w: 1, h: 1 };
  return {
    renderer,
    scene,
    camera,
    coarse,
    view,
    resize(w, h, pixelRatio) {
      view.w = w;
      view.h = h;
      renderer.setPixelRatio(Math.min(pixelRatio, 2));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < h ? 64 : 52;
      camera.updateProjectionMatrix();
    },
    project(x, y, z) {
      const v = toWorld(x, y, z).project(camera);
      return { x: ((v.x + 1) / 2) * view.w, y: ((1 - v.y) / 2) * view.h, visible: v.z < 1 };
    },
  };
}

// ---- scrolling ground -------------------------------------------------------------------

/** A long flat strip whose texture slides towards the camera as the run goes on. */
export class ScrollStrip {
  mesh: THREE.Mesh;
  private tex: THREE.Texture;

  constructor(
    scene: THREE.Scene,
    x0: number,
    x1: number,
    y: number,
    near: number,
    far: number,
    private tileLen: number,
    key: string,
    paint: (c: CanvasRenderingContext2D, w: number, h: number) => void,
    texW = 256,
    texH = 256,
    rough = 0.9,
    segs = 1,
  ) {
    const len = far - near;
    const tex = cachedTexture(key, texW, texH, (c) => paint(c, texW, texH)).clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, len / tileLen);
    tex.needsUpdate = true;
    this.tex = tex;
    const geo = new THREE.PlaneGeometry(x1 - x0, len, 1, segs);
    geo.rotateX(-Math.PI / 2);
    this.baseX = Float32Array.from({ length: geo.attributes.position.count }, (_, i) => geo.attributes.position.getX(i));
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: rough }));
    this.mesh.position.set((x0 + x1) / 2, y, -(near + far) / 2);
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  scroll(distance: number) {
    this.tex.offset.y = (distance / this.tileLen) % 1;
  }

  private baseX: Float32Array;

  /** Bends the strip sideways by curve * z^2 (engine z), for a curving line. Needs segs > 1. */
  bend(curve: number) {
    const pos = this.mesh.geometry.attributes.position;
    const cz = this.mesh.position.z;
    for (let i = 0; i < pos.count; i++) {
      const z = -(pos.getZ(i) + cz);
      pos.setX(i, this.baseX[i] + curve * z * z);
    }
    pos.needsUpdate = true;
  }
}

/**
 * Long thin things (rails, platform edges) drawn as straight instanced pieces that follow a
 * curving line. place() is called once per frame with the pieces wanted.
 */
export class Segments {
  private m: THREE.InstancedMesh;
  private tmp = new THREE.Object3D();
  private n = 0;

  constructor(scene: THREE.Scene, material: THREE.Material, w: number, h: number, max: number, shadows = true) {
    this.m = new THREE.InstancedMesh(new THREE.BoxGeometry(w, h, 1), material, max);
    this.m.castShadow = shadows;
    this.m.receiveShadow = true;
    this.m.frustumCulled = false;
    this.m.count = 0;
    scene.add(this.m);
  }

  begin() {
    this.n = 0;
  }

  /** A piece from engine z0 to z1 at engine x, height y, bent by curve. */
  add(x: number, y: number, z0: number, z1: number, curve: number) {
    if (this.n >= this.m.instanceMatrix.count) return;
    const zm = (z0 + z1) / 2;
    const t = this.tmp;
    t.position.set(x + curve * zm * zm, y, -zm);
    t.rotation.set(0, Math.atan(2 * curve * zm), 0);
    t.scale.set(1, 1, z1 - z0);
    t.updateMatrix();
    this.m.setMatrixAt(this.n++, t.matrix);
  }

  end() {
    this.m.count = this.n;
    this.m.instanceMatrix.needsUpdate = true;
  }
}

// ---- pooled objects ------------------------------------------------------------------------

/** Keeps one 3D object per live engine object, recycling them when the engine drops it. */
export class Pool<K extends object> {
  private live = new Map<K, THREE.Object3D>();
  private free = new Map<string, THREE.Object3D[]>();
  private kinds = new Map<THREE.Object3D, string>();
  private seen = new Set<K>();

  constructor(
    private scene: THREE.Object3D,
    private make: (kind: string, key: K) => THREE.Object3D,
  ) {}

  get(key: K, kind: string) {
    this.seen.add(key);
    let o = this.live.get(key);
    if (o && this.kinds.get(o) !== kind) {
      this.release(key, o);
      o = undefined;
    }
    if (!o) {
      o = this.free.get(kind)?.pop() ?? this.make(kind, key);
      this.kinds.set(o, kind);
      if (!o.parent) this.scene.add(o);
      this.live.set(key, o);
    }
    o.visible = true;
    return o;
  }

  /** Hides and recycles everything not requested since the last call. */
  sweep() {
    for (const [key, o] of this.live) if (!this.seen.has(key)) this.release(key, o);
    this.seen.clear();
  }

  private release(key: K, o: THREE.Object3D) {
    o.visible = false;
    this.live.delete(key);
    const kind = this.kinds.get(o) ?? "";
    let list = this.free.get(kind);
    if (!list) this.free.set(kind, (list = []));
    list.push(o);
  }
}

/** Scenery that repeats every `gap` metres (lamps, buildings, trees), keyed by its slot number. */
export class Repeater {
  private pool: Pool<{ k: number }>;
  private keys = new Map<number, { k: number }>();

  constructor(
    scene: THREE.Object3D,
    private gap: number,
    private offset: number,
    make: (k: number) => THREE.Object3D,
  ) {
    this.pool = new Pool(scene, (_kind, key) => make(key.k));
  }

  /** Calls place(object, z, k) for every slot between near and far. */
  update(distance: number, near: number, far: number, kind: (k: number) => string, place: (o: THREE.Object3D, z: number, k: number) => void) {
    const first = Math.ceil((distance + near - this.offset) / this.gap);
    for (let k = first; k * this.gap + this.offset - distance < far; k++) {
      let key = this.keys.get(k);
      if (!key) this.keys.set(k, (key = { k }));
      const o = this.pool.get(key, kind(k));
      place(o, k * this.gap + this.offset - distance, k);
    }
    for (const k of this.keys.keys()) if (k < first - 2) this.keys.delete(k);
    this.pool.sweep();
  }
}

// ---- the crowd ---------------------------------------------------------------------------


/** The engine's protesters, drawn with GPU instancing: legs, body, head, raised arms, placards and flags. */
export class Crowd3D {
  private legs: THREE.InstancedMesh;
  private bodies: THREE.InstancedMesh;
  private heads: THREE.InstancedMesh;
  private hair: THREE.InstancedMesh;
  private arms: THREE.InstancedMesh;
  private sticks: THREE.InstancedMesh;
  private signs: THREE.Mesh[] = [];
  private flags: THREE.Mesh[] = [];
  private banners: THREE.Mesh[] = [];
  private papers: THREE.Mesh[] = [];
  private tmp = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(
    private scene: THREE.Scene,
    max = 320,
  ) {
    const mk = (geo: THREE.BufferGeometry, rough: number, n: number) => {
      const m = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: rough }), n);
      m.castShadow = true;
      m.frustumCulled = false;
      scene.add(m);
      return m;
    };
    this.legs = mk(new THREE.CapsuleGeometry(0.17, 0.62, 3, 8), 0.8, max);
    this.bodies = mk(new THREE.CapsuleGeometry(0.22, 0.42, 3, 8), 0.75, max);
    this.heads = mk(new THREE.SphereGeometry(0.15, 10, 8), 0.6, max);
    this.hair = mk(new THREE.SphereGeometry(0.155, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0.9, max);
    const armGeo = new THREE.CapsuleGeometry(0.06, 0.5, 3, 6);
    armGeo.translate(0, 0.31, 0);
    this.arms = mk(armGeo, 0.6, max * 2);
    this.sticks = mk(new THREE.CylinderGeometry(0.02, 0.02, 1, 5), 0.8, max);
    for (const m of [this.legs, this.bodies, this.heads, this.hair, this.arms, this.sticks]) m.count = 0;
  }

  private signMaterial(text: string, colors: [string, string]) {
    return cachedTexture(`sign|${text}|${colors[0]}|${colors[1]}`, 256, 140, (c) => {
      c.fillStyle = colors[0];
      c.fillRect(0, 0, 256, 140);
      c.strokeStyle = "rgba(0,0,0,0.6)";
      c.lineWidth = 6;
      c.strokeRect(3, 3, 250, 134);
      sloganText(c, text, 256, 140, colors[1]);
    });
  }

  update(crowd: Crowd, clock: number, near: number, far: number, bend: (z: number) => number = () => 0) {
    const t = this.tmp;
    const floor = crowd.layout.floor;
    let n = 0;
    let a = 0;
    let s = 0;
    let si = 0;
    let fi = 0;
    for (let i = 0; i < crowd.protesters.length; i++) {
      const p = crowd.protesters[i];
      if (p.z < near || p.z > far) continue;
      const k = p.height / 1.75;
      const bob = Math.abs(Math.sin(clock * 4 + p.phase)) * 0.08;
      const x = p.x + bend(p.z);
      const z = -p.z;
      const y = floor + bob;
      const set = (m: THREE.InstancedMesh, idx: number, px: number, py: number, pz: number, color: string, sx = 1, sy = 1, rz = 0) => {
        t.position.set(px, py, pz);
        t.rotation.set(0, 0, rz);
        t.scale.set(sx, sy, sx);
        t.updateMatrix();
        m.setMatrixAt(idx, t.matrix);
        m.setColorAt(idx, this.color.set(color));
      };
      const longTop = p.kind === "woman" || p.kind === "elder";
      set(this.legs, n, x, y + 0.48 * k, z, p.pants, k, k);
      set(this.bodies, n, x, y + 1.13 * k, z, p.shirt, k, longTop ? k * 1.25 : k);
      set(this.heads, n, x, y + 1.6 * k, z, p.skin, k, k);
      set(this.hair, n, x, y + 1.63 * k, z, p.kind === "elder" ? "#fafafa" : p.hair, k, k);
      // Arms: both up holding a placard, one up with a flag or a fist, or hanging.
      const up = p.sign !== null;
      const pump = Math.max(0, Math.sin(clock * 5 + p.phase)) * 0.4;
      for (const side of [-1, 1]) {
        const raised = up || side === 1;
        const rz = raised ? side * (up ? 0.25 : 0.15 + pump * 0.3) : side * -2.9;
        set(this.arms, a++, x + side * 0.24 * k, y + 1.35 * k, z, p.skin, k, k, -rz);
      }
      if (up && p.sign) {
        set(this.sticks, s++, x, y + 2.05 * k, z, "#6b4f2a", 1, 0.5 * k);
        let sign = this.signs[si];
        if (!sign) {
          sign = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.58), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }));
          this.scene.add(sign);
          this.signs.push(sign);
        }
        const m = sign.material as THREE.MeshStandardMaterial;
        const map = this.signMaterial(p.sign, p.signColors);
        if (m.map !== map) {
          m.map = map;
          m.needsUpdate = true;
        }
        sign.position.set(x + Math.sin(clock * 2 + p.phase) * 0.05, y + 2.45 * k, z);
        sign.rotation.y = -p.side * 0.5;
        sign.visible = true;
        si++;
      } else if (p.kind === "flag") {
        set(this.sticks, s++, x + 0.32 * k, y + 2.2 * k, z, "#8b5a2b", 1, 1.6 * k);
        let flag = this.flags[fi];
        if (!flag) {
          flag = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.53, 6, 1),
            new THREE.MeshStandardMaterial({
              side: THREE.DoubleSide,
              roughness: 0.8,
              map: cachedTexture("tricolour-flag", 96, 64, (c) => {
                ["#ff9933", "#ffffff", "#138808"].forEach((col, i) => {
                  c.fillStyle = col;
                  c.fillRect(0, (i * 64) / 3, 96, 64 / 3 + 1);
                });
                c.strokeStyle = "#000080";
                c.lineWidth = 2;
                c.beginPath();
                c.arc(48, 32, 7, 0, Math.PI * 2);
                c.stroke();
              }),
            }),
          );
          this.scene.add(flag);
          this.flags.push(flag);
        }
        flag.position.set(x + 0.32 * k - p.side * 0.4, y + 2.75 * k, z);
        flag.rotation.y = Math.sin(clock * 5 + p.phase) * 0.35;
        flag.visible = true;
        fi++;
      }
      n++;
    }
    for (const m of [this.legs, this.bodies, this.heads, this.hair]) {
      m.count = n;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.arms.count = a;
    this.arms.instanceMatrix.needsUpdate = true;
    if (this.arms.instanceColor) this.arms.instanceColor.needsUpdate = true;
    this.sticks.count = s;
    this.sticks.instanceMatrix.needsUpdate = true;
    if (this.sticks.instanceColor) this.sticks.instanceColor.needsUpdate = true;
    for (let i = si; i < this.signs.length; i++) this.signs[i].visible = false;
    for (let i = fi; i < this.flags.length; i++) this.flags[i].visible = false;

    // Cloth banners carried along the sidewalk.
    let bi = 0;
    if (crowd.layout.banners !== false) {
      for (const b of crowd.banners) {
        if (b.z < near + 1 || b.z > far * 0.7) continue;
        let m = this.banners[bi];
        if (!m) {
          m = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.9 }));
          m.castShadow = true;
          this.scene.add(m);
          this.banners.push(m);
        }
        const mm = m.material as THREE.MeshStandardMaterial;
        const map = cachedTexture(`banner|${b.text}|${b.cloth}|${b.ink}`, 512, 110, (c) => {
          c.fillStyle = b.cloth;
          c.fillRect(0, 0, 512, 110);
          c.strokeStyle = b.ink;
          c.lineWidth = 6;
          c.strokeRect(3, 3, 506, 104);
          sloganText(c, b.text, 512, 110, b.ink);
        });
        if (mm.map !== map) {
          mm.map = map;
          mm.needsUpdate = true;
        }
        const cx = b.side * (crowd.layout.edge + 3.1);
        m.position.set(cx + bend(b.z), floor + 1.6 + Math.sin(clock * 2 + b.z) * 0.05, -b.z);
        m.visible = true;
        bi++;
      }
    }
    for (let i = bi; i < this.banners.length; i++) this.banners[i].visible = false;

    // Leaked exam papers blowing across.
    let pi = 0;
    for (const p of crowd.papers) {
      if (p.z < 4 || p.z > 60) continue;
      let m = this.papers[pi];
      if (!m) {
        m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.4), mat("#fbfbf6", 0.9));
        (m.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
        this.scene.add(m);
        this.papers.push(m);
      }
      m.position.set(p.x + bend(p.z), p.y + Math.sin(clock * 2 + p.z) * 0.3, -p.z);
      m.rotation.set(clock * p.spin, clock * p.spin * 0.7, 0);
      m.visible = true;
      pi++;
    }
    for (let i = pi; i < this.papers.length; i++) this.papers[i].visible = false;
  }
}

// ---- police and pickups ------------------------------------------------------------------

const stripeTex = () =>
  cachedTexture("barricade-stripes", 256, 64, (c) => {
    c.fillStyle = "#f1f1f1";
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = "#d62828";
    for (let x = -64; x < 256; x += 48) {
      c.beginPath();
      c.moveTo(x, 64);
      c.lineTo(x + 24, 64);
      c.lineTo(x + 88, 0);
      c.lineTo(x + 64, 0);
      c.fill();
    }
  });

/** Red-and-white police barricade, w metres wide. */
export function barricade3d(w = 2.1) {
  const g = new THREE.Group();
  const legMat = mat("#3a3a3a", 0.6);
  for (const lx of [-w * 0.4, w * 0.4]) {
    const leg = mesh(new THREE.BoxGeometry(0.1, 1.0, 0.5), legMat, g, lx, 0.5, 0);
    leg.rotation.x = 0.0;
  }
  const board = new THREE.MeshStandardMaterial({ map: stripeTex(), roughness: 0.6 });
  mesh(new THREE.BoxGeometry(w, 0.42, 0.1), board, g, 0, 0.83, 0);
  mesh(new THREE.BoxGeometry(w - 0.3, 0.16, 0.08), board, g, 0, 0.32, 0);
  const plate = cachedTexture("police-plate", 128, 80, (c) => {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 128, 80);
    c.strokeStyle = "#1d3557";
    c.lineWidth = 6;
    c.strokeRect(0, 0, 128, 80);
    centreText(c, "पुलिस", 64, 26, 28, "#1d3557", 120);
    centreText(c, "POLICE", 64, 60, 24, "#c1121f", 120);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.36), new THREE.MeshStandardMaterial({ map: plate }));
  p.position.set(0, 0.83, 0.06);
  g.add(p);
  const lamp = mesh(new THREE.SphereGeometry(0.08, 8, 6), mat("#ffb703", 0.3, 0, 2), g, -w / 2 + 0.15, 1.12, 0);
  lamp.name = "blink";
  return g;
}

/** Yellow "POLICE LINE" board on two posts; you slide or duck under it. */
export function policeLine3d(w = 2.3, h = 2.4, clearance = 1.15) {
  const g = new THREE.Group();
  const post = mat("#9a9a9a", 0.5, 0.4);
  for (const lx of [-w / 2, w / 2]) mesh(new THREE.BoxGeometry(0.12, h, 0.12), post, g, lx, h / 2, 0);
  const tex = cachedTexture("police-line", 460, 200, (c) => {
    c.fillStyle = "#ffd60a";
    c.fillRect(0, 0, 460, 200);
    c.fillStyle = "#111";
    c.fillRect(0, 0, 460, 24);
    c.fillRect(0, 176, 460, 24);
    centreText(c, "POLICE LINE", 230, 78, 60, "#111", 420);
    centreText(c, "DO NOT CROSS", 230, 136, 40, "#111", 420);
  });
  mesh(new THREE.BoxGeometry(w, h - 0.2 - clearance - 0.05, 0.08), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), g, 0, (clearance + 0.05 + h - 0.2) / 2, 0);
  const lamp = mesh(new THREE.SphereGeometry(0.13, 8, 6), mat("#ff2d55", 0.3, 0, 2.5), g, 0, h + 0.12, 0);
  lamp.name = "siren";
  return g;
}

const POLICE: RigLook = { skin: "#a5694f", top: "#b59a6a", trunks: "#a08657", shins: "#a08657", sleeves: true, boots: "#1a1a1a", hair: "cap", hairColor: "#8a6d3b", mustache: true, belly: false, glasses: false, jacket: false, extra: "none", size: 1.02 };
const RIOT: RigLook = { ...POLICE, hair: "helmet", hairColor: "#2b3a55", mustache: false };

/** A police officer: riot gear with a shield when blocking the road, a cap when chasing. */
export function officer3d(riot: boolean): THREE.Group & { userData: { rig: Rig } } {
  const rig = buildRig(riot ? RIOT : POLICE);
  const lathi = mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.0, 6), mat("#c9a25e", 0.6), rig.hand, 0, 0.35, 0);
  lathi.rotation.z = 0.3;
  if (riot) {
    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 1.1, 0.7),
      new THREE.MeshStandardMaterial({
        transparent: true,
        opacity: 0.55,
        roughness: 0.15,
        map: cachedTexture("riot-shield", 128, 200, (c) => {
          c.fillStyle = "#bcd9ff";
          c.fillRect(0, 0, 128, 200);
          centreText(c, "पुलिस", 64, 70, 34, "#0b1730", 120);
          centreText(c, "POLICE", 64, 110, 28, "#0b1730", 120);
        }),
      }),
    );
    shield.position.set(0.42, 0.95, 0.05);
    rig.inner.add(shield);
  }
  const g = rig.outer as THREE.Group & { userData: { rig: Rig } };
  g.userData.rig = rig;
  return g;
}

/** Animates an officer: standing guard facing the camera, or running after the player. */
export function poseOfficer(o: THREE.Object3D, clock: number, running: boolean, phase = 0) {
  const rig = (o.userData as { rig: Rig }).rig;
  if (running) {
    const s = Math.sin(clock * 14 + phase);
    setPose(rig, { lean: 0.25, armF: [2.6, 0.4], armB: [s * 0.8, 1.2], legF: [s * 0.7, 0.3 + Math.max(0, -s)], legB: [-s * 0.7, 0.3 + Math.max(0, s)], drop: 0 });
  } else {
    setPose(rig, { ...standPose(clock + phase), armF: [0.9, 1.4] });
  }
}

/** Blue detention bus (also used for police buses on the highway). */
export function bus3d(w = 2.3, h = 3.1, len = 11) {
  const g = new THREE.Group();
  const front = cachedTexture("bus-front", 256, 320, (c) => {
    c.fillStyle = "#1f4e8c";
    c.fillRect(0, 0, 256, 320);
    c.fillStyle = "#0d1b2a";
    c.fillRect(16, 46, 224, 110);
    c.strokeStyle = "rgba(200,200,200,0.7)";
    c.lineWidth = 3;
    for (let x = 30; x < 240; x += 18) {
      c.beginPath();
      c.moveTo(x, 46);
      c.lineTo(x, 156);
      c.stroke();
    }
    c.fillStyle = "#e9ecef";
    c.fillRect(0, 186, 256, 20);
    centreText(c, "पुलिस  POLICE", 128, 22, 30, "#ffffff", 240);
    c.fillStyle = "#fff6b0";
    for (const x of [36, 220]) {
      c.beginPath();
      c.arc(x, 260, 16, 0, Math.PI * 2);
      c.fill();
    }
  });
  const side = cachedTexture("bus-side", 512, 128, (c) => {
    c.fillStyle = "#183f73";
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#0d1b2a";
    for (let x = 16; x < 500; x += 64) c.fillRect(x, 20, 48, 40);
    c.fillStyle = "#e9ecef";
    c.fillRect(0, 72, 512, 8);
  });
  const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.5 });
  const frontM = new THREE.MeshStandardMaterial({ map: front, roughness: 0.5 });
  const top = mat("#2b5fa6", 0.6);
  // Box faces: +x, -x, +y, -y, +z (towards the camera), -z.
  const body = mesh(new THREE.BoxGeometry(w, h - 0.35, len), [sideM, sideM, top, top, frontM, frontM], g, 0, 0.35 + (h - 0.35) / 2, -len / 2);
  body.name = "body";
  const wheel = mat("#111", 0.8);
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-1.6, -len + 2]) {
      const wh = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 14), wheel, g, x, 0.45, z);
      wh.rotation.z = Math.PI / 2;
    }
  }
  const red = mesh(new THREE.BoxGeometry(0.55, 0.15, 0.3), mat("#ff2d55", 0.3, 0, 2), g, -0.3, h + 0.08, -0.4);
  red.name = "lightA";
  const blue = mesh(new THREE.BoxGeometry(0.55, 0.15, 0.3), mat("#2d7dff", 0.3, 0, 2), g, 0.3, h + 0.08, -0.4);
  blue.name = "lightB";
  const beam = new THREE.Mesh(new THREE.CircleGeometry(1.6, 20), new THREE.MeshBasicMaterial({ color: 0xfff6b0, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(0, 0.9, 0.02);
  beam.name = "beam";
  g.add(beam);
  return g;
}

/** Flashes the named lights of a prop. */
export function blink(o: THREE.Object3D, clock: number, offset = 0) {
  const on = Math.sin(clock * 10 + offset) > 0;
  o.traverse((c) => {
    if (c.name === "blink" || c.name === "siren") c.visible = c.name === "siren" ? true : on;
    if (c.name === "siren") ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).emissive.set(on ? "#ff2d55" : "#2d7dff");
    if (c.name === "lightA") c.visible = on;
    if (c.name === "lightB") c.visible = !on;
  });
}

/** Spinning gold ₹ coin. */
export function coin3d() {
  const face = cachedTexture("coin-face", 128, 128, (c) => {
    const g = c.createRadialGradient(48, 40, 6, 64, 64, 64);
    g.addColorStop(0, "#fff3a6");
    g.addColorStop(0.5, "#ffd23f");
    g.addColorStop(1, "#d98e04");
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 128);
    c.strokeStyle = "rgba(160,90,0,0.7)";
    c.lineWidth = 6;
    c.beginPath();
    c.arc(64, 64, 50, 0, Math.PI * 2);
    c.stroke();
    centreText(c, "₹", 64, 68, 70, "#a35f00", 120);
  });
  const faceM = new THREE.MeshStandardMaterial({ map: face, roughness: 0.3, metalness: 0.6, emissive: new THREE.Color("#7a5200"), emissiveIntensity: 0.4 });
  const edge = mat("#d98e04", 0.3, 0.7);
  const geo = new THREE.CylinderGeometry(0.3, 0.3, 0.06, 24);
  geo.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(geo, [edge, faceM, faceM]);
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  m.name = "spin";
  return g;
}

/** Red heart pickup (a lifeline). */
export function heart3d() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.3);
  s.bezierCurveTo(-0.5, 0.05, -0.18, 0.42, 0, 0.16);
  s.bezierCurveTo(0.18, 0.42, 0.5, 0.05, 0, -0.3);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 });
  geo.translate(0, 0, -0.06);
  const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: "#ff3b5c", roughness: 0.3, emissive: new THREE.Color("#ff3b5c"), emissiveIntensity: 0.5 }));
  m.name = "spin";
  const g = new THREE.Group();
  g.add(m);
  return g;
}

/** Spins coins and hearts. */
export function spin(o: THREE.Object3D, clock: number, seed: number) {
  const s = o.getObjectByName("spin");
  if (s) s.rotation.y = clock * 4 + seed;
}

// ---- city scenery ---------------------------------------------------------------------------

const WALLS = ["#5a4566", "#6a4a4a", "#45506a", "#5f5648", "#4a6458"];

function windowsTexture(wall: string) {
  return cachedTexture(`windows|${wall}`, 128, 256, (c) => {
    c.fillStyle = wall;
    c.fillRect(0, 0, 128, 256);
    c.fillStyle = "#2a2a2e";
    c.fillRect(0, 216, 128, 40);
    for (let y = 12; y < 200; y += 44) {
      for (let x = 10; x < 120; x += 38) {
        c.fillStyle = hash(x, y + wall.length) > 0.45 ? "#ffd27a" : "#1e1a24";
        c.fillRect(x, y, 26, 30);
      }
    }
  });
}

/** A city block building seen from the road: lit windows, a shop shutter, sometimes a news hoarding. */
export function building3d(k: number, side: -1 | 1) {
  const r = hash(k, side);
  const h = 7 + r * 16;
  const depth = 12;
  const wall = WALLS[Math.floor(r * WALLS.length)];
  const g = new THREE.Group();
  const tex = windowsTexture(wall).clone();
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(depth / 10, h / 9);
  tex.needsUpdate = true;
  const facade = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  const plain = mat(shade(wall), 0.9);
  // Faces: +x, -x, +y, -y, +z, -z. The face towards the road gets the windows.
  const mats = side < 0 ? [facade, plain, plain, plain, facade, plain] : [plain, facade, plain, plain, facade, plain];
  mesh(new THREE.BoxGeometry(10, h, depth), mats, g, side * 5, h / 2, -depth / 2);
  if (hash(k, side + 3) > 0.45) {
    const idx = Math.floor(hash(k, side + 9) * BILLBOARDS.length);
    const [header, headline] = BILLBOARDS[idx];
    const board = cachedTexture(`billboard|${idx}`, 400, 200, (c) => {
      c.fillStyle = "#1b1b1b";
      c.fillRect(0, 0, 400, 200);
      c.fillStyle = "#f8f4ec";
      c.fillRect(4, 4, 392, 192);
      c.fillStyle = "#c1121f";
      c.fillRect(4, 4, 392, 60);
      centreText(c, header, 200, 34, 36, "#fff", 360);
      sloganText(c, headline, 400, 180, "#111");
    });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshStandardMaterial({ map: board, roughness: 0.7 }));
    b.position.set(side * 5, h + 1.8, 0.05);
    g.add(b);
    mesh(new THREE.BoxGeometry(0.15, 1.8, 0.15), mat("#1b1b1b"), g, side * 3.5, h + 0.3, -0.1);
    mesh(new THREE.BoxGeometry(0.15, 1.8, 0.15), mat("#1b1b1b"), g, side * 6.5, h + 0.3, -0.1);
  }
  return g;
}

function shade(hex: string) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(0.7);
  return `#${c.getHexString()}`;
}

/** Street lamp with a glowing head. `arm` points the head over the road. */
export function lamp3d(arm: number, color = "#fff3c4", height = 6.5) {
  const g = new THREE.Group();
  const pole = mat("#1b1b22", 0.5, 0.5);
  mesh(new THREE.CylinderGeometry(0.08, 0.1, height, 8), pole, g, 0, height / 2, 0);
  const a = mesh(new THREE.BoxGeometry(Math.abs(arm), 0.08, 0.08), pole, g, arm / 2, height, 0);
  a.castShadow = false;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  head.position.set(arm, height - 0.15, 0);
  g.add(head);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.1, 12, 10), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.copy(head.position);
  g.add(glow);
  return g;
}

/** Hero look shared by the runner and the rail trolley rider. */
export const HERO_LOOK: RigLook = {
  skin: "#d89a5e",
  top: "#ff6b1a",
  trunks: "#27466e",
  shins: "#27466e",
  sleeves: true,
  boots: "#f7f7f7",
  hair: "short",
  hairColor: "#16110e",
  mustache: false,
  belly: false,
  glasses: false,
  jacket: false,
  extra: "headband",
  size: 1,
  backpack: "#14a38b",
};

/** Soft glowing ring under the player. */
export function playerRing(color = 0xffcc00, r = 0.62) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.88, r, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

export { setPose, buildRig };
export type { Rig };
