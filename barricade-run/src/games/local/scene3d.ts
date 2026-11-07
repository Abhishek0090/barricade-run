import * as THREE from "three";

import { hash } from "../shared/random";
import { cachedTexture, centreText, disposeTree, mat, mesh } from "../shared/rig3d";
import type { Scene3D } from "../shared/types";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { addEnvironment } from "../shared/world3d";

import { type Aspect, BUFFER, CAR_LEN, CARS, type LocalGame, MARKER, PLATFORM_LEN, SCALE, type Station } from "./engine";

/**
 * Mumbai Local: Motorman in 3D. Everything is placed relative to the front of your train, which sits
 * at the world origin and faces -z: a point p metres along the line is at world z = game.pos - p.
 * Your line is at x = 0, the opposite slow line at DOWN_X and the two fast lines further right.
 */

const GAUGE = 0.84; // Broad gauge: rails 1.676 m apart.
const DOWN_X = 14;
const FAST_X = [19.5, 24.1];
const PLAT_Y = 0.95;
const PLAT_EDGE = 1.85;
const PLAT_W = 9;
const WIRE_Y = 5.55;
const BODY_W = 3.66;
const BODY_Y0 = 1.05;
const BODY_H = 3.3;

// ---- small helpers ----------------------------------------------------------------------

/** Instanced meshes placed fresh every frame. */
class Scatter {
  readonly mesh: THREE.InstancedMesh;
  private tmp = new THREE.Object3D();
  private col = new THREE.Color();
  private n = 0;

  constructor(
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    private max: number,
    parent: THREE.Object3D,
    shadow = true,
  ) {
    this.mesh = new THREE.InstancedMesh(geo, material, max);
    this.mesh.castShadow = shadow;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  begin() {
    this.n = 0;
  }

  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, ry = 0) {
    if (this.n >= this.max) return;
    const t = this.tmp;
    t.position.set(x, y, z);
    t.rotation.set(0, ry, 0);
    t.scale.set(sx, sy, sz);
    t.updateMatrix();
    this.mesh.setMatrixAt(this.n, t.matrix);
    this.mesh.setColorAt(this.n, this.col.set(color));
    this.n++;
  }

  end() {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

const SHIRTS = ["#9cc3e6", "#f1f1f1", "#f7c9d0", "#cfe8d0", "#e9d8a6", "#b8c6db", "#ffffff", "#d7b8f3", "#ff9f43", "#5c6b7a", "#c1272d", "#2a9d8f"];
const PANTS = ["#2b2d42", "#3d405b", "#1d3557", "#5c4d3c", "#4a4e69", "#222222"];
const SKINS = ["#f1c27d", "#e0ac69", "#c68642", "#a5694f", "#8d5524"];

type Person = { x: number; y: number; z: number; look: number; ry: number; lean?: number };

/** Instanced commuters: legs, body, head, hair. */
class People {
  private parts: Scatter[];

  constructor(parent: THREE.Object3D, max: number) {
    const m = (rough: number) => new THREE.MeshStandardMaterial({ roughness: rough });
    this.parts = [
      new Scatter(new THREE.CapsuleGeometry(0.15, 0.62, 3, 8), m(0.8), max, parent),
      new Scatter(new THREE.CapsuleGeometry(0.21, 0.4, 3, 8), m(0.75), max, parent),
      new Scatter(new THREE.SphereGeometry(0.14, 10, 8), m(0.6), max, parent, false),
      new Scatter(new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m(0.9), max, parent, false),
    ];
  }

  /** lean tips the upper body sideways (x), for people hanging out of the doors. */
  update(list: Person[]) {
    const [legs, body, head, hair] = this.parts;
    for (const s of this.parts) s.begin();
    for (const p of list) {
      const k = 0.9 + hash(p.look, 3) * 0.18;
      const lean = p.lean ?? 0;
      const lx = (h: number) => p.x + Math.sin(lean) * h;
      legs.add(p.x, p.y + 0.47 * k, p.z, k, k, k, PANTS[(p.look >> 3) % PANTS.length], p.ry);
      body.add(lx(0.6), p.y + 1.12 * k, p.z, k, k, k, SHIRTS[p.look % SHIRTS.length], p.ry);
      head.add(lx(1.1), p.y + 1.58 * k, p.z, k, k, k, SKINS[(p.look >> 5) % SKINS.length], p.ry);
      hair.add(lx(1.12), p.y + 1.61 * k, p.z, k, k, k, (p.look >> 7) % 5 === 0 ? "#7a7a7a" : "#16110e", p.ry);
    }
    for (const s of this.parts) s.end();
  }
}

function repeatTex(key: string, w: number, h: number, rx: number, ry: number, paint: (c: CanvasRenderingContext2D) => void) {
  const t = cachedTexture(key, w, h, paint).clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}

const glowTex = () =>
  cachedTexture("glow", 64, 64, (c) => {
    const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = g;
    c.fillRect(0, 0, 64, 64);
  });

function glow(color: number, size: number) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  s.scale.set(size, size, 1);
  return s;
}

// ---- textures ---------------------------------------------------------------------------

/** Yellow station name board: Marathi over English, as on Central line stations. */
function stationBoardTex(st: Station) {
  return cachedTexture(`stn2|${st.en}`, 512, 170, (c) => {
    c.fillStyle = "#151515";
    c.fillRect(0, 0, 512, 170);
    c.fillStyle = "#ffd60a";
    c.fillRect(6, 6, 500, 158);
    centreText(c, st.mr, 256, 52, st.mr.length > 14 ? 30 : 46, "#111", 480);
    centreText(c, st.en.toUpperCase(), 256, 120, st.en.length > 10 ? 44 : 54, "#111", 480);
  });
}

type CarKind = "general" | "ladies" | "first" | "motor";

/** One side of a coach in the Central line livery: white body, magenta stripes, magenta doors, three open doorways. */
function coachSideTex(kind: CarKind) {
  return cachedTexture(`emu-side2|${kind}`, 1024, 176, (c) => {
    const PINK = "#c2368f";
    const body = c.createLinearGradient(0, 0, 0, 176);
    body.addColorStop(0, "#fbfbfc");
    body.addColorStop(0.7, "#eceef0");
    body.addColorStop(1, "#d6d9dc");
    c.fillStyle = body;
    c.fillRect(0, 0, 1024, 176);
    // Magenta stripes: a band under the roof, a broad one under the windows, a thin one above the skirt.
    c.fillStyle = PINK;
    c.fillRect(0, 14, 1024, 7);
    c.fillRect(0, 100, 1024, 20);
    c.fillStyle = "#e08cc0";
    c.fillRect(0, 124, 1024, 5);
    c.fillStyle = "#8e9399";
    c.fillRect(0, 160, 1024, 16);
    c.strokeStyle = "rgba(0,0,0,0.07)";
    for (let x = 0; x < 1024; x += 64) {
      c.beginPath();
      c.moveTo(x, 22);
      c.lineTo(x, 158);
      c.stroke();
    }
    const doors = [0.17, 0.5, 0.83].map((u) => u * 1024);
    for (let x = 22; x < 1000; x += 64) {
      if (doors.some((d) => Math.abs(d - (x + 20)) < 72)) continue;
      // Tall windows with rounded corners and grey frames.
      c.fillStyle = "#9aa0a8";
      c.beginPath();
      c.roundRect(x - 3, 30, 46, 66, 8);
      c.fill();
      const glass = c.createLinearGradient(0, 33, 0, 93);
      glass.addColorStop(0, "#c9d6e2");
      glass.addColorStop(0.35, "#6f8193");
      glass.addColorStop(1, "#2c3846");
      c.fillStyle = glass;
      c.beginPath();
      c.roundRect(x, 33, 40, 60, 6);
      c.fill();
      c.strokeStyle = "rgba(230,235,240,0.7)";
      c.lineWidth = 2;
      for (let y = 46; y < 92; y += 11) {
        c.beginPath();
        c.moveTo(x + 2, y);
        c.lineTo(x + 38, y);
        c.stroke();
      }
    }
    for (const d of doors) {
      // Magenta door leaves pushed open, the dark doorway, a grab pole in the middle.
      c.fillStyle = PINK;
      c.fillRect(d - 46, 22, 92, 138);
      c.fillStyle = "#0e1217";
      c.fillRect(d - 34, 26, 68, 134);
      c.fillStyle = "#2a3038";
      c.fillRect(d - 34, 146, 68, 14);
      c.fillStyle = "#d9dee3";
      c.fillRect(d - 2, 30, 4, 116);
      c.fillStyle = "#e9a7d0";
      for (const s of [-1, 1]) c.fillRect(d + s * 40 - 3, 40, 6, 40);
    }
    if (kind === "first") {
      for (let x = 0; x < 1024; x += 28) {
        c.fillStyle = (x / 28) % 2 ? "#c1272d" : "#f2b705";
        c.beginPath();
        c.moveTo(x, 130);
        c.lineTo(x + 14, 130);
        c.lineTo(x + 6, 142);
        c.lineTo(x - 8, 142);
        c.fill();
      }
    }
    const label = kind === "ladies" ? "LADIES • महिला" : kind === "first" ? "FIRST CLASS • प्रथम श्रेणी" : kind === "motor" ? "MOTOR COACH" : "GENERAL • सामान्य";
    c.font = "900 14px system-ui, sans-serif";
    c.textBaseline = "middle";
    for (const x of [290, 640]) {
      if (kind === "ladies") {
        c.fillStyle = "#2a9d3a";
        c.fillRect(x - 6, 102, c.measureText(label).width + 12, 16);
      }
      c.fillStyle = "#ffffff";
      c.fillText(label, x, 110);
    }
  });
}

/** The cab front: yellow nose, black band with the two windscreens, LED destination, twin headlights, grey skirt. */
function cabFrontTex(dest: string, fast: boolean) {
  return cachedTexture(`emu-front2|${dest}|${fast}`, 512, 464, (c) => {
    const yellow = c.createLinearGradient(0, 0, 0, 464);
    yellow.addColorStop(0, "#ffe23a");
    yellow.addColorStop(1, "#f2c500");
    c.fillStyle = yellow;
    c.fillRect(0, 0, 512, 464);
    // Destination board in the black strip above the windscreens.
    c.fillStyle = "#111";
    c.beginPath();
    c.roundRect(40, 22, 432, 44, 10);
    c.fill();
    c.font = "900 30px ui-monospace, Consolas, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = "#ff8c1a";
    c.fillText(`${dest}  ${fast ? "F" : "S"}`, 256, 45, 400);
    // Windscreens.
    for (const x of [34, 268]) {
      c.fillStyle = "#111";
      c.beginPath();
      c.roundRect(x - 6, 80, 222, 160, 18);
      c.fill();
      const g = c.createLinearGradient(x, 86, x + 210, 234);
      g.addColorStop(0, "#4f6377");
      g.addColorStop(0.45, "#151d26");
      g.addColorStop(1, "#24313f");
      c.fillStyle = g;
      c.beginPath();
      c.roundRect(x, 86, 210, 148, 14);
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.16)";
      c.lineWidth = 7;
      c.beginPath();
      c.moveTo(x + 30, 220);
      c.lineTo(x + 110, 100);
      c.stroke();
    }
    // Black lamp band with twin headlights each side and red markers in the middle.
    c.fillStyle = "#151515";
    c.beginPath();
    c.roundRect(20, 262, 472, 62, 30);
    c.fill();
    for (const x of [62, 104, 408, 450]) {
      c.fillStyle = "#cfd3d6";
      c.beginPath();
      c.arc(x, 293, 19, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fffbe6";
      c.beginPath();
      c.arc(x, 293, 13, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#ff2a2a";
    for (const x of [226, 286]) {
      c.beginPath();
      c.arc(x, 284, 6, 0, Math.PI * 2);
      c.arc(x, 304, 6, 0, Math.PI * 2);
      c.fill();
    }
    // White band and the grey skirt.
    c.fillStyle = "#f4f4f4";
    c.fillRect(0, 340, 512, 26);
    c.fillStyle = "#8d949b";
    c.fillRect(0, 366, 512, 98);
    c.fillStyle = "#6b7178";
    for (let x = 140; x < 380; x += 14) c.fillRect(x, 384, 7, 60);
  });
}

function speedBoardTex(lim: number) {
  return cachedTexture(`speed-board|${lim}`, 128, 128, (c) => {
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(64, 64, 60, 0, Math.PI * 2);
    c.fill();
    c.lineWidth = 12;
    c.strokeStyle = "#d62828";
    c.beginPath();
    c.arc(64, 64, 54, 0, Math.PI * 2);
    c.stroke();
    centreText(c, String(lim), 64, 68, lim >= 100 ? 44 : 54, "#111", 96);
  });
}

function kmPostTex(km: number) {
  return cachedTexture(`km-post|${km}`, 96, 64, (c) => {
    c.fillStyle = "#f4f4f0";
    c.fillRect(0, 0, 96, 64);
    c.strokeStyle = "#111";
    c.lineWidth = 4;
    c.strokeRect(2, 2, 92, 60);
    centreText(c, String(km), 48, 34, 34, "#111", 84);
  });
}

/** Sky and a far skyline, wrapped round a cylinder. The horizon is 3/4 of the way down. */
function skylineTex(evening: boolean) {
  return cachedTexture(`local-skyline|${evening}`, 2048, 512, (c) => {
    const H = 384;
    const sky = c.createLinearGradient(0, 0, 0, H);
    if (evening) {
      sky.addColorStop(0, "#141d45");
      sky.addColorStop(0.55, "#6d4a7c");
      sky.addColorStop(1, "#ff9a5a");
    } else {
      sky.addColorStop(0, "#6fa8dc");
      sky.addColorStop(0.6, "#bcd5ea");
      sky.addColorStop(1, "#efe1cc");
    }
    c.fillStyle = sky;
    c.fillRect(0, 0, 2048, H);
    const sx = 1400;
    const sun = c.createRadialGradient(sx, H - 70, 0, sx, H - 70, 160);
    sun.addColorStop(0, evening ? "rgba(255,190,120,0.95)" : "rgba(255,250,230,0.9)");
    sun.addColorStop(1, "rgba(255,240,200,0)");
    c.fillStyle = sun;
    c.fillRect(sx - 160, H - 230, 320, 320);
    c.fillStyle = evening ? "#3a3352" : "#9eabb9";
    c.beginPath();
    c.moveTo(0, H);
    for (let x = 0; x <= 2048; x += 32) c.lineTo(x, H - 30 - Math.sin(x * 0.004) * 22 - hash(x, 1) * 10);
    c.lineTo(2048, H);
    c.fill();
    for (const [row, count, maxH, color] of [
      [0, 180, 150, evening ? "#2f2a48" : "#8f9cad"],
      [1, 120, 110, evening ? "#211d33" : "#77849a"],
    ] as const) {
      for (let i = 0; i < count; i++) {
        const x = hash(i, 11 + row) * 2048;
        const w = 12 + hash(i, 21 + row) * 40;
        const h = 14 + hash(i, 31 + row) * hash(i, 41 + row) * maxH;
        c.fillStyle = color;
        c.fillRect(x, H - h, w, h);
        if (evening) {
          c.fillStyle = "rgba(255,214,140,0.7)";
          for (let k = 0; k < h / 9; k++) if (hash(i * 31 + k, row) > 0.6) c.fillRect(x + 3 + hash(k, i) * (w - 6), H - h + 4 + k * 8, 2, 2);
        }
      }
    }
    c.fillStyle = evening ? "#3d3448" : "#c9c4b8";
    c.fillRect(0, H, 2048, 512 - H);
  });
}

/**
 * Bakes every single-material mesh under root into one mesh per material, so a train or a station
 * draws in a couple of dozen calls instead of hundreds. Multi-material meshes, sprites and instanced
 * meshes are left alone, as is anything tagged userData.keep.
 */
function mergeStatic<T extends THREE.Object3D>(root: T): T {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; cast: boolean }>();
  const gone: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh || Array.isArray(m.material) || m.userData.keep) return;
    let parent = m.parent;
    while (parent && parent !== root) {
      if (parent.userData.keep) return;
      parent = parent.parent;
    }
    const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    for (const name of Object.keys(geo.attributes)) if (name !== "position" && name !== "normal" && name !== "uv") geo.deleteAttribute(name);
    if (!geo.attributes.uv || !geo.attributes.normal) return;
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
    const entry = byMat.get(m.material) ?? { geos: [], cast: false };
    entry.geos.push(geo);
    entry.cast ||= m.castShadow;
    byMat.set(m.material, entry);
    gone.push(m);
  });
  for (const m of gone) {
    m.removeFromParent();
    m.geometry.dispose();
  }
  for (const [material, { geos, cast }] of byMat) {
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    if (!merged) continue;
    const mm = new THREE.Mesh(merged, material);
    mm.castShadow = cast;
    mm.receiveShadow = true;
    root.add(mm);
  }
  return root;
}

// ---- the train ----------------------------------------------------------------------------

/** 12-car rake composition, from the leading cab. */
const RAKE: CarKind[] = ["motor", "ladies", "general", "general", "first", "motor", "general", "first", "ladies", "general", "motor", "general"];

/** A Central line EMU: CARS coaches, front of the train at local z = 0, coaches trailing towards +z. */
function buildTrain(dest: string, fast: boolean) {
  const g = new THREE.Group();
  const roofMat = mat("#a9adb2", 0.5, 0.5);
  const under = mat("#25272c", 0.8, 0.3);
  const endMat = mat("#c9cdd1", 0.6, 0.2);
  const front = new THREE.MeshStandardMaterial({ map: cabFrontTex(dest, fast), roughness: 0.35, metalness: 0.2 });
  const bodyGeo = new THREE.BoxGeometry(BODY_W, BODY_H, CAR_LEN - 0.6);
  const roofGeo = new THREE.CylinderGeometry(BODY_W / 2, BODY_W / 2, CAR_LEN - 0.6, 18);
  const bogieGeo = new THREE.BoxGeometry(2.5, 0.55, 2.9);
  const axleGeo = new THREE.CylinderGeometry(0.46, 0.46, 1.9, 14);
  axleGeo.rotateZ(Math.PI / 2);
  const boxGeo = new THREE.BoxGeometry(2.6, 0.7, 8);
  const ventGeo = new THREE.BoxGeometry(0.9, 0.22, 1.4);
  const steel = mat("#5a5f66", 0.4, 0.8);
  const sides = new Map<CarKind, THREE.Material>();
  for (let i = 0; i < CARS; i++) {
    const cz = i * CAR_LEN + CAR_LEN / 2;
    const kind = RAKE[i];
    let side = sides.get(kind);
    if (!side) {
      side = new THREE.MeshStandardMaterial({ map: coachSideTex(kind), roughness: 0.4, metalness: 0.25 });
      sides.set(kind, side);
    }
    // Faces: +x, -x, +y, -y, +z (rear), -z (front).
    mesh(bodyGeo, [side, side, roofMat, under, i === CARS - 1 ? front : endMat, i === 0 ? front : endMat], g, 0, BODY_Y0 + BODY_H / 2, cz);
    const roof = mesh(roofGeo, roofMat, g, 0, BODY_Y0 + BODY_H, cz);
    roof.rotation.x = Math.PI / 2;
    roof.scale.z = 0.2;
    for (const dz of [-6.6, 6.6]) {
      mesh(bogieGeo, under, g, 0, 0.62, cz + dz);
      for (const a of [-1.05, 1.05]) mesh(axleGeo, under, g, 0, 0.46, cz + dz + a);
    }
    mesh(boxGeo, under, g, 0, 0.75, cz);
    for (const dz of [-3, 3]) mesh(ventGeo, roofMat, g, 0, BODY_Y0 + BODY_H + 0.35, cz + dz);
    if (kind === "motor") {
      // Pantograph up against the overhead wire.
      const panto = new THREE.Group();
      mesh(new THREE.BoxGeometry(1.6, 0.18, 1.4), steel, panto, 0, 0.1, 0);
      const armA = mesh(new THREE.BoxGeometry(0.06, 0.06, 1.3), steel, panto, 0, 0.55, -0.3);
      armA.rotation.x = -0.75;
      const armB = mesh(new THREE.BoxGeometry(0.06, 0.06, 1.1), steel, panto, 0, 0.95, 0.05);
      armB.rotation.x = 0.85;
      const top = BODY_Y0 + BODY_H + 0.25;
      mesh(new THREE.BoxGeometry(1.7, 0.06, 0.12), steel, panto, 0, WIRE_Y - top - 0.04, 0.25);
      panto.position.set(0, top, cz - 5);
      g.add(panto);
    }
  }
  // Nose details at both cabs: yellow roof cap, grey skirt, buffers and the coupler.
  const yellow = mat("#f7d117", 0.45, 0.2);
  const grey = mat("#7d848b", 0.6, 0.4);
  for (const [z0, dir] of [
    [0.3, -1],
    [CARS * CAR_LEN - 0.3, 1],
  ] as const) {
    const cap = mesh(new THREE.CylinderGeometry(BODY_W / 2 + 0.02, BODY_W / 2 + 0.02, 2.4, 18), yellow, g, 0, BODY_Y0 + BODY_H, z0 - dir * 1.2);
    cap.rotation.x = Math.PI / 2;
    cap.scale.z = 0.21;
    mesh(new THREE.BoxGeometry(BODY_W - 0.2, 0.75, 0.5), grey, g, 0, BODY_Y0 - 0.15, z0 + dir * 0.05);
    for (const x of [-1.2, 1.2]) {
      const b = mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.5, 14), grey, g, x, BODY_Y0 - 0.1, z0 + dir * 0.45);
      b.rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16), mat("#d9dcdf", 0.4, 0.6), g, x, BODY_Y0 - 0.1, z0 + dir * 0.72).rotation.x = Math.PI / 2;
    }
    mesh(new THREE.BoxGeometry(0.35, 0.3, 0.7), mat("#33373c", 0.5, 0.6), g, 0, BODY_Y0 - 0.2, z0 + dir * 0.45);
  }
  // Twin headlights each side, in the black lamp band.
  const lampY = BODY_Y0 + BODY_H * (1 - 293 / 464);
  for (const x of [-1.38, -1.06, 1.06, 1.38]) {
    mesh(new THREE.CircleGeometry(0.13, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), g, x, lampY, 0.28).rotation.y = Math.PI;
  }
  for (const x of [-1.22, 1.22]) {
    const hg = glow(0xfff2c0, 1.8);
    hg.position.set(x, lampY, 0.05);
    g.add(hg);
  }
  return mergeStatic(g);
}

/** The motorman's cab around the camera: desk with gauges, master controller, windscreen pillars. */
function buildCab() {
  const cab = new THREE.Group();
  const wall = mat("#4a5856", 0.7, 0.1);
  const dark = mat("#22272b", 0.6, 0.3);
  const floorY = BODY_Y0 + 0.1;
  const desk = cachedTexture("cab-desk", 512, 160, (c) => {
    c.fillStyle = "#2e3438";
    c.fillRect(0, 0, 512, 160);
    const gauge = (x: number, y: number, r: number, label: string, v: number, color: string) => {
      c.fillStyle = "#f4f1e8";
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#111";
      c.lineWidth = 3;
      c.stroke();
      c.strokeStyle = color;
      const a = Math.PI * 0.75 + v * Math.PI * 1.5;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * r * 0.8, y + Math.sin(a) * r * 0.8);
      c.stroke();
      c.font = "700 10px system-ui";
      c.fillStyle = "#111";
      c.textAlign = "center";
      c.fillText(label, x, y + r * 0.5);
    };
    gauge(70, 70, 44, "km/h", 0.1, "#d62828");
    gauge(170, 60, 30, "BP", 0.6, "#111");
    gauge(240, 60, 30, "MR", 0.7, "#111");
    gauge(310, 60, 30, "kV", 0.75, "#111");
    for (let i = 0; i < 8; i++) {
      c.fillStyle = ["#2a9d3a", "#f2b705", "#d62828", "#3a86ff"][i % 4];
      c.beginPath();
      c.arc(380 + (i % 4) * 30, 40 + Math.floor(i / 4) * 34, 9, 0, Math.PI * 2);
      c.fill();
    }
    c.fillStyle = "#111";
    c.fillRect(150, 110, 220, 34);
    c.font = "700 16px ui-monospace, monospace";
    c.fillStyle = "#4cff7a";
    c.textAlign = "left";
    c.fillText("VCB ON  PANTO UP", 160, 132);
  });
  const deskTop = new THREE.MeshStandardMaterial({ map: desk, roughness: 0.6 });
  const d = mesh(new THREE.BoxGeometry(3.3, 0.8, 0.7), [dark, dark, deskTop, dark, dark, dark], cab, 0, floorY + 0.4, 0.6);
  d.rotation.x = 0.18;
  // Windscreen frame.
  mesh(new THREE.BoxGeometry(3.66, 0.7, 0.3), wall, cab, 0, BODY_Y0 + BODY_H - 0.3, 0.18);
  for (const x of [-1.72, 1.72]) mesh(new THREE.BoxGeometry(0.22, 2.2, 0.3), wall, cab, x, BODY_Y0 + 2.1, 0.2);
  mesh(new THREE.BoxGeometry(0.12, 1.5, 0.12), dark, cab, 0, BODY_Y0 + 2.2, 0.14);
  // Side walls with a window each side.
  for (const x of [-1.8, 1.8]) {
    mesh(new THREE.BoxGeometry(0.08, 1.35, 3.0), wall, cab, x, floorY + 0.68, 1.6);
    mesh(new THREE.BoxGeometry(0.08, 0.7, 3.0), wall, cab, x, BODY_Y0 + BODY_H - 0.35, 1.6);
    mesh(new THREE.BoxGeometry(0.08, 1.4, 0.3), wall, cab, x, BODY_Y0 + 2.2, 2.4);
  }
  mesh(new THREE.BoxGeometry(3.66, 0.08, 3.2), mat("#d9d6cf", 0.8), cab, 0, BODY_Y0 + BODY_H, 1.6);
  mesh(new THREE.BoxGeometry(3.66, BODY_H, 0.08), wall, cab, 0, BODY_Y0 + BODY_H / 2, 3.1);
  mesh(new THREE.BoxGeometry(3.66, 0.08, 3.2), mat("#3a3a3a", 0.9), cab, 0, floorY, 1.6);
  for (const x of [-0.9, 0.9]) {
    const w = mesh(new THREE.BoxGeometry(0.04, 0.9, 0.04), dark, cab, x, BODY_Y0 + 1.75, 0.04);
    w.rotation.z = 0.5;
  }
  // Master controller (left hand) and brake handle (right hand); their angles follow the notch.
  const power = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.35, 8), mat("#888", 0.3, 0.8), power, 0, 0.17, 0);
  mesh(new THREE.SphereGeometry(0.06, 10, 8), mat("#111", 0.4), power, 0, 0.36, 0);
  power.position.set(-1.15, floorY + 0.82, 0.85);
  cab.add(power);
  const brake = new THREE.Group();
  mesh(new THREE.BoxGeometry(0.04, 0.04, 0.32), mat("#888", 0.3, 0.8), brake, 0, 0, -0.16);
  mesh(new THREE.BoxGeometry(0.1, 0.08, 0.08), mat("#c1272d", 0.5), brake, 0, 0, -0.32);
  brake.position.set(-0.2, floorY + 0.86, 0.9);
  cab.add(brake);
  mesh(new THREE.BoxGeometry(0.6, 0.12, 0.6), mat("#3a2a20", 0.8), cab, -0.7, floorY + 0.55, 2.0);
  mesh(new THREE.BoxGeometry(0.6, 0.7, 0.1), mat("#3a2a20", 0.8), cab, -0.7, floorY + 0.95, 2.3);
  return { cab, power, brake };
}

// ---- stations ----------------------------------------------------------------------------

interface StationView {
  group: THREE.Group;
  people: People;
  crowd: { x: number; z: number; look: number; ry: number }[];
  lastCount: number;
}

/** CSMT: Gothic stone facade, turrets and the central dome with the statue on top. */
function buildCsmt() {
  const stoneTex = repeatTex("csmt-stone", 256, 256, 6, 3, (c) => {
    c.fillStyle = "#c9a27a";
    c.fillRect(0, 0, 256, 256);
    c.fillStyle = "#b5523b";
    for (let y = 0; y < 256; y += 64) c.fillRect(0, y + 58, 256, 6);
    for (let y = 8; y < 250; y += 64) {
      for (let x = 10; x < 250; x += 40) {
        c.fillStyle = "#5c4a3a";
        c.beginPath();
        c.moveTo(x, y + 44);
        c.lineTo(x, y + 18);
        c.quadraticCurveTo(x + 12, y, x + 24, y + 18);
        c.lineTo(x + 24, y + 44);
        c.closePath();
        c.fill();
      }
    }
  });
  const stone = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85 });
  const csmt = new THREE.Group();
  mesh(new THREE.BoxGeometry(90, 20, 22), stone, csmt, 0, 10, 0);
  mesh(new THREE.BoxGeometry(20, 28, 16), stone, csmt, 0, 14, 2);
  mesh(new THREE.CylinderGeometry(7, 7.5, 7, 16), stone, csmt, 0, 31.5, 2);
  mesh(new THREE.SphereGeometry(7.2, 22, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat("#8a9a8a", 0.6, 0.3), csmt, 0, 35, 2);
  mesh(new THREE.CylinderGeometry(0.35, 0.7, 6, 8), mat("#8a9a8a", 0.6, 0.3), csmt, 0, 44, 2);
  mesh(new THREE.SphereGeometry(0.8, 10, 8), mat("#d9c9a0", 0.5, 0.4), csmt, 0, 47.6, 2);
  for (const x of [-44, -22, 22, 44]) {
    mesh(new THREE.CylinderGeometry(1.6, 1.8, 26, 10), stone, csmt, x, 13, 11);
    mesh(new THREE.ConeGeometry(2.1, 6, 10), mat("#7a6a5a", 0.7), csmt, x, 29, 11);
  }
  const nameTex = cachedTexture("csmt-name2", 1024, 96, (c) => {
    c.fillStyle = "#2b2016";
    c.fillRect(0, 0, 1024, 96);
    centreText(c, "छत्रपती शिवाजी महाराज टर्मिनस • CHHATRAPATI SHIVAJI MAHARAJ TERMINUS", 512, 50, 34, "#f2d38a", 990);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(40, 3.8), new THREE.MeshStandardMaterial({ map: nameTex }));
  board.position.set(0, 17, 11.05);
  csmt.add(board);
  for (let x = -36; x <= 36; x += 9) {
    if (Math.abs(x) < 8) continue;
    mesh(new THREE.BoxGeometry(4, 6, 0.4), mat("#2b2016", 0.9), csmt, x, 3, 11.05).castShadow = false;
  }
  return csmt;
}

function buildStation(st: Station, left: boolean, terminus: boolean): StationView {
  const g = new THREE.Group();
  const s0 = left ? -1 : 1;
  const sides = st.big || terminus ? [s0, -s0] : [s0];
  const tiles = new THREE.MeshStandardMaterial({
    map: repeatTex("plat-tiles2", 128, 128, PLAT_W / 1.5, PLATFORM_LEN / 1.5, (c) => {
      c.fillStyle = "#b5ada0";
      c.fillRect(0, 0, 128, 128);
      c.strokeStyle = "rgba(0,0,0,0.14)";
      c.lineWidth = 2;
      for (let i = 0; i <= 128; i += 64) {
        c.beginPath();
        c.moveTo(i, 0);
        c.lineTo(i, 128);
        c.moveTo(0, i);
        c.lineTo(128, i);
        c.stroke();
      }
    }),
    roughness: 0.85,
  });
  const edge = mat("#8f887c", 0.9);
  const boardMat = new THREE.MeshStandardMaterial({ map: stationBoardTex(st), roughness: 0.5 });
  // Two faces back to back, so the name reads the right way round from both sides.
  const board = (w: number, h: number) => {
    const b = new THREE.Group();
    const front = new THREE.Mesh(new THREE.PlaneGeometry(w, h), boardMat);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), boardMat);
    back.rotation.y = Math.PI;
    back.position.z = -0.02;
    mesh(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.015), mat("#151515"), b, 0, 0, -0.01).castShadow = false;
    b.add(front, back);
    return b;
  };
  const green = mat("#2f6b4f", 0.6, 0.3);
  const roof = mat("#5d6e86", 0.6, 0.4);
  const crowd: StationView["crowd"] = [];
  sides.forEach((s, si) => {
    const cx = s * (PLAT_EDGE + PLAT_W / 2);
    mesh(new THREE.BoxGeometry(PLAT_W, PLAT_Y, PLATFORM_LEN), [edge, edge, tiles, edge, edge, edge], g, cx, PLAT_Y / 2, 0).castShadow = false;
    mesh(new THREE.BoxGeometry(0.28, 0.01, PLATFORM_LEN), mat("#f5c518", 0.6), g, s * (PLAT_EDGE + 0.35), PLAT_Y + 0.006, 0).castShadow = false;
    // Canopy on green pillars over the middle of the platform.
    const roofLen = PLATFORM_LEN * (st.big ? 0.8 : 0.55);
    mesh(new THREE.BoxGeometry(7, 0.22, roofLen), roof, g, s * (PLAT_EDGE + 5.2), PLAT_Y + 4.6, 0);
    for (let z = -roofLen / 2 + 6; z < roofLen / 2; z += 12) mesh(new THREE.CylinderGeometry(0.15, 0.17, 4.6, 10), green, g, s * (PLAT_EDGE + 5.6), PLAT_Y + 2.3, z);
    // Name boards hanging under the canopy, facing the track.
    for (let z = -roofLen / 2 + 15; z < roofLen / 2; z += 38) {
      const b = board(3.2, 1.06);
      b.position.set(s * (PLAT_EDGE + 2.4), PLAT_Y + 3.6, z);
      b.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(b);
    }
    // Standing name board at the near end, facing the approaching train.
    const end = board(4.6, 1.5);
    end.position.set(s * (PLAT_EDGE + 3.4), PLAT_Y + 2.6, PLATFORM_LEN / 2 - 8);
    g.add(end);
    for (const dx of [-2, 2]) mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), mat("#333"), g, s * (PLAT_EDGE + 3.4) + dx, PLAT_Y + 1.3, PLATFORM_LEN / 2 - 8.05);
    for (let z = -80; z <= 100; z += 45) mesh(new THREE.BoxGeometry(0.5, 0.08, 2.4), mat("#6b4a2b", 0.7), g, s * (PLAT_EDGE + 7.4), PLAT_Y + 0.48, z);
    if (si === 0) {
      mesh(new THREE.BoxGeometry(1.4, 1.2, 3), mat("#a0522d", 0.7), g, s * (PLAT_EDGE + 7.6), PLAT_Y + 0.6, -30);
      mesh(new THREE.BoxGeometry(1.6, 0.1, 3.4), mat("#c1272d", 0.6), g, s * (PLAT_EDGE + 7.6), PLAT_Y + 2.4, -30);
    }
    // Crowd waiting along the platform.
    const n = Math.round((st.big ? 130 : 75) / (si === 0 ? 1 : 2));
    for (let i = 0; i < n; i++) {
      const z = (hash(i, st.km * 10 + si) - 0.5) * (PLATFORM_LEN - 30);
      const x = s * (PLAT_EDGE + 1.6 + hash(i, 7 + si) * 5.5);
      const turn = (hash(i, 9) - 0.5) * 1.2;
      crowd.push({ x, z, look: Math.floor(hash(i, 3 + si) * 4096), ry: (s < 0 ? Math.PI / 2 : -Math.PI / 2) + turn });
    }
  });
  // 12-car stop marker (and the 9-car one), facing the cab.
  const markerTex = (n: number) =>
    cachedTexture(`car-stop|${n}`, 128, 160, (c) => {
      c.fillStyle = "#111";
      c.fillRect(0, 0, 128, 160);
      c.fillStyle = "#ffd60a";
      c.fillRect(6, 6, 116, 148);
      centreText(c, String(n), 64, 70, 76, "#111", 110);
      centreText(c, "CAR STOP", 64, 132, 18, "#111", 110);
    });
  for (const [n, z] of [
    [12, -MARKER],
    [9, -MARKER + 60],
  ] as const) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshStandardMaterial({ map: markerTex(n), roughness: 0.5 }));
    b.position.set(s0 * (PLAT_EDGE + 0.9), PLAT_Y + 2.3, z);
    g.add(b);
    mesh(new THREE.BoxGeometry(0.08, 2.3, 0.08), mat("#333"), g, s0 * (PLAT_EDGE + 0.9), PLAT_Y + 1.15, z + 0.05);
    if (n === 12) mesh(new THREE.BoxGeometry(0.6, 0.012, 0.25), mat("#ffffff", 0.5), g, s0 * (PLAT_EDGE + 0.4), PLAT_Y + 0.01, z).castShadow = false;
  }
  // Foot overbridge across all the tracks.
  const fob = mat("#8b8f94", 0.7, 0.2);
  mesh(new THREE.BoxGeometry(48, 0.5, 3.2), fob, g, 6, 7.6, 70);
  for (const dz of [-1.5, 1.5]) mesh(new THREE.BoxGeometry(48, 1.2, 0.12), mat("#5d6e86", 0.6, 0.3), g, 6, 8.4, 70 + dz);
  mesh(new THREE.BoxGeometry(48, 0.12, 3.6), roof, g, 6, 10, 70);
  for (const x of [-16, -8, 10, 28]) mesh(new THREE.BoxGeometry(0.5, 7.6, 0.5), fob, g, x, 3.8, 70);
  const stair = mesh(new THREE.BoxGeometry(2.4, 0.3, 12), fob, g, s0 * (PLAT_EDGE + 6.5), PLAT_Y + 3.3, 78);
  stair.rotation.x = -0.55;
  if (terminus) {
    // Buffer stops just past the 12-car marker, the train shed, and (at CSMT) the heritage building.
    const buf = new THREE.Group();
    mesh(new THREE.BoxGeometry(3, 1.2, 1.2), mat("#c1272d", 0.6), buf, 0, 0.9, 0);
    for (const x of [-0.84, 0.84]) mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 12), mat("#e9e5dc", 0.5), buf, x, 1.05, 0.7).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }), buf, 0, 1.7, 0.2).castShadow = false;
    const lg = glow(0xff3030, 1.6);
    lg.position.set(0, 1.7, 0.4);
    buf.add(lg);
    buf.position.set(0, 0, -(MARKER + BUFFER + 1.6));
    g.add(buf);
    const shedLen = PLATFORM_LEN + 40;
    const arch = new THREE.Mesh(
      new THREE.CylinderGeometry(16, 16, shedLen, 24, 1, true, -Math.PI / 2, Math.PI),
      new THREE.MeshStandardMaterial({ color: "#7d8b99", roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    arch.rotation.x = Math.PI / 2;
    arch.scale.z = 0.4;
    arch.position.set(2, 8, -20);
    arch.castShadow = false;
    g.add(arch);
    for (let z = -shedLen / 2 - 20; z <= shedLen / 2 - 20; z += 20) for (const x of [-12, 16]) mesh(new THREE.BoxGeometry(0.4, 8, 0.4), mat("#3f4a55", 0.6, 0.4), g, x, 4, z);
    if (st.en === "CSMT") {
      const b = buildCsmt();
      b.position.set(4, 0, -(MARKER + 70));
      g.add(b);
    }
  }
  mergeStatic(g);
  const people = new People(g, crowd.length);
  return { group: g, people, crowd, lastCount: -1 };
}

// ---- signals ------------------------------------------------------------------------------

interface SignalView {
  group: THREE.Group;
  lamps: { mat: THREE.MeshBasicMaterial; glow: THREE.Sprite; on: number; off: number }[];
}

function buildSignal(): SignalView {
  const g = new THREE.Group();
  const stripes = repeatTex("signal-post", 16, 64, 1, 6, (c) => {
    c.fillStyle = "#f7d117";
    c.fillRect(0, 0, 16, 64);
    c.fillStyle = "#111";
    c.fillRect(0, 0, 16, 32);
  });
  mesh(new THREE.CylinderGeometry(0.12, 0.14, 4.8, 10), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 }), g, 0, 2.4, 0);
  for (let y = 0.4; y < 4.6; y += 0.6) mesh(new THREE.BoxGeometry(0.22, 0.12, 0.12), mat("#111"), g, 0, y, 0.12);
  mesh(new THREE.BoxGeometry(0.62, 1.95, 0.32), mat("#111", 0.6), g, 0, 5.6, 0);
  // Top to bottom: yellow, green, red, yellow (Indian 4-aspect colour light signal).
  const colors: [number, number][] = [
    [0xffc61a, 0x2a2410],
    [0x2bff6a, 0x0f2414],
    [0xff2a2a, 0x2a1010],
    [0xffc61a, 0x2a2410],
  ];
  const lamps = colors.map(([on, off], i) => {
    const y = 6.3 - i * 0.46;
    const m = new THREE.MeshBasicMaterial({ color: off, toneMapped: false });
    mesh(new THREE.CircleGeometry(0.15, 16), m, g, 0, y, 0.17).castShadow = false;
    mesh(new THREE.BoxGeometry(0.4, 0.04, 0.22), mat("#111"), g, 0, y + 0.18, 0.26).castShadow = false;
    const gl = glow(on, 1.9);
    gl.position.set(0, y, 0.3);
    g.add(gl);
    return { mat: m, glow: gl, on, off };
  });
  return { group: g, lamps };
}

function showAspect(s: SignalView, a: Aspect) {
  const lit = a === "G" ? [1] : a === "Y" ? [3] : a === "YY" ? [0, 3] : [2];
  s.lamps.forEach((l, i) => {
    const on = lit.includes(i);
    l.mat.color.setHex(on ? l.on : l.off);
    l.glow.visible = on;
  });
}

// ---- the scene -----------------------------------------------------------------------------

export async function createLocalScene(canvas: HTMLCanvasElement): Promise<Scene3D<LocalGame>> {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  addEnvironment(renderer, scene, 0.45);
  const fog = new THREE.Fog(0xe6dccb, 220, 900);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(65, 1, 0.08, 2500);
  const view = { w: 1, h: 1 };

  // Sky: a cylinder of skyline that follows the camera.
  const SKY_H = 700;
  const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(new THREE.CylinderGeometry(900, 900, SKY_H, 48, 1, true), skyMat);
  sky.renderOrder = -1;
  scene.add(sky);
  let evening: boolean | null = null;

  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x7d7262, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 220 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);

  // Ground and the four tracks. Ballast and ground textures scroll with the train.
  const world = new THREE.Group();
  scene.add(world);
  const GROUND = 4000;
  const GROUND_REP = 120;
  const groundTex = repeatTex("local-ground", 256, 256, GROUND_REP, GROUND_REP, (c) => {
    c.fillStyle = "#77705f";
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = hash(i, 1) > 0.5 ? "rgba(90,110,60,0.35)" : "rgba(40,30,20,0.18)";
      c.fillRect(hash(i, 2) * 256, hash(i, 3) * 256, 3 + hash(i, 4) * 8, 3 + hash(i, 5) * 8);
    }
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(GROUND, GROUND), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.12;
  ground.receiveShadow = true;
  world.add(ground);
  const TRACK_LEN = 2600;
  const TRACK_MID = -TRACK_LEN / 2 + 500;
  const SLEEPER_TILE = 2.4;
  const ballastTex = repeatTex("local-ballast2", 128, 256, 1, TRACK_LEN / SLEEPER_TILE, (c) => {
    c.fillStyle = "#6f675d";
    c.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 700; i++) {
      c.fillStyle = hash(i, 8) > 0.5 ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.16)";
      c.fillRect(hash(i, 9) * 128, hash(i, 10) * 256, 2, 2);
    }
    // Four concrete sleepers per tile.
    c.fillStyle = "#9c978f";
    for (let y = 8; y < 256; y += 64) c.fillRect(12, y, 104, 22);
  });
  const ballastMat = new THREE.MeshStandardMaterial({ map: ballastTex, roughness: 0.95 });
  const railMat = mat("#c9ced4", 0.25, 0.9);
  const wireMat = mat("#3a3a3a", 0.5, 0.6);
  const railGeo = new THREE.BoxGeometry(0.08, 0.16, TRACK_LEN);
  for (const x of [0, DOWN_X, ...FAST_X]) {
    const bed = new THREE.Mesh(new THREE.PlaneGeometry(3.8, TRACK_LEN), ballastMat);
    bed.rotation.x = -Math.PI / 2;
    bed.position.set(x, 0.01, TRACK_MID);
    bed.receiveShadow = true;
    world.add(bed);
    for (const dx of [-GAUGE, GAUGE]) mesh(railGeo, railMat, world, x + dx, 0.1, TRACK_MID).castShadow = false;
    // Contact and catenary wires.
    mesh(new THREE.BoxGeometry(0.03, 0.03, TRACK_LEN), wireMat, world, x, WIRE_Y, TRACK_MID).castShadow = false;
    mesh(new THREE.BoxGeometry(0.02, 0.02, TRACK_LEN), wireMat, world, x, WIRE_Y + 1.1, TRACK_MID).castShadow = false;
  }
  // Thane creek water (shown only on that stretch).
  const water = new THREE.Mesh(new THREE.PlaneGeometry(220, 1), new THREE.MeshStandardMaterial({ color: "#4f6f78", roughness: 0.15, metalness: 0.4 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(-118, -0.06, 0);
  water.receiveShadow = true;
  const city = new THREE.Group();
  world.add(city);
  city.add(water);
  let cityBase = Number.NaN;
  let cityKey = "";

  // Overhead masts every 60 m, as a pool that walks with the train.
  const MAST_GAP = 60;
  const steel = mat("#8b9097", 0.6, 0.5);
  const masts = Array.from({ length: 32 }, () => {
    const m = new THREE.Group();
    mesh(new THREE.BoxGeometry(0.3, 7.4, 0.3), steel, m, -3.3, 3.7, 0);
    mesh(new THREE.BoxGeometry(3.6, 0.1, 0.1), steel, m, -1.5, WIRE_Y + 1.1, 0).castShadow = false;
    mesh(new THREE.BoxGeometry(0.06, 1.2, 0.06), steel, m, 0, WIRE_Y + 0.55, 0).castShadow = false;
    for (const x of [DOWN_X - 3, FAST_X[1] + 3]) mesh(new THREE.BoxGeometry(0.35, 8, 0.35), steel, m, x, 4, 0);
    mesh(new THREE.BoxGeometry(FAST_X[1] - DOWN_X + 6, 0.45, 0.3), steel, m, (DOWN_X + FAST_X[1]) / 2, 7.8, 0);
    world.add(mergeStatic(m));
    return m;
  });

  // City: instanced buildings with rooftop water tanks, hutments by the line, walls, trees and hills.
  const winTex = cachedTexture("local-windows", 128, 256, (c) => {
    c.fillStyle = "#ffffff";
    c.fillRect(0, 0, 128, 256);
    for (let y = 10; y < 250; y += 24) {
      for (let x = 8; x < 124; x += 20) {
        c.fillStyle = hash(x, y) > 0.8 ? "#7c8692" : "#4a5562";
        c.fillRect(x, y, 12, 13);
        c.fillStyle = "rgba(0,0,0,0.12)";
        c.fillRect(x - 2, y + 14, 16, 3);
      }
    }
    for (let i = 0; i < 18; i++) {
      c.fillStyle = "rgba(60,60,50,0.12)";
      c.fillRect(hash(i, 4) * 128, 0, 3 + hash(i, 5) * 6, 256);
    }
  });
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  unitBox.translate(0, 0.5, 0);
  const buildings = new Scatter(unitBox, new THREE.MeshStandardMaterial({ map: winTex, roughness: 0.85 }), 520, city, false);
  const tanks = new Scatter(new THREE.CylinderGeometry(0.8, 0.8, 1.4, 10).translate(0, 0.7, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 520, city, false);
  const huts = new Scatter(unitBox, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 360, city, false);
  const tarps = new Scatter(unitBox, new THREE.MeshStandardMaterial({ roughness: 0.7 }), 360, city, false);
  const walls = new Scatter(unitBox, new THREE.MeshStandardMaterial({ roughness: 0.9 }), 260, city, false);
  const trees = new Scatter(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), 420, city, false);
  const hills = new Scatter(new THREE.ConeGeometry(1, 1, 9).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), 40, city, false);
  const BUILD = ["#efe8dc", "#e9dcc6", "#f2d4c9", "#cfdbe6", "#d8d5cf", "#f4e3c3", "#cbd5c0", "#e7c9b0", "#bfc6cc"];
  const HUT = ["#8fa0b5", "#c9b79c", "#a3755a", "#d6cfc2", "#7f8f6a", "#b0b7bd"];
  const TARP = ["#1f5fbf", "#2a6fd6", "#3a3a3a", "#1f5fbf", "#6b7b8c", "#c1272d"];

  // Track-side boards and signals.
  const speedBoards = Array.from({ length: 5 }, () => {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), new THREE.MeshStandardMaterial({ roughness: 0.5 }));
    face.position.y = 3;
    g.add(face);
    mesh(new THREE.BoxGeometry(0.08, 3, 0.08), mat("#333"), g, 0, 1.5, -0.05);
    world.add(g);
    return { g, face, lim: -1 };
  });
  const kmPosts = Array.from({ length: 6 }, () => {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ roughness: 0.6 }));
    face.position.y = 1.3;
    g.add(face);
    mesh(new THREE.BoxGeometry(0.08, 1.1, 0.08), mat("#555"), g, 0, 0.55, -0.03);
    world.add(g);
    return { g, face, km: -1 };
  });
  const signals = Array.from({ length: 6 }, () => {
    const s = buildSignal();
    world.add(s.group);
    return s;
  });

  // Stations, built when they come near.
  const stations = new Map<string, StationView>();

  // Your train, its cab, and the passengers hanging out of the doors.
  let trainKey = "";
  let train = new THREE.Group();
  scene.add(train);
  const { cab, power, brake } = buildCab();
  scene.add(cab);
  const hangers = new People(scene, 230);
  const headBeam = new THREE.SpotLight(0xfff2cc, 0, 260, 0.32, 0.5, 1.2);
  headBeam.position.set(0, BODY_Y0 + BODY_H - 0.3, -0.5);
  headBeam.target.position.set(0, 0, -60);
  scene.add(headBeam, headBeam.target);

  // Other trains: a slow local the other way and fast locals on the through lines.
  const others = [
    { o: buildTrain("KALYAN", false), x: DOWN_X, dir: -1, q: 0, u: 20, on: false, wait: 8 },
    { o: buildTrain("CSMT", true), x: FAST_X[0], dir: 1, q: 0, u: 26, on: false, wait: 25 },
    { o: buildTrain("KASARA", true), x: FAST_X[1], dir: -1, q: 0, u: 24, on: false, wait: 40 },
  ];
  for (const t of others) {
    if (t.dir < 0) t.o.rotation.y = Math.PI;
    t.o.visible = false;
    scene.add(t.o);
  }

  let dutyKey = "";
  let boardPts: { pos: number; lim: number }[] = [];
  const camPos = new THREE.Vector3(0, 3, 10);
  const camLook = new THREE.Vector3(0, 2, -20);
  let lastMode = "";
  /** Line position of the trackside camera. */
  let trackCam: number | null = null;

  const setSky = (eve: boolean) => {
    if (evening === eve) return;
    evening = eve;
    const tex = skylineTex(eve).clone();
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(2, 1);
    tex.needsUpdate = true;
    skyMat.map?.dispose();
    skyMat.map = tex;
    skyMat.needsUpdate = true;
    scene.background = new THREE.Color(eve ? "#141d45" : "#6fa8dc");
    fog.color.set(eve ? "#4a3e55" : "#e6dccb");
    hemi.intensity = eve ? 0.45 : 1.0;
    hemi.color.set(eve ? "#8a8cc0" : "#dfeeff");
    sun.color.set(eve ? "#ff9a5a" : "#fff1d6");
    sun.intensity = eve ? 0.9 : 2.6;
    renderer.toneMappingExposure = eve ? 1.25 : 1.05;
    headBeam.intensity = eve ? 60 : 0;
    scene.environmentIntensity = eve ? 0.25 : 0.45;
  };

  /** World z of a line position. */
  let origin = 0;
  const zOf = (p: number) => origin - p;

  const updateCity = (g: LocalGame) => {
    const key = `${g.up}|${g.duty}`;
    if (key === cityKey && Math.abs(g.pos - cityBase) < 40) {
      city.position.z = g.pos - cityBase;
      return;
    }
    cityKey = key;
    cityBase = g.pos;
    city.position.z = 0;
    const pos = g.pos;
    const SLOT = 26;
    buildings.begin();
    tanks.begin();
    for (let k = Math.floor((pos - 300) / SLOT); k <= Math.floor((pos + 1500) / SLOT); k++) {
      const p = k * SLOT;
      const z = zOf(p);
      const km = g.kmAt(p);
      const creek = km > 33.9 && km < 35.9;
      const city = km < 16 ? 1.6 : km < 34 ? 1.1 : 0.75;
      for (const side of [-1, 1]) {
        for (let row = 0; row < 3; row++) {
          if (hash(k * 3 + row, side > 0 ? 17 : 5) < 0.15) continue;
          if (side < 0 && creek) continue;
          if (side < 0 && row === 2 && km > 36.5 && km < 44) continue;
          const w = 10 + hash(k, row * 2 + side + 40) * 10;
          const d = 9 + hash(k, row * 3 + side + 50) * 10;
          let h = (6 + hash(k, row + side * 7 + 60) * 22) * city;
          // Now and then a tall tower.
          if (hash(k, row + 77 + side) > 0.93) h = 45 + hash(k, 88) * 70;
          const x = side < 0 ? -(17 + row * 26 + d / 2 + hash(k, 91 + row) * 4) : 30 + row * 26 + d / 2 + hash(k, 93 + row) * 4;
          const zz = z + (hash(k, 95 + row) - 0.5) * 6;
          buildings.add(x, 0, zz, d, h, w, BUILD[Math.floor(hash(k, row * 5 + side + 99) * BUILD.length)]);
          if (h < 40 && hash(k, row + 111) > 0.35) tanks.add(x + (hash(k, 3) - 0.5) * d * 0.5, h, zz + (hash(k, 4) - 0.5) * w * 0.5, 1, 1, 1, hash(k, row + 5) > 0.3 ? "#1d1d1d" : "#2a6fd6");
        }
      }
    }
    buildings.end();
    tanks.end();

    huts.begin();
    tarps.begin();
    walls.begin();
    const H = 7;
    for (let k = Math.floor((pos - 120) / H); k <= Math.floor((pos + 700) / H); k++) {
      const z = zOf(k * H);
      const km = g.kmAt(k * H);
      if (km > 20 || km < 1.5) continue;
      for (const side of [-1, 1]) {
        if (hash(k, side + 200) < 0.35) continue;
        const x = side < 0 ? -12.5 - hash(k, 201) * 3 : FAST_X[1] + 4.5 + hash(k, 202) * 3;
        const w = 3 + hash(k, 203 + side) * 3;
        const h = 2.2 + hash(k, 204 + side) * 2.6;
        huts.add(x, 0, z, 3.4, h, w, HUT[Math.floor(hash(k, 205 + side) * HUT.length)]);
        tarps.add(x, h, z, 3.8, 0.12, w + 0.4, TARP[Math.floor(hash(k, 206 + side) * TARP.length)]);
      }
    }
    const WG = 12;
    for (let k = Math.floor((pos - 150) / WG); k <= Math.floor((pos + 600) / WG); k++) {
      const km = g.kmAt(k * WG);
      if (km > 33.9 && km < 35.9) continue;
      walls.add(-10.9, 0, zOf(k * WG), 0.3, 1.8, WG - 0.4, hash(k, 300) > 0.85 ? "#e9c46a" : "#cfc6b5");
    }
    huts.end();
    tarps.end();
    walls.end();

    trees.begin();
    hills.begin();
    const T = 13;
    for (let k = Math.floor((pos - 200) / T); k <= Math.floor((pos + 1200) / T); k++) {
      const z = zOf(k * T);
      const km = g.kmAt(k * T);
      if (km > 33.9 && km < 35.9) {
        // Mangroves along the creek.
        for (let j = 0; j < 3; j++) trees.add(-7 - j * 6 - hash(k, j) * 5, 0.6, z + hash(k, j + 9) * 6, 2.4 + hash(k, j + 1) * 1.6, 1.4, 2.4, hash(k, j + 3) > 0.5 ? "#2f5d34" : "#3c6e3a");
        continue;
      }
      if (hash(k, 400) > 0.45) continue;
      const side = hash(k, 401) > 0.5 ? 1 : -1;
      const x = side < 0 ? -11.5 - hash(k, 402) * 5 : FAST_X[1] + 3 + hash(k, 403) * 2;
      const r = 1.8 + hash(k, 404) * 2.2;
      trees.add(x, r + 1.6, z, r, r * 1.1, r, ["#3c6e3a", "#4f7d3a", "#2f5d34", "#5b8a3c"][Math.floor(hash(k, 405) * 4)]);
    }
    // Parsik hill to the west, between Kalwa and Diva.
    for (let k = Math.floor((pos - 400) / 160); k <= Math.floor((pos + 1800) / 160); k++) {
      const km = g.kmAt(k * 160);
      if (km < 36.5 || km > 44) continue;
      hills.add(-130 - hash(k, 501) * 80, -2, zOf(k * 160), 120 + hash(k, 502) * 80, 40 + hash(k, 500) * 60, 140, hash(k, 503) > 0.5 ? "#5f7a45" : "#6e7f4e");
    }
    trees.end();
    hills.end();

    const posOfKm = (km: number) => Math.abs(g.route[0].km - km) * 1000 * SCALE;
    const za = zOf(posOfKm(35.9));
    const zb = zOf(posOfKm(33.9));
    water.visible = Math.min(za, zb) < 1500 && Math.max(za, zb) > -1500;
    water.scale.y = Math.abs(zb - za);
    water.position.z = (za + zb) / 2;
  };

  const updateStations = (g: LocalGame) => {
    const route = g.route;
    const haltIdx = new Map(g.halts.map((h, i) => [h.idx, i]));
    const near = new Set<string>();
    route.forEach((st, i) => {
      const z = zOf(g.stationPos(i));
      if (z > 450 || z < -1700) return;
      const hi = haltIdx.get(i);
      const h = hi !== undefined ? g.halts[hi] : null;
      const left = h ? h.left : hash(i, 13) > 0.5;
      const terminus = i === route.length - 1;
      const key = `${st.en}|${left}|${terminus}`;
      near.add(key);
      let sv = stations.get(key);
      if (!sv) {
        sv = buildStation(st, left, terminus);
        stations.set(key, sv);
        world.add(sv.group);
      }
      sv.group.visible = true;
      sv.group.position.z = z;
      // The crowd boards during your dwell; a few are left once you've gone.
      let frac = 1;
      if (h && hi !== undefined) {
        if (hi < g.next - 1 || (hi === g.next - 1 && g.phase !== "dwell")) frac = 0.18;
        else if (hi === g.next - 1) frac = Math.max(0.18, Math.min(1, (g.dwellT - 2) / 10));
      }
      const count = Math.round(sv.crowd.length * frac);
      if (count !== sv.lastCount) {
        sv.lastCount = count;
        sv.people.update(sv.crowd.slice(0, count).map((c) => ({ x: c.x, y: PLAT_Y, z: c.z, look: c.look, ry: c.ry })));
      }
    });
    for (const [key, sv] of stations) {
      if (near.has(key)) continue;
      sv.group.visible = false;
      if (stations.size > 6) {
        world.remove(sv.group);
        disposeTree(sv.group);
        stations.delete(key);
      }
    }
  };

  const updateTrackside = (g: LocalGame) => {
    const key = `${g.up}|${g.fast}|${g.duty}`;
    if (key !== dutyKey) {
      dutyKey = key;
      boardPts = [];
      let prev = g.limitAt(0);
      for (let p = 0; p < g.lineEnd + 200; p += 10) {
        const lim = g.limitAt(p);
        if (lim !== prev) boardPts.push({ pos: p, lim });
        prev = lim;
      }
    }
    let bi = 0;
    for (const b of boardPts) {
      const z = zOf(b.pos);
      if (z > 60 || z < -1200 || bi >= speedBoards.length) continue;
      const sb = speedBoards[bi++];
      sb.g.visible = true;
      sb.g.position.set(-3.1, 0, z);
      if (sb.lim !== b.lim) {
        sb.lim = b.lim;
        const m = sb.face.material as THREE.MeshStandardMaterial;
        m.map = speedBoardTex(b.lim);
        m.needsUpdate = true;
      }
    }
    for (; bi < speedBoards.length; bi++) speedBoards[bi].g.visible = false;
    // Km posts every real kilometre.
    const step = 1000 * SCALE;
    let ki = 0;
    for (let p = Math.ceil((g.pos - 60) / step) * step; p < g.pos + 1100 && ki < kmPosts.length; p += step) {
      const kp = kmPosts[ki++];
      const km = Math.round(g.kmAt(p));
      kp.g.visible = true;
      kp.g.position.set(-3.8, 0, zOf(p));
      if (kp.km !== km) {
        kp.km = km;
        const m = kp.face.material as THREE.MeshStandardMaterial;
        m.map = kmPostTex(km);
        m.needsUpdate = true;
      }
    }
    for (; ki < kmPosts.length; ki++) kmPosts[ki].g.visible = false;
    // Signals: the one just passed and those ahead.
    const first = g.signals.findIndex((s) => s.pos > g.pos - 80);
    signals.forEach((sv, j) => {
      const i = first + j;
      const s = first < 0 ? undefined : g.signals[i];
      sv.group.visible = !!s;
      if (!s) return;
      sv.group.position.set(-2.6, 0, zOf(s.pos));
      showAspect(sv, g.aspect(i));
    });
    const base = Math.floor((g.pos - 300) / MAST_GAP);
    masts.forEach((m, i) => m.position.set(0, 0, zOf((base + i) * MAST_GAP)));
  };

  const updateOthers = (g: LocalGame, dt: number) => {
    const moving = g.phase === "run" || g.phase === "dwell";
    for (const t of others) {
      if (!t.on) {
        t.wait -= dt;
        if (t.wait <= 0 && moving) {
          t.on = true;
          // Oncoming trains start far ahead; overtaking fast trains start behind you.
          t.q = t.dir < 0 ? g.pos + 1300 : g.pos - 420;
          t.u = t.dir < 0 ? 18 + Math.random() * 8 : Math.max(24, g.v + 6);
        }
      }
      if (t.on) {
        t.q += t.dir * t.u * dt;
        const rel = t.q - g.pos;
        if (rel < -500 || rel > 1600) {
          t.on = false;
          t.wait = 20 + Math.random() * 40;
        }
      }
      t.o.visible = t.on;
      t.o.position.set(t.x, 0, zOf(t.q));
    }
  };

  let hangT = 0;
  const updateHangers = (g: LocalGame, clock: number) => {
    if (clock - hangT < 0.15) return;
    hangT = clock;
    const load = g.passengers;
    const perDoor = load > 2600 ? 3 : load > 1500 ? 2 : load > 700 ? 1 : 0;
    const list: Person[] = [];
    for (let c = 0; c < CARS && perDoor > 0; c++) {
      for (const u of [0.17, 0.5, 0.83]) {
        const dz = c * CAR_LEN + 0.3 + (CAR_LEN - 0.6) * (1 - u);
        for (const side of [-1, 1]) {
          for (let k = 0; k < perDoor; k++) {
            const look = c * 97 + Math.round(u * 10) * 13 + k * 7 + (side > 0 ? 3 : 0);
            const out = k === 0 && g.kmh > 5 ? 0.25 + Math.sin(clock * 3 + look) * 0.04 : 0;
            list.push({ x: side * (BODY_W / 2 - 0.15 - k * 0.45), y: BODY_Y0, z: dz + (k - 1) * 0.4, look, ry: side > 0 ? -Math.PI / 2 : Math.PI / 2, lean: side * out });
          }
        }
      }
    }
    hangers.update(list);
  };

  return {
    resize(w, h, pixelRatio) {
      view.w = w;
      view.h = h;
      renderer.setPixelRatio(Math.min(pixelRatio, coarse ? 1.25 : 1.5));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    project(x, y, z) {
      const v = new THREE.Vector3(x, y, z).project(camera);
      return { x: ((v.x + 1) / 2) * view.w, y: ((1 - v.y) / 2) * view.h, visible: v.z < 1 };
    },
    render(g, clock, dt) {
      const portrait = view.w < view.h;
      origin = g.pos;
      setSky(g.start >= 17 * 3600);

      const dest = g.route[g.route.length - 1].en.toUpperCase();
      const tk = `${dest}|${g.fast}`;
      if (tk !== trainKey) {
        trainKey = tk;
        scene.remove(train);
        disposeTree(train);
        train = buildTrain(dest, g.fast);
        scene.add(train);
      }
      ballastTex.offset.y = (g.pos / SLEEPER_TILE) % 1;
      groundTex.offset.y = ((g.pos * GROUND_REP) / GROUND) % 1;

      updateCity(g);
      updateStations(g);
      updateTrackside(g);
      updateOthers(g, dt);
      updateHangers(g, clock);

      power.rotation.x = -Math.max(0, g.notch) * 0.18;
      brake.rotation.y = Math.min(0, g.notch) * 0.22;
      sun.position.set(-40, 70, -30);
      sun.target.position.set(0, 0, -30);

      // Camera: cab, chase or side view; an orbit for the menu, the end of a duty and the hub preview.
      const mode = g.phase === "select" || g.phase === "done" || g.ghost ? "orbit" : g.view;
      const snap = mode !== lastMode;
      lastMode = mode;
      cab.visible = mode === "cab";
      const shake = Math.min(1, g.kmh / 100);
      const want = new THREE.Vector3();
      const look = new THREE.Vector3();
      const z = g.zoom;
      let fov = 55;
      if (mode === "cab") {
        const sway = Math.sin(clock * 9.3) * 0.012 * shake + Math.sin(clock * 2.1) * 0.02 * shake;
        const bob = Math.abs(Math.sin(clock * 11)) * 0.012 * shake;
        want.set(-0.7 + sway, BODY_Y0 + 1.9 + bob, 2.1);
        const yaw = g.camYaw;
        const pitch = -0.04 + g.camPitch;
        look.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(20).add(want);
        // Zoom in the cab narrows the lens (binoculars for distant signals).
        fov = (portrait ? 82 : 68) / z;
      } else if (mode === "chase") {
        const a = 0.28 + g.camYaw;
        const D = (portrait ? 30 : 24) / z;
        want.set(-Math.sin(a) * D, (9 + g.camPitch * 14) / Math.sqrt(z), Math.cos(a) * D - 4);
        look.set(Math.sin(a) * 30, 1.5, -Math.cos(a) * 30 - 10);
        fov = portrait ? 72 : 58;
      } else if (mode === "side") {
        const a = Math.PI * 0.8 + g.camYaw;
        const D = (portrait ? 22 : 17) / z;
        look.set(0, 2.6, 8);
        want.set(-Math.sin(a) * D, 1.2 + g.camPitch * 10, Math.cos(a) * D).add(look);
        fov = portrait ? 72 : 55;
      } else if (mode === "top") {
        // Drone: high above, looking down the line.
        const a = g.camYaw;
        const H = (portrait ? 70 : 55) / z;
        look.set(-Math.sin(a) * 30, 0, -Math.cos(a) * 30 + 10);
        want.set(Math.sin(a) * H * 0.5 - 8, H, Math.cos(a) * H * 0.5 + 40);
        fov = portrait ? 70 : 55;
      } else if (mode === "front") {
        // Ahead of the cab, looking back at the yellow nose and the rake behind it.
        const a = g.camYaw;
        const D = (portrait ? 18 : 14) / z;
        look.set(0, 2.4, 6);
        want.set(-Math.sin(a) * D - 3, 2.4 + g.camPitch * 10, -Math.cos(a) * D - 4);
        fov = portrait ? 72 : 55;
      } else if (mode === "track") {
        // A camera on a post by the line: the train runs past it, then it jumps ahead again.
        if (trackCam === null || trackCam < g.pos - CARS * CAR_LEN - 30 || trackCam > g.pos + 700) trackCam = g.pos + 260 + g.v * 6;
        want.set(-7 + Math.sin(g.camYaw) * 4, 2.2 + g.camPitch * 8, zOf(trackCam));
        look.set(0, 2.2, Math.min(zOf(trackCam) + 30, Math.max(zOf(trackCam) - 40, 20)));
        fov = (portrait ? 70 : 50) / z;
      } else {
        const a = Math.PI * 0.72 + Math.sin(clock * 0.15) * 0.55 + g.camYaw;
        const D = (portrait ? 26 : 20) / z;
        look.set(0, 2.4, 10);
        want.set(-Math.sin(a) * D, 3.2 + g.camPitch * 10, Math.cos(a) * D).add(look);
        fov = portrait ? 70 : 55;
      }
      camera.fov = Math.max(14, Math.min(100, fov));
      if (mode !== "track") trackCam = null;
      const k = snap || mode === "cab" || mode === "track" ? 1 : Math.min(1, dt * 4);
      camPos.lerp(want, k);
      camLook.lerp(look, k);
      camera.updateProjectionMatrix();
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      // Keep the skyline's horizon level with the eye.
      sky.position.set(camPos.x, SKY_H / 2 - SKY_H / 4 + camPos.y * 0.5, camPos.z);
      renderer.render(scene, camera);
    },
    dispose() {
      disposeTree(scene);
      renderer.dispose();
    },
  };
}
