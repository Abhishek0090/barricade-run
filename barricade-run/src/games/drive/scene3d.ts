import * as THREE from "three";

import { buildRig, cachedTexture, centreText, disposeTree, mat, mesh, setPose, sloganText } from "../shared/rig3d";
import type { Scene3D } from "../shared/types";
import { barricade3d, blink, bus3d, coin3d, createWorld, Crowd3D, heart3d, HERO_LOOK, lamp3d, officer3d, playerRing, Pool, Repeater, ScrollStrip, spin } from "../shared/world3d";

import { CAM_BACK, CAM_BACK_PORTRAIT, CAM_H, CAR_HALF_W, CAR_LEN, LANE_COUNT, LANE_W, laneX, ROAD_HALF, VIEW_DIST } from "./constants";
import { type Debris, type DriveGame, type Obstacle, type Pickup, VEHICLE } from "./engine";

/** Barricade Drive in 3D: a night highway through the chakka jam. Engine z is -z in the scene. */

const RAIL_X = ROAD_HALF + 1.4;

/** Car body seen from any side: lower box, cabin with glass, tail lights, wheels. Origin at the rear bumper. */
function car3d(color: string, w = 1.8, len = 4.0, roof?: string) {
  const g = new THREE.Group();
  const paint = mat(color, 0.35, 0.3);
  mesh(new THREE.BoxGeometry(w, 0.65, len), paint, g, 0, 0.62, -len / 2);
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2b3d, roughness: 0.1, metalness: 0.5 });
  const cabin = mesh(new THREE.BoxGeometry(w * 0.84, 0.5, len - 1.9), [paint, paint, roof ? mat(roof, 0.4) : paint, paint, glass, glass], g, 0, 1.2, -len / 2 + 0.1);
  cabin.name = "cabin";
  const wheel = mat("#0b0b0e", 0.8);
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-0.75, -len + 0.75]) {
      const wh = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14), wheel, g, x, 0.34, z);
      wh.rotation.z = Math.PI / 2;
    }
  }
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a1018, emissive: new THREE.Color(0xff2b3a), emissiveIntensity: 0.6 });
  for (const x of [-w / 2 + 0.22, w / 2 - 0.22]) {
    const t = mesh(new THREE.BoxGeometry(0.32, 0.14, 0.04), tail, g, x, 0.78, 0.01);
    t.name = "tail";
  }
  const amber = mat("#ffb000", 0.3, 0, 2.5);
  for (const x of [-w / 2 + 0.15, w / 2 - 0.15]) {
    const h = mesh(new THREE.BoxGeometry(0.16, 0.08, 0.04), amber, g, x, 0.6, 0.02);
    h.name = "blink";
  }
  mesh(new THREE.BoxGeometry(w + 0.04, 0.12, 0.08), mat("#1b1b1f", 0.6), g, 0, 0.36, 0);
  const plate = cachedTexture("plate-dl", 156, 40, (c) => {
    c.fillStyle = "#f7f3e3";
    c.fillRect(0, 0, 156, 40);
    centreText(c, "DL 3C 2026", 78, 22, 24, "#111", 146);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.13), new THREE.MeshStandardMaterial({ map: plate }));
  p.position.set(0, 0.55, 0.02);
  g.add(p);
  return g;
}

function auto3d() {
  const g = new THREE.Group();
  const { w, len, h } = VEHICLE.auto;
  mesh(new THREE.BoxGeometry(w, 0.65, len), mat("#1f8a3a", 0.5), g, 0, 0.6, -len / 2);
  mesh(new THREE.BoxGeometry(w * 1.02, h - 0.95, len - 0.7), [mat("#141414"), mat("#141414"), mat("#f2c200", 0.5), mat("#141414"), mat("#141414"), mat("#141414")], g, 0, 0.95 + (h - 0.95) / 2, -len / 2 + 0.25);
  const wheel = mat("#0b0b0e", 0.8);
  for (const x of [-w / 2, w / 2]) {
    const wh = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), wheel, g, x, 0.28, -0.6);
    wh.rotation.z = Math.PI / 2;
  }
  const wh = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), wheel, g, 0, 0.28, -len + 0.4);
  wh.rotation.z = Math.PI / 2;
  return g;
}

function jeep3d() {
  const g = car3d("#f4f4f4", VEHICLE.jeep.w, VEHICLE.jeep.len, "#f8f9fa");
  mesh(new THREE.BoxGeometry(VEHICLE.jeep.w + 0.02, 0.1, VEHICLE.jeep.len), mat("#1d4ed8", 0.5), g, 0, 0.75, -VEHICLE.jeep.len / 2);
  const red = mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), mat("#ff2d55", 0.3, 0, 2.5), g, -0.28, 1.55, -1.6);
  red.name = "lightA";
  const blue = mesh(new THREE.BoxGeometry(0.5, 0.14, 0.3), mat("#2d7dff", 0.3, 0, 2.5), g, 0.28, 1.55, -1.6);
  blue.name = "lightB";
  const beam = new THREE.Mesh(new THREE.CircleGeometry(1.4, 20), new THREE.MeshBasicMaterial({ color: 0xfff6b0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
  beam.position.set(0, 0.7, 0.03);
  beam.name = "beam";
  g.add(beam);
  return g;
}

function cones3d() {
  const g = new THREE.Group();
  const orange = mat("#ff6b1a", 0.5);
  const white = mat("#f5f5f5", 0.5);
  for (const dx of [-0.75, 0, 0.75]) {
    mesh(new THREE.ConeGeometry(0.24, 0.75, 14), orange, g, dx, 0.38, 0);
    mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.1, 14), white, g, dx, 0.42, 0);
    mesh(new THREE.BoxGeometry(0.55, 0.05, 0.55), mat("#222"), g, dx, 0.025, 0);
  }
  return g;
}

function nitro3d() {
  const g = new THREE.Group();
  const can = mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 16), new THREE.MeshStandardMaterial({ color: 0x1e6fff, roughness: 0.3, metalness: 0.5, emissive: new THREE.Color(0x1e6fff), emissiveIntensity: 0.6 }), g);
  can.name = "spin";
  mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.12, 10), mat("#cfe6ff", 0.3, 0.6), can, 0, 0.41, 0);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), new THREE.MeshBasicMaterial({ color: 0x3caaff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
  g.add(glow);
  return g;
}

/** The player's Mumbai kaali-peeli taxi, with the hero at the wheel. */
function taxi3d() {
  const w = CAR_HALF_W * 2;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const black = mat("#141417", 0.35, 0.4);
  const yellow = mat("#ffcc00", 0.4, 0.2);
  mesh(new THREE.BoxGeometry(w, 0.68, CAR_LEN), black, body, 0, 0.64, -CAR_LEN / 2);
  mesh(new THREE.BoxGeometry(w + 0.01, 0.06, CAR_LEN), yellow, body, 0, 0.99, -CAR_LEN / 2);
  const glass = new THREE.MeshStandardMaterial({ color: 0x3a4f6e, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.45 });
  const cabin = mesh(new THREE.BoxGeometry(w * 0.86, 0.52, CAR_LEN - 2.1), [glass, glass, yellow, black, glass, glass], body, 0, 1.25, -CAR_LEN / 2 + 0.05);
  cabin.castShadow = true;
  // The driver: the hero's head and shoulders behind the rear window.
  const driver = buildRig(HERO_LOOK);
  driver.outer.scale.setScalar(0.9);
  driver.outer.position.set(-0.36, 0.2, -2.1);
  driver.inner.rotation.y = Math.PI / 2;
  setPose(driver, { lean: 0, armF: [1.3, 0.3], armB: [1.3, 0.3], legF: [1.5, 1.5], legB: [1.5, 1.5], drop: 0.45 });
  body.add(driver.outer);
  const sign = cachedTexture("taxi-sign", 160, 48, (c) => {
    c.fillStyle = "#ffe066";
    c.fillRect(0, 0, 160, 48);
    centreText(c, "TAXI", 80, 26, 32, "#111", 150);
  });
  mesh(new THREE.BoxGeometry(0.6, 0.18, 0.22), [mat("#ffe066"), mat("#ffe066"), mat("#ffe066"), mat("#ffe066"), new THREE.MeshBasicMaterial({ map: sign }), new THREE.MeshBasicMaterial({ map: sign })], body, 0, 1.6, -1.8);
  const wheel = mat("#0b0b0e", 0.8);
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-0.8, -CAR_LEN + 0.8]) {
      const wh = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), wheel, body, x, 0.36, z);
      wh.rotation.z = Math.PI / 2;
    }
  }
  mesh(new THREE.BoxGeometry(w + 0.08, 0.1, 0.1), mat("#b9c0c8", 0.2, 0.9), body, 0, 0.38, 0.02);
  const tail = new THREE.MeshStandardMaterial({ color: 0x8a1018, emissive: new THREE.Color(0xff2b3a), emissiveIntensity: 0.6 });
  for (const x of [-w / 2 + 0.24, w / 2 - 0.24]) mesh(new THREE.BoxGeometry(0.34, 0.16, 0.04), tail, body, x, 0.8, 0.02).name = "tail";
  const plate = cachedTexture("plate-mh", 156, 40, (c) => {
    c.fillStyle = "#f7f3e3";
    c.fillRect(0, 0, 156, 40);
    centreText(c, "MH 01 AP 26", 78, 22, 24, "#111", 146);
  });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.13), new THREE.MeshStandardMaterial({ map: plate }));
  p.position.set(0, 0.55, 0.03);
  body.add(p);
  // Nitro flame out of the exhaust.
  const flameGeo = new THREE.ConeGeometry(0.16, 1.1, 12, 1, true);
  flameGeo.rotateX(Math.PI / 2);
  flameGeo.translate(0, 0, 0.55);
  const flame = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: 0x5abeff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.set(-0.5, 0.35, 0.05);
  flame.name = "flame";
  body.add(flame);
  body.name = "body";
  return g;
}

/** Police motorbike with a rider, seen from behind. */
function bike3d() {
  const g = new THREE.Group();
  const wheel = mat("#0e0e10", 0.8);
  for (const z of [0, -1.3]) {
    const w = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 14), wheel, g, 0, 0.32, z);
    w.rotation.z = Math.PI / 2;
  }
  mesh(new THREE.BoxGeometry(0.34, 0.4, 1.3), mat("#e9ecef", 0.4, 0.3), g, 0, 0.6, -0.65);
  const light = mesh(new THREE.BoxGeometry(0.24, 0.1, 0.06), mat("#ff2d55", 0.3, 0, 3), g, 0, 0.82, 0.02);
  light.name = "lightA";
  const light2 = mesh(new THREE.BoxGeometry(0.24, 0.1, 0.06), mat("#2d7dff", 0.3, 0, 3), g, 0, 0.82, 0.02);
  light2.name = "lightB";
  const rider = officer3d(false);
  rider.position.set(0, 0.25, -0.6);
  (rider.userData.rig.inner as THREE.Group).rotation.y = Math.PI / 2;
  setPose(rider.userData.rig, { lean: 0.35, armF: [1.4, 0.2], armB: [1.4, 0.2], legF: [1.4, 1.4], legB: [1.4, 1.4], drop: 0.3 });
  g.add(rider);
  return g;
}

function gantry3d(k: number) {
  const g = new THREE.Group();
  const steel = mat("#6c7682", 0.5, 0.5);
  for (const side of [-1, 1]) mesh(new THREE.BoxGeometry(0.3, 7.4, 0.3), steel, g, side * (RAIL_X + 0.2), 3.7, 0);
  mesh(new THREE.BoxGeometry((RAIL_X + 0.2) * 2, 0.4, 0.3), steel, g, 0, 7.2, 0);
  const signs: [string, string][] = [
    ["ANDOLAN MARG", "CITY CENTRE  ↑"],
    ["RE-NEET ROAD", "EXAM BHAWAN  →"],
    ["लोकतंत्र मार्ग", "DEMOCRACY CHOWK  ↑"],
  ];
  const pair = signs[Math.abs(k) % signs.length];
  pair.forEach((line, i) => {
    const tex = cachedTexture(`gantry|${line}`, 340, 120, (c) => {
      c.fillStyle = "#0f6b3a";
      c.fillRect(0, 0, 340, 120);
      c.strokeStyle = "#fff";
      c.lineWidth = 5;
      c.strokeRect(8, 8, 324, 104);
      centreText(c, line, 170, 62, 36, "#fff", 300);
    });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 1.7, 1.7), new THREE.MeshStandardMaterial({ map: tex, emissive: new THREE.Color(0x0f6b3a), emissiveIntensity: 0.3 }));
    s.position.set((i === 0 ? -1 : 1) * LANE_W, 6.1, 0.2);
    g.add(s);
  });
  return g;
}

const ADS = ["STOP VOTE CHORI", "RE-NEET NOW", "NO MORE DHANDLI", "वोट चोरी बंद करो", "SAVE DEMOCRACY", "पेपर लीक बंद करो"];

function ad3d(k: number) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.15, 0.18, 8, 8), mat("#2a2f38", 0.6), g, 0, 4, 0);
  const msg = ADS[Math.abs(k) % ADS.length];
  const neon = k % 2 ? "#ff3fa4" : "#3ad0ff";
  const tex = cachedTexture(`ad|${msg}|${neon}`, 360, 180, (c) => {
    c.fillStyle = "#0b0d16";
    c.fillRect(0, 0, 360, 180);
    c.strokeStyle = neon;
    c.lineWidth = 8;
    c.shadowColor = neon;
    c.shadowBlur = 16;
    c.strokeRect(10, 10, 340, 160);
    c.shadowBlur = 10;
    sloganText(c, msg, 360, 180, neon);
  });
  const board = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide }));
  board.position.set(0, 9, 0);
  g.add(board);
  return g;
}

export async function createDriveScene(canvas: HTMLCanvasElement): Promise<Scene3D<DriveGame>> {
  const W = createWorld(canvas, {
    sky: { top: "#070b24", mid: "#24184f", low: "#d9467a", far: "#251c47", near: "#15122c", moon: true },
    fog: 0x1d1640,
    fogNear: 50,
    fogFar: VIEW_DIST + 10,
    hemiSky: 0x5a63b8,
    hemiGround: 0x0d1118,
    hemi: 0.8,
    sun: 0x9fb4ff,
    sunIntensity: 0.9,
    sunPos: [10, 20, 12],
    exposure: 1.2,
    env: 0.25,
  });
  const { scene, camera, renderer } = W;

  const SEG = 12;
  const strips = [
    new ScrollStrip(scene, -ROAD_HALF, ROAD_HALF, 0, -10, VIEW_DIST + 10, SEG, "drive-road", (c, w, h) => {
      c.fillStyle = "#24232c";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#292830";
      c.fillRect(0, 0, w, h / 3);
      c.fillStyle = "rgba(255,255,255,0.8)";
      for (let l = 1; l < LANE_COUNT; l++) c.fillRect((l / LANE_COUNT) * w - 2, 0, 4, h * 0.3);
      c.fillStyle = "rgba(255,255,255,0.65)";
      c.fillRect(w * 0.025, 0, 3, h);
      c.fillRect(w * 0.975 - 3, 0, 3, h);
    }),
  ];
  for (const side of [-1, 1]) {
    strips.push(
      new ScrollStrip(scene, side < 0 ? -RAIL_X : ROAD_HALF, side < 0 ? -ROAD_HALF : RAIL_X, 0.005, -10, VIEW_DIST + 10, SEG, "drive-shoulder", (c, w, h) => {
        c.fillStyle = "#1b1d24";
        c.fillRect(0, 0, w, h);
      }, 16, 16),
    );
    // Steel guardrail with posts.
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, VIEW_DIST + 20), mat("#aab4bf", 0.3, 0.8));
    rail.position.set(side * RAIL_X, 0.7, -(VIEW_DIST - 10) / 2);
    rail.castShadow = true;
    scene.add(rail);
  }
  const verge = new THREE.Mesh(new THREE.PlaneGeometry(200, 400), mat("#0e131a", 1));
  verge.rotation.x = -Math.PI / 2;
  verge.position.set(0, -0.02, -150);
  verge.receiveShadow = true;
  scene.add(verge);

  const posts = ([-1, 1] as const).map(() => new Repeater(scene, 4, 0, () => mesh(new THREE.BoxGeometry(0.1, 0.85, 0.1), mat("#3d444d", 0.6, 0.4), new THREE.Group(), 0, 0.42, 0).parent as THREE.Group));
  const lamps = ([-1, 1] as const).map((side) => new Repeater(scene, 32, 0, () => lamp3d(-side * 2.6, "#ffd59a", 10)));
  const pools = ([-1, 1] as const).map(
    () =>
      new Repeater(scene, 32, 0, () => {
        const m = new THREE.Mesh(new THREE.CircleGeometry(4.5, 24), new THREE.MeshBasicMaterial({ color: 0xffaa46, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }));
        m.rotation.x = -Math.PI / 2;
        m.scale.set(1, 0.45, 1);
        return m;
      }),
  );
  const gantries = new Repeater(scene, 220, 0, gantry3d);
  const ads = new Repeater(scene, 70, 0, ad3d);
  const crowd = new Crowd3D(scene, 160);

  const obstacles = new Pool<Obstacle>(scene, (kind, o) => {
    if (kind === "car") return car3d(o.color);
    if (kind === "auto") return auto3d();
    if (kind === "jeep") return jeep3d();
    if (kind === "bus") return bus3d();
    if (kind === "barricade") return barricade3d(VEHICLE.barricade.w);
    return cones3d();
  });
  const pickups = new Pool<Pickup>(scene, (kind) => (kind === "coin" ? coin3d() : kind === "nitro" ? nitro3d() : heart3d()));
  const debris = new Pool<Debris>(scene, () => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.25), mat("#f1f1f1", 0.6));
    m.castShadow = true;
    return m;
  });

  const taxi = taxi3d();
  scene.add(taxi);
  const ring = playerRing(0xffcc00, 1.3);
  scene.add(ring);
  const bikes = [bike3d(), bike3d()];
  for (const b of bikes) scene.add(b);
  let camX = 0;

  return {
    resize: W.resize,
    project: W.project,
    render(g, clock) {
      const d = g.distance;
      for (const s of strips) s.scroll(d);
      posts.forEach((rep, i) => rep.update(d, -6, 90, () => "p", (o, z) => o.position.set((i ? 1 : -1) * RAIL_X, 0, -z)));
      lamps.forEach((rep, i) => rep.update(d, 4, VIEW_DIST, () => "l", (o, z) => o.position.set((i ? 1 : -1) * (RAIL_X + 0.4), 0, -z)));
      pools.forEach((rep, i) => rep.update(d, -6, VIEW_DIST * 0.7, () => "p", (o, z) => o.position.set((i ? 1 : -1) * (ROAD_HALF - 2.4), 0.02, -z)));
      gantries.update(d, 6, VIEW_DIST, () => "g", (o, z) => o.position.set(0, 0, -z));
      ads.update(d, 4, VIEW_DIST, () => "a", (o, z, k) => o.position.set((k % 2 ? 1 : -1) * (RAIL_X + 6), 0, -z));
      crowd.update(g.crowd, clock, -6, VIEW_DIST * 0.8);

      for (const o of g.obstacles) {
        if (o.z > VIEW_DIST || o.z + o.len < -10) continue;
        const obj = obstacles.get(o, o.kind);
        obj.position.set(laneX(o.lane), 0, -o.z);
        blink(obj, clock, o.seed);
        const beam = obj.getObjectByName("beam");
        if (beam) beam.visible = o.vz > 0;
      }
      obstacles.sweep();
      for (const p of g.pickups) {
        if (p.taken || p.z > VIEW_DIST || p.z < -6) continue;
        const obj = pickups.get(p, p.kind);
        obj.position.set(laneX(p.lane), 0.75 + Math.sin(clock * 4 + p.z) * 0.08, -p.z);
        spin(obj, clock, p.z);
      }
      pickups.sweep();
      for (const db of g.debris) {
        const m = debris.get(db, "d");
        m.position.set(db.x, db.y, -db.z);
        m.rotation.set(clock * db.spin, clock * db.spin * 0.7, 0);
        ((m as THREE.Mesh).material as THREE.MeshStandardMaterial).color.set(db.color);
      }
      debris.sweep();

      const c = g.car;
      taxi.position.set(c.x, Math.sin(clock * 22) * 0.012 * (g.speed / 30), 0);
      const body = taxi.getObjectByName("body");
      if (body) body.rotation.z = Math.max(-0.08, Math.min(0.08, -c.lean * 0.04));
      taxi.visible = !(c.invulnT > 0 && Math.sin(clock * 30) > 0.3);
      taxi.traverse((o) => {
        if (o.name === "tail") ((o as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity = g.braking ? 3 : 0.6;
        if (o.name === "flame") {
          o.visible = g.boosting;
          o.scale.setScalar(0.8 + Math.random() * 0.5);
        }
      });
      ring.position.set(c.x, 0.02, -CAR_LEN / 2 + 1);
      ring.visible = true;
      (ring.material as THREE.MeshBasicMaterial).color.set(g.boosting ? 0x50b4ff : 0xffcc00);
      bikes.forEach((b, i) => {
        b.visible = g.chaserZ > -6.5;
        b.position.set(c.x + (i ? 1.9 : -1.9), 0, -g.chaserZ);
        blink(b, clock, i);
      });

      const portrait = W.view.w < W.view.h;
      camX += (c.x * 0.6 - camX) * 0.12;
      // Nitro pulls the camera back a little for a sense of speed.
      const kick = g.boosting ? 0.8 : 0;
      camera.position.set(camX, portrait ? 6.8 : CAM_H, (portrait ? CAM_BACK_PORTRAIT : CAM_BACK) + kick);
      camera.lookAt(camX * 0.7, portrait ? 0.4 : 1.2, -18);
      renderer.render(scene, camera);
    },
    dispose() {
      disposeTree(scene);
      renderer.dispose();
    },
  };
}
