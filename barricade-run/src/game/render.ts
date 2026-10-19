import {
  BILLBOARDS,
  BUILDING_X,
  CAM_BACK,
  CAM_H,
  FONT,
  LANE_W,
  NEAR_Z,
  OBSTACLE,
  PLAYER_HALF_W,
  ROAD_HALF,
  SIDEWALK_END,
  VIEW_DIST,
} from "./constants";
import type { Game, Obstacle, Paper, Pickup, Protester, StreetBanner } from "./engine";

type Ctx = CanvasRenderingContext2D;
type Vec3 = readonly [number, number, number];

export interface View {
  w: number;
  h: number;
  cx: number;
  focal: number;
  horizon: number;
  /** Camera height. Higher in portrait so more road fits on a narrow screen. */
  camH: number;
  camX: number;
  backdrop: HTMLCanvasElement | null;
}

interface Projected {
  x: number;
  y: number;
  s: number;
}

export function makeView(w: number, h: number): View {
  const portrait = w < h;
  const focal = Math.min(h * 0.95, w * 0.85);
  const camH = portrait ? CAM_H * 1.9 : CAM_H;
  const groundY = h * (portrait ? 0.66 : 0.82);
  const horizon = groundY - (camH * focal) / CAM_BACK;
  return { w, h, cx: w / 2, focal, horizon, camH, camX: 0, backdrop: buildBackdrop(w, h, horizon) };
}

function project(v: View, x: number, y: number, z: number): Projected {
  const s = v.focal / (z + CAM_BACK);
  return { x: v.cx + (x - v.camX) * s, y: v.horizon + (v.camH - y) * s, s };
}

function poly(ctx: Ctx, v: View, color: string, pts: Vec3[]) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = project(v, pts[i][0], pts[i][1], pts[i][2]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
}

/** Ground strip between two x values, from z0 (near) to z1 (far). */
function strip(ctx: Ctx, v: View, color: string, xa: number, xb: number, z0: number, z1: number, y = 0) {
  poly(ctx, v, color, [
    [xa, y, z0],
    [xb, y, z0],
    [xb, y, z1],
    [xa, y, z1],
  ]);
}

interface Rect {
  l: number;
  r: number;
  t: number;
  b: number;
  s: number;
}

/**
 * Draws a box with its visible side and top faces. Returns the screen rect of the
 * front (camera-facing) face for decorating, or null when the front is behind the camera.
 */
function box(
  ctx: Ctx,
  v: View,
  cx: number,
  w: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  colors: { front: string; side: string; top: string },
): Rect | null {
  if (z1 < NEAR_Z) return null;
  const zn = Math.max(z0, NEAR_Z);
  const xl = cx - w / 2;
  const xr = cx + w / 2;
  if (v.camX < xl) poly(ctx, v, colors.side, [[xl, y0, zn], [xl, y1, zn], [xl, y1, z1], [xl, y0, z1]]);
  if (v.camX > xr) poly(ctx, v, colors.side, [[xr, y0, zn], [xr, y1, zn], [xr, y1, z1], [xr, y0, z1]]);
  if (y1 < v.camH) poly(ctx, v, colors.top, [[xl, y1, zn], [xr, y1, zn], [xr, y1, z1], [xl, y1, z1]]);
  if (zn !== z0) return null;
  const a = project(v, xl, y1, z0);
  const b = project(v, xr, y0, z0);
  ctx.fillStyle = colors.front;
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  return { l: a.x, r: b.x, t: a.y, b: b.y, s: a.s };
}

function text(ctx: Ctx, str: string, x: number, y: number, size: number, color: string, maxW?: number) {
  if (size < 5) return;
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y, maxW);
}

/** Slogan fitted into a box: one line if short, otherwise split into two at the middle space. */
function slogan(ctx: Ctx, str: string, cx: number, cy: number, w: number, h: number, color: string) {
  const words = str.split(" ");
  if (str.length <= 12 || words.length < 2) {
    text(ctx, str, cx, cy, Math.min(h * 0.5, (w / Math.max(4, str.length)) * 1.9), color, w * 0.92);
    return;
  }
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length;
    const b = words.slice(i).join(" ").length;
    const cur = Math.abs(words.slice(0, best).join(" ").length - words.slice(best).join(" ").length);
    if (Math.abs(a - b) < cur) best = i;
  }
  const lines = [words.slice(0, best).join(" "), words.slice(best).join(" ")];
  const longest = Math.max(...lines.map((l) => l.length));
  const size = Math.min(h * 0.36, (w / Math.max(4, longest)) * 1.9);
  text(ctx, lines[0], cx, cy - size * 0.55, size, color, w * 0.92);
  text(ctx, lines[1], cx, cy + size * 0.55, size, color, w * 0.92);
}

/**
 * Text is the most expensive thing to draw on a canvas, so every placard, banner and billboard is
 * painted once into a small offscreen canvas and then stamped with drawImage each frame.
 */
const labels = new Map<string, HTMLCanvasElement>();

function label(key: string, w: number, h: number, paint: (c: Ctx, w: number, h: number) => void) {
  let img = labels.get(key);
  if (!img) {
    img = document.createElement("canvas");
    img.width = w;
    img.height = h;
    const c = img.getContext("2d");
    if (c) paint(c, w, h);
    labels.set(key, img);
  }
  return img;
}

/** Board with a border and a fitted slogan. */
function boardLabel(textStr: string, bg: string, ink: string, w: number, h: number, border = "rgba(0,0,0,0.6)") {
  return label(`board|${textStr}|${bg}|${ink}|${w}x${h}`, w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = border;
    c.lineWidth = Math.max(2, h * 0.04);
    c.strokeRect(0, 0, w, h);
    slogan(c, textStr, w / 2, h / 2, w, h, ink);
  });
}

function hash(a: number, b: number) {
  const n = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

// ---- backdrop -------------------------------------------------------------

function buildBackdrop(w: number, h: number, horizon: number) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const bw = Math.ceil(w * 1.3);
  canvas.width = bw;
  canvas.height = Math.max(1, Math.ceil(horizon + 2));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, "#1a1033");
  sky.addColorStop(0.55, "#5b2a5e");
  sky.addColorStop(1, "#f08a4b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, bw, horizon + 2);

  // Distant skyline silhouettes with a few lit windows.
  const unit = Math.max(6, Math.min(w, h) / 60);
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer === 0 ? "#3a2348" : "#24172f";
    let x = -unit * 2;
    let i = 0;
    while (x < bw) {
      const bwid = unit * (3 + hash(i, layer) * 5);
      const bh = unit * (layer === 0 ? 6 + hash(layer, i) * 14 : 3 + hash(i + 7, layer) * 9);
      ctx.fillRect(x, horizon - bh, bwid - unit * 0.4, bh + 2);
      if (layer === 1) {
        ctx.fillStyle = "rgba(255, 210, 120, 0.55)";
        for (let wy = horizon - bh + unit; wy < horizon - unit; wy += unit * 1.4) {
          for (let wx = x + unit * 0.6; wx < x + bwid - unit; wx += unit * 1.2) {
            if (hash(wx, wy) > 0.65) ctx.fillRect(wx, wy, unit * 0.45, unit * 0.6);
          }
        }
        ctx.fillStyle = "#24172f";
      }
      x += bwid;
      i++;
    }
  }

  const haze = ctx.createLinearGradient(0, horizon - unit * 10, 0, horizon);
  haze.addColorStop(0, "rgba(240, 138, 75, 0)");
  haze.addColorStop(1, "rgba(240, 138, 75, 0.45)");
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - unit * 10, bw, unit * 10 + 2);
  return canvas;
}

// ---- ground and buildings -------------------------------------------------

const SEG = 4;

function drawGround(ctx: Ctx, v: View, distance: number) {
  ctx.fillStyle = "#1c1820";
  ctx.fillRect(0, v.horizon, v.w, v.h - v.horizon);

  const far = VIEW_DIST + SEG;
  for (const side of [-1, 1]) {
    strip(ctx, v, "#443c4a", side * (ROAD_HALF + 0.3), side * SIDEWALK_END, NEAR_Z, far, 0.15);
    strip(ctx, v, "#222", side * ROAD_HALF, side * (ROAD_HALF + 0.3), NEAR_Z, far, 0.15);
  }
  strip(ctx, v, "#302e36", -ROAD_HALF, ROAD_HALF, NEAR_Z, far);

  const first = Math.floor((distance + NEAR_Z) / SEG);
  const last = Math.ceil((distance + VIEW_DIST) / SEG);
  for (let i = last; i >= first; i--) {
    if (i % 2 !== 0) continue;
    const z1 = i * SEG + SEG - distance;
    const z0 = Math.max(NEAR_Z, i * SEG - distance);
    if (z1 <= z0) continue;
    for (const side of [-1, 1]) {
      strip(ctx, v, "#4a4250", side * (ROAD_HALF + 0.3), side * SIDEWALK_END, z0, z1, 0.15);
      strip(ctx, v, "#ffcc00", side * ROAD_HALF, side * (ROAD_HALF + 0.3), z0, z1, 0.15);
    }
    strip(ctx, v, "#34323a", -ROAD_HALF, ROAD_HALF, z0, z1);
    for (const lx of [-LANE_W / 2, LANE_W / 2]) {
      strip(ctx, v, "rgba(255,255,255,0.7)", lx - 0.08, lx + 0.08, z0, Math.min(z1, z0 + SEG * 0.6));
    }
  }
}

/** News-style hoarding on the camera-facing end of a building. */
function billboard(ctx: Ctx, v: View, side: -1 | 1, h: number, z: number, k: number) {
  const a = project(v, side * (BUILDING_X + 1.2), h - 0.6, z);
  const b = project(v, side * (BUILDING_X + 9), h - 4.6, z);
  const l = Math.min(a.x, b.x);
  const r = Math.max(a.x, b.x);
  const t = a.y;
  const bh = b.y - a.y;
  if (r - l < 12) return;
  const index = Math.floor(hash(k, side + 9) * BILLBOARDS.length);
  const [header, headline] = BILLBOARDS[index];
  const img = label(`billboard|${index}`, 400, 200, (c, w, h) => {
    c.fillStyle = "#1b1b1b";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#f8f4ec";
    c.fillRect(4, 4, w - 8, h - 8);
    c.fillStyle = "#c1121f";
    c.fillRect(4, 4, w - 8, h * 0.3);
    text(c, header, w / 2, h * 0.17, h * 0.18, "#fff", w * 0.9);
    slogan(c, headline, w / 2, h * 0.65, w - 8, h * 0.62, "#111");
  });
  ctx.drawImage(img, l, t, r - l, bh);
  // Legs holding the hoarding.
  ctx.fillStyle = "#1b1b1b";
  const leg = project(v, side * (BUILDING_X + 3), h - 5.2, z);
  ctx.fillRect(l + (r - l) * 0.2, t + bh, Math.max(1, (r - l) * 0.02), leg.y - t - bh);
  ctx.fillRect(l + (r - l) * 0.78, t + bh, Math.max(1, (r - l) * 0.02), leg.y - t - bh);
}

const BLOCK = 14;
const WALLS = ["#5a4566", "#6a4a4a", "#45506a", "#5f5648", "#4a6458"];

function drawBuildings(ctx: Ctx, v: View, distance: number) {
  const first = Math.floor((distance + NEAR_Z) / BLOCK);
  const last = Math.ceil((distance + VIEW_DIST) / BLOCK);
  for (let k = last; k >= first; k--) {
    const z0 = k * BLOCK - distance;
    const z1 = z0 + BLOCK - 2;
    if (z1 < NEAR_Z) continue;
    const zn = Math.max(NEAR_Z, z0);
    for (const side of [-1, 1] as const) {
      const r = hash(k, side);
      const h = 7 + r * 16;
      const x = side * BUILDING_X;
      const wall = WALLS[Math.floor(r * WALLS.length)];
      poly(ctx, v, wall, [[x, 0, zn], [x, h, zn], [x, h, z1], [x, 0, z1]]);
      if (z0 >= NEAR_Z) {
        poly(ctx, v, "#2a2030", [[x, 0, z0], [side * 40, 0, z0], [side * 40, h, z0], [x, h, z0]]);
        if (hash(k, side + 3) > 0.4 && z0 > 1 && z0 < 100) billboard(ctx, v, side, h, z0, k);
      }
      // Shop shutter at street level, windows above.
      poly(ctx, v, "#2a2a2e", [[x, 0, zn], [x, 2.6, zn], [x, 2.6, z1], [x, 0, z1]]);
      if (z0 > 70) continue;
      for (let wy = 3.5; wy < h - 1.5; wy += 3) {
        for (let wz = 1; wz < BLOCK - 3; wz += 3.4) {
          const za = z0 + wz;
          if (za < NEAR_Z) continue;
          if ((1.5 * v.focal) / (za + CAM_BACK) < 2.5) break;
          const lit = hash(k * 7 + wy, wz + side) > 0.45;
          poly(ctx, v, lit ? "#ffd27a" : "#1e1a24", [[x, wy, za], [x, wy + 1.5, za], [x, wy + 1.5, za + 1.8], [x, wy, za + 1.8]]);
        }
      }
    }
  }
}

// ---- figures --------------------------------------------------------------

interface FigureStyle {
  shirt: string;
  pants: string;
  skin: string;
  hair?: string;
  shoes?: string;
  /** Seen from behind (player, chasing police). */
  back?: boolean;
  backpack?: string;
  /** Long top: kurta / kameez. */
  kurta?: boolean;
  dupatta?: string | null;
  longHair?: boolean;
  /** White Gandhi topi. */
  topi?: boolean;
  /** Police peaked cap colour. */
  cap?: string;
  /** Riot helmet colour. */
  helmet?: string;
  belt?: string;
}

interface Pose {
  phase: number;
  height?: number;
  /** Both hands up holding a placard stick. */
  armsUp?: boolean;
  /** Right fist pumping. */
  fist?: boolean;
  /** Right hand up holding a flag pole. */
  flag?: boolean;
  /** Both hands forward at chest height holding a banner. */
  carry?: boolean;
  air?: boolean;
}

/** A person. (x, gy) is the ground point under the feet, s is pixels per metre. */
function figure(ctx: Ctx, x: number, gy: number, s: number, st: FigureStyle, pose: Pose) {
  const k = s * ((pose.height ?? 1.75) / 1.75);
  const X = (m: number) => x + m * k;
  const Y = (m: number) => gy - m * k;
  const swing = Math.sin(pose.phase);
  const detailed = k > 14;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Legs and shoes. In front/back view a running leg shows up as the foot lifting.
  ctx.strokeStyle = st.pants;
  ctx.lineWidth = 0.15 * k;
  const lifts = pose.air ? [0.35, 0.25] : [Math.max(0, swing) * 0.32, Math.max(0, -swing) * 0.32];
  [-0.1, 0.1].forEach((lx, i) => {
    ctx.beginPath();
    ctx.moveTo(X(lx), Y(0.92));
    ctx.lineTo(X(lx * 1.15), Y(lifts[i] + 0.08));
    ctx.stroke();
    ctx.fillStyle = st.shoes ?? "#2b2b2b";
    ctx.fillRect(X(lx * 1.15 - 0.09), Y(lifts[i] + 0.09), 0.18 * k, 0.09 * k);
  });

  // Long hair falls behind the shoulders (front view).
  if (st.longHair && !st.back) {
    ctx.fillStyle = st.hair ?? "#111";
    ctx.beginPath();
    ctx.roundRect(X(-0.17), Y(1.74), 0.34 * k, 0.52 * k, 0.1 * k);
    ctx.fill();
  }

  // Torso: shoulders wider than the waist; a kurta reaches the knees.
  const hem = st.kurta ? 0.55 : 0.88;
  ctx.fillStyle = st.shirt;
  ctx.beginPath();
  ctx.moveTo(X(-0.25), Y(1.46));
  ctx.lineTo(X(0.25), Y(1.46));
  ctx.lineTo(X(st.kurta ? 0.25 : 0.2), Y(hem));
  ctx.lineTo(X(st.kurta ? -0.25 : -0.2), Y(hem));
  ctx.closePath();
  ctx.fill();
  // Simple shading for volume.
  ctx.fillStyle = "rgba(0,0,0,0.13)";
  ctx.fillRect(X(0.05), Y(1.46), 0.2 * k, (1.46 - hem) * k);
  if (st.belt) {
    ctx.fillStyle = st.belt;
    ctx.fillRect(X(-0.2), Y(0.98), 0.4 * k, 0.06 * k);
  }
  if (st.backpack) {
    ctx.fillStyle = st.backpack;
    if (st.back) {
      ctx.beginPath();
      ctx.roundRect(X(-0.17), Y(1.42), 0.34 * k, 0.42 * k, 0.07 * k);
      ctx.fill();
    } else if (detailed) {
      ctx.fillRect(X(-0.17), Y(1.45), 0.05 * k, 0.4 * k);
      ctx.fillRect(X(0.12), Y(1.45), 0.05 * k, 0.4 * k);
    }
  }
  if (st.dupatta) {
    ctx.strokeStyle = st.dupatta;
    ctx.lineWidth = 0.09 * k;
    ctx.beginPath();
    ctx.moveTo(X(-0.22), Y(1.45));
    ctx.lineTo(X(0.2), Y(0.95));
    ctx.stroke();
  }

  // Arms: upper arm and forearm with an elbow bend, skin-coloured hands.
  const hands: Record<number, [number, number]> = {};
  for (const side of [-1, 1]) {
    let hand: [number, number] = [side * 0.32, 0.98 + side * swing * 0.18];
    if (pose.armsUp) hand = [side * 0.14, 2.02];
    else if (pose.carry) hand = [side * 0.3, 1.28];
    else if (pose.flag && side === 1) hand = [0.32, 1.9];
    else if (pose.fist && side === 1) hand = [0.3, 1.72 + Math.max(0, swing) * 0.3];
    hands[side] = hand;
    const sx = side * 0.24;
    const sy = 1.42;
    const ex = (sx + hand[0]) / 2 + side * 0.09;
    const ey = (sy + hand[1]) / 2;
    ctx.strokeStyle = st.shirt;
    ctx.lineWidth = 0.11 * k;
    ctx.beginPath();
    ctx.moveTo(X(sx), Y(sy));
    ctx.lineTo(X(ex), Y(ey));
    ctx.lineTo(X(hand[0]), Y(hand[1]));
    ctx.stroke();
    ctx.fillStyle = st.skin;
    ctx.beginPath();
    ctx.arc(X(hand[0]), Y(hand[1]), 0.055 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // Neck and head.
  ctx.fillStyle = st.skin;
  ctx.fillRect(X(-0.05), Y(1.52), 0.1 * k, 0.08 * k);
  ctx.fillStyle = st.back ? (st.hair ?? "#111") : st.skin;
  ctx.beginPath();
  ctx.ellipse(X(0), Y(1.62), 0.12 * k, 0.14 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  if (!st.back) {
    ctx.fillStyle = st.hair ?? "#111";
    ctx.beginPath();
    ctx.ellipse(X(0), Y(1.68), 0.125 * k, 0.09 * k, 0, Math.PI, 0);
    ctx.fill();
    if (detailed && !st.helmet) {
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(X(-0.06), Y(1.64), 0.025 * k, 0.025 * k);
      ctx.fillRect(X(0.035), Y(1.64), 0.025 * k, 0.025 * k);
    }
  }
  if (st.longHair && st.back) {
    ctx.fillStyle = st.hair ?? "#111";
    ctx.fillRect(X(-0.12), Y(1.62), 0.24 * k, 0.32 * k);
  }
  if (st.topi) {
    ctx.fillStyle = "#fafafa";
    ctx.beginPath();
    ctx.moveTo(X(-0.13), Y(1.72));
    ctx.lineTo(X(0.13), Y(1.72));
    ctx.lineTo(X(0.1), Y(1.82));
    ctx.lineTo(X(-0.1), Y(1.82));
    ctx.closePath();
    ctx.fill();
  }
  if (st.cap) {
    ctx.fillStyle = st.cap;
    ctx.beginPath();
    ctx.roundRect(X(-0.14), Y(1.85), 0.28 * k, 0.12 * k, 0.04 * k);
    ctx.fill();
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(X(-0.15), Y(1.74), 0.3 * k, 0.035 * k);
  }
  if (st.helmet) {
    ctx.fillStyle = st.helmet;
    ctx.beginPath();
    ctx.ellipse(X(0), Y(1.66), 0.16 * k, 0.17 * k, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(X(-0.16), Y(1.67), 0.32 * k, 0.05 * k);
    if (!st.back) {
      ctx.fillStyle = "rgba(20, 30, 50, 0.55)";
      ctx.fillRect(X(-0.13), Y(1.63), 0.26 * k, 0.12 * k);
    }
  }
  return { hands, k, X, Y };
}

function shadow(ctx: Ctx, v: View, x: number, z: number, w: number) {
  if (z < NEAR_Z || w <= 0) return;
  const p = project(v, x, 0, z);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w * p.s, w * 0.3 * p.s, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Indian tricolour on a pole, waving. (px, py) is the top of the pole. */
function tricolour(ctx: Ctx, px: number, py: number, k: number, phase: number, dir: number) {
  const w = 0.75 * k * dir;
  const h = 0.5 * k;
  const wave = (t: number) => Math.sin(phase + t * 3) * 0.06 * k * t;
  const band = (top: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(px, py + top);
    for (let t = 0; t <= 1.001; t += 0.25) ctx.lineTo(px + w * t, py + top + wave(t));
    for (let t = 1; t >= -0.001; t -= 0.25) ctx.lineTo(px + w * t, py + top + h / 3 + wave(t));
    ctx.closePath();
    ctx.fill();
  };
  band(0, "#ff9933");
  band(h / 3, "#ffffff");
  band((2 * h) / 3, "#138808");
  if (k > 18) {
    ctx.strokeStyle = "#000080";
    ctx.lineWidth = Math.max(1, 0.02 * k);
    ctx.beginPath();
    ctx.arc(px + w / 2, py + h / 2 + wave(0.5), h * 0.13, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawProtester(ctx: Ctx, v: View, pr: Protester, clock: number) {
  const p = project(v, pr.x, 0, pr.z);
  if (p.s * pr.height < 3) return;
  const bob = Math.abs(Math.sin(clock * 4 + pr.phase)) * 0.1;
  const gy = p.y - bob * p.s;
  const hasSign = pr.sign !== null;
  const lod = p.s * (pr.height / 1.75);
  if (lod < 8) {
    // Far away the person is only a few pixels tall: a silhouette is enough.
    ctx.fillStyle = pr.pants;
    ctx.fillRect(p.x - 0.15 * lod, gy - 0.9 * lod, 0.3 * lod, 0.9 * lod);
    ctx.fillStyle = pr.shirt;
    ctx.fillRect(p.x - 0.23 * lod, gy - 1.48 * lod, 0.46 * lod, 0.62 * lod);
    ctx.fillStyle = pr.skin;
    ctx.fillRect(p.x - 0.1 * lod, gy - 1.75 * lod, 0.2 * lod, 0.24 * lod);
    if (pr.sign) {
      ctx.fillStyle = pr.signColors[0];
      ctx.fillRect(p.x - 0.52 * lod, gy - 2.62 * lod, 1.05 * lod, 0.58 * lod);
    } else if (pr.kind === "flag") {
      const fx = p.x + 0.32 * lod;
      const band = 0.17 * lod;
      ctx.fillStyle = "#ff9933";
      ctx.fillRect(fx, gy - 3.1 * lod, 0.75 * lod * -pr.side, band);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(fx, gy - 3.1 * lod + band, 0.75 * lod * -pr.side, band);
      ctx.fillStyle = "#138808";
      ctx.fillRect(fx, gy - 3.1 * lod + band * 2, 0.75 * lod * -pr.side, band);
    }
    return;
  }
  const style: FigureStyle = {
    shirt: pr.shirt,
    pants: pr.pants,
    skin: pr.skin,
    hair: pr.hair,
    kurta: pr.kind === "woman" || pr.kind === "elder",
    dupatta: pr.dupatta,
    longHair: pr.kind === "woman",
    topi: pr.kind === "elder",
    backpack: pr.backpack ? "#3a3a3a" : undefined,
    shoes: pr.kind === "student" ? "#e9e9e9" : "#3b2a20",
  };
  const fig = figure(ctx, p.x, gy, p.s, style, {
    phase: clock * 4 + pr.phase,
    height: pr.height,
    armsUp: hasSign,
    flag: pr.kind === "flag",
    fist: !hasSign && pr.kind !== "flag",
  });
  const { k, X, Y } = fig;

  if (pr.kind === "flag") {
    const [hx, hy] = fig.hands[1];
    ctx.strokeStyle = "#8b5a2b";
    ctx.lineWidth = Math.max(1, 0.04 * k);
    ctx.beginPath();
    ctx.moveTo(X(hx), Y(hy - 0.3));
    ctx.lineTo(X(hx), Y(hy + 1.2));
    ctx.stroke();
    tricolour(ctx, X(hx), Y(hy + 1.2), k, clock * 5 + pr.phase, -pr.side);
    return;
  }
  if (!pr.sign) return;
  const sway = Math.sin(clock * 2 + pr.phase) * 0.06 * k;
  const w = 1.05 * k;
  const h = 0.58 * k;
  const top = gy - 2.62 * k;
  const [board, ink] = pr.signColors;
  ctx.fillStyle = "#6b4f2a";
  ctx.fillRect(p.x - 0.03 * k + sway, top + h, 0.06 * k, 0.12 * k);
  ctx.drawImage(boardLabel(pr.sign, board, ink, 168, 92), p.x - w / 2 + sway, top, w, h);
}

/** A cloth banner across the sidewalk, carried by two marchers. */
function drawStreetBanner(ctx: Ctx, v: View, b: StreetBanner, clock: number) {
  const xa = b.side * (ROAD_HALF + 1.0);
  const xb = b.side * (ROAD_HALF + 5.2);
  const pa = project(v, xa, 0, b.z);
  const pb = project(v, xb, 0, b.z);
  if (pa.s < 2) return;
  const bob = Math.abs(Math.sin(clock * 3 + b.z)) * 0.06 * pa.s;
  const holder: FigureStyle = { shirt: "#f1f1f1", pants: "#2b4c7e", skin: "#c68642", hair: "#111" };
  figure(ctx, pa.x, pa.y - bob, pa.s, { ...holder, shirt: "#e9c46a" }, { phase: clock * 4 + b.z, carry: true });
  figure(ctx, pb.x, pb.y - bob, pb.s, { ...holder, shirt: "#2a9d8f" }, { phase: clock * 4 + b.z + 1, carry: true });
  const top = project(v, xa, 1.95, b.z).y - bob;
  const bottom = project(v, xa, 1.05, b.z).y - bob;
  const l = Math.min(pa.x, pb.x);
  const r = Math.max(pa.x, pb.x);
  // Poles.
  ctx.fillStyle = "#6b4f2a";
  ctx.fillRect(l - 0.03 * pa.s, top - 0.1 * pa.s, 0.06 * pa.s, bottom - top + 0.4 * pa.s);
  ctx.fillRect(r - 0.03 * pa.s, top - 0.1 * pa.s, 0.06 * pa.s, bottom - top + 0.4 * pa.s);
  // Cloth swaying slightly between the poles.
  const sag = 0.05 * pa.s * (1 + Math.sin(clock * 2 + b.z));
  ctx.drawImage(boardLabel(b.text, b.cloth, b.ink, 512, 110, b.ink), l, top + sag, r - l, bottom - top);
}

/** A leaked exam sheet tumbling through the air. */
function drawPaper(ctx: Ctx, v: View, p: Paper, clock: number) {
  const y = p.y + Math.sin(clock * 2 + p.z) * 0.3;
  const pr = project(v, p.x, y, p.z);
  const size = 0.32 * pr.s;
  if (size < 2) return;
  ctx.save();
  ctx.translate(pr.x, pr.y);
  ctx.rotate(clock * p.spin);
  ctx.scale(1, 0.4 + Math.abs(Math.cos(clock * p.spin * 0.7)) * 0.6);
  ctx.fillStyle = "#fbfbf6";
  ctx.fillRect(-size / 2, -size * 0.65, size, size * 1.3);
  if (size > 10) {
    ctx.fillStyle = "#c1121f";
    ctx.fillRect(-size * 0.4, -size * 0.55, size * 0.5, size * 0.1);
    ctx.fillStyle = "#9a9a9a";
    for (let i = 0; i < 4; i++) ctx.fillRect(-size * 0.4, -size * 0.3 + i * size * 0.2, size * 0.8, size * 0.05);
  }
  ctx.restore();
}

function drawLamp(ctx: Ctx, v: View, side: -1 | 1, z: number) {
  const x = side * (ROAD_HALF + 0.7);
  const base = project(v, x, 0, z);
  const top = project(v, x, 6.5, z);
  const arm = project(v, x - side * 1.4, 6.5, z);
  if (base.s < 1) return;
  ctx.strokeStyle = "#1b1b22";
  ctx.lineWidth = Math.max(1, 0.15 * base.s);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.lineTo(arm.x, arm.y);
  ctx.stroke();
  ctx.fillStyle = "rgba(255, 220, 140, 0.25)";
  ctx.beginPath();
  ctx.arc(arm.x, arm.y + 0.2 * base.s, 0.9 * base.s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff3c4";
  ctx.beginPath();
  ctx.arc(arm.x, arm.y + 0.15 * base.s, 0.22 * base.s, 0, Math.PI * 2);
  ctx.fill();
}

// ---- obstacles ------------------------------------------------------------

function drawBarricade(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = o.lane * LANE_W;
  const { w, h } = OBSTACLE.barricade;
  shadow(ctx, v, x, o.z + 0.2, w * 0.55);
  for (const lx of [-0.85, 0.85]) {
    box(ctx, v, x + lx, 0.1, 0, h - 0.1, o.z + 0.1, o.z + 0.2, { front: "#3a3a3a", side: "#2a2a2a", top: "#444" });
  }
  const lower = box(ctx, v, x, w - 0.3, 0.25, 0.4, o.z, o.z + 0.1, { front: "#f1f1f1", side: "#bbb", top: "#ddd" });
  const board = box(ctx, v, x, w, 0.6, h, o.z, o.z + 0.12, { front: "#f1f1f1", side: "#bbb", top: "#ddd" });
  for (const r of [board, lower]) {
    if (!r) continue;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.l, r.t, r.r - r.l, r.b - r.t);
    ctx.clip();
    ctx.fillStyle = "#d62828";
    const step = 0.35 * r.s;
    for (let sx = r.l - (r.b - r.t); sx < r.r; sx += step * 2) {
      ctx.beginPath();
      ctx.moveTo(sx, r.b);
      ctx.lineTo(sx + step, r.b);
      ctx.lineTo(sx + step + (r.b - r.t), r.t);
      ctx.lineTo(sx + (r.b - r.t), r.t);
      ctx.fill();
    }
    ctx.restore();
  }
  if (board) {
    // Police plate bolted to the middle of the barricade.
    const mid = (board.l + board.r) / 2;
    const pw = 0.62 * board.s;
    const ph = (board.b - board.t) * 0.8;
    const plate = label("barricade-plate", 124, 80, (c, w, h) => {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#1d3557";
      c.lineWidth = 4;
      c.strokeRect(0, 0, w, h);
      text(c, "पुलिस", w / 2, h * 0.3, h * 0.36, "#1d3557", w * 0.9);
      text(c, "POLICE", w / 2, h * 0.74, h * 0.3, "#c1121f", w * 0.9);
    });
    ctx.drawImage(plate, mid - pw / 2, board.t + (board.b - board.t) * 0.1, pw, ph);
  }
  if (board && Math.sin(clock * 8 + o.z) > 0) {
    ctx.fillStyle = "#ffb703";
    ctx.beginPath();
    ctx.arc(board.l + 0.15 * board.s, board.t - 0.1 * board.s, 0.1 * board.s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBanner(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = o.lane * LANE_W;
  const { w, h, clearance } = OBSTACLE.banner;
  for (const lx of [-w / 2, w / 2]) {
    box(ctx, v, x + lx, 0.12, 0, h, o.z, o.z + 0.12, { front: "#9a9a9a", side: "#777", top: "#bbb" });
  }
  const r = box(ctx, v, x, w, clearance + 0.05, h - 0.2, o.z, o.z + 0.08, { front: "#ffd60a", side: "#c9a800", top: "#ffe55c" });
  if (r) {
    const img = label("police-line", 460, 200, (c, w, h) => {
      c.fillStyle = "#ffd60a";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#111";
      c.fillRect(0, 0, w, h * 0.12);
      c.fillRect(0, h * 0.88, w, h * 0.12);
      text(c, "POLICE LINE", w / 2, h * 0.38, h * 0.3, "#111", w * 0.9);
      text(c, "DO NOT CROSS", w / 2, h * 0.68, h * 0.2, "#111", w * 0.9);
    });
    ctx.drawImage(img, r.l, r.t, r.r - r.l, r.b - r.t);
  }
  const lamp = project(v, x, h + 0.1, o.z);
  if (lamp.s > 1) {
    ctx.fillStyle = Math.sin(clock * 10) > 0 ? "#ff2d55" : "#2d7dff";
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 0.14 * lamp.s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawOfficer(ctx: Ctx, v: View, x: number, z: number, clock: number, back: boolean, running: boolean) {
  const p = project(v, x, 0, z);
  if (p.s < 1) return;
  shadow(ctx, v, x, z, 0.45);
  const phase = running ? clock * 14 : 0;
  const bob = running ? Math.abs(Math.sin(phase)) * 0.06 * p.s : 0;
  // Khaki uniform. Officers chasing you wear caps; the ones blocking the road are in riot gear.
  const fig = figure(
    ctx,
    p.x,
    p.y - bob,
    p.s,
    {
      shirt: "#b59a6a",
      pants: "#a08657",
      skin: "#a5694f",
      hair: "#111",
      shoes: "#1a1a1a",
      belt: "#4a2f1a",
      back,
      cap: back ? "#8a6d3b" : undefined,
      helmet: back ? undefined : "#2b3a55",
    },
    { phase },
  );
  // Lathi (bamboo baton) raised over the shoulder.
  const [hx, hy] = fig.hands[1];
  ctx.strokeStyle = "#c9a25e";
  ctx.lineWidth = Math.max(1, 0.06 * p.s);
  ctx.beginPath();
  ctx.moveTo(fig.X(hx), fig.Y(hy));
  ctx.lineTo(fig.X(hx + 0.25 + Math.sin(clock * 6) * 0.08), fig.Y(hy + 1.0));
  ctx.stroke();
  if (back) return;
  // Riot shield.
  ctx.fillStyle = "rgba(190, 220, 255, 0.42)";
  ctx.strokeStyle = "rgba(230, 240, 255, 0.9)";
  ctx.lineWidth = Math.max(1, 0.03 * p.s);
  ctx.beginPath();
  ctx.roundRect(p.x - 0.45 * p.s, p.y - 1.55 * p.s, 0.7 * p.s, 1.15 * p.s, 0.06 * p.s);
  ctx.fill();
  ctx.stroke();
  const lettering = label("shield", 140, 100, (c, w, h) => {
    text(c, "पुलिस", w / 2, h * 0.3, h * 0.36, "#0b1730", w * 0.95);
    text(c, "POLICE", w / 2, h * 0.75, h * 0.3, "#0b1730", w * 0.95);
  });
  ctx.drawImage(lettering, p.x - 0.42 * p.s, p.y - 1.45 * p.s, 0.64 * p.s, 0.46 * p.s);
}

function drawBus(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = o.lane * LANE_W;
  const { w, h } = OBSTACLE.bus;
  const z1 = o.z + o.len;
  shadow(ctx, v, x, o.z + 0.5, w * 0.6);
  const body = { front: "#1f4e8c", side: "#183f73", top: "#2b5fa6" };
  const r = box(ctx, v, x, w, 0.35, h, o.z, z1, body);

  // Side windows with bars on whichever side faces the camera.
  const xl = x - w / 2;
  const xr = x + w / 2;
  const sideX = v.camX < xl ? xl : v.camX > xr ? xr : null;
  if (sideX !== null) {
    for (let wz = o.z + 1.4; wz < z1 - 1; wz += 1.6) {
      if (wz < NEAR_Z) continue;
      poly(ctx, v, "#0d1b2a", [[sideX, 1.6, wz], [sideX, 2.6, wz], [sideX, 2.6, wz + 1.2], [sideX, 1.6, wz + 1.2]]);
    }
    if (o.z > NEAR_Z) poly(ctx, v, "#e9ecef", [[sideX, 1.15, o.z], [sideX, 1.35, o.z], [sideX, 1.35, z1], [sideX, 1.15, z1]]);
    for (const wz of [o.z + 1.6, z1 - 2]) {
      if (wz < NEAR_Z) continue;
      const c = project(v, sideX, 0.4, wz);
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, 0.18 * c.s, 0.45 * c.s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (!r) return;
  const s = r.s;
  const mid = (r.l + r.r) / 2;
  // Wheels below the body.
  ctx.fillStyle = "#111";
  ctx.fillRect(r.l + 0.15 * s, r.b, 0.4 * s, 0.35 * s);
  ctx.fillRect(r.r - 0.55 * s, r.b, 0.4 * s, 0.35 * s);
  // Windscreen with protective grille.
  const wt = r.t + 0.45 * s;
  const wb = r.t + 1.45 * s;
  ctx.fillStyle = "#0d1b2a";
  ctx.fillRect(r.l + 0.15 * s, wt, r.r - r.l - 0.3 * s, wb - wt);
  ctx.strokeStyle = "rgba(200, 200, 200, 0.7)";
  ctx.lineWidth = Math.max(1, 0.03 * s);
  ctx.beginPath();
  for (let gx = r.l + 0.35 * s; gx < r.r - 0.2 * s; gx += 0.22 * s) {
    ctx.moveTo(gx, wt);
    ctx.lineTo(gx, wb);
  }
  ctx.stroke();
  // White stripe and lettering.
  ctx.fillStyle = "#e9ecef";
  ctx.fillRect(r.l, r.t + 1.85 * s, r.r - r.l, 0.2 * s);
  const busText = label("bus", 320, 60, (c, w, h) => text(c, "पुलिस  POLICE", w / 2, h / 2, h * 0.7, "#fff", w * 0.95));
  ctx.drawImage(busText, r.l + (r.r - r.l) * 0.05, r.t + 0.06 * s, (r.r - r.l) * 0.9, 0.34 * s);
  // Headlights, brighter when the bus is driving at you.
  ctx.fillStyle = o.vz > 0 ? "#fff6b0" : "#bfb68a";
  for (const hx of [r.l + 0.35 * s, r.r - 0.35 * s]) {
    ctx.beginPath();
    ctx.arc(hx, r.b - 0.55 * s, 0.16 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (o.vz > 0) {
    ctx.fillStyle = "rgba(255, 246, 176, 0.18)";
    ctx.beginPath();
    ctx.arc(mid, r.b - 0.55 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Light bar.
  const blink = Math.sin(clock * 12) > 0;
  ctx.fillStyle = blink ? "#ff2d55" : "#5a1020";
  ctx.fillRect(mid - 0.6 * s, r.t - 0.15 * s, 0.55 * s, 0.15 * s);
  ctx.fillStyle = blink ? "#13234a" : "#2d7dff";
  ctx.fillRect(mid + 0.05 * s, r.t - 0.15 * s, 0.55 * s, 0.15 * s);
}

function drawPickup(ctx: Ctx, v: View, c: Pickup, clock: number) {
  const p = project(v, c.lane * LANE_W, c.y + Math.sin(clock * 4 + c.z) * 0.08, c.z);
  if (p.s < 1) return;
  if (c.kind === "coin") {
    // Spinning gold coin.
    const spin = Math.abs(Math.cos(clock * 5 + c.z * 0.3));
    ctx.fillStyle = "#e09f1f";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, Math.max(0.04, 0.3 * spin) * p.s, 0.3 * p.s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd447";
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, Math.max(0.02, 0.2 * spin) * p.s, 0.2 * p.s, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const r = 0.32 * p.s * (1 + Math.sin(clock * 6) * 0.08);
  ctx.fillStyle = "rgba(255, 80, 110, 0.3)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, r * 2, 0, Math.PI * 2);
  ctx.fill();
  heart(ctx, p.x, p.y, r, "#ff3b5c");
}

export function heart(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
  ctx.fill();
}

// ---- player ---------------------------------------------------------------

const PLAYER_STYLE: FigureStyle = {
  shirt: "#ff7b00",
  pants: "#264653",
  skin: "#e0ac69",
  hair: "#1a1a1a",
  back: true,
  shoes: "#f5f5f5",
  backpack: "#2a9d8f",
};

function drawPlayer(ctx: Ctx, v: View, game: Game, clock: number) {
  const pl = game.player;
  shadow(ctx, v, pl.x, 0, PLAYER_HALF_W + 0.1 - Math.min(0.2, pl.y * 0.08));
  if (pl.invulnT > 0 && Math.sin(clock * 30) > 0.3) return;
  const p = project(v, pl.x, pl.y, 0);
  if (game.crouching) {
    // Slide: low, wide and leaning forward.
    const s = p.s;
    ctx.fillStyle = PLAYER_STYLE.pants;
    ctx.fillRect(p.x - 0.3 * s, p.y - 0.25 * s, 0.6 * s, 0.25 * s);
    ctx.fillStyle = PLAYER_STYLE.shirt;
    ctx.beginPath();
    ctx.roundRect(p.x - 0.3 * s, p.y - 0.75 * s, 0.6 * s, 0.55 * s, 0.1 * s);
    ctx.fill();
    ctx.fillStyle = PLAYER_STYLE.backpack!;
    ctx.beginPath();
    ctx.roundRect(p.x - 0.18 * s, p.y - 0.7 * s, 0.36 * s, 0.32 * s, 0.06 * s);
    ctx.fill();
    ctx.fillStyle = PLAYER_STYLE.hair!;
    ctx.beginPath();
    ctx.arc(p.x, p.y - 0.85 * s, 0.13 * s, 0, Math.PI * 2);
    ctx.fill();
  } else {
    figure(ctx, p.x, p.y, p.s, PLAYER_STYLE, { phase: pl.runPhase, air: pl.y > 0.05 });
  }
  if (pl.invulnT > 0) {
    ctx.strokeStyle = "rgba(120, 220, 255, 0.8)";
    ctx.lineWidth = Math.max(2, 0.05 * p.s);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 0.9 * p.s, 0.75 * p.s, 1.1 * p.s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ---- frame ----------------------------------------------------------------

export function render(ctx: Ctx, v: View, game: Game, clock: number) {
  v.camX += (game.player.x * 0.55 - v.camX) * 0.15;

  if (v.backdrop) {
    const offset = (v.backdrop.width - v.w) / 2 + v.camX * 6;
    ctx.drawImage(v.backdrop, -offset, 0);
  }
  drawGround(ctx, v, game.distance);
  drawBuildings(ctx, v, game.distance);

  const sprites: { z: number; draw: () => void }[] = [];
  for (const pr of game.protesters) {
    if (pr.z > NEAR_Z && pr.z < VIEW_DIST * 0.8) sprites.push({ z: pr.z, draw: () => drawProtester(ctx, v, pr, clock) });
  }
  for (const b of game.banners) {
    if (b.z > NEAR_Z + 1 && b.z < VIEW_DIST * 0.7) sprites.push({ z: b.z, draw: () => drawStreetBanner(ctx, v, b, clock) });
  }
  for (const p of game.papers) {
    if (p.z > 4 && p.z < 60) sprites.push({ z: p.z, draw: () => drawPaper(ctx, v, p, clock) });
  }
  const lampStart = Math.ceil((game.distance + NEAR_Z) / 30);
  for (let k = lampStart; k * 30 - game.distance < VIEW_DIST; k++) {
    const z = k * 30 - game.distance;
    for (const side of [-1, 1] as const) sprites.push({ z: z + 0.01, draw: () => drawLamp(ctx, v, side, z) });
  }
  for (const o of game.obstacles) {
    if (o.z > VIEW_DIST || o.z + o.len < NEAR_Z) continue;
    const draw =
      o.kind === "barricade" ? drawBarricade : o.kind === "banner" ? drawBanner : o.kind === "bus" ? drawBus : null;
    sprites.push({
      // Long buses sort by their near end so the player is drawn over them only when actually in front.
      z: o.z,
      draw: draw ? () => draw(ctx, v, o, clock) : () => drawOfficer(ctx, v, o.lane * LANE_W, o.z + o.len / 2, clock, false, false),
    });
  }
  for (const c of game.pickups) {
    if (!c.taken && c.z > NEAR_Z && c.z < VIEW_DIST) sprites.push({ z: c.z, draw: () => drawPickup(ctx, v, c, clock) });
  }
  sprites.push({ z: 0, draw: () => drawPlayer(ctx, v, game, clock) });
  if (game.chaserZ > NEAR_Z + 0.3) {
    const running = game.status === "running";
    for (const dx of [-1.3, 1.3]) {
      sprites.push({
        z: game.chaserZ,
        draw: () => drawOfficer(ctx, v, game.player.x + dx, game.chaserZ, clock + dx, true, running),
      });
    }
  }
  sprites.sort((a, b) => b.z - a.z);
  for (const sp of sprites) sp.draw();

  if (game.chaseT > 0) {
    // Siren glow at the screen edges while the police are on your heels.
    const red = Math.sin(clock * 10) > 0;
    const alpha = 0.22 * Math.min(1, game.chaseT);
    const g = ctx.createLinearGradient(0, 0, v.w, 0);
    g.addColorStop(0, red ? `rgba(255,40,70,${alpha})` : `rgba(40,110,255,${alpha})`);
    g.addColorStop(0.2, "rgba(0,0,0,0)");
    g.addColorStop(0.8, "rgba(0,0,0,0)");
    g.addColorStop(1, red ? `rgba(40,110,255,${alpha})` : `rgba(255,40,70,${alpha})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, v.w, v.h);
  }
}
