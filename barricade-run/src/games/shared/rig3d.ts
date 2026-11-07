import * as THREE from "three";

import { FONT } from "./constants";

/** Shared 3D building blocks: cached materials, runtime canvas textures, and a jointed person rig. */

export function canvasTexture(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext("2d");
  if (c) paint(c);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function centreText(c: CanvasRenderingContext2D, str: string, x: number, y: number, size: number, color: string, maxW: number, italic = false) {
  c.font = `${italic ? "italic " : ""}900 ${size}px ${FONT}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillStyle = color;
  c.fillText(str, x, y, maxW);
}

/** Slogan fitted on a board: one line if short, two lines otherwise. */
export function sloganText(c: CanvasRenderingContext2D, str: string, w: number, h: number, color: string) {
  const words = str.split(" ");
  if (str.length <= 12 || words.length < 2) {
    centreText(c, str, w / 2, h / 2 + h * 0.03, Math.min(h * 0.5, (w / Math.max(4, str.length)) * 1.8), color, w * 0.92);
    return;
  }
  const mid = Math.ceil(words.length / 2);
  const lines = [words.slice(0, mid).join(" "), words.slice(mid).join(" ")];
  const size = Math.min(h * 0.36, (w / Math.max(4, ...lines.map((l) => l.length))) * 1.8);
  centreText(c, lines[0], w / 2, h / 2 - size * 0.52, size, color, w * 0.92);
  centreText(c, lines[1], w / 2, h / 2 + size * 0.58, size, color, w * 0.92);
}

const texCache = new Map<string, THREE.Texture>();
/** A canvas texture painted once per key. */
export function cachedTexture(key: string, w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) {
  let t = texCache.get(key);
  if (!t) {
    t = canvasTexture(w, h, paint);
    texCache.set(key, t);
  }
  return t;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** A capsule hanging down from its pivot, `len` metres long. */
export function limbGeo(r: number, len: number) {
  const key = `limb|${r}|${len}`;
  let g = geoCache.get(key);
  if (!g) {
    g = new THREE.CapsuleGeometry(r, Math.max(0.01, len - r * 2), 4, 10);
    g.translate(0, -len / 2, 0);
    geoCache.set(key, g);
  }
  return g;
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
export function mat(color: string | number, rough = 0.65, metal = 0, emissive = 0) {
  const key = `${color}|${rough}|${metal}|${emissive}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    if (emissive) {
      m.emissive = new THREE.Color(color);
      m.emissiveIntensity = emissive;
    }
    matCache.set(key, m);
  }
  return m;
}

export function shade(hex: string, f: number) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `#${c.getHexString()}`;
}

export function mesh(geo: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], parent: THREE.Object3D, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Disposes every geometry, material and texture under a root, then clears the shared caches. */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh || o instanceof THREE.InstancedMesh || o instanceof THREE.Line) {
      o.geometry.dispose();
      const m = o.material as THREE.Material | THREE.Material[];
      for (const mm of Array.isArray(m) ? m : [m]) {
        (mm as THREE.MeshStandardMaterial).map?.dispose();
        mm.dispose();
      }
    }
  });
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
  geoCache.clear();
  matCache.clear();
}

// ---- person rig ---------------------------------------------------------------------

export type Hair = "turban" | "ponytail" | "short" | "bald" | "cap" | "mohawk" | "helmet";
export type Extra = "none" | "headband" | "garland" | "papers" | "evm";

export interface RigLook {
  skin: string;
  /** Top colour, or "tricolour". */
  top: string;
  trunks: string;
  boots: string;
  hair: Hair;
  hairColor: string;
  mustache: boolean;
  belly: boolean;
  glasses: boolean;
  jacket: boolean;
  extra: Extra;
  size: number;
  /** Colour of the lower legs; skin when not set (wrestlers). */
  shins?: string;
  /** Long sleeves in the top colour instead of bare arms. */
  sleeves?: boolean;
  backpack?: string;
}

/** Angles in radians. 0 = limb hanging straight down, positive = swung forward (+x). */
export interface Pose {
  lean: number;
  /** [upper arm angle, elbow bend]. */
  armF: [number, number];
  armB: [number, number];
  /** [thigh angle, knee bend]. */
  legF: [number, number];
  legB: [number, number];
  /** Hip drop in metres (crouch / kneel). */
  drop: number;
}

export interface Rig {
  /** Position; rotates for lying down and being thrown. */
  outer: THREE.Group;
  /** Turns the body; local +x is the way the person faces. */
  inner: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  arms: { shoulder: THREE.Group; elbow: THREE.Group }[];
  legs: { hip: THREE.Group; knee: THREE.Group }[];
  /** End of the front forearm, for holding things. */
  hand: THREE.Group;
}

export function buildRig(look: RigLook, shirtTexture?: THREE.Texture): Rig {
  const outer = new THREE.Group();
  const inner = new THREE.Group();
  outer.add(inner);
  const body = new THREE.Group();
  body.scale.setScalar(look.size);
  inner.add(body);
  const hips = new THREE.Group();
  body.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);

  const skin = mat(look.skin, 0.55);
  const skinBack = mat(shade(look.skin, 0.85), 0.55);
  const trunks = mat(look.trunks, 0.7);
  const boots = mat(look.boots, 0.5);

  let topMat: THREE.Material;
  if (shirtTexture) topMat = new THREE.MeshStandardMaterial({ map: shirtTexture, roughness: 0.7 });
  else if (look.top === "tricolour") {
    topMat = new THREE.MeshStandardMaterial({
      roughness: 0.7,
      map: cachedTexture("tricolour-top", 64, 128, (c) => {
        ["#138808", "#ffffff", "#ff9933"].forEach((col, i) => {
          c.fillStyle = col;
          c.fillRect(0, (i * 128) / 3, 64, 128 / 3 + 1);
        });
        c.strokeStyle = "#000080";
        c.lineWidth = 3;
        c.beginPath();
        c.arc(16, 64, 9, 0, Math.PI * 2);
        c.stroke();
      }),
    });
  } else topMat = mat(look.top, 0.7);
  const chest = mesh(new THREE.CapsuleGeometry(0.2, 0.32, 4, 12), topMat, torso, 0, 0.36, 0);
  chest.scale.set(1, 1, 0.72);
  mesh(new THREE.CylinderGeometry(0.19, 0.17, 0.12, 12), trunks, torso, 0, 0.02, 0);
  if (look.belly) mesh(new THREE.SphereGeometry(0.21, 14, 10), topMat, torso, 0.09, 0.24, 0);
  if (look.jacket) {
    const jacket = mesh(new THREE.CapsuleGeometry(0.215, 0.24, 4, 12), mat("#4b4f57", 0.8), torso, 0, 0.42, 0);
    jacket.scale.set(1, 1, 0.76);
  }
  if (look.backpack) {
    const pack = mesh(new THREE.BoxGeometry(0.18, 0.4, 0.34), mat(look.backpack, 0.7), torso, -0.2, 0.38, 0);
    mesh(new THREE.BoxGeometry(0.06, 0.14, 0.3), mat(shade(look.backpack, 0.75), 0.7), pack, -0.1, -0.06, 0);
  }
  if (look.extra === "garland") {
    const garland = mesh(new THREE.TorusGeometry(0.19, 0.04, 6, 18), mat("#ff9f1c", 0.8), torso, 0.04, 0.56, 0);
    garland.rotation.set(Math.PI / 2, 0.5, 0);
  }
  if (look.extra === "evm") {
    const evm = mesh(new THREE.BoxGeometry(0.06, 0.3, 0.26), mat("#c9ccd1", 0.5), torso, 0.16, 0.36, 0);
    for (let i = 0; i < 4; i++) mesh(new THREE.BoxGeometry(0.02, 0.04, 0.06), mat(i === 1 ? "#d62828" : "#1d3557"), evm, 0.035, 0.1 - i * 0.065, 0.06);
  }
  if (look.extra === "papers") {
    const paper = mat("#fbfbf6", 0.9);
    for (const [y, z, r] of [[0.42, 0.06, 0.3], [0.26, -0.08, -0.4]]) {
      const p = mesh(new THREE.BoxGeometry(0.01, 0.2, 0.15), paper, torso, 0.17, y, z);
      p.rotation.x = r;
    }
  }

  mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.12, 8), skin, torso, 0, 0.66, 0);
  const head = new THREE.Group();
  head.position.set(0.02, 0.83, 0);
  torso.add(head);
  mesh(new THREE.SphereGeometry(0.15, 16, 12), skin, head);
  const black = mat("#111111", 0.4);
  for (const z of [-0.055, 0.055]) mesh(new THREE.SphereGeometry(0.02, 6, 6), black, head, 0.135, 0.02, z);
  mesh(new THREE.SphereGeometry(0.035, 6, 6), skin, head, 0.15, -0.02, 0);
  if (look.glasses) mesh(new THREE.BoxGeometry(0.04, 0.05, 0.2), black, head, 0.13, 0.02, 0);
  if (look.mustache) {
    const hairCol = look.hairColor === "#bbb" ? "#dddddd" : "#16110e";
    mesh(new THREE.BoxGeometry(0.03, 0.025, 0.12), mat(hairCol), head, 0.14, -0.06, 0);
    if (look.hair === "turban") {
      const beard = mesh(new THREE.SphereGeometry(0.12, 10, 8), mat("#16110e", 0.9), head, 0.06, -0.1, 0);
      beard.scale.set(0.8, 0.8, 1);
    }
  }
  const hair = mat(look.hairColor, 0.8);
  switch (look.hair) {
    case "turban": {
      const t = mesh(new THREE.SphereGeometry(0.18, 14, 10), hair, head, -0.02, 0.07, 0);
      t.scale.set(1.05, 0.85, 1.05);
      mesh(new THREE.SphereGeometry(0.09, 10, 8), hair, head, -0.06, 0.2, 0);
      break;
    }
    case "ponytail": {
      const cap = mesh(new THREE.SphereGeometry(0.155, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, head, 0, 0.01, 0);
      cap.rotation.z = 0.25;
      const tail = mesh(limbGeo(0.05, 0.3), hair, head, -0.15, 0.04, 0);
      tail.rotation.z = -0.5;
      break;
    }
    case "short": {
      const cap = mesh(new THREE.SphereGeometry(0.157, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.4), hair, head, -0.01, 0.01, 0);
      cap.rotation.z = 0.35;
      break;
    }
    case "cap":
      mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.09, 14), hair, head, 0, 0.12, 0);
      mesh(new THREE.BoxGeometry(0.14, 0.015, 0.22), black, head, 0.13, 0.08, 0);
      break;
    case "helmet": {
      mesh(new THREE.SphereGeometry(0.19, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hair, head, 0, 0.02, 0);
      const visor = mesh(new THREE.BoxGeometry(0.03, 0.13, 0.3), new THREE.MeshStandardMaterial({ color: 0x9ec5ff, transparent: true, opacity: 0.45, roughness: 0.1 }), head, 0.16, 0.0, 0);
      visor.castShadow = false;
      break;
    }
    case "mohawk":
      mesh(new THREE.BoxGeometry(0.26, 0.12, 0.04), hair, head, -0.02, 0.17, 0);
      break;
    default:
      break;
  }
  if (look.extra === "headband") {
    const tex = cachedTexture("headband", 8, 48, (c) => {
      ["#ff9933", "#ffffff", "#138808"].forEach((col, i) => {
        c.fillStyle = col;
        c.fillRect(0, i * 16, 8, 16);
      });
    });
    mesh(new THREE.CylinderGeometry(0.158, 0.158, 0.06, 18, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }), head, 0, 0.05, 0);
  }

  const sleeve = mat(look.top === "tricolour" ? "#ff9933" : look.top, 0.7);
  const arms = [0.24, -0.24].map((z, i) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(0, 0.57, z);
    torso.add(shoulder);
    const armSkin = look.jacket ? mat("#f7f5ee", 0.8) : look.sleeves ? sleeve : i === 0 ? skin : skinBack;
    mesh(limbGeo(0.075, 0.34), armSkin, shoulder);
    const elbow = new THREE.Group();
    elbow.position.y = -0.33;
    shoulder.add(elbow);
    mesh(limbGeo(0.065, 0.31), look.sleeves ? sleeve : i === 0 ? skin : skinBack, elbow);
    mesh(new THREE.SphereGeometry(0.075, 10, 8), i === 0 ? skin : skinBack, elbow, 0, -0.31, 0);
    return { shoulder, elbow };
  });
  const hand = new THREE.Group();
  hand.position.y = -0.31;
  arms[0].elbow.add(hand);
  const shinMat = look.shins ? mat(look.shins, 0.7) : null;
  const legs = [0.11, -0.11].map((z, i) => {
    const hip = new THREE.Group();
    hip.position.set(0, 0, z);
    hips.add(hip);
    mesh(limbGeo(0.1, 0.47), trunks, hip);
    const knee = new THREE.Group();
    knee.position.y = -0.46;
    hip.add(knee);
    mesh(limbGeo(0.08, 0.46), shinMat ?? (i === 0 ? skin : skinBack), knee);
    mesh(new THREE.BoxGeometry(0.24, 0.12, 0.13), boots, knee, 0.05, -0.46, 0);
    return { hip, knee };
  });

  return { outer, inner, hips, torso, head, arms, legs, hand };
}

/** Sets joint angles from a pose. Standing height comes from the pose's hip drop. */
export function setPose(r: Rig, pose: Pose, standing = true) {
  if (standing) r.hips.position.y = 0.95 - pose.drop;
  r.torso.rotation.z = -pose.lean;
  const armPose = [pose.armF, pose.armB];
  r.arms.forEach((a, i) => {
    a.shoulder.rotation.z = armPose[i][0];
    a.elbow.rotation.z = armPose[i][1];
  });
  const legPose = [pose.legF, pose.legB];
  r.legs.forEach((l, i) => {
    l.hip.rotation.z = legPose[i][0];
    l.knee.rotation.z = -legPose[i][1];
  });
}

/** Running, jumping and sliding poses for the runners. */
export function runPose(phase: number, air: boolean, crouch: boolean): Pose {
  if (crouch) return { lean: -0.55, armF: [1.2, 0.4], armB: [-0.6, 0.3], legF: [1.45, 0.25], legB: [0.9, 1.6], drop: 0.55 };
  if (air) return { lean: 0.15, armF: [2.4, 0.4], armB: [1.9, 0.5], legF: [1.1, 1.6], legB: [0.2, 1.2], drop: 0 };
  const s = Math.sin(phase);
  return {
    lean: 0.22,
    armF: [-s * 0.9, 1.3],
    armB: [s * 0.9, 1.3],
    legF: [s * 0.75, 0.25 + Math.max(0, -s) * 1.2],
    legB: [-s * 0.75, 0.25 + Math.max(0, s) * 1.2],
    drop: Math.abs(Math.cos(phase)) * 0.06,
  };
}

/** Standing still with fists up, bobbing (crowd, police, idle). */
export function standPose(clock: number, armsUp = false): Pose {
  const b = Math.sin(clock * 4) * 0.03;
  if (armsUp) return { lean: -0.05, armF: [2.8, 0.3], armB: [2.7, 0.3], legF: [0.1, 0], legB: [-0.1, 0], drop: b };
  return { lean: 0, armF: [0.3, 0.4], armB: [-0.2, 0.3], legF: [0.1, 0], legB: [-0.1, 0], drop: b };
}
