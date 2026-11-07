import * as THREE from "three";

import { buildRig, disposeTree, mat, runPose, setPose } from "../shared/rig3d";
import type { Scene3D } from "../shared/types";
import {
  barricade3d,
  blink,
  building3d,
  bus3d,
  coin3d,
  createWorld,
  Crowd3D,
  heart3d,
  HERO_LOOK,
  lamp3d,
  officer3d,
  playerRing,
  policeLine3d,
  Pool,
  poseOfficer,
  Repeater,
  ScrollStrip,
  spin,
} from "../shared/world3d";

import { BUILDING_X, CAM_BACK, CAM_H, LANE_W, ROAD_HALF, SIDEWALK_END, VIEW_DIST } from "./constants";
import type { Obstacle, Pickup, RunnerGame } from "./engine";

/** Barricade Run in 3D: a dusk city street full of marchers. Engine z is -z in the scene. */
export async function createRunnerScene(canvas: HTMLCanvasElement): Promise<Scene3D<RunnerGame>> {
  const W = createWorld(canvas, {
    sky: { top: "#1a1033", mid: "#5b2a5e", low: "#f08a4b", far: "#3a2348", near: "#24172f" },
    fog: 0x6a3a5e,
    fogNear: 55,
    fogFar: VIEW_DIST + 10,
    hemiSky: 0xb9a3e8,
    hemiGround: 0x2a1f30,
    hemi: 1.05,
    sun: 0xffb27a,
    sunIntensity: 2.2,
    sunPos: [-14, 16, 14],
    env: 0.4,
  });
  const { scene, camera, renderer } = W;

  // Road, kerbs and sidewalks, all scrolling. Lane dividers sit at x = ±LANE_W / 2.
  const SEG = 8;
  const road = new ScrollStrip(scene, -ROAD_HALF, ROAD_HALF, 0, -8, VIEW_DIST + 10, SEG, "runner-road", (c, w, h) => {
    c.fillStyle = "#302e36";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#35333c";
    c.fillRect(0, 0, w, h / 2);
    c.fillStyle = "rgba(255,255,255,0.8)";
    for (const lx of [-LANE_W / 2, LANE_W / 2]) {
      const u = ((lx + ROAD_HALF) / (ROAD_HALF * 2)) * w;
      c.fillRect(u - 3, 0, 6, h * 0.3);
    }
  });
  const strips = [road];
  for (const side of [-1, 1]) {
    const kerb = new ScrollStrip(scene, side < 0 ? -ROAD_HALF - 0.3 : ROAD_HALF, side < 0 ? -ROAD_HALF : ROAD_HALF + 0.3, 0.15, -8, VIEW_DIST + 10, SEG, "runner-kerb", (c, w, h) => {
      c.fillStyle = "#ffcc00";
      c.fillRect(0, 0, w, h / 2);
      c.fillStyle = "#222";
      c.fillRect(0, h / 2, w, h / 2);
    }, 16, 64);
    const walk = new ScrollStrip(scene, side < 0 ? -SIDEWALK_END : ROAD_HALF + 0.3, side < 0 ? -ROAD_HALF - 0.3 : SIDEWALK_END, 0.15, -8, VIEW_DIST + 10, SEG, "runner-walk", (c, w, h) => {
      c.fillStyle = "#443c4a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#4a4250";
      c.fillRect(0, 0, w, h / 2);
      c.strokeStyle = "rgba(0,0,0,0.18)";
      c.lineWidth = 2;
      for (let x = 0; x < w; x += w / 6) {
        c.beginPath();
        c.moveTo(x, 0);
        c.lineTo(x, h);
        c.stroke();
      }
    });
    strips.push(kerb, walk);
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.15, VIEW_DIST + 18), mat("#1d1b20", 0.8));
    curb.position.set(side * (ROAD_HALF + 0.15), 0.07, -(VIEW_DIST - 8) / 2);
    scene.add(curb);
  }
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 400), mat("#1c1820", 1));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.02, -150);
  ground.receiveShadow = true;
  scene.add(ground);

  // Buildings and lamps repeat along the street.
  const blocks = ([-1, 1] as const).map((side) => new Repeater(scene, 14, 0, (k) => building3d(k, side)));
  const lamps = ([-1, 1] as const).map((side) => new Repeater(scene, 30, 0, () => lamp3d(-side * 1.4)));
  const crowd = new Crowd3D(scene);

  // Obstacles and pickups, one 3D object per engine object.
  const obstacles = new Pool<Obstacle>(scene, (kind) => {
    if (kind === "barricade") return barricade3d();
    if (kind === "banner") return policeLine3d();
    if (kind === "bus") return bus3d();
    return officer3d(true);
  });
  const pickups = new Pool<Pickup>(scene, (kind) => (kind === "coin" ? coin3d() : heart3d()));

  // The player and the two officers who chase after a stumble.
  const hero = buildRig(HERO_LOOK);
  hero.inner.rotation.y = Math.PI / 2;
  scene.add(hero.outer);
  const ring = playerRing();
  scene.add(ring);
  const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(1.1, 20, 14), new THREE.MeshBasicMaterial({ color: 0x78dcff, transparent: true, opacity: 0.18, depthWrite: false }));
  scene.add(shieldBubble);
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
      for (const s of strips) s.scroll(d);
      blocks.forEach((rep, i) => {
        const side = i === 0 ? -1 : 1;
        rep.update(d, -10, VIEW_DIST, () => "b", (o, z) => o.position.set(side * BUILDING_X, 0, -z));
      });
      lamps.forEach((rep, i) => {
        const side = i === 0 ? -1 : 1;
        rep.update(d, 2, VIEW_DIST, () => "l", (o, z) => o.position.set(side * (ROAD_HALF + 0.7), 0.15, -z));
      });
      crowd.update(g.crowd, clock, -6, VIEW_DIST * 0.8);

      for (const o of g.obstacles) {
        if (o.z > VIEW_DIST || o.z + o.len < -8) continue;
        const obj = obstacles.get(o, o.kind);
        const x = o.lane * LANE_W;
        if (o.kind === "police") {
          obj.position.set(x, 0, -(o.z + o.len / 2));
          (obj.userData.rig.inner as THREE.Group).rotation.y = -Math.PI / 2;
          poseOfficer(obj, clock, false, o.z);
        } else {
          obj.position.set(x, 0, -o.z);
          blink(obj, clock, o.z);
          const beam = obj.getObjectByName("beam");
          if (beam) beam.visible = o.vz > 0;
        }
      }
      obstacles.sweep();
      for (const p of g.pickups) {
        if (p.taken || p.z > VIEW_DIST || p.z < -6) continue;
        const obj = pickups.get(p, p.kind);
        obj.position.set(p.lane * LANE_W, p.y + Math.sin(clock * 4 + p.z) * 0.08, -p.z);
        spin(obj, clock, p.z);
      }
      pickups.sweep();

      const pl = g.player;
      hero.outer.position.set(pl.x, pl.y, 0);
      setPose(hero, runPose(pl.runPhase, pl.y > 0.05, g.crouching));
      hero.outer.visible = !(pl.invulnT > 0 && Math.sin(clock * 30) > 0.3);
      ring.position.set(pl.x, 0.02, 0);
      shieldBubble.visible = pl.invulnT > 0;
      shieldBubble.position.set(pl.x, pl.y + 0.9, 0);
      chasers.forEach((c, i) => {
        c.visible = g.chaserZ > -5.5;
        c.position.set(pl.x + (i ? 1.3 : -1.3), 0, -g.chaserZ);
        poseOfficer(c, clock, g.status === "running", i * 1.3);
      });

      // Camera behind and above the runner; higher in portrait so more road fits.
      const portrait = W.view.w < W.view.h;
      camX += (pl.x * 0.55 - camX) * 0.15;
      camera.position.set(camX, portrait ? 6.4 : CAM_H, portrait ? CAM_BACK + 2.5 : CAM_BACK);
      camera.lookAt(camX * 0.7, portrait ? 0.4 : 1.1, -16);
      renderer.render(scene, camera);
    },
    dispose() {
      disposeTree(scene);
      renderer.dispose();
    },
  };
}
