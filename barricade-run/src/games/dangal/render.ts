import { FONT } from "../shared/constants";
import { hash } from "../shared/random";
import { type Ctx, heart, label, text, type View } from "../shared/scene";
import type { Project } from "../shared/types";

import { type DangalGame, HEROES, type Look, RING_X, RING_Z, VILLAINS, type Wrestler } from "./engine";

export function makeDangalView(w: number, h: number): View {
  return { w, h, cx: w / 2, focal: 0, horizon: 0, camH: 0, back: 1, near: 0, camX: 0, curve: 0, backdrop: null };
}

interface Frame {
  s: number;
  cx: number;
  base: number;
}

function frame(v: View): Frame {
  // Portrait phones: a bigger ring, higher up, leaving room for the buttons below.
  if (v.w < v.h) return { s: v.w / 10.8, cx: v.w / 2, base: v.h * 0.6 };
  const s = Math.min(v.w / 12.2, v.h / 7.6);
  return { s, cx: v.w / 2, base: v.h * 0.8 };
}

/** Mat coordinates to screen. Farther (bigger z) is higher up and a little smaller. */
function proj(f: Frame, x: number, z: number, y = 0) {
  const p = 1 - z * 0.045;
  return { x: f.cx + x * f.s * p, y: f.base - z * f.s * 0.38 - y * f.s * p, k: f.s * p };
}

// ---- arena ------------------------------------------------------------------

const SIGNS = ["DANGAL!", "JUSTICE", "RE-NEET", "जय हो", "NO DHANDLI", "SHER!", "RANI!", "WE WANT TITLE", "VOTE CHOR OUT"];

function drawArena(ctx: Ctx, v: View, f: Frame, g: DangalGame, clock: number) {
  const bg = ctx.createLinearGradient(0, 0, 0, v.h);
  bg.addColorStop(0, "#0b0618");
  bg.addColorStop(0.6, "#1a0f33");
  bg.addColorStop(1, "#08050f");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, v.w, v.h);

  // Big screen above the ring.
  const sw = Math.min(v.w * 0.42, 460);
  const sh = sw * 0.22;
  const sx = v.cx - sw / 2;
  const sy = v.h * 0.04;
  ctx.fillStyle = "#05030a";
  ctx.fillRect(sx - 6, sy - 6, sw + 12, sh + 12);
  const screen = ctx.createLinearGradient(sx, 0, sx + sw, 0);
  screen.addColorStop(0, "#3b0f5c");
  screen.addColorStop(0.5, "#c71f5b");
  screen.addColorStop(1, "#3b0f5c");
  ctx.fillStyle = screen;
  ctx.fillRect(sx, sy, sw, sh);
  ctx.fillStyle = "#fff";
  ctx.font = `italic 900 ${sh * 0.42}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DANGAL SHOWDOWN", v.cx, sy + sh * 0.42, sw * 0.92);
  ctx.font = `800 ${sh * 0.2}px ${FONT}`;
  ctx.fillStyle = "#ffd447";
  ctx.fillText("LIVE FROM JANTAR MANTAR", v.cx, sy + sh * 0.8, sw * 0.9);

  // Crowd in the stands: rows of heads, bouncing more when the crowd is hyped.
  const top = sy + sh + 14;
  const bottom = proj(f, 0, RING_Z + 0.6).y - f.s * 0.6;
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y = top + ((bottom - top) * (r + 0.5)) / rows;
    const size = 6 + r * 2.2;
    const shade = 30 + r * 10;
    for (let i = 0; i * size * 1.6 < v.w + size * 2; i++) {
      const hx = i * size * 1.6 + (r % 2) * size * 0.8;
      const bounce = Math.max(0, Math.sin(clock * 6 + i * 1.7 + r)) * g.crowdHype * size * 0.5;
      const tint = hash(i, r);
      ctx.fillStyle = `rgb(${shade + tint * 40},${shade * 0.7},${shade + 20})`;
      ctx.fillRect(hx - size * 0.7, y - bounce, size * 1.4, size * 1.3);
      ctx.beginPath();
      ctx.arc(hx, y - size * 0.4 - bounce, size * 0.45, 0, Math.PI * 2);
      ctx.fill();
      if (tint > 0.93 && r > 1) {
        const sign = SIGNS[Math.floor(hash(r, i) * SIGNS.length)];
        const img = label(`crowd-sign|${sign}`, 120, 60, (c, w, h) => {
          c.fillStyle = hash(i, 4) > 0.5 ? "#ffffff" : "#ffe066";
          c.fillRect(0, 0, w, h);
          text(c, sign, w / 2, h / 2 + 2, h * 0.42, "#c1121f", w * 0.9);
        });
        ctx.drawImage(img, hx - size * 1.6, y - size * 2.6 - bounce, size * 3.2, size * 1.6);
      }
      // Camera flashes.
      if (hash(i + Math.floor(clock * 3), r) > 0.995) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(hx, y - size * 0.4, size * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Spotlights sweeping the ring.
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < 4; i++) {
    const ox = v.w * (0.1 + i * 0.27);
    const target = f.cx + Math.sin(clock * 0.6 + i * 1.7) * f.s * 3;
    const ty = proj(f, 0, RING_Z / 2).y;
    const light = ctx.createLinearGradient(ox, 0, target, ty);
    light.addColorStop(0, i % 2 ? "rgba(255, 90, 160, 0.22)" : "rgba(120, 170, 255, 0.22)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = light;
    ctx.beginPath();
    ctx.moveTo(ox - 8, 0);
    ctx.lineTo(ox + 8, 0);
    ctx.lineTo(target + f.s * 1.6, ty);
    ctx.lineTo(target - f.s * 1.6, ty);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// ---- ring ---------------------------------------------------------------------

const ROPE_COLORS = ["#ff9933", "#ffffff", "#138808"];
const ROPE_HEIGHTS = [0.5, 0.9, 1.3];

function drawRing(ctx: Ctx, f: Frame) {
  const X = RING_X + 0.45;
  const z0 = -0.25;
  const z1 = RING_Z + 0.25;
  const a = proj(f, -X, z0);
  const b = proj(f, X, z0);
  const c = proj(f, X, z1);
  const d = proj(f, -X, z1);
  // Apron skirt below the front edge.
  const skirt = f.s * 0.95;
  ctx.fillStyle = "#14102b";
  ctx.fillRect(a.x - f.s * 0.2, a.y, b.x - a.x + f.s * 0.4, skirt);
  const apron = label("apron", 900, 70, (cc, w, h) => {
    text(cc, "DANGAL SHOWDOWN  •  JANTAR MANTAR  •  NEW DELHI", w / 2, h / 2 + 2, h * 0.5, "#ffd447", w * 0.96);
  });
  ctx.drawImage(apron, a.x + (b.x - a.x) * 0.08, a.y + skirt * 0.25, (b.x - a.x) * 0.84, skirt * 0.5);
  // Mat.
  const mat = ctx.createLinearGradient(0, d.y, 0, a.y);
  mat.addColorStop(0, "#c9c3b4");
  mat.addColorStop(1, "#ebe6da");
  ctx.fillStyle = mat;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.lineTo(d.x, d.y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7a1f3d";
  ctx.lineWidth = Math.max(2, f.s * 0.08);
  ctx.stroke();
  // Logo in the middle of the mat.
  const mid = proj(f, 0, RING_Z / 2);
  ctx.save();
  ctx.translate(mid.x, mid.y);
  ctx.scale(1, 0.38);
  ctx.fillStyle = "rgba(122, 31, 61, 0.18)";
  ctx.beginPath();
  ctx.arc(0, 0, f.s * 1.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(122, 31, 61, 0.45)";
  ctx.font = `italic 900 ${f.s * 0.9}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("DANGAL", 0, 0);
  ctx.restore();
}

function post(ctx: Ctx, f: Frame, x: number, z: number, pad: string) {
  const b = proj(f, x, z);
  const t = proj(f, x, z, 1.55);
  ctx.fillStyle = "#2b2b33";
  ctx.fillRect(b.x - f.s * 0.07, t.y, f.s * 0.14, b.y - t.y);
  ctx.fillStyle = pad;
  for (const h of ROPE_HEIGHTS) {
    const p = proj(f, x, z, h);
    ctx.fillRect(p.x - f.s * 0.11, p.y - f.s * 0.09, f.s * 0.22, f.s * 0.18);
  }
}

function ropes(ctx: Ctx, f: Frame, side: "back" | "front" | "sides", shake: number) {
  const X = RING_X + 0.45;
  const z0 = -0.25;
  const z1 = RING_Z + 0.25;
  ROPE_HEIGHTS.forEach((h, i) => {
    ctx.strokeStyle = ROPE_COLORS[i];
    ctx.lineWidth = Math.max(1.5, f.s * 0.045);
    ctx.beginPath();
    const line = (ax: number, az: number, bx: number, bz: number) => {
      const a = proj(f, ax, az, h);
      const b = proj(f, bx, bz, h);
      const m = proj(f, (ax + bx) / 2, (az + bz) / 2, h - shake * 0.12 * Math.sin(i + 1));
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(m.x, m.y, b.x, b.y);
    };
    if (side === "back") line(-X, z1, X, z1);
    if (side === "front") line(-X, z0, X, z0);
    if (side === "sides") {
      line(-X, z0, -X, z1);
      line(X, z0, X, z1);
    }
    ctx.stroke();
  });
}

// ---- wrestlers --------------------------------------------------------------------

export interface Pose {
  lean: number;
  /** [upper arm angle, forearm bend], 0 = hanging, positive = forward. */
  armF: [number, number];
  armB: [number, number];
  /** [thigh angle, knee bend]. */
  legF: [number, number];
  legB: [number, number];
  /** Hip drop in metres (crouch / kneel). */
  drop: number;
}

export function poseOf(w: Wrestler, clock: number): Pose {
  const bob = Math.sin(clock * 4 + w.phase) * 0.04;
  const guard: Pose = { lean: 0.08, armF: [0.5, 2.1], armB: [0.3, 2.2], legF: [0.25, 0.1], legB: [-0.25, 0.1], drop: 0.04 + bob };
  const p = w.dur > 0 ? Math.min(1, w.t / w.dur) : 0;
  const swing = Math.sin(w.phase);
  switch (w.state) {
    case "walk":
      return { ...guard, legF: [swing * 0.55, 0.2 + Math.max(0, swing) * 0.4], legB: [-swing * 0.55, 0.2 + Math.max(0, -swing) * 0.4] };
    case "punch": {
      const ext = Math.sin(Math.min(1, p / 0.45) * Math.PI);
      return { ...guard, lean: 0.12 + ext * 0.15, armF: [0.5 + ext * 1.05, 2.1 * (1 - ext)] };
    }
    case "kick": {
      const ext = Math.sin(Math.min(1, p / 0.6) * Math.PI);
      return { ...guard, lean: -0.25 * ext, legF: [0.25 + ext * 1.35, 0.6 - ext * 0.6], armB: [-0.6, 0.3] };
    }
    case "stomp": {
      const up = p < 0.5 ? p * 2 : 2 - p * 2;
      return { ...guard, legF: [0.2 + up * 0.9, 0.4 + up * 1.2], drop: 0.04 };
    }
    case "grab":
      return { ...guard, lean: 0.25, armF: [1.55, 0], armB: [1.4, 0] };
    case "slam":
    case "special": {
      const up = p < 0.5;
      return { lean: up ? -0.15 : 0.35, armF: up ? [2.9, 0.2] : [1.2, 0], armB: up ? [2.8, 0.2] : [1.0, 0], legF: [0.35, 0.3], legB: [-0.35, 0.3], drop: up ? 0.1 : 0.25 };
    }
    case "lifted":
      return { lean: 0, armF: [1.8 + Math.sin(clock * 20) * 0.5, 0.4], armB: [2.2 + Math.cos(clock * 18) * 0.5, 0.4], legF: [0.6, 0.6 + Math.sin(clock * 16) * 0.3], legB: [-0.2, 0.4], drop: 0 };
    case "hit":
      return { ...guard, lean: -0.4, armF: [0.4, 0.4], armB: [-0.4, 0.3] };
    case "block":
      return { ...guard, lean: 0.05, armF: [0.9, 2.0], armB: [0.8, 2.1] };
    case "getup":
      return { lean: 0.6 * (1 - p), armF: [0.6, 0.4], armB: [0.4, 0.4], legF: [0.6 * (1 - p), 1.2 * (1 - p)], legB: [-0.2, 0.8 * (1 - p)], drop: 0.35 * (1 - p) };
    case "pin":
      return { lean: 1.25, armF: [1.0, 0.3], armB: [0.7, 0.2], legF: [1.4, 2.2], legB: [0.3, 2.0], drop: 0.5 };
    case "celebrate":
      return { lean: -0.1, armF: [2.9 + Math.sin(clock * 8) * 0.2, 0.2], armB: [2.8 - Math.sin(clock * 8) * 0.2, 0.2], legF: [0.2, 0], legB: [-0.2, 0], drop: Math.abs(Math.sin(clock * 6)) * -0.05 };
    case "down":
    case "pinned": {
      const flail = w.state === "pinned" ? Math.sin(clock * 22) * 0.3 : 0;
      return { lean: 0, armF: [0.5 + flail, 0.2], armB: [-0.3 - flail, 0.2], legF: [0.3, 0.3], legB: [-0.1, 0.2], drop: 0 };
    }
    default:
      return guard;
  }
}

function limb(ctx: Ctx, x: number, y: number, a1: number, a2: number, l1: number, l2: number, w1: number, w2: number, c1: string, c2: string) {
  // Angle 0 points straight down; positive swings forward (+x).
  const ex = x + Math.sin(a1) * l1;
  const ey = y + Math.cos(a1) * l1;
  const hx = ex + Math.sin(a1 + a2) * l2;
  const hy = ey + Math.cos(a1 + a2) * l2;
  ctx.strokeStyle = c1;
  ctx.lineWidth = w1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(ex, ey);
  ctx.stroke();
  ctx.strokeStyle = c2;
  ctx.lineWidth = w2;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(hx, hy);
  ctx.stroke();
  return [hx, hy] as const;
}

/** Draws a wrestler in metres around the hip at (0, 0); the caller sets position, scale, facing and rotation. */
function body(ctx: Ctx, lk: Look, pose: Pose, clock: number, chair: boolean) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const shoulderY = -0.62;
  const torsoW = lk.belly ? 0.5 : 0.4;
  const legPaint = (a: [number, number], back: boolean) => {
    const [fx, fy] = limb(ctx, 0, 0, a[0], -a[1], 0.46, 0.46, 0.19, 0.15, lk.trunks, back ? shadeOf(lk.skin) : lk.skin);
    ctx.fillStyle = lk.boots;
    ctx.beginPath();
    ctx.roundRect(fx - 0.08, fy - 0.12, 0.24, 0.14, 0.05);
    ctx.fill();
  };
  const armPaint = (a: [number, number], back: boolean) => {
    const skin = back ? shadeOf(lk.skin) : lk.skin;
    const [hx, hy] = limb(ctx, 0, shoulderY + 0.05, a[0], a[1], 0.33, 0.3, 0.14, 0.12, lk.jacket ? "#f7f5ee" : skin, skin);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(hx, hy, 0.07, 0, Math.PI * 2);
    ctx.fill();
    return [hx, hy] as const;
  };

  ctx.save();
  ctx.rotate(pose.lean);
  armPaint([pose.armB[0], pose.armB[1]], true);
  ctx.restore();
  legPaint(pose.legB, true);
  legPaint(pose.legF, false);

  ctx.save();
  ctx.rotate(pose.lean);
  // Torso: singlet, belly, extras.
  if (lk.top === "tricolour") {
    const bands = ["#ff9933", "#ffffff", "#138808"];
    bands.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(-torsoW / 2, shoulderY + (i * 0.62) / 3, torsoW, 0.62 / 3 + 0.01);
    });
    ctx.strokeStyle = "#000080";
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.arc(0, shoulderY + 0.31, 0.05, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    ctx.fillStyle = lk.top;
    ctx.beginPath();
    ctx.roundRect(-torsoW / 2, shoulderY, torsoW, 0.66, [0.12, 0.12, 0.06, 0.06]);
    ctx.fill();
  }
  if (lk.belly) {
    ctx.fillStyle = lk.top === "tricolour" ? "#ffffff" : lk.top;
    ctx.beginPath();
    ctx.ellipse(0.1, -0.2, 0.22, 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(0,0,0,0.14)";
  ctx.fillRect(-torsoW / 2, shoulderY, torsoW * 0.35, 0.62);
  if (lk.jacket) {
    ctx.fillStyle = "#4b4f57";
    ctx.fillRect(-torsoW / 2, shoulderY, torsoW * 0.4, 0.5);
    ctx.fillRect(torsoW * 0.15, shoulderY, torsoW * 0.35, 0.5);
  }
  // Championship-style belt.
  ctx.fillStyle = "#1a1a1a";
  ctx.fillRect(-torsoW / 2, -0.08, torsoW, 0.08);
  if (lk.extra === "papers") {
    ctx.fillStyle = "#fbfbf6";
    ctx.fillRect(-0.05, shoulderY + 0.12, 0.16, 0.2);
    ctx.fillRect(-0.15, shoulderY + 0.3, 0.14, 0.18);
    ctx.fillStyle = "#c1121f";
    ctx.fillRect(-0.02, shoulderY + 0.14, 0.1, 0.02);
  }
  if (lk.extra === "evm") {
    ctx.fillStyle = "#c9ccd1";
    ctx.fillRect(-0.12, shoulderY + 0.12, 0.26, 0.3);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = i === 1 ? "#d62828" : "#1d3557";
      ctx.fillRect(0.05, shoulderY + 0.16 + i * 0.065, 0.06, 0.04);
    }
  }
  if (lk.extra === "garland") {
    ctx.fillStyle = "#ff9f1c";
    for (let i = 0; i < 10; i++) {
      const a = Math.PI * 0.15 + (i / 9) * Math.PI * 0.7;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 0.17, shoulderY + Math.sin(a) * 0.3, 0.035, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Head.
  const hy = shoulderY - 0.2;
  ctx.fillStyle = lk.skin;
  ctx.fillRect(-0.05, shoulderY - 0.08, 0.1, 0.1);
  ctx.beginPath();
  ctx.arc(0.02, hy, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(0.1, hy - 0.02, 0.018, 0, Math.PI * 2);
  ctx.fill();
  if (lk.glasses) {
    ctx.fillStyle = "#111";
    ctx.fillRect(0.04, hy - 0.05, 0.13, 0.05);
  }
  if (lk.mustache) {
    ctx.fillStyle = lk.hair === "turban" ? "#16110e" : lk.hairColor === "#bbb" ? "#ddd" : "#16110e";
    ctx.fillRect(0.06, hy + 0.04, 0.1, 0.03);
    if (lk.hair === "turban") {
      ctx.beginPath();
      ctx.arc(0.06, hy + 0.08, 0.09, 0, Math.PI);
      ctx.fill();
    }
  }
  switch (lk.hair) {
    case "turban":
      ctx.fillStyle = lk.hairColor;
      ctx.beginPath();
      ctx.ellipse(0, hy - 0.08, 0.19, 0.14, -0.2, Math.PI * 0.95, Math.PI * 2.1);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(-0.05, hy - 0.16, 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "ponytail":
      ctx.fillStyle = lk.hairColor;
      ctx.beginPath();
      ctx.arc(0.01, hy - 0.04, 0.155, Math.PI, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-0.2, hy + 0.04 + Math.sin(clock * 8) * 0.02, 0.06, 0.16, 0.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "short":
      ctx.fillStyle = lk.hairColor;
      ctx.beginPath();
      ctx.arc(0.01, hy - 0.03, 0.155, Math.PI * 1.05, Math.PI * 1.95);
      ctx.fill();
      break;
    case "cap":
      ctx.fillStyle = lk.hairColor;
      ctx.fillRect(-0.15, hy - 0.2, 0.32, 0.1);
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0.05, hy - 0.11, 0.2, 0.03);
      break;
    case "mohawk":
      ctx.fillStyle = lk.hairColor;
      ctx.beginPath();
      ctx.moveTo(-0.12, hy - 0.08);
      for (let i = 0; i < 5; i++) ctx.lineTo(-0.1 + i * 0.05, hy - 0.26 + (i % 2) * 0.06);
      ctx.lineTo(0.14, hy - 0.08);
      ctx.fill();
      break;
    default:
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(-0.02, hy - 0.08, 0.06, 0, Math.PI * 2);
      ctx.fill();
  }
  if (lk.extra === "headband") {
    ["#ff9933", "#ffffff", "#138808"].forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(-0.14, hy - 0.1 + i * 0.025, 0.31, 0.026);
    });
    ctx.fillStyle = "#ff9933";
    ctx.fillRect(-0.24, hy - 0.08 + Math.sin(clock * 12) * 0.02, 0.1, 0.03);
  }
  ctx.restore();

  ctx.save();
  ctx.rotate(pose.lean);
  const [hx, hy2] = armPaint([pose.armF[0], pose.armF[1]], false);
  if (chair) {
    ctx.fillStyle = "#9aa3ad";
    ctx.strokeStyle = "#5f6873";
    ctx.lineWidth = 0.03;
    ctx.beginPath();
    ctx.roundRect(hx - 0.05, hy2 - 0.45, 0.32, 0.4, 0.03);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function shadeOf(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((n >> s) & 255) * 0.8);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function drawWrestler(ctx: Ctx, f: Frame, w: Wrestler, clock: number, highlight: string | null) {
  const ground = proj(f, w.x, w.z);
  const k = ground.k * w.f.look.size;
  // Shadow on the mat.
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(ground.x, ground.y, 0.55 * k, 0.15 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  if (highlight) {
    ctx.strokeStyle = highlight;
    ctx.lineWidth = Math.max(2, k * 0.04);
    ctx.beginPath();
    ctx.ellipse(ground.x, ground.y, 0.6 * k, 0.17 * k, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  const pose = poseOf(w, clock);
  ctx.save();
  const lying = w.state === "down" || w.state === "pinned";
  if (lying) {
    ctx.translate(ground.x, ground.y - 0.2 * k);
    ctx.scale(k, k);
    ctx.rotate(-Math.PI / 2 * w.facing);
  } else if (w.state === "lifted") {
    const hip = proj(f, w.x, w.z, w.y + 0.95);
    ctx.translate(hip.x, hip.y);
    ctx.scale(k, k);
    ctx.rotate(w.rot);
  } else {
    ctx.translate(ground.x, ground.y - (0.95 - pose.drop) * k);
    ctx.scale(k, k);
  }
  ctx.scale(w.facing, 1);
  body(ctx, w.f.look, pose, clock, w.chairShots > 0);
  ctx.restore();
}

function drawRef(ctx: Ctx, f: Frame, g: DangalGame, clock: number) {
  const p = proj(f, g.ref.x, g.ref.z);
  const k = p.k * 0.95;
  const counting = g.pin !== null;
  const slap = counting ? Math.max(0, Math.sin((g.pin!.t / 0.85) * Math.PI)) : 0;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 0.45 * k, 0.12 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(p.x, p.y - (counting ? 0.45 : 0.95) * k);
  ctx.scale(k, k);
  ctx.scale(g.me.x > g.ref.x ? -1 : 1, 1);
  const look: Look = { skin: "#c68642", top: "#f1f1f1", trunks: "#111", boots: "#111", hair: "short", hairColor: "#111", mustache: true, belly: false, glasses: false, jacket: false, extra: "none", size: 1 };
  const pose: Pose = counting
    ? { lean: 1.1, armF: [1.2 + slap * 0.8, 0], armB: [0.4, 0.2], legF: [1.4, 2.2], legB: [0.2, 2.0], drop: 0.5 }
    : { lean: 0, armF: [0.3 + Math.sin(clock * 2) * 0.1, 0.3], armB: [-0.2, 0.2], legF: [0.15, 0], legB: [-0.15, 0], drop: 0 };
  body(ctx, look, pose, clock, false);
  // Referee stripes.
  ctx.rotate(pose.lean);
  ctx.fillStyle = "#111";
  for (let i = 0; i < 4; i++) ctx.fillRect(-0.2 + i * 0.11, -0.62, 0.045, 0.6);
  ctx.restore();
}

function drawChair(ctx: Ctx, f: Frame, x: number, z: number) {
  const p = proj(f, x, z);
  const k = p.k;
  ctx.fillStyle = "#9aa3ad";
  ctx.strokeStyle = "#5f6873";
  ctx.lineWidth = Math.max(1, k * 0.03);
  ctx.fillRect(p.x - 0.22 * k, p.y - 0.5 * k, 0.44 * k, 0.08 * k);
  ctx.fillRect(p.x - 0.22 * k, p.y - 0.95 * k, 0.06 * k, 0.95 * k);
  ctx.fillRect(p.x + 0.16 * k, p.y - 0.5 * k, 0.06 * k, 0.5 * k);
  ctx.fillRect(p.x - 0.22 * k, p.y - 0.95 * k, 0.3 * k, 0.3 * k);
  ctx.fillStyle = "rgba(255, 220, 90, 0.8)";
  ctx.font = `900 ${Math.max(9, k * 0.22)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("STEEL CHAIR", p.x, p.y - 1.1 * k);
}

// ---- HUD ---------------------------------------------------------------------------

function bar(ctx: Ctx, x: number, y: number, w: number, h: number, value: number, colors: [string, string], flip: boolean) {
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.roundRect(x - 2, y - 2, w + 4, h + 4, h / 2 + 2);
  ctx.fill();
  const fill = Math.max(0, Math.min(1, value)) * w;
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, colors[0]);
  grad.addColorStop(1, colors[1]);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(flip ? x + w - fill : x, y, fill, h, h / 2);
  ctx.fill();
}

function drawHud(ctx: Ctx, v: View, g: DangalGame, clock: number) {
  const bw = Math.min((v.w - 110) * 0.4, 400);
  const pad = 14;
  const top = 14;
  const small = v.w < 560;
  const nameSize = small ? 12 : 15;
  for (const side of [0, 1]) {
    const w = side === 0 ? g.me : g.foe;
    // The right bar stops short of the pause button in the corner.
    const x = side === 0 ? pad : v.w - pad - 58 - bw;
    ctx.textAlign = side === 0 ? "left" : "right";
    ctx.textBaseline = "top";
    ctx.font = `italic 900 ${nameSize}px ${FONT}`;
    ctx.fillStyle = side === 0 ? "#ffd447" : "#ff8fa3";
    ctx.fillText(w.f.name.toUpperCase(), side === 0 ? x : x + bw, top);
    if (!small) {
      ctx.font = `700 11px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.fillText(w.f.title, side === 0 ? x : x + bw, top + nameSize + 3);
    }
    const by = top + nameSize + (small ? 6 : 20);
    const hpCol: [string, string] = w.hp > 50 ? ["#2ec27e", "#7cffb2"] : w.hp > 25 ? ["#f5a623", "#ffd447"] : ["#c1121f", "#ff5d73"];
    bar(ctx, x, by, bw, small ? 12 : 16, w.hp / 100, side === 0 ? hpCol : [hpCol[1], hpCol[0]], side === 1);
    const ready = w.special >= 100;
    const sCol: [string, string] = ready ? (Math.sin(clock * 10) > 0 ? ["#c77dff", "#ffd447"] : ["#ffd447", "#c77dff"]) : ["#5a3ea8", "#c77dff"];
    bar(ctx, side === 0 ? x : x + bw * 0.4, by + (small ? 18 : 24), bw * 0.6, small ? 5 : 7, w.special / 100, sCol, side === 1);
    if (ready) {
      ctx.font = `900 ${small ? 9 : 11}px ${FONT}`;
      ctx.fillStyle = "#ffd447";
      ctx.fillText(side === 0 ? `${w.f.finisher} READY  (I)` : "FINISHER READY", side === 0 ? x : x + bw, by + (small ? 26 : 36));
    }
  }
  // Lifelines and the match number.
  for (let i = 0; i < 3; i++) heart(ctx, pad + 8 + i * 18, top + (small ? 70 : 92), 6, i < g.lifelines ? "#ff3b5c" : "rgba(255,255,255,0.2)");
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = `900 ${small ? 11 : 13}px ${FONT}`;
  ctx.fillStyle = "#fff";
  const champ = g.match >= VILLAINS.length;
  ctx.fillText(champ ? `CHAMPION • DEFENCE ${g.match - VILLAINS.length + 1}` : `MATCH ${g.match + 1}/${VILLAINS.length}`, v.cx, small ? 64 : top + 4);
  ctx.font = `700 ${small ? 10 : 12}px ${FONT}`;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.fillText(`Score ${g.xp.toLocaleString()}`, v.cx, (small ? 64 : top + 4) + 16);

  // Being pinned: mash to kick out.
  if (g.pin && g.pin.by === g.foe) {
    const need = 0.55 + (1 - g.me.hp / 100) * 0.65;
    const mw = Math.min(300, v.w * 0.7);
    const my = v.h * 0.62;
    ctx.font = `italic 900 ${small ? 20 : 28}px ${FONT}`;
    ctx.fillStyle = Math.sin(clock * 14) > 0 ? "#ffd447" : "#ff5d73";
    ctx.textBaseline = "middle";
    ctx.fillText("MASH ANY BUTTON TO KICK OUT!", v.cx, my - 26, v.w - 20);
    bar(ctx, v.cx - mw / 2, my, mw, 14, g.me.kickPower / need, ["#ff9933", "#ffd447"], false);
  }
}

function drawPops(ctx: Ctx, f: Frame, g: DangalGame) {
  for (const p of g.pops) {
    const pt = proj(f, p.x, 0.5, p.y + 1.2);
    const big = p.text.length <= 2;
    ctx.globalAlpha = Math.min(1, p.t * 3);
    ctx.font = `italic 900 ${big ? f.s * 0.9 : Math.max(13, f.s * 0.32)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(p.text, pt.x + 2, pt.y + 2);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, pt.x, pt.y);
    ctx.globalAlpha = 1;
  }
}

function drawBanner(ctx: Ctx, v: View, g: DangalGame) {
  const b = g.banner;
  if (!b) return;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, b.t * 3));
  const y = v.h * 0.4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = b.big ? Math.min(54, v.w / 11) : Math.min(34, v.w / 16);
  ctx.font = `italic 900 ${size}px ${FONT}`;
  ctx.fillStyle = "#2d7dff";
  ctx.fillText(b.text, v.cx + 4, y + 4, v.w - 20);
  ctx.fillStyle = "#ff2d55";
  ctx.fillText(b.text, v.cx + 2, y + 2, v.w - 20);
  ctx.fillStyle = "#ffd447";
  ctx.fillText(b.text, v.cx, y, v.w - 20);
  if (b.sub) {
    ctx.font = `700 ${Math.min(17, v.w / 26)}px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.fillText(b.sub, v.cx, y + size * 0.85, v.w - 24);
  }
  ctx.restore();
}

/** Character select: three cards, the highlighted one bigger. */
function drawSelect(ctx: Ctx, v: View, f: Frame, g: DangalGame, clock: number) {
  ctx.fillStyle = "rgba(8,5,18,0.72)";
  ctx.fillRect(0, 0, v.w, v.h);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `italic 900 ${Math.min(40, v.w / 13)}px ${FONT}`;
  ctx.fillStyle = "#ffd447";
  ctx.fillText("CHOOSE YOUR WRESTLER", v.cx, v.h * 0.12, v.w - 20);
  const cw = Math.min(220, (v.w - 40) / 3);
  const ch = Math.min(v.h * 0.6, cw * 1.9);
  HEROES.forEach((hero, i) => {
    const on = i === g.pick;
    const x = v.cx + (i - 1) * (cw + 10) - cw / 2;
    const y = v.h * 0.2;
    ctx.fillStyle = on ? "rgba(199,125,255,0.25)" : "rgba(255,255,255,0.06)";
    ctx.strokeStyle = on ? "#c77dff" : "rgba(255,255,255,0.15)";
    ctx.lineWidth = on ? 3 : 1;
    ctx.beginPath();
    ctx.roundRect(x, y, cw, ch, 16);
    ctx.fill();
    ctx.stroke();
    // The wrestler, posing.
    const k = Math.min(cw / 1.6, ch / 3.6);
    ctx.save();
    ctx.translate(x + cw / 2, y + ch * 0.52);
    ctx.scale(k * hero.look.size, k * hero.look.size);
    const pose: Pose = on
      ? { lean: -0.1, armF: [2.9 + Math.sin(clock * 6) * 0.15, 0.2], armB: [2.8, 0.2], legF: [0.25, 0], legB: [-0.25, 0], drop: 0 }
      : { lean: 0.08, armF: [0.5, 2.1], armB: [0.3, 2.2], legF: [0.25, 0.1], legB: [-0.25, 0.1], drop: 0 };
    body(ctx, hero.look, pose, clock, false);
    ctx.restore();
    ctx.font = `italic 900 ${Math.min(17, cw / 9)}px ${FONT}`;
    ctx.fillStyle = on ? "#ffd447" : "#fff";
    ctx.fillText(hero.name.toUpperCase(), x + cw / 2, y + ch * 0.8, cw - 10);
    ctx.font = `700 ${Math.min(12, cw / 15)}px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.7)";
    ctx.fillText(hero.title, x + cw / 2, y + ch * 0.8 + 18, cw - 10);
    ctx.fillStyle = "#c77dff";
    ctx.fillText(`Finisher: ${hero.finisher}`, x + cw / 2, y + ch * 0.8 + 34, cw - 10);
    // Power and speed.
    const sw = cw * 0.7;
    bar(ctx, x + (cw - sw) / 2, y + ch * 0.06, sw * (hero.power / 1.2), 5, 1, ["#ff5d73", "#ff9933"], false);
    bar(ctx, x + (cw - sw) / 2, y + ch * 0.06 + 10, sw * (hero.speed / 1.2), 5, 1, ["#3ab0ff", "#7cffb2"], false);
  });
  ctx.font = `700 ${Math.min(15, v.w / 30)}px ${FONT}`;
  ctx.fillStyle = "#fff";
  ctx.fillText("← → or drag to choose   •   J / tap / PUNCH to pick", v.cx, v.h * 0.2 + ch + 30, v.w - 20);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.fillText("Bar 1: power   •   Bar 2: speed", v.cx, v.h * 0.2 + ch + 52, v.w - 20);
}

export function renderDangal(ctx: Ctx, v: View, g: DangalGame, clock: number) {
  const f = frame(v);
  ctx.save();
  if (g.shake > 0) ctx.translate((Math.random() - 0.5) * g.shake * 14, (Math.random() - 0.5) * g.shake * 10);
  drawArena(ctx, v, f, g, clock);
  drawRing(ctx, f);
  ropes(ctx, f, "back", g.shake);
  post(ctx, f, -(RING_X + 0.45), RING_Z + 0.25, "#2d7dff");
  post(ctx, f, RING_X + 0.45, RING_Z + 0.25, "#ff2d55");
  ropes(ctx, f, "sides", g.shake);

  type Item = { z: number; draw: () => void };
  const items: Item[] = [];
  if (g.phase !== "select") {
    items.push({ z: g.me.z, draw: () => drawWrestler(ctx, f, g.me, clock, g.ghost ? null : "rgba(255, 212, 71, 0.85)") });
    items.push({ z: g.foe.z + 0.001, draw: () => drawWrestler(ctx, f, g.foe, clock, g.ghost ? null : "rgba(255, 93, 115, 0.7)") });
    items.push({ z: g.ref.z, draw: () => drawRef(ctx, f, g, clock) });
    if (g.chair) {
      const c = g.chair;
      items.push({ z: c.z, draw: () => drawChair(ctx, f, c.x, c.z) });
    }
  }
  items.sort((a, b) => b.z - a.z);
  for (const it of items) it.draw();

  post(ctx, f, -(RING_X + 0.45), -0.25, "#ff2d55");
  post(ctx, f, RING_X + 0.45, -0.25, "#2d7dff");
  ropes(ctx, f, "front", g.shake);
  drawPops(ctx, f, g);
  ctx.restore();

  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.6})`;
    ctx.fillRect(0, 0, v.w, v.h);
  }
  if (g.ghost) return;
  if (g.phase === "select") {
    drawSelect(ctx, v, f, g, clock);
    return;
  }
  drawHud(ctx, v, g, clock);
  drawBanner(ctx, v, g);
  if (g.phase === "fight" && g.phaseT < 7 && g.match === 0) {
    ctx.textAlign = "center";
    ctx.font = `700 ${Math.min(14, v.w / 32)}px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.fillText(
      v.w < 700 ? "Drag to move • buttons: punch, kick, grapple/pin, finisher" : "WASD / arrows move • J punch • K kick • L grapple, pin or pick up the chair • I finisher",
      v.cx,
      v.h - 22,
      v.w - 20,
    );
  }
}

// ---- 2D layer over the 3D scene ---------------------------------------------------

/** Where the three heroes stand on the character-select screen (engine x). */
export const SELECT_X = [-2.4, 0, 2.4];

/** HUD, banners and labels drawn on the transparent canvas above the WebGL scene. */
export function drawDangalOverlay(ctx: Ctx, v: View, g: DangalGame, clock: number, project: Project) {
  if (g.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${g.flash * 0.6})`;
    ctx.fillRect(0, 0, v.w, v.h);
  }
  if (g.ghost) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (g.phase === "select") {
    ctx.font = `italic 900 ${Math.min(40, v.w / 13)}px ${FONT}`;
    ctx.fillStyle = "#ffd447";
    ctx.fillText("CHOOSE YOUR WRESTLER", v.cx, v.h * 0.1, v.w - 20);
    HEROES.forEach((hero, i) => {
      const on = i === g.pick;
      const p = project(SELECT_X[i], -0.15, RING_Z / 2);
      if (!p.visible) return;
      const size = Math.min(17, v.w / 26);
      ctx.font = `italic 900 ${on ? size * 1.15 : size}px ${FONT}`;
      ctx.fillStyle = on ? "#ffd447" : "#ffffff";
      ctx.fillText(hero.name.toUpperCase(), p.x, p.y + 14, v.w / 3.2);
      ctx.font = `700 ${Math.min(12, v.w / 34)}px ${FONT}`;
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillText(hero.title, p.x, p.y + 34, v.w / 3.2);
      ctx.fillStyle = "#c77dff";
      ctx.fillText(hero.finisher, p.x, p.y + 50, v.w / 3.2);
      const bw = Math.min(110, v.w / 4.2);
      bar(ctx, p.x - bw / 2, p.y + 62, bw * (hero.power / 1.2), 5, 1, ["#ff5d73", "#ff9933"], false);
      bar(ctx, p.x - bw / 2, p.y + 72, bw * (hero.speed / 1.2), 5, 1, ["#3ab0ff", "#7cffb2"], false);
    });
    ctx.font = `700 ${Math.min(15, v.w / 30)}px ${FONT}`;
    ctx.fillStyle = "#fff";
    ctx.fillText("← → or drag to choose   •   J / tap / PUNCH to pick", v.cx, v.h - 34, v.w - 20);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText("Red bar: power   •   Blue bar: speed", v.cx, v.h - 14, v.w - 20);
    return;
  }
  drawHud(ctx, v, g, clock);
  for (const p of g.pops) {
    const pt = project(p.x, p.y + 0.6, RING_Z / 2);
    if (!pt.visible) continue;
    const big = p.text.length <= 2;
    ctx.globalAlpha = Math.min(1, p.t * 3);
    ctx.font = `italic 900 ${big ? Math.min(90, v.w / 9) : Math.min(30, Math.max(15, v.w / 40))}px ${FONT}`;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillText(p.text, pt.x + 2, pt.y + 2);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, pt.x, pt.y);
    ctx.globalAlpha = 1;
  }
  drawBanner(ctx, v, g);
  if (g.phase === "fight" && g.phaseT < 7 && g.match === 0) {
    ctx.font = `700 ${Math.min(14, v.w / 32)}px ${FONT}`;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(
      v.w < 700 ? "Drag to move • buttons: punch, kick, grapple/pin, finisher" : "WASD / arrows move • J punch • K kick • L grapple, pin or pick up the chair • I finisher",
      v.cx,
      v.h - 22,
      v.w - 20,
    );
  }
}
