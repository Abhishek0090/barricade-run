import { BILLBOARDS, FONT } from "./constants";
import { hash } from "./random";

/** Pseudo-3D on a 2D canvas: projection, drawing primitives and the scenery every game shares. */

export type Ctx = CanvasRenderingContext2D;
export type Vec3 = readonly [number, number, number];

export interface Sprite {
  z: number;
  draw: () => void;
}

export interface Sky {
  top: string;
  mid: string;
  low: string;
  /** Far and near skyline layers. */
  far: string;
  near: string;
  moon?: boolean;
  /** Daylight: a sun and clouds instead of stars. */
  day?: boolean;
  /** Rolling hills on the horizon instead of a city skyline. */
  hills?: boolean;
}

export interface Camera {
  height: number;
  /** Distance from the camera to z = 0. */
  back: number;
  /** Camera distance in portrait, where a wide road needs more room. Defaults to `back`. */
  portraitBack?: number;
  sky: Sky;
}

export interface View {
  w: number;
  h: number;
  cx: number;
  focal: number;
  horizon: number;
  /** Camera height. Higher in portrait so more road fits on a narrow screen. */
  camH: number;
  back: number;
  /** Nearest z that is still drawn. */
  near: number;
  camX: number;
  /** Sideways bend of the world: x shifts by curve * z * z. Used for the curving rail track. */
  curve: number;
  backdrop: HTMLCanvasElement | null;
}

export interface Projected {
  x: number;
  y: number;
  s: number;
}

export function makeView(w: number, h: number, cam: Camera): View {
  const portrait = w < h;
  const focal = Math.min(h * 0.95, w * 0.85);
  const camH = portrait ? cam.height * 1.9 : cam.height;
  const back = portrait ? (cam.portraitBack ?? cam.back) : cam.back;
  const groundY = h * (portrait ? 0.66 : 0.82);
  const horizon = groundY - (camH * focal) / back;
  return {
    w,
    h,
    cx: w / 2,
    focal,
    horizon,
    camH,
    back,
    near: -back + 0.6,
    camX: 0,
    curve: 0,
    backdrop: buildBackdrop(w, h, horizon, cam.sky),
  };
}

export function project(v: View, x: number, y: number, z: number): Projected {
  const s = v.focal / (z + v.back);
  return { x: v.cx + (x + v.curve * z * z - v.camX) * s, y: v.horizon + (v.camH - y) * s, s };
}

export function poly(ctx: Ctx, v: View, color: string, pts: Vec3[]) {
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
export function strip(ctx: Ctx, v: View, color: string, xa: number, xb: number, z0: number, z1: number, y = 0) {
  poly(ctx, v, color, [
    [xa, y, z0],
    [xb, y, z0],
    [xb, y, z1],
    [xa, y, z1],
  ]);
}

/** Like strip, but cut into pieces so it follows the curve of the world. */
export function curvedStrip(ctx: Ctx, v: View, color: string, xa: number, xb: number, z0: number, z1: number, y = 0) {
  if (v.curve === 0) {
    strip(ctx, v, color, xa, xb, z0, z1, y);
    return;
  }
  const pieces = Math.max(1, Math.ceil((z1 - z0) / 6));
  const step = (z1 - z0) / pieces;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i <= pieces; i++) {
    const p = project(v, xa, y, z0 + i * step);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  for (let i = pieces; i >= 0; i--) {
    const p = project(v, xb, y, z0 + i * step);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
  ctx.fill();
}

export interface Rect {
  l: number;
  r: number;
  t: number;
  b: number;
  s: number;
}

export interface BoxColors {
  front: string;
  side: string;
  top: string;
}

/**
 * Draws a box with its visible side and top faces. Returns the screen rect of the
 * front (camera-facing) face for decorating, or null when the front is behind the camera.
 */
export function box(ctx: Ctx, v: View, cx: number, w: number, y0: number, y1: number, z0: number, z1: number, colors: BoxColors): Rect | null {
  if (z1 < v.near) return null;
  const zn = Math.max(z0, v.near);
  const xl = cx - w / 2;
  const xr = cx + w / 2;
  const bend = v.curve * zn * zn;
  if (v.camX < xl + bend) poly(ctx, v, colors.side, [[xl, y0, zn], [xl, y1, zn], [xl, y1, z1], [xl, y0, z1]]);
  if (v.camX > xr + bend) poly(ctx, v, colors.side, [[xr, y0, zn], [xr, y1, zn], [xr, y1, z1], [xr, y0, z1]]);
  if (y1 < v.camH) poly(ctx, v, colors.top, [[xl, y1, zn], [xr, y1, zn], [xr, y1, z1], [xl, y1, z1]]);
  if (zn !== z0) return null;
  const a = project(v, xl, y1, z0);
  const b = project(v, xr, y0, z0);
  ctx.fillStyle = colors.front;
  ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
  return { l: a.x, r: b.x, t: a.y, b: b.y, s: a.s };
}

export function text(ctx: Ctx, str: string, x: number, y: number, size: number, color: string, maxW?: number) {
  if (size < 5) return;
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(str, x, y, maxW);
}

/** Slogan fitted into a box: one line if short, otherwise split into two at the middle space. */
export function slogan(ctx: Ctx, str: string, cx: number, cy: number, w: number, h: number, color: string) {
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

export function label(key: string, w: number, h: number, paint: (c: Ctx, w: number, h: number) => void) {
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
export function boardLabel(textStr: string, bg: string, ink: string, w: number, h: number, border = "rgba(0,0,0,0.6)") {
  return label(`board|${textStr}|${bg}|${ink}|${w}x${h}`, w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.strokeStyle = border;
    c.lineWidth = Math.max(2, h * 0.04);
    c.strokeRect(0, 0, w, h);
    slogan(c, textStr, w / 2, h / 2, w, h, ink);
  });
}

// ---- backdrop -------------------------------------------------------------

function buildBackdrop(w: number, h: number, horizon: number, sky: Sky) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const bw = Math.ceil(w * 1.4);
  canvas.width = bw;
  canvas.height = Math.max(1, Math.ceil(horizon + 2));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const grad = ctx.createLinearGradient(0, 0, 0, horizon);
  grad.addColorStop(0, sky.top);
  grad.addColorStop(0.55, sky.mid);
  grad.addColorStop(1, sky.low);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, bw, horizon + 2);

  const unit = Math.max(6, Math.min(w, h) / 60);
  if (sky.day) {
    const sx = bw * 0.3;
    const sy = horizon * 0.35;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, unit * 16);
    glow.addColorStop(0, "rgba(255, 246, 200, 0.9)");
    glow.addColorStop(0.15, "rgba(255, 236, 170, 0.55)");
    glow.addColorStop(1, "rgba(255, 236, 170, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(sx - unit * 16, sy - unit * 16, unit * 32, unit * 32);
    ctx.fillStyle = "#fffbe8";
    ctx.beginPath();
    ctx.arc(sx, sy, unit * 2.6, 0, Math.PI * 2);
    ctx.fill();
    // Flat cartoon clouds.
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (let i = 0; i < 7; i++) {
      const cx = hash(i, 21) * bw;
      const cy = horizon * (0.12 + hash(i, 22) * 0.45);
      const cw = unit * (6 + hash(i, 23) * 8);
      ctx.beginPath();
      ctx.ellipse(cx, cy, cw, cw * 0.22, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - cw * 0.35, cy - cw * 0.1, cw * 0.4, cw * 0.25, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + cw * 0.25, cy - cw * 0.14, cw * 0.45, cw * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (sky.hills) {
    // Two layers of rolling hills.
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = layer === 0 ? sky.far : sky.near;
      const amp = unit * (layer === 0 ? 9 : 5);
      const base = horizon - unit * (layer === 0 ? 3 : 0.5);
      ctx.beginPath();
      ctx.moveTo(0, horizon + 2);
      for (let x = 0; x <= bw; x += unit) {
        const t = x / bw;
        const y = base - amp * (0.55 + 0.45 * Math.sin(t * (layer ? 17 : 9) + layer * 2) * Math.sin(t * (layer ? 5 : 3) + 1));
        ctx.lineTo(x, y);
      }
      ctx.lineTo(bw, horizon + 2);
      ctx.closePath();
      ctx.fill();
    }
    return canvas;
  }

  // Stars in the upper sky.
  ctx.fillStyle = sky.day ? "rgba(0, 0, 0, 0)" : "rgba(255, 255, 255, 0.7)";
  for (let i = 0; i < 70; i++) {
    const sx = hash(i, 3) * bw;
    const sy = hash(i, 5) * horizon * 0.5;
    const r = hash(i, 9) > 0.85 ? 1.6 : 0.9;
    ctx.fillRect(sx, sy, r, r);
  }
  if (sky.moon) {
    const mx = bw * 0.72;
    const my = horizon * 0.22;
    const glow = ctx.createRadialGradient(mx, my, 0, mx, my, unit * 9);
    glow.addColorStop(0, "rgba(255, 244, 214, 0.35)");
    glow.addColorStop(1, "rgba(255, 244, 214, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(mx - unit * 9, my - unit * 9, unit * 18, unit * 18);
    ctx.fillStyle = "#fff4d6";
    ctx.beginPath();
    ctx.arc(mx, my, unit * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Distant skyline silhouettes with a few lit windows.
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer === 0 ? sky.far : sky.near;
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
        ctx.fillStyle = sky.near;
      }
      x += bwid;
      i++;
    }
  }

  const haze = ctx.createLinearGradient(0, horizon - unit * 10, 0, horizon);
  haze.addColorStop(0, "rgba(0, 0, 0, 0)");
  haze.addColorStop(1, sky.low);
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = haze;
  ctx.fillRect(0, horizon - unit * 10, bw, unit * 10 + 2);
  ctx.globalAlpha = 1;
  return canvas;
}

export function drawBackdrop(ctx: Ctx, v: View) {
  if (!v.backdrop) return;
  const slack = (v.backdrop.width - v.w) / 2;
  const shift = Math.max(-slack, Math.min(slack, v.camX * 6 + v.curve * 9000));
  ctx.drawImage(v.backdrop, -slack - shift, 0);
}

// ---- buildings --------------------------------------------------------------

/** News-style hoarding on the camera-facing end of a building. */
function billboard(ctx: Ctx, v: View, x: number, side: -1 | 1, h: number, z: number, k: number) {
  const a = project(v, x + side * 1.2, h - 0.6, z);
  const b = project(v, x + side * 9, h - 4.6, z);
  const l = Math.min(a.x, b.x);
  const r = Math.max(a.x, b.x);
  const t = a.y;
  const bh = b.y - a.y;
  if (r - l < 12) return;
  const index = Math.floor(hash(k, side + 9) * BILLBOARDS.length);
  const [header, headline] = BILLBOARDS[index];
  const img = label(`billboard|${index}`, 400, 200, (c, w, hh) => {
    c.fillStyle = "#1b1b1b";
    c.fillRect(0, 0, w, hh);
    c.fillStyle = "#f8f4ec";
    c.fillRect(4, 4, w - 8, hh - 8);
    c.fillStyle = "#c1121f";
    c.fillRect(4, 4, w - 8, hh * 0.3);
    text(c, header, w / 2, hh * 0.17, hh * 0.18, "#fff", w * 0.9);
    slogan(c, headline, w / 2, hh * 0.65, w - 8, hh * 0.62, "#111");
  });
  ctx.drawImage(img, l, t, r - l, bh);
  ctx.fillStyle = "#1b1b1b";
  const leg = project(v, x + side * 3, h - 5.2, z);
  ctx.fillRect(l + (r - l) * 0.2, t + bh, Math.max(1, (r - l) * 0.02), leg.y - t - bh);
  ctx.fillRect(l + (r - l) * 0.78, t + bh, Math.max(1, (r - l) * 0.02), leg.y - t - bh);
}

const BLOCK = 14;
const WALLS = ["#5a4566", "#6a4a4a", "#45506a", "#5f5648", "#4a6458"];

export function drawBuildings(ctx: Ctx, v: View, distance: number, buildingX: number, far: number) {
  const first = Math.floor((distance + v.near) / BLOCK);
  const last = Math.ceil((distance + far) / BLOCK);
  for (let k = last; k >= first; k--) {
    const z0 = k * BLOCK - distance;
    const z1 = z0 + BLOCK - 2;
    if (z1 < v.near) continue;
    const zn = Math.max(v.near, z0);
    for (const side of [-1, 1] as const) {
      const r = hash(k, side);
      const h = 7 + r * 16;
      const x = side * buildingX;
      const wall = WALLS[Math.floor(r * WALLS.length)];
      poly(ctx, v, wall, [[x, 0, zn], [x, h, zn], [x, h, z1], [x, 0, z1]]);
      if (z0 >= v.near) {
        poly(ctx, v, "#2a2030", [[x, 0, z0], [side * (buildingX + 30), 0, z0], [side * (buildingX + 30), h, z0], [x, h, z0]]);
        if (hash(k, side + 3) > 0.4 && z0 > 1 && z0 < 100) billboard(ctx, v, x, side, h, z0, k);
      }
      // Shop shutter at street level, windows above.
      poly(ctx, v, "#2a2a2e", [[x, 0, zn], [x, 2.6, zn], [x, 2.6, z1], [x, 0, z1]]);
      if (z0 > 70) continue;
      for (let wy = 3.5; wy < h - 1.5; wy += 3) {
        for (let wz = 1; wz < BLOCK - 3; wz += 3.4) {
          const za = z0 + wz;
          if (za < v.near) continue;
          if ((1.5 * v.focal) / (za + v.back) < 2.5) break;
          const lit = hash(k * 7 + wy, wz + side) > 0.45;
          poly(ctx, v, lit ? "#ffd27a" : "#1e1a24", [[x, wy, za], [x, wy + 1.5, za], [x, wy + 1.5, za + 1.8], [x, wy, za + 1.8]]);
        }
      }
    }
  }
}

export function drawLamp(ctx: Ctx, v: View, x: number, side: -1 | 1, z: number) {
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

// ---- people -------------------------------------------------------------------

export interface FigureStyle {
  shirt: string;
  pants: string;
  skin: string;
  hair?: string;
  shoes?: string;
  /** Seen from behind (chasing police). */
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

export interface Pose {
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
export function figure(ctx: Ctx, x: number, gy: number, s: number, st: FigureStyle, pose: Pose) {
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

// ---- the hero (player character, seen from behind) -----------------------------

const HERO = {
  hoodie: "#ff6b1a",
  hoodieDark: "#d94f0a",
  jeans: "#27466e",
  jeansDark: "#1c3352",
  skin: "#d89a5e",
  hair: "#16110e",
  pack: "#14a38b",
  packDark: "#0d7766",
  shoe: "#f7f7f7",
  sole: "#ff3b5c",
};

export interface HeroPose {
  phase: number;
  clock: number;
  air?: boolean;
  crouch?: boolean;
  /** Arms out holding on (rail trolley). */
  brace?: boolean;
}

/**
 * The player: orange hoodie, tricolour headband with flapping tails, teal backpack and white sneakers.
 * Drawn bigger and with more detail than the crowd so it always reads as "you".
 */
export function hero(ctx: Ctx, x: number, gy: number, s: number, pose: HeroPose) {
  const k = s;
  const X = (m: number) => x + m * k;
  const Y = (m: number) => gy - m * k;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const swing = Math.sin(pose.phase);
  const drop = pose.crouch ? 0.62 : 0;
  const B = (m: number) => Y(m - drop);

  // Legs: thigh and shin with a knee; the lifted foot shows its sole.
  if (!pose.crouch) {
    const lifts = pose.air ? [0.38, 0.22] : [Math.max(0, swing) * 0.34, Math.max(0, -swing) * 0.34];
    [-0.11, 0.11].forEach((lx, i) => {
      const lift = lifts[i];
      ctx.strokeStyle = i === 0 ? HERO.jeansDark : HERO.jeans;
      ctx.lineWidth = 0.17 * k;
      ctx.beginPath();
      ctx.moveTo(X(lx), Y(0.94));
      ctx.lineTo(X(lx * 1.1), Y(0.5 + lift * 0.55));
      ctx.lineTo(X(lx * 1.15), Y(lift + 0.12));
      ctx.stroke();
      ctx.fillStyle = HERO.shoe;
      ctx.beginPath();
      ctx.roundRect(X(lx * 1.15 - 0.1), Y(lift + 0.13), 0.2 * k, 0.11 * k, 0.04 * k);
      ctx.fill();
      ctx.fillStyle = HERO.sole;
      ctx.fillRect(X(lx * 1.15 - 0.1), Y(lift + 0.04), 0.2 * k, (lift > 0.05 ? 0.05 : 0.025) * k);
    });
  } else {
    // Knees tucked under the body.
    ctx.fillStyle = HERO.jeans;
    ctx.beginPath();
    ctx.roundRect(X(-0.3), Y(0.42), 0.6 * k, 0.3 * k, 0.12 * k);
    ctx.fill();
    ctx.fillStyle = HERO.shoe;
    ctx.fillRect(X(-0.32), Y(0.14), 0.22 * k, 0.12 * k);
    ctx.fillRect(X(0.1), Y(0.14), 0.22 * k, 0.12 * k);
  }

  // Arms swing forward and back, which from behind reads as hands going up and down.
  for (const side of [-1, 1]) {
    let hand: [number, number] = [side * 0.36, 1.0 - side * swing * 0.22];
    if (pose.air) hand = [side * 0.46, 1.42];
    if (pose.brace) hand = [side * 0.42, 1.0];
    const sx = side * 0.25;
    const sy = 1.42;
    const ex = (sx + hand[0]) / 2 + side * 0.08;
    const ey = (sy + hand[1]) / 2;
    ctx.strokeStyle = HERO.hoodieDark;
    ctx.lineWidth = 0.13 * k;
    ctx.beginPath();
    ctx.moveTo(X(sx), B(sy));
    ctx.lineTo(X(ex), B(ey));
    ctx.lineTo(X(hand[0]), B(hand[1]));
    ctx.stroke();
    ctx.fillStyle = HERO.skin;
    ctx.beginPath();
    ctx.arc(X(hand[0]), B(hand[1] - 0.03), 0.065 * k, 0, Math.PI * 2);
    ctx.fill();
  }

  // Hoodie body with a ribbed hem.
  ctx.fillStyle = HERO.hoodie;
  ctx.beginPath();
  ctx.moveTo(X(-0.27), B(1.48));
  ctx.quadraticCurveTo(X(0), B(1.56), X(0.27), B(1.48));
  ctx.lineTo(X(0.23), B(0.9));
  ctx.lineTo(X(-0.23), B(0.9));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = HERO.hoodieDark;
  ctx.fillRect(X(-0.23), B(0.98), 0.46 * k, 0.08 * k);
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(X(0.08), B(1.46), 0.15 * k, 0.5 * k);

  // Backpack with flap, pocket and straps over the shoulders.
  ctx.fillStyle = HERO.packDark;
  ctx.fillRect(X(-0.17), B(1.5), 0.06 * k, 0.12 * k);
  ctx.fillRect(X(0.11), B(1.5), 0.06 * k, 0.12 * k);
  ctx.fillStyle = HERO.pack;
  ctx.beginPath();
  ctx.roundRect(X(-0.2), B(1.42), 0.4 * k, 0.48 * k, 0.09 * k);
  ctx.fill();
  ctx.fillStyle = HERO.packDark;
  ctx.beginPath();
  ctx.roundRect(X(-0.2), B(1.42), 0.4 * k, 0.15 * k, [0.09 * k, 0.09 * k, 0.03 * k, 0.03 * k]);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(X(-0.12), B(1.15), 0.24 * k, 0.15 * k, 0.04 * k);
  ctx.fill();
  if (k > 30) {
    // A small tricolour patch on the pack.
    ctx.fillStyle = "#ff9933";
    ctx.fillRect(X(-0.06), B(1.23), 0.12 * k, 0.017 * k);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(X(-0.06), B(1.213), 0.12 * k, 0.017 * k);
    ctx.fillStyle = "#138808";
    ctx.fillRect(X(-0.06), B(1.196), 0.12 * k, 0.017 * k);
  }

  // Hood resting on the neck, then the head.
  ctx.fillStyle = HERO.hoodieDark;
  ctx.beginPath();
  ctx.ellipse(X(0), B(1.5), 0.17 * k, 0.07 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HERO.skin;
  ctx.beginPath();
  ctx.ellipse(X(-0.125), B(1.63), 0.03 * k, 0.045 * k, 0, 0, Math.PI * 2);
  ctx.ellipse(X(0.125), B(1.63), 0.03 * k, 0.045 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = HERO.hair;
  ctx.beginPath();
  ctx.ellipse(X(0), B(1.65), 0.13 * k, 0.15 * k, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tricolour headband with tails flapping in the wind.
  const band = 0.024;
  const colors = ["#ff9933", "#ffffff", "#138808"];
  colors.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(X(-0.132), B(1.72 - i * band), 0.264 * k, band * k + 0.5);
  });
  const flap = pose.clock * 14;
  colors.forEach((c, i) => {
    ctx.strokeStyle = c;
    ctx.lineWidth = band * k + 0.5;
    ctx.beginPath();
    ctx.moveTo(X(0.04), B(1.71 - i * band));
    ctx.quadraticCurveTo(
      X(0.18),
      B(1.66 - i * band + Math.sin(flap) * 0.04),
      X(0.3),
      B(1.6 - i * band + Math.sin(flap + 1.2) * 0.07),
    );
    ctx.stroke();
  });
}

/** Soft glowing ring under the player so it's easy to find in a busy scene. */
export function heroRing(ctx: Ctx, v: View, x: number, z: number, w: number, color = "rgba(255, 204, 0, 0.55)") {
  if (z < v.near) return;
  const p = project(v, x, 0.02, z);
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, 0.05 * p.s);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w * p.s, w * 0.28 * p.s, 0, 0, Math.PI * 2);
  ctx.stroke();
}

export function shadow(ctx: Ctx, v: View, x: number, z: number, w: number, alpha = 0.35) {
  if (z < v.near || w <= 0) return;
  const p = project(v, x, 0, z);
  ctx.fillStyle = `rgba(0,0,0,${alpha})`;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, w * p.s, w * 0.3 * p.s, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Indian tricolour on a pole, waving. (px, py) is the top of the pole. */
export function tricolour(ctx: Ctx, px: number, py: number, k: number, phase: number, dir: number) {
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

// ---- pickups and effects ------------------------------------------------------

export function heart(ctx: Ctx, x: number, y: number, r: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + r);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.6, y - r * 1.4, x, y - r * 0.5);
  ctx.bezierCurveTo(x + r * 0.6, y - r * 1.4, x + r * 1.6, y - r * 0.2, x, y + r);
  ctx.fill();
}

/** Spinning gold rupee coin, painted once and squashed horizontally to spin. */
export function drawCoin(ctx: Ctx, x: number, y: number, r: number, spin: number) {
  if (r < 1) return;
  const img = label("coin", 96, 96, (c, w, h) => {
    const g = c.createRadialGradient(w * 0.38, h * 0.32, 4, w / 2, h / 2, w / 2);
    g.addColorStop(0, "#fff3a6");
    g.addColorStop(0.45, "#ffd23f");
    g.addColorStop(1, "#d98e04");
    c.fillStyle = "#b86e00";
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 1, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = g;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "rgba(160, 90, 0, 0.6)";
    c.lineWidth = 3;
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2 - 14, 0, Math.PI * 2);
    c.stroke();
    text(c, "₹", w / 2, h / 2 + 2, h * 0.5, "#a35f00");
  });
  const sx = Math.max(0.12, Math.abs(spin));
  // Gold edge visible while the coin is side-on.
  ctx.fillStyle = "#b86e00";
  ctx.beginPath();
  ctx.ellipse(x + r * 0.08 * (1 - sx), y, Math.max(1, r * sx), r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(img, x - r * sx, y - r, 2 * r * sx, 2 * r);
}

export function drawHeartPickup(ctx: Ctx, x: number, y: number, s: number, clock: number) {
  const r = 0.32 * s * (1 + Math.sin(clock * 6) * 0.08);
  ctx.fillStyle = "rgba(255, 80, 110, 0.3)";
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();
  heart(ctx, x, y, r, "#ff3b5c");
}

/** Red/blue siren glow at the screen edges while the police are on your heels. */
export function sirenGlow(ctx: Ctx, v: View, clock: number, chaseT: number) {
  if (chaseT <= 0) return;
  const red = Math.sin(clock * 10) > 0;
  const alpha = 0.24 * Math.min(1, chaseT);
  const g = ctx.createLinearGradient(0, 0, v.w, 0);
  g.addColorStop(0, red ? `rgba(255,40,70,${alpha})` : `rgba(40,110,255,${alpha})`);
  g.addColorStop(0.2, "rgba(0,0,0,0)");
  g.addColorStop(0.8, "rgba(0,0,0,0)");
  g.addColorStop(1, red ? `rgba(40,110,255,${alpha})` : `rgba(255,40,70,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, v.w, v.h);
}

/** Dark vignette that frames the scene. Painted once per size. */
export function vignette(ctx: Ctx, v: View) {
  const img = label(`vignette|${Math.round(v.w)}x${Math.round(v.h)}`, Math.max(1, Math.round(v.w / 4)), Math.max(1, Math.round(v.h / 4)), (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
  });
  ctx.drawImage(img, 0, 0, v.w, v.h);
}
