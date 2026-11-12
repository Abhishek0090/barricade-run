import * as THREE from "three";

import { hash } from "../shared/random";
import { buildRig, canvasTexture, centreText, disposeTree, mat, mesh, type Rig, setPose } from "../shared/rig3d";
import type { Scene3D } from "../shared/types";
import { addEnvironment } from "../shared/world3d";

import { type DangalGame, HEROES, type Look, RING_X, RING_Z, type Wrestler } from "./engine";
import { type Pose, poseOf, SELECT_X } from "./render";

/**
 * Dangal Showdown in real 3D (Three.js). The engine is unchanged: engine x is world x, engine z
 * (front ropes 0, back ropes RING_Z) becomes world z running towards the camera, engine y is height.
 * Everything is built from primitives and canvas textures at runtime: no model or image files.
 */

const RX = RING_X + 0.45;
const RZ = RING_Z / 2 + 0.3;
const ROPE_HEIGHTS = [0.5, 0.9, 1.3];
const ROPE_COLORS = [0xff9933, 0xffffff, 0x138808];

/** Engine position to world position. */
const world = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, RING_Z / 2 - z);

const SIGNS = ["SLAM NIGHT!", "THUNDER!", "BLAZE ON", "CYCLONE!", "THIS IS AWESOME", "NEW CHAMP!", "WE WANT TABLES", "1-2-3!", "BOO KING", "HOLY COW!"];

// ---- wrestler rig ------------------------------------------------------------------------

interface DangalRig extends Rig {
  heldChair: THREE.Object3D;
  /** Coloured ring on the mat under the wrestler. */
  ring: THREE.Mesh;
}

function chairMesh() {
  const g = new THREE.Group();
  const steel = mat("#9aa3ad", 0.35, 0.8);
  mesh(new THREE.BoxGeometry(0.42, 0.04, 0.4), steel, g, 0, 0.46, 0);
  mesh(new THREE.BoxGeometry(0.42, 0.42, 0.04), steel, g, 0, 0.7, -0.19);
  for (const [x, z] of [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]]) {
    mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.46, 6), steel, g, x, 0.23, z);
  }
  return g;
}

function buildDangalRig(look: Look, shirt?: THREE.Texture): DangalRig {
  const rig = buildRig(look, shirt);
  const heldChair = chairMesh();
  heldChair.scale.setScalar(0.8);
  heldChair.position.set(0.05, -0.25, 0);
  heldChair.visible = false;
  rig.hand.add(heldChair);
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.63, 32), new THREE.MeshBasicMaterial({ color: 0xffd447, transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  return { ...rig, heldChair, ring };
}

/** Puts a rig where the wrestler is, in the pose the 2D renderer uses. */
function applyPose(r: DangalRig, w: Wrestler, pose: Pose, size: number) {
  const pos = world(w.x, w.z);
  r.outer.position.copy(pos);
  r.outer.rotation.set(0, 0, 0);
  const lying = w.state === "down" || w.state === "pinned";
  if (lying) {
    r.outer.position.y = 0.2 * size;
    r.outer.rotation.z = (Math.PI / 2) * w.facing;
    r.hips.position.y = 0;
  } else if (w.state === "lifted") {
    r.outer.position.y = (w.y + 0.95) * size;
    r.outer.rotation.z = -w.rot;
    r.hips.position.y = 0;
  } else {
    r.hips.position.y = 0.95 - pose.drop;
  }
  // Face the opponent, turned a little towards the camera so you see the body, not a profile.
  r.inner.rotation.y = lying || w.state === "lifted" ? (w.facing > 0 ? 0 : Math.PI) : w.facing > 0 ? -0.35 : Math.PI + 0.35;
  setPose(r, pose, false);
  r.heldChair.visible = w.chairShots > 0;
  r.ring.position.set(pos.x, 0.012, pos.z);
  r.ring.visible = !lying && w.state !== "lifted";
}

// ---- the scene -------------------------------------------------------------------------------

export async function createDangalScene(canvas: HTMLCanvasElement): Promise<Scene3D<DangalGame>> {
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: "high-performance" });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0618);
  scene.fog = new THREE.Fog(0x0b0618, 26, 52);
  addEnvironment(renderer, scene, 0.35);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 120);
  const camPos = new THREE.Vector3(0, 4, 11);
  const camLook = new THREE.Vector3(0, 0.9, 0);

  // Lights: a dim fill, a key light over the ring with soft shadows, coloured spots sweeping.
  scene.add(new THREE.HemisphereLight(0x8c7ac9, 0x1a0f33, 0.9));
  const key = new THREE.SpotLight(0xfff2e0, 260, 40, 0.62, 0.55, 1.6);
  key.position.set(0, 13, 3);
  key.target.position.set(0, 0, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(coarse ? 512 : 1024, coarse ? 512 : 1024);
  key.shadow.bias = -0.0004;
  scene.add(key, key.target);
  const sweep: { light: THREE.SpotLight; cone: THREE.Mesh; phase: number }[] = [];
  const sweepColors = [0xff4fa0, 0x5a9bff, 0xffb347, 0x9b5cff];
  sweepColors.forEach((col, i) => {
    const light = new THREE.SpotLight(col, 140, 45, 0.22, 0.6, 1.4);
    light.position.set(-12 + i * 8, 11, -6 + (i % 2) * 10);
    scene.add(light, light.target);
    const coneGeo = new THREE.ConeGeometry(1.6, 14, 24, 1, true);
    coneGeo.translate(0, -7, 0);
    coneGeo.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(coneGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.copy(light.position);
    scene.add(cone);
    sweep.push({ light, cone, phase: i * 1.7 });
  });

  // Arena floor, barricades around the ring.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mat("#120b22", 0.9));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.05;
  floor.receiveShadow = true;
  scene.add(floor);
  const barricade = mat("#1d1a3a", 0.6);
  for (const [w, d, x, z] of [[18, 0.2, 0, -6.2], [18, 0.2, 0, 6.2], [0.2, 12.4, -9, 0], [0.2, 12.4, 9, 0]]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), barricade);
    b.position.set(x, -0.5, z);
    scene.add(b);
  }

  // The ring: platform, apron lettering, mat with the logo, posts, pads and tricolour ropes.
  const apronTex = canvasTexture(1024, 96, (c) => {
    c.fillStyle = "#14102b";
    c.fillRect(0, 0, 1024, 96);
    centreText(c, "SLAM NIGHT  •  CHAMPIONSHIP WRESTLING  •  LIVE", 512, 50, 46, "#ffd447", 980);
  });
  const apronMat = new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.8 });
  const matTex = canvasTexture(1024, 512, (c) => {
    const grad = c.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, "#d8d2c4");
    grad.addColorStop(1, "#ece7dc");
    c.fillStyle = grad;
    c.fillRect(0, 0, 1024, 512);
    c.strokeStyle = "#7a1f3d";
    c.lineWidth = 16;
    c.strokeRect(8, 8, 1008, 496);
    c.fillStyle = "rgba(122, 31, 61, 0.16)";
    c.beginPath();
    c.ellipse(512, 256, 260, 200, 0, 0, Math.PI * 2);
    c.fill();
    centreText(c, "SLAM", 512, 256, 150, "rgba(122, 31, 61, 0.55)", 900, true);
  });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(RX * 2 + 0.6, 1.05, RZ * 2 + 0.6), [apronMat, apronMat, new THREE.MeshStandardMaterial({ map: matTex, roughness: 0.85 }), apronMat, apronMat, apronMat]);
  platform.position.y = -0.525;
  platform.receiveShadow = true;
  scene.add(platform);
  const postMat = mat("#2b2b33", 0.4, 0.6);
  const corners: [number, number, number][] = [
    [-RX, RZ, 0xff2d55],
    [RX, RZ, 0x2d7dff],
    [-RX, -RZ, 0x2d7dff],
    [RX, -RZ, 0xff2d55],
  ];
  for (const [x, z, pad] of corners) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 10), postMat);
    p.position.set(x, 0.78, z);
    p.castShadow = true;
    scene.add(p);
    for (const h of ROPE_HEIGHTS) {
      const pd = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), mat(new THREE.Color(pad).getStyle(), 0.6));
      pd.position.set(x, h, z);
      scene.add(pd);
    }
  }
  const ropes: { mesh: THREE.Mesh; i: number }[] = [];
  ROPE_HEIGHTS.forEach((h, i) => {
    const m = mat(new THREE.Color(ROPE_COLORS[i]).getStyle(), 0.5);
    const sides: [THREE.Vector3, THREE.Vector3][] = [
      [new THREE.Vector3(-RX, h, RZ), new THREE.Vector3(RX, h, RZ)],
      [new THREE.Vector3(-RX, h, -RZ), new THREE.Vector3(RX, h, -RZ)],
      [new THREE.Vector3(-RX, h, -RZ), new THREE.Vector3(-RX, h, RZ)],
      [new THREE.Vector3(RX, h, -RZ), new THREE.Vector3(RX, h, RZ)],
    ];
    for (const [a, b] of sides) {
      const len = a.distanceTo(b);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 8), m);
      rope.position.copy(a).add(b).multiplyScalar(0.5);
      rope.lookAt(b);
      rope.rotateX(Math.PI / 2);
      rope.castShadow = true;
      scene.add(rope);
      ropes.push({ mesh: rope, i });
    }
  });

  // Big screen above the far stands.
  const screenTex = canvasTexture(1024, 256, (c) => {
    const g = c.createLinearGradient(0, 0, 1024, 0);
    g.addColorStop(0, "#3b0f5c");
    g.addColorStop(0.5, "#c71f5b");
    g.addColorStop(1, "#3b0f5c");
    c.fillStyle = g;
    c.fillRect(0, 0, 1024, 256);
    centreText(c, "SLAM NIGHT", 512, 110, 110, "#ffffff", 980, true);
    centreText(c, "CHAMPIONSHIP WRESTLING • LIVE", 512, 205, 52, "#ffd447", 960);
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, 9.5, -17);
  scene.add(screen);

  // The crowd: instanced bodies and heads on tiered stands, bouncing with the hype.
  const seats: { x: number; y: number; z: number; ph: number }[] = [];
  const rows = coarse ? 6 : 8;
  for (let r = 0; r < rows; r++) {
    const y = -0.6 + r * 0.62;
    for (let x = -15; x <= 15; x += 0.8) seats.push({ x: x + (r % 2) * 0.4, y, z: -7.6 - r * 1.05, ph: hash(x, r) * 6 });
    for (const side of [-1, 1]) {
      for (let z = -6.5; z <= 7; z += 0.8) seats.push({ x: side * (10.4 + r * 1.05), y, z: z + (r % 2) * 0.4, ph: hash(z, r + side) * 6 });
    }
  }
  const stands = new THREE.Group();
  for (let r = 0; r < rows; r++) {
    const step = mat(r % 2 ? "#1c1433" : "#22183d", 0.9);
    const back = new THREE.Mesh(new THREE.BoxGeometry(32, 0.62 * (r + 1), 1.05), step);
    back.position.set(0, -1.05 + (0.62 * (r + 1)) / 2, -7.6 - r * 1.05);
    stands.add(back);
    for (const side of [-1, 1]) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.62 * (r + 1), 15), step);
      s.position.set(side * (10.4 + r * 1.05), -1.05 + (0.62 * (r + 1)) / 2, 0.25);
      stands.add(s);
    }
  }
  scene.add(stands);
  const bodyGeo = new THREE.CapsuleGeometry(0.2, 0.36, 3, 8);
  const headGeo = new THREE.SphereGeometry(0.15, 8, 6);
  const bodies = new THREE.InstancedMesh(bodyGeo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), seats.length);
  const heads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), seats.length);
  const shirts = ["#e63946", "#2a9d8f", "#e9c46a", "#3a86ff", "#f1f1f1", "#ff006e", "#ff9933", "#138808", "#6d597a", "#ffd60a"];
  const skins = ["#f1c27d", "#e0ac69", "#c68642", "#a5694f", "#8d5524"];
  seats.forEach((s, i) => {
    bodies.setColorAt(i, new THREE.Color(shirts[Math.floor(hash(i, 1) * shirts.length)]));
    heads.setColorAt(i, new THREE.Color(skins[Math.floor(hash(i, 2) * skins.length)]));
  });
  scene.add(bodies, heads);
  // Protest signs held up in the stands.
  const signs: { mesh: THREE.Mesh; seat: number }[] = [];
  for (let i = 0; i < seats.length; i++) {
    if (hash(i, 7) < 0.93) continue;
    const text = SIGNS[signs.length % SIGNS.length];
    const tex = canvasTexture(256, 128, (c) => {
      c.fillStyle = hash(i, 4) > 0.5 ? "#ffffff" : "#ffe066";
      c.fillRect(0, 0, 256, 128);
      c.strokeStyle = "#111";
      c.lineWidth = 6;
      c.strokeRect(3, 3, 250, 122);
      centreText(c, text, 128, 68, 56, "#c1121f", 236);
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    scene.add(sign);
    signs.push({ mesh: sign, seat: i });
  }
  // Camera flashes.
  const flashes = Array.from({ length: 8 }, () => {
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    f.visible = false;
    scene.add(f);
    return f;
  });

  // Wrestlers, referee, steel chair, and the three heroes for the select screen.
  const refTex = canvasTexture(64, 64, (c) => {
    c.fillStyle = "#f1f1f1";
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = "#111";
    for (let x = 0; x < 64; x += 16) c.fillRect(x, 0, 8, 64);
  });
  const refLook: Look = { skin: "#c68642", top: "#f1f1f1", trunks: "#111111", boots: "#111111", hair: "short", hairColor: "#111111", mustache: true, belly: false, glasses: false, jacket: false, extra: "none", size: 1 };
  const refRig = buildDangalRig(refLook, refTex);
  refRig.ring.visible = false;
  scene.add(refRig.outer);
  const rigs = new Map<string, DangalRig>();
  const rigFor = (w: Wrestler) => {
    let r = rigs.get(w.f.name);
    if (!r) {
      r = buildDangalRig(w.f.look);
      rigs.set(w.f.name, r);
      scene.add(r.outer, r.ring);
    }
    return r;
  };
  const heroRigs = HEROES.map((h) => {
    const r = buildDangalRig(h.look);
    scene.add(r.outer);
    return r;
  });
  const ringChair = chairMesh();
  scene.add(ringChair);

  const tmp = new THREE.Object3D();
  let view = { w: 1, h: 1 };
  let orbit = 0;

  const project = (x: number, y: number, z: number) => {
    const v = world(x, z, y).project(camera);
    return { x: ((v.x + 1) / 2) * view.w, y: ((1 - v.y) / 2) * view.h, visible: v.z < 1 };
  };

  return {
    resize(w, h, pixelRatio) {
      view = { w, h };
      renderer.setPixelRatio(Math.min(pixelRatio, coarse ? 1.25 : 1.5));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.fov = w < h ? 58 : 40;
      camera.updateProjectionMatrix();
    },

    project,

    render(g, clock, dt) {
      const portrait = view.w < view.h;
      const hype = g.crowdHype;
      // Crowd bounce.
      seats.forEach((s, i) => {
        const bounce = Math.max(0, Math.sin(clock * 6 + s.ph)) * hype * 0.25;
        tmp.position.set(s.x, s.y + 0.55 + bounce, s.z);
        tmp.rotation.set(0, 0, 0);
        tmp.updateMatrix();
        bodies.setMatrixAt(i, tmp.matrix);
        tmp.position.y += 0.42;
        tmp.updateMatrix();
        heads.setMatrixAt(i, tmp.matrix);
      });
      bodies.instanceMatrix.needsUpdate = true;
      heads.instanceMatrix.needsUpdate = true;
      for (const sg of signs) {
        const s = seats[sg.seat];
        const bounce = Math.max(0, Math.sin(clock * 6 + s.ph)) * hype * 0.25;
        sg.mesh.position.set(s.x, s.y + 1.75 + bounce, s.z);
        sg.mesh.lookAt(camPos);
      }
      for (const f of flashes) {
        f.visible = Math.random() < 0.04 + hype * 0.04;
        if (f.visible) {
          const s = seats[Math.floor(Math.random() * seats.length)];
          f.position.set(s.x, s.y + 1.1, s.z + 0.3);
        }
      }
      // Sweeping spotlights.
      for (const s of sweep) {
        const t = new THREE.Vector3(Math.sin(clock * 0.5 + s.phase) * 4, 0, Math.cos(clock * 0.4 + s.phase) * 2.5);
        s.light.target.position.copy(t);
        s.cone.lookAt(t);
      }
      // Ropes wobble when someone hits the mat.
      for (const r of ropes) r.mesh.position.y = ROPE_HEIGHTS[r.i] - g.shake * 0.05 * Math.sin(clock * 40 + r.i);

      const select = g.phase === "select" && !g.ghost;
      for (const r of rigs.values()) {
        r.outer.visible = false;
        r.ring.visible = false;
      }
      heroRigs.forEach((r, i) => {
        r.outer.visible = select;
        if (!select) return;
        const on = i === g.pick;
        r.outer.position.copy(world(SELECT_X[i], RING_Z / 2));
        r.outer.rotation.set(0, 0, 0);
        r.inner.rotation.y = -Math.PI / 2 + Math.sin(clock * 0.8 + i) * 0.15;
        const fake = { state: on ? "celebrate" : "idle", t: clock, dur: 0, phase: i * 2, facing: 1 } as unknown as Wrestler;
        const pose = poseOf(fake, clock);
        r.hips.position.y = 0.95 - pose.drop;
        r.torso.rotation.z = -pose.lean;
        r.arms.forEach((a, k) => {
          const ap = k === 0 ? pose.armF : pose.armB;
          a.shoulder.rotation.z = ap[0];
          a.elbow.rotation.z = ap[1];
        });
        r.legs.forEach((l, k) => {
          const lp = k === 0 ? pose.legF : pose.legB;
          l.hip.rotation.z = lp[0];
          l.knee.rotation.z = -lp[1];
        });
        r.outer.scale.setScalar(on ? 1.12 : 1);
      });
      refRig.outer.visible = !select;
      ringChair.visible = !select && g.chair !== null;
      if (g.chair) ringChair.position.copy(world(g.chair.x, g.chair.z));

      if (!select) {
        for (const w of [g.me, g.foe]) {
          const r = rigFor(w);
          r.outer.visible = true;
          applyPose(r, w, poseOf(w, clock), w.f.look.size);
          (r.ring.material as THREE.MeshBasicMaterial).color.set(w === g.me ? 0xffd447 : 0xff5d73);
          if (g.ghost) r.ring.visible = false;
        }
        // Referee: watches the action, kneels to count.
        const counting = g.pin !== null;
        const slap = counting ? Math.max(0, Math.sin((g.pin!.t / 0.85) * Math.PI)) : 0;
        const refW = { x: g.ref.x, z: g.ref.z, y: 0, rot: 0, facing: g.me.x > g.ref.x ? 1 : -1, state: "idle", chairShots: 0 } as unknown as Wrestler;
        const refPose: Pose = counting
          ? { lean: 1.1, armF: [1.2 + slap * 0.8, 0], armB: [0.4, 0.2], legF: [1.4, 2.2], legB: [0.2, 2.0], drop: 0.5 }
          : { lean: 0, armF: [0.3 + Math.sin(clock * 2) * 0.1, 0.3], armB: [-0.2, 0.2], legF: [0.15, 0], legB: [-0.15, 0], drop: 0 };
        applyPose(refRig, refW, refPose, 1);
        refRig.ring.visible = false;
      }

      // Camera: broadcast view that follows the fight, swings round on finishers, drops low for pins.
      const midX = select ? 0 : (g.me.x + g.foe.x) / 2;
      const midZ = select ? RING_Z / 2 : (g.me.z + g.foe.z) / 2;
      const target = world(midX * 0.6, midZ, 0.9);
      const gap = select ? 0 : Math.abs(g.me.x - g.foe.x);
      let dist = (portrait ? 13.5 : 11) + gap * 0.35;
      let height = portrait ? 5.2 : 4.4;
      let angle = 0;
      if (select) {
        dist = portrait ? 11 : 7.4;
        height = 2.2;
        target.set(0, 1.1, 0);
      } else if (g.slowmo > 0) {
        orbit += dt * 1.6;
        angle = 0.9 * Math.sin(Math.min(1, orbit));
        dist *= 0.65;
        height = 2.4;
      } else if (g.pin) {
        const pinned = g.pin.by === g.me ? g.foe : g.me;
        target.copy(world(pinned.x, pinned.z, 0.3));
        dist *= 0.6;
        height = 1.6;
        angle = 0.35;
      } else if (g.phase === "won" || g.phase === "champion") {
        target.copy(world(g.me.x, g.me.z, 1.2));
        angle = Math.sin(clock * 0.6) * 0.8;
        dist *= 0.7;
        height = 2.4;
      } else {
        orbit = 0;
      }
      const want = new THREE.Vector3(target.x + Math.sin(angle) * dist, height, target.z + Math.cos(angle) * dist);
      const k = Math.min(1, dt * 3 + (dt === 0 ? 0.05 : 0));
      camPos.lerp(want, k);
      camLook.lerp(target, k);
      camera.position.copy(camPos);
      if (g.shake > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * g.shake * 0.3, (Math.random() - 0.5) * g.shake * 0.2, 0));
      camera.lookAt(camLook);
      key.intensity = select ? 180 : 260;

      renderer.render(scene, camera);
    },

    dispose() {
      disposeTree(scene);
      renderer.dispose();
    },
  };
}
