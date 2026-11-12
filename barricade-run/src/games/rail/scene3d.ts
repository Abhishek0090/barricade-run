import * as THREE from "three";

import { hash } from "../shared/random";
import { buildRig, cachedTexture, centreText, disposeTree, mat, mesh, setPose } from "../shared/rig3d";
import type { Scene3D } from "../shared/types";
import { barricade3d, blink, coin3d, createWorld, Crowd3D, heart3d, HERO_LOOK, officer3d, playerRing, policeLine3d, Pool, poseOfficer, Repeater, ScrollStrip, Segments, spin } from "../shared/world3d";

import {
  BALLAST_HALF,
  CAM_BACK,
  CAM_BACK_PORTRAIT,
  CAM_H,
  CART_BACK,
  CART_FRONT,
  CART_HALF_W,
  GAUGE_HALF,
  LANE_W,
  PLATFORM_END,
  PLATFORM_H,
  PLATFORM_X,
  STATION_EVERY,
  STATION_LEN,
  type Track,
  VIEW_DIST,
} from "./constants";
import { OBSTACLE, type Obstacle, type Pickup, type RailGame, type Spark } from "./engine";

/** Rail Roko in 3D: a curving line through the countryside. Engine z is -z in the scene. */

function inStation(d: number) {
  const start = Math.floor(d / STATION_EVERY) * STATION_EVERY + 60;
  return d >= start && d < start + STATION_LEN;
}

/** Pieces of [z0, z1] where `lane` still has rails. */
function railSpans(game: RailGame, lane: Track, z0: number, z1: number): [number, number][] {
  const cuts = game.gaps.filter((g) => g.lane === lane && g.z < z1 && g.z + g.len > z0).sort((a, b) => a.z - b.z);
  const spans: [number, number][] = [];
  let from = z0;
  for (const g of cuts) {
    if (g.z > from) spans.push([from, g.z]);
    from = Math.max(from, g.z + g.len);
  }
  if (from < z1) spans.push([from, z1]);
  return spans;
}

function coach3d(len: number) {
  const { w, h } = OBSTACLE.coach;
  const g = new THREE.Group();
  const end = cachedTexture("coach-end", 256, 320, (c) => {
    c.fillStyle = "#1d4e89";
    c.fillRect(0, 0, 256, 320);
    c.fillStyle = "#f1e3c2";
    c.fillRect(0, 96, 256, 16);
    c.fillStyle = "#12325a";
    c.fillRect(96, 40, 64, 280);
    c.fillStyle = "#ffd60a";
    c.fillRect(20, 140, 56, 56);
    c.strokeStyle = "#111";
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(28, 148);
    c.lineTo(68, 188);
    c.moveTo(68, 148);
    c.lineTo(28, 188);
    c.stroke();
  });
  const side = cachedTexture("coach-side", 512, 128, (c) => {
    c.fillStyle = "#1d4e89";
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#f1e3c2";
    c.fillRect(0, 64, 512, 8);
    c.fillStyle = "#0d1b2a";
    for (let x = 12; x < 500; x += 48) c.fillRect(x, 20, 32, 34);
  });
  const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.5 });
  const endM = new THREE.MeshStandardMaterial({ map: end, roughness: 0.5 });
  const top = mat("#5d6b7d", 0.6, 0.3);
  mesh(new THREE.BoxGeometry(w, h - 0.55, len), [sideM, sideM, top, top, endM, endM], g, 0, 0.55 + (h - 0.55) / 2, -len / 2);
  const bogie = mat("#16161a", 0.8);
  for (const z of [-2, -len + 2]) mesh(new THREE.BoxGeometry(w - 0.4, 0.45, 2.4), bogie, g, 0, 0.32, z);
  const lamp = mesh(new THREE.SphereGeometry(0.13, 8, 6), mat("#ff2b3a", 0.3, 0, 3), g, w / 2 - 0.4, 2.3, 0.02);
  lamp.name = "blink";
  return g;
}

function loco3d(len: number) {
  const { w, h } = OBSTACLE.loco;
  const g = new THREE.Group();
  const front = cachedTexture("loco-front", 256, 340, (c) => {
    c.fillStyle = "#c62828";
    c.fillRect(0, 0, 256, 340);
    c.fillStyle = "#1a2433";
    c.fillRect(18, 48, 100, 80);
    c.fillRect(138, 48, 100, 80);
    c.fillStyle = "#f4f1e8";
    c.fillRect(0, 196, 256, 18);
    c.fillStyle = "#ffcc00";
    c.fillRect(0, 216, 256, 8);
    c.fillStyle = "#fffbe0";
    c.beginPath();
    c.arc(128, 26, 14, 0, Math.PI * 2);
    c.fill();
  });
  const side = cachedTexture("loco-side", 512, 128, (c) => {
    c.fillStyle = "#9e1f1f";
    c.fillRect(0, 0, 512, 128);
    c.fillStyle = "#f4f1e8";
    c.fillRect(0, 80, 512, 10);
    c.fillStyle = "#20232b";
    for (let x = 30; x < 480; x += 90) c.fillRect(x, 24, 50, 30);
  });
  const sideM = new THREE.MeshStandardMaterial({ map: side, roughness: 0.45, metalness: 0.2 });
  const frontM = new THREE.MeshStandardMaterial({ map: front, roughness: 0.45, metalness: 0.2 });
  mesh(new THREE.BoxGeometry(w, h - 0.55, len), [sideM, sideM, mat("#6f7884", 0.5, 0.4), sideM, frontM, frontM], g, 0, 0.55 + (h - 0.55) / 2, -len / 2);
  mesh(new THREE.BoxGeometry(w - 0.6, 0.5, 0.6), mat("#2b2b31", 0.6, 0.5), g, 0, 0.35, 0.1);
  const beam = new THREE.Mesh(new THREE.CircleGeometry(2.2, 24), new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(0, h - 0.6, 0.05);
  beam.name = "beam";
  g.add(beam);
  return g;
}

function buffer3d() {
  const g = new THREE.Group();
  const { w, h, len } = OBSTACLE.buffer;
  const stripes = cachedTexture("buffer-stripes", 128, 64, (c) => {
    c.fillStyle = "#c1121f";
    c.fillRect(0, 0, 128, 64);
    c.fillStyle = "#f5f5f5";
    for (let x = -64; x < 128; x += 32) {
      c.beginPath();
      c.moveTo(x, 64);
      c.lineTo(x + 16, 64);
      c.lineTo(x + 80, 0);
      c.lineTo(x + 64, 0);
      c.fill();
    }
  });
  const sign = cachedTexture("rail-roko-plate", 220, 60, (c) => {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, 220, 60);
    centreText(c, "रेल रोको", 110, 32, 36, "#c1121f", 200);
  });
  mesh(new THREE.BoxGeometry(w, h - 0.3, len), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.5 }), g, 0, 0.3 + (h - 0.3) / 2, -len / 2);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.3), new THREE.MeshStandardMaterial({ map: sign }));
  plate.position.set(0, h - 0.35, 0.01);
  g.add(plate);
  for (const x of [-0.6, 0.6]) {
    const b = mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 12), mat("#222", 0.4, 0.6), g, x, 0.75, 0.15);
    b.rotation.x = Math.PI / 2;
  }
  mesh(new THREE.SphereGeometry(0.14, 8, 6), mat("#ff2b3a", 0.3, 0, 3), g, 0, h + 0.15, -0.2).name = "blink";
  return g;
}

function tree3d(k: number) {
  const g = new THREE.Group();
  const size = 1 + hash(k, 5) * 0.9;
  mesh(new THREE.CylinderGeometry(0.12 * size, 0.18 * size, 1.8 * size, 7), mat("#6b4a2b", 0.9), g, 0, 0.9 * size, 0);
  const greens = ["#3f7d3a", "#4e8f3f", "#2f6b33"];
  const leaf = mat(greens[Math.abs(k) % 3], 0.85);
  for (const [x, y, z, r] of [[0, 2.6, 0, 1.1], [-0.6, 2.1, 0.2, 0.8], [0.6, 2.2, -0.2, 0.85]]) mesh(new THREE.IcosahedronGeometry(r * size, 1), leaf, g, x * size, y * size, z * size);
  return g;
}

function mast3d(side: -1 | 1) {
  const g = new THREE.Group();
  const steel = mat("#59606b", 0.5, 0.6);
  mesh(new THREE.BoxGeometry(0.22, 7.2, 0.22), steel, g, 0, 3.6, 0);
  const arm = mesh(new THREE.BoxGeometry(LANE_W * 2.2, 0.1, 0.1), steel, g, -side * LANE_W * 1.1, 6.6, 0);
  arm.castShadow = false;
  return g;
}

function shelter3d() {
  const g = new THREE.Group();
  const pillar = mat("#d7cfc2", 0.7);
  for (const dx of [-1.4, 1.4]) mesh(new THREE.BoxGeometry(0.18, 3.2, 0.18), pillar, g, dx, 1.6, 0);
  mesh(new THREE.BoxGeometry(4.2, 0.25, 6), mat("#b23a2e", 0.6), g, 0, 3.3, -0.5);
  return g;
}

function stationBoard3d() {
  const g = new THREE.Group();
  const tex = cachedTexture("station-board", 360, 130, (c) => {
    c.fillStyle = "#111";
    c.fillRect(0, 0, 360, 130);
    c.fillStyle = "#ffd60a";
    c.fillRect(5, 5, 350, 120);
    centreText(c, "आंदोलन जं.", 180, 42, 38, "#111", 330);
    centreText(c, "ANDOLAN JN.", 180, 92, 38, "#111", 330);
  });
  const b = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.15), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
  b.position.y = 2.5;
  g.add(b);
  for (const x of [-1.2, 1.2]) mesh(new THREE.BoxGeometry(0.08, 2, 0.08), mat("#222"), g, x, 1, 0);
  return g;
}

/** The yellow track trolley with the hero standing in it. */
function trolley3d() {
  const g = new THREE.Group();
  const w = CART_HALF_W * 2;
  const len = CART_BACK + CART_FRONT;
  const back = cachedTexture("trolley-back", 256, 128, (c) => {
    c.fillStyle = "#e0a526";
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = "rgba(0,0,0,0.18)";
    c.fillRect(0, 60, 256, 6);
    c.fillStyle = "#6b4a10";
    for (const [x, y] of [[16, 18], [240, 18], [16, 110], [240, 110]]) {
      c.beginPath();
      c.arc(x, y, 6, 0, Math.PI * 2);
      c.fill();
    }
    centreText(c, "RAIL ROKO", 128, 66, 40, "#2a1c08", 220);
  });
  const yellow = mat("#e0a526", 0.55, 0.2);
  const backM = new THREE.MeshStandardMaterial({ map: back, roughness: 0.55 });
  const cart = new THREE.Group();
  g.add(cart);
  // Open-topped box: floor and four walls.
  mesh(new THREE.BoxGeometry(w, 0.1, len), mat("#3b2a12", 0.9), cart, 0, 0.3, -len / 2 + CART_BACK);
  mesh(new THREE.BoxGeometry(w, 0.85, 0.06), [yellow, yellow, yellow, yellow, backM, yellow], cart, 0, 0.67, CART_BACK);
  mesh(new THREE.BoxGeometry(w, 0.85, 0.06), yellow, cart, 0, 0.67, -CART_FRONT);
  for (const x of [-w / 2, w / 2]) mesh(new THREE.BoxGeometry(0.06, 0.85, len), yellow, cart, x, 0.67, -len / 2 + CART_BACK);
  const wheel = mat("#1a1a1e", 0.5, 0.7);
  for (const x of [-GAUGE_HALF, GAUGE_HALF]) {
    for (const z of [CART_BACK - 0.25, -CART_FRONT + 0.25]) {
      const wh = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 14), wheel, cart, x, 0.2, z);
      wh.rotation.z = Math.PI / 2;
    }
  }
  // Flag on the front corner and the brass bell on the rim.
  mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.2, 6), mat("#8b5a2b"), cart, 0.62, 2.1, -CART_FRONT + 0.2);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.6, 8, 1),
    new THREE.MeshStandardMaterial({
      side: THREE.DoubleSide,
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
  flag.position.set(0.62, 2.9, -CART_FRONT + 0.2 - 0.45);
  flag.rotation.y = Math.PI / 2;
  flag.name = "flag";
  cart.add(flag);
  const bell = mesh(new THREE.ConeGeometry(0.15, 0.22, 14, 1, true), mat("#f2c94c", 0.25, 0.9), cart, -0.68, 1.35, CART_BACK - 0.05);
  (bell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  bell.name = "bell";
  const ringFx = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffdc78, transparent: true, opacity: 0.8 }));
  ringFx.position.copy(bell.position);
  ringFx.name = "ringFx";
  cart.add(ringFx);
  const rider = buildRig(HERO_LOOK);
  rider.outer.position.set(0, 0.35, -0.3);
  rider.inner.rotation.y = Math.PI / 2;
  cart.add(rider.outer);
  cart.name = "cart";
  return { g, cart, rider };
}

export async function createRailScene(canvas: HTMLCanvasElement): Promise<Scene3D<RailGame>> {
  const W = createWorld(canvas, {
    sky: { top: "#3d8fe0", mid: "#8cc6f2", low: "#ffe7b8", far: "#7aa8a0", near: "#5e9165", day: true, hills: true },
    fog: 0xcfe6f3,
    fogNear: 60,
    fogFar: VIEW_DIST + 20,
    hemiSky: 0xcfe9ff,
    hemiGround: 0x5e8a4a,
    hemi: 1.3,
    sun: 0xfff1d6,
    sunIntensity: 2.8,
    sunPos: [-16, 26, 10],
    env: 0.6,
  });
  const { scene, camera, renderer } = W;
  const NEAR = -8;
  const FAR = VIEW_DIST + 10;
  const SEGS = 48;

  const fields = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat("#5f9443", 1));
  fields.rotation.x = -Math.PI / 2;
  fields.position.set(0, -0.03, -150);
  fields.receiveShadow = true;
  scene.add(fields);
  const strips: ScrollStrip[] = [];
  const bed = new ScrollStrip(scene, -BALLAST_HALF - 0.9, BALLAST_HALF + 0.9, 0.01, NEAR, FAR, 2.2, "rail-bed", (c, w, h) => {
    c.fillStyle = "#ab9f8b";
    c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      c.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.1)";
      c.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  }, 512, 256, 0.95, SEGS);
  strips.push(bed);
  for (const side of [-1, 1] as const) {
    strips.push(
      new ScrollStrip(scene, side < 0 ? -PLATFORM_END : PLATFORM_X, side < 0 ? -PLATFORM_X : PLATFORM_END, PLATFORM_H, NEAR, FAR, 8, `platform|${side}`, (c, w, h) => {
        c.fillStyle = "#c9c3b8";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#bfb8ac";
        c.fillRect(0, 0, w, h / 2);
        c.fillStyle = "#f5c518";
        const edge = side < 0 ? w - w * 0.08 : w * 0.04;
        c.fillRect(edge, 0, w * 0.04, h);
      }, 128, 128, 0.9, SEGS),
      new ScrollStrip(scene, side < 0 ? -PLATFORM_END - 70 : PLATFORM_END, side < 0 ? -PLATFORM_END : PLATFORM_END + 70, 0, NEAR, FAR, 12, `crops|${side}`, (c, w, h) => {
        for (let x = 0; x < w; x += 16) {
          c.fillStyle = (x / 16) % 2 ? "#8bbd5f" : "#6c9f4c";
          c.fillRect(x, 0, 16, h);
        }
        c.fillStyle = "rgba(0,0,0,0.06)";
        c.fillRect(0, h / 2, w, h / 2);
      }, 256, 64, 1, SEGS),
    );
  }
  const walls = new Segments(scene, mat("#8f887c", 0.9), 0.2, PLATFORM_H, 120);
  // Each line: a raised dark ballast bed, concrete sleepers, and rails with a dark web and a bright head.
  const ballastTex = cachedTexture("rail-ballast3d", 64, 64, (c) => {
    c.fillStyle = "#5f5852";
    c.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = Math.random() > 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.18)";
      c.fillRect(Math.random() * 64, Math.random() * 64, 2, 2);
    }
  });
  const ballast = new Segments(scene, new THREE.MeshStandardMaterial({ map: ballastTex, roughness: 1 }), 2.5, 0.1, 280, false);
  const sleepers = new Segments(scene, mat("#cfc8bc", 0.85), 2.1, 0.07, 420, false);
  // Short 2 m pieces so the rails follow the curve without kinks.
  const rails = new Segments(scene, mat("#4d5158", 0.5, 0.7), 0.09, 0.12, 520);
  const railHeads = new Segments(scene, mat("#f1f4f8", 0.2, 0.95), 0.06, 0.03, 520, false);
  // Red-and-white stop board where a line runs out ahead.
  const stopBoards = new Pool<{ k: string }>(scene, () => {
    const g3 = new THREE.Group();
    const tex = cachedTexture("track-end-board", 128, 64, (c) => {
      c.fillStyle = "#c1272d";
      c.fillRect(0, 0, 128, 64);
      c.fillStyle = "#ffffff";
      c.fillRect(0, 24, 128, 16);
    });
    mesh(new THREE.BoxGeometry(2.2, 1.1, 0.12), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }), g3, 0, 0.75, 0);
    for (const x of [-0.9, 0.9]) mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), mat("#333"), g3, x, 0.15, 0);
    return g3;
  });
  const stopKeys = new Map<string, { k: string }>();
  const wires = [-1, 0, 1].map(() => {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 24 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0x2c3038 }));
    scene.add(line);
    return line;
  });

  const trees = ([-1, 1] as const).map((side) => new Repeater(scene, 9, 0, (k) => tree3d(k * side)));
  const masts = ([-1, 1] as const).map((side) => new Repeater(scene, 30, 0, () => mast3d(side)));
  const poles = new Repeater(scene, 40, 0, () => {
    const g = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.09, 0.11, 7, 7), mat("#5c4330", 0.9), g, 0, 3.5, 0);
    mesh(new THREE.BoxGeometry(1.4, 0.1, 0.1), mat("#5c4330", 0.9), g, 0, 6.6, 0);
    return g;
  });
  const shelters = ([-1, 1] as const).map(() => new Repeater(scene, 22, 74, () => shelter3d()));
  const boards = ([-1, 1] as const).map((side) => new Repeater(scene, STATION_EVERY, side < 0 ? 64 : 60 + STATION_LEN - 4, () => stationBoard3d()));
  const crowd = new Crowd3D(scene, 260);

  const obstacles = new Pool<Obstacle>(scene, (kind, o) => {
    if (kind === "barricade") return barricade3d(OBSTACLE.barricade.w);
    if (kind === "banner") return policeLine3d();
    if (kind === "coach") return coach3d(o.len);
    if (kind === "loco") return loco3d(o.len);
    if (kind === "buffer") return buffer3d();
    return officer3d(true);
  });
  const pickups = new Pool<Pickup>(scene, (kind) => (kind === "coin" ? coin3d() : heart3d()));
  const sparks = new Pool<Spark>(scene, () => new THREE.Mesh(new THREE.SphereGeometry(0.04, 4, 3), new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false })));

  const { g: trolley, cart, rider } = trolley3d();
  scene.add(trolley);
  const ring = playerRing(0xffcc00, 1.05);
  scene.add(ring);
  const chasers = [officer3d(false), officer3d(false)];
  for (const c of chasers) {
    (c.userData.rig.inner as THREE.Group).rotation.y = Math.PI / 2;
    scene.add(c);
  }
  let camX = 0;

  return {
    resize: W.resize,
    project: W.project,
    render(g, clock) {
      const d = g.distance;
      // The line bends gently left and right, as in the 2D version.
      const curve = 0.0011 * Math.sin(d / 260) + 0.0005 * Math.sin(d / 97);
      const bend = (z: number) => curve * z * z;
      const yaw = (z: number) => Math.atan(2 * curve * z);
      for (const s of strips) {
        s.scroll(d);
        s.bend(curve);
      }
      walls.begin();
      for (const side of [-1, 1]) for (let z = NEAR; z < FAR; z += 3) walls.add(side * PLATFORM_X, PLATFORM_H / 2, z, z + 3.05, curve);
      walls.end();
      for (const m of [ballast, sleepers, rails, railHeads]) m.begin();
      for (const lane of [-1, 0, 1] as Track[]) {
        const cx = lane * LANE_W;
        for (const [a, b] of railSpans(g, lane, NEAR, VIEW_DIST)) {
          for (let z = a; z < b; z += 2) {
            const z1 = Math.min(b, z + 2.05);
            ballast.add(cx, 0.04, z, z1, curve);
            for (const gx of [-GAUGE_HALF, GAUGE_HALF]) {
              rails.add(cx + gx, 0.16, z, z1, curve);
              railHeads.add(cx + gx, 0.225, z, z1, curve);
            }
          }
          // Sleepers stay put on the ground as the trolley rolls over them.
          const gap = 1.1;
          for (let k = Math.ceil((d + Math.max(a, NEAR)) / gap); k * gap - d < Math.min(b, 75); k++) {
            const z = k * gap - d;
            sleepers.add(cx, 0.1, z, z + 0.26, curve);
          }
          if (b < VIEW_DIST - 1) {
            const key = `${lane}|${Math.round(b + d)}`;
            let ref = stopKeys.get(key);
            if (!ref) stopKeys.set(key, (ref = { k: key }));
            const o = stopBoards.get(ref, "board");
            o.position.set(cx + bend(b), 0, -b);
            o.rotation.y = -yaw(b);
          }
        }
      }
      for (const m of [ballast, sleepers, rails, railHeads]) m.end();
      stopBoards.sweep();
      if (stopKeys.size > 40) stopKeys.clear();
      for (const [i, line] of wires.entries()) {
        const pos = line.geometry.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          const z = NEAR + j * 5;
          pos.setXYZ(j, (i - 1) * LANE_W + bend(z), 6, -z);
        }
        pos.needsUpdate = true;
      }

      const place = (o: THREE.Object3D, x: number, y: number, z: number) => {
        o.position.set(x + bend(z), y, -z);
        o.rotation.y = yaw(z);
      };
      trees.forEach((rep, i) => {
        const side = i ? 1 : -1;
        rep.update(d, -6, VIEW_DIST, (k) => (hash(k, side * 3) < 0.35 ? "none" : "tree"), (o, z, k) => {
          o.visible = hash(k, side * 3) >= 0.35;
          place(o, side * (PLATFORM_END + 3 + hash(k, side) * 26), 0, z);
        });
      });
      masts.forEach((rep, i) => rep.update(d, -2, VIEW_DIST, () => "m", (o, z) => place(o, (i ? 1 : -1) * (PLATFORM_X + 0.6), PLATFORM_H, z)));
      poles.update(d, -2, VIEW_DIST, () => "p", (o, z) => place(o, PLATFORM_END + 1.5, 0, z));
      shelters.forEach((rep, i) =>
        rep.update(d, 0, VIEW_DIST, () => "s", (o, z) => {
          o.visible = inStation(z + d);
          place(o, (i ? 1 : -1) * (PLATFORM_X + 2.4), PLATFORM_H, z);
        }),
      );
      boards.forEach((rep, i) => rep.update(d, 0, VIEW_DIST, () => "b", (o, z) => place(o, (i ? 1 : -1) * (PLATFORM_X + 2.5), PLATFORM_H, z)));
      crowd.update(g.crowd, clock, -6, VIEW_DIST * 0.8, bend);

      for (const o of g.obstacles) {
        if (o.z > VIEW_DIST || o.z + o.len < -8) continue;
        const obj = obstacles.get(o, o.kind);
        if (o.kind === "police") {
          const aside = (o.lane === -1 ? -1 : 1) * o.cleared * 1.35;
          place(obj, o.lane * LANE_W + aside, 0, o.z + o.len / 2);
          (obj.userData.rig.inner as THREE.Group).rotation.y = -Math.PI / 2;
          poseOfficer(obj, clock, o.cleared > 0 && o.cleared < 1, o.z);
        } else {
          place(obj, o.lane * LANE_W, 0, o.z);
          blink(obj, clock, o.z);
          const beam = obj.getObjectByName("beam");
          if (beam) beam.visible = o.vz > 0;
        }
      }
      obstacles.sweep();
      for (const p of g.pickups) {
        if (p.taken || p.z > VIEW_DIST || p.z < -6) continue;
        const obj = pickups.get(p, p.kind);
        place(obj, p.lane * LANE_W, p.y + Math.sin(clock * 4 + p.z) * 0.08, p.z);
        spin(obj, clock, p.z);
      }
      pickups.sweep();
      for (const s of g.sparks) sparks.get(s, "s").position.set(s.x, s.y, -s.z);
      sparks.sweep();

      const c = g.cart;
      const rattle = Math.sin(clock * 31) * 0.012 * (g.speed / 20);
      trolley.position.set(c.x, rattle, 0);
      cart.rotation.z = -Math.max(-0.25, Math.min(0.25, c.tilt));
      trolley.visible = !(c.invulnT > 0 && Math.sin(clock * 30) > 0.3);
      setPose(
        rider,
        g.ducking
          ? { lean: 0.5, armF: [1.2, 0.6], armB: [1.0, 0.6], legF: [1.5, 2.3], legB: [1.1, 2.1], drop: 0.62 }
          : { lean: 0.12, armF: [0.95, 0.35], armB: [0.85, 0.35], legF: [0.15, 0.1], legB: [-0.15, 0.1], drop: 0 },
      );
      const flag = cart.getObjectByName("flag");
      if (flag) flag.rotation.y = Math.PI / 2 + Math.sin(clock * 9) * 0.25;
      const bell = cart.getObjectByName("bell");
      if (bell) bell.rotation.z = g.ringing ? Math.sin(clock * 40) * 0.4 : 0;
      const ringFx = cart.getObjectByName("ringFx");
      if (ringFx) {
        ringFx.visible = g.ringing;
        const t = (clock * 3) % 1;
        ringFx.scale.setScalar(1 + t * 3);
        ((ringFx as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 1 - t;
      }
      ring.position.set(c.x, 0.2, -0.4);
      chasers.forEach((o, i) => {
        o.visible = g.chaserZ > -6;
        o.position.set(c.x + (i ? 1.5 : -1.5), 0, -g.chaserZ);
        poseOfficer(o, clock, g.status === "running", i * 1.3);
      });

      const portrait = W.view.w < W.view.h;
      camX += (c.x * 0.55 - camX) * 0.15;
      camera.position.set(camX, portrait ? 6.6 : CAM_H, portrait ? CAM_BACK_PORTRAIT + 1.5 : CAM_BACK);
      // Look along the curve.
      camera.lookAt(camX * 0.7 + bend(18), portrait ? 0.6 : 1.2, -18);
      renderer.render(scene, camera);
    },
    dispose() {
      disposeTree(scene);
      renderer.dispose();
    },
  };
}
