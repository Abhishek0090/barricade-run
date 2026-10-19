import {
  BUILDING_X,
  CAM_BACK,
  CAM_H,
  LANE_W,
  NEAR_Z,
  OBSTACLE,
  PLAYER_HALF_W,
  ROAD_HALF,
  SIDEWALK_END,
  VIEW_DIST,
} from "./constants";
import type { Game, Obstacle, Pickup, Protester } from "./engine";

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
  const groundY = h * (portrait ? 0.78 : 0.82);
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
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y, maxW);
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

  const first = Math.floor((distance + NEAR_Z) / SEG);
  const last = Math.ceil((distance + VIEW_DIST) / SEG);
  for (let i = last; i >= first; i--) {
    const z1 = i * SEG + SEG - distance;
    const z0 = Math.max(NEAR_Z, i * SEG - distance);
    if (z1 <= z0) continue;
    const even = i % 2 === 0;
    for (const side of [-1, 1]) {
      strip(ctx, v, even ? "#4a4250" : "#443c4a", side * (ROAD_HALF + 0.3), side * SIDEWALK_END, z0, z1, 0.15);
      strip(ctx, v, even ? "#ffcc00" : "#222", side * ROAD_HALF, side * (ROAD_HALF + 0.3), z0, z1, 0.15);
    }
    strip(ctx, v, even ? "#34323a" : "#302e36", -ROAD_HALF, ROAD_HALF, z0, z1);
    if (even) {
      for (const lx of [-LANE_W / 2, LANE_W / 2]) {
        strip(ctx, v, "rgba(255,255,255,0.7)", lx - 0.08, lx + 0.08, z0, Math.min(z1, z0 + SEG * 0.6));
      }
    }
  }
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
      }
      // Shop shutter at street level, windows above.
      poly(ctx, v, "#2a2a2e", [[x, 0, zn], [x, 2.6, zn], [x, 2.6, z1], [x, 0, z1]]);
      if (z0 > 70) continue;
      for (let wy = 3.5; wy < h - 1.5; wy += 3) {
        for (let wz = 1; wz < BLOCK - 3; wz += 3.4) {
          const za = z0 + wz;
          if (za < NEAR_Z) continue;
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
  cap?: string;
  back?: boolean;
  backpack?: string;
}

/** A simple person. (x, gy) is the ground point under the feet, s is pixels per metre. */
function figure(
  ctx: Ctx,
  x: number,
  gy: number,
  s: number,
  style: FigureStyle,
  pose: { phase: number; height?: number; armsUp?: boolean; fist?: boolean; air?: boolean },
) {
  const k = s * ((pose.height ?? 1.75) / 1.75);
  const Y = (m: number) => gy - m * k;
  const X = (m: number) => x + m * k;
  const swing = Math.sin(pose.phase);
  ctx.lineCap = "round";

  // Legs: in front/back view a running leg shows up as the foot lifting.
  ctx.strokeStyle = style.pants;
  ctx.lineWidth = 0.15 * k;
  const liftL = pose.air ? 0.35 : Math.max(0, swing) * 0.32;
  const liftR = pose.air ? 0.25 : Math.max(0, -swing) * 0.32;
  for (const [lx, lift] of [[-0.1, liftL], [0.1, liftR]] as const) {
    ctx.beginPath();
    ctx.moveTo(X(lx), Y(0.9));
    ctx.lineTo(X(lx * 1.2), Y(lift + 0.06));
    ctx.stroke();
    ctx.fillStyle = "#f5f5f5";
    ctx.fillRect(X(lx * 1.2 - 0.08), Y(lift + 0.08), 0.16 * k, 0.08 * k);
  }

  // Arms.
  ctx.strokeStyle = style.shirt;
  ctx.lineWidth = 0.11 * k;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(X(side * 0.22), Y(1.4));
    if (pose.armsUp) ctx.lineTo(X(side * 0.18), Y(2.0));
    else if (pose.fist && side === 1) ctx.lineTo(X(0.3), Y(1.75 + Math.max(0, swing) * 0.3));
    else ctx.lineTo(X(side * 0.3), Y(1.0 + side * swing * 0.18));
    ctx.stroke();
  }

  // Torso.
  ctx.fillStyle = style.shirt;
  ctx.beginPath();
  ctx.roundRect(X(-0.23), Y(1.47), 0.46 * k, 0.6 * k, 0.08 * k);
  ctx.fill();
  if (style.backpack) {
    ctx.fillStyle = style.backpack;
    ctx.beginPath();
    ctx.roundRect(X(-0.16), Y(1.4), 0.32 * k, 0.38 * k, 0.06 * k);
    ctx.fill();
  }

  // Head.
  ctx.fillStyle = style.back ? (style.hair ?? "#1a1a1a") : style.skin;
  ctx.beginPath();
  ctx.arc(X(0), Y(1.6), 0.13 * k, 0, Math.PI * 2);
  ctx.fill();
  if (!style.back && style.hair) {
    ctx.fillStyle = style.hair;
    ctx.beginPath();
    ctx.arc(X(0), Y(1.64), 0.13 * k, Math.PI, 0);
    ctx.fill();
  }
  if (style.cap) {
    ctx.fillStyle = style.cap;
    ctx.fillRect(X(-0.15), Y(1.78), 0.3 * k, 0.1 * k);
    ctx.fillRect(X(-0.18), Y(1.69), 0.36 * k, 0.04 * k);
  }
}

function shadow(ctx: Ctx, v: View, x: number, z: number, w: number) {
  if (z < NEAR_Z || w <= 0) return;
  const p = project(v, x, 0, z);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w * p.s, w * 0.3 * p.s, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawProtester(ctx: Ctx, v: View, pr: Protester, clock: number) {
  const p = project(v, pr.x, 0, pr.z);
  if (p.s * pr.height < 3) return;
  const bob = Math.abs(Math.sin(clock * 4 + pr.phase)) * 0.12;
  const gy = p.y - bob * p.s;
  figure(ctx, p.x, gy, p.s, { shirt: pr.shirt, pants: "#2b2d42", skin: pr.skin, hair: "#222" }, {
    phase: clock * 4 + pr.phase,
    height: pr.height,
    armsUp: pr.sign !== null,
    fist: pr.sign === null,
  });
  if (!pr.sign) return;
  const k = p.s * (pr.height / 1.75);
  const sway = Math.sin(clock * 2 + pr.phase) * 0.06 * k;
  const w = 1.0 * k;
  const h = 0.5 * k;
  const top = gy - 2.45 * k;
  ctx.fillStyle = "#6b4f2a";
  ctx.fillRect(p.x - 0.03 * k + sway, top + h, 0.06 * k, 0.3 * k);
  ctx.fillStyle = pr.signColor;
  ctx.fillRect(p.x - w / 2 + sway, top, w, h);
  ctx.strokeStyle = "#222";
  ctx.lineWidth = Math.max(1, 0.03 * k);
  ctx.strokeRect(p.x - w / 2 + sway, top, w, h);
  text(ctx, pr.sign, p.x + sway, top + h / 2, 0.17 * k, "#c1121f", w * 0.92);
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
    ctx.fillStyle = "#111";
    const band = (r.b - r.t) * 0.12;
    ctx.fillRect(r.l, r.t, r.r - r.l, band);
    ctx.fillRect(r.l, r.b - band, r.r - r.l, band);
    const cyc = (r.t + r.b) / 2;
    text(ctx, "POLICE LINE", (r.l + r.r) / 2, cyc - 0.17 * r.s, 0.3 * r.s, "#111", (r.r - r.l) * 0.9);
    text(ctx, "DO NOT CROSS", (r.l + r.r) / 2, cyc + 0.2 * r.s, 0.2 * r.s, "#111", (r.r - r.l) * 0.9);
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
  figure(ctx, p.x, p.y - bob, p.s, { shirt: "#1d3557", pants: "#14213d", skin: "#c68642", hair: "#111", cap: "#0b1730", back }, { phase });
  // Lathi (baton) raised over the shoulder.
  ctx.strokeStyle = "#8b5a2b";
  ctx.lineWidth = Math.max(1, 0.06 * p.s);
  ctx.beginPath();
  ctx.moveTo(p.x + 0.3 * p.s, p.y - bob - 1.0 * p.s);
  ctx.lineTo(p.x + (0.55 + Math.sin(clock * 6) * 0.08) * p.s, p.y - bob - 2.0 * p.s);
  ctx.stroke();
  if (back) return;
  // Riot shield.
  ctx.fillStyle = "rgba(190, 220, 255, 0.45)";
  ctx.strokeStyle = "rgba(230, 240, 255, 0.9)";
  ctx.lineWidth = Math.max(1, 0.03 * p.s);
  ctx.beginPath();
  ctx.roundRect(p.x - 0.42 * p.s, p.y - 1.5 * p.s, 0.66 * p.s, 1.1 * p.s, 0.06 * p.s);
  ctx.fill();
  ctx.stroke();
  text(ctx, "POLICE", p.x - 0.09 * p.s, p.y - 1.25 * p.s, 0.13 * p.s, "#0b1730");
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
  text(ctx, "POLICE", mid, r.t + 0.22 * s, 0.32 * s, "#fff", (r.r - r.l) * 0.9);
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
