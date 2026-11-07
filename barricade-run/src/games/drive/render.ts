import { drawBarricade, drawPoliceBus } from "../shared/props";
import {
  box,
  type Ctx,
  drawBackdrop,
  drawCoin,
  drawHeartPickup,
  figure,
  heroRing,
  label,
  makeView,
  poly,
  project,
  type Rect,
  shadow,
  sirenGlow,
  slogan,
  type Sprite,
  strip,
  text,
  type View,
  vignette,
} from "../shared/scene";

import { CAM_BACK, CAM_BACK_PORTRAIT, CAM_H, CAR_HALF_W, CAR_LEN, LANE_COUNT, LANE_W, laneX, ROAD_HALF, VIEW_DIST } from "./constants";
import { type Debris, type DriveGame, type Obstacle, type Pickup, VEHICLE } from "./engine";

export function makeDriveView(w: number, h: number): View {
  return makeView(w, h, {
    height: CAM_H,
    back: CAM_BACK,
    portraitBack: CAM_BACK_PORTRAIT,
    sky: { top: "#070b24", mid: "#24184f", low: "#d9467a", far: "#251c47", near: "#15122c", moon: true },
  });
}

const SEG = 4;

/** Barricade Drive is the highway game: no buildings close by, just guardrails, gantries and the city far away. */
const RAIL_X = ROAD_HALF + 1.4;
const LAMP_GAP = 32;
const GANTRY_GAP = 220;
const AD_GAP = 70;

function drawRoad(ctx: Ctx, v: View, distance: number) {
  ctx.fillStyle = "#0d1118";
  ctx.fillRect(0, v.horizon, v.w, v.h - v.horizon);
  const far = VIEW_DIST + SEG;
  // Paved shoulder out to the guardrail, then dark verge.
  for (const side of [-1, 1]) strip(ctx, v, "#1b1d24", side * ROAD_HALF, side * RAIL_X, v.near, far);
  strip(ctx, v, "#24232c", -ROAD_HALF, ROAD_HALF, v.near, far);

  const first = Math.floor((distance + v.near) / SEG);
  const last = Math.ceil((distance + VIEW_DIST) / SEG);
  for (let i = last; i >= first; i--) {
    const z1 = i * SEG + SEG - distance;
    const z0 = Math.max(v.near, i * SEG - distance);
    if (z1 <= z0) continue;
    if (i % 2 === 0) {
      strip(ctx, v, "#292830", -ROAD_HALF, ROAD_HALF, z0, z1);
      for (const side of [-1, 1]) strip(ctx, v, "#121820", side * RAIL_X, side * (RAIL_X + 30), z0, z1);
    }
    if (i % 3 === 0) {
      for (let l = 1; l < LANE_COUNT; l++) {
        const lx = -ROAD_HALF + l * LANE_W;
        strip(ctx, v, "rgba(255,255,255,0.75)", lx - 0.08, lx + 0.08, z0, Math.min(z1, z0 + SEG * 0.9));
      }
    }
    // Reflective road studs on the edge lines.
    if (i % 2 === 0 && z0 < 70) {
      for (const side of [-1, 1]) {
        const p = project(v, side * (ROAD_HALF - 0.27), 0, z0);
        ctx.fillStyle = side < 0 ? "#ffb000" : "#ff3b3b";
        ctx.fillRect(p.x - 0.06 * p.s, p.y - 0.03 * p.s, 0.12 * p.s, 0.06 * p.s);
      }
    }
  }
  // Solid edge lines.
  for (const side of [-1, 1]) strip(ctx, v, "rgba(255,255,255,0.6)", side * (ROAD_HALF - 0.35), side * (ROAD_HALF - 0.2), v.near, far);
  // Steel guardrails: a long beam with posts.
  for (const side of [-1, 1]) {
    const x = side * RAIL_X;
    poly(ctx, v, "#5f6873", [[x, 0.55, v.near], [x, 0.85, v.near], [x, 0.85, far], [x, 0.55, far]]);
    poly(ctx, v, "#aab4bf", [[x, 0.78, v.near], [x, 0.85, v.near], [x, 0.85, far], [x, 0.78, far]]);
    for (let i = last; i >= first; i--) {
      const z = i * SEG - distance;
      if (z < v.near || z > 90) continue;
      const b = project(v, x, 0, z);
      const t = project(v, x, 0.85, z);
      ctx.fillStyle = "#3d444d";
      ctx.fillRect(b.x - 0.05 * b.s, t.y, 0.1 * b.s, b.y - t.y);
    }
  }
}

/** Pool of orange sodium light on the road under each highway lamp. */
function lampPool(ctx: Ctx, v: View, x: number, z: number) {
  const p = project(v, x, 0, z);
  if (p.s < 1.5) return;
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 5 * p.s);
  g.addColorStop(0, "rgba(255, 170, 70, 0.26)");
  g.addColorStop(1, "rgba(255, 170, 70, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, 5 * p.s, 1.6 * p.s, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Tall highway lamp leaning over the road. */
function drawHighwayLamp(ctx: Ctx, v: View, side: -1 | 1, z: number) {
  const x = side * (RAIL_X + 0.4);
  const base = project(v, x, 0, z);
  if (base.s < 1) return;
  const top = project(v, x, 10, z);
  const arm = project(v, x - side * 2.6, 10.3, z);
  ctx.strokeStyle = "#3a404a";
  ctx.lineWidth = Math.max(1, 0.16 * base.s);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.quadraticCurveTo(top.x, arm.y, arm.x, arm.y);
  ctx.stroke();
  const g = ctx.createRadialGradient(arm.x, arm.y, 0, arm.x, arm.y, 1.4 * base.s);
  g.addColorStop(0, "rgba(255, 190, 90, 0.75)");
  g.addColorStop(1, "rgba(255, 170, 70, 0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(arm.x, arm.y, 1.4 * base.s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd59a";
  ctx.fillRect(arm.x - 0.35 * base.s, arm.y - 0.05 * base.s, 0.7 * base.s, 0.12 * base.s);
}

const GANTRY_SIGNS: [string, string][] = [
  ["ANDOLAN MARG", "CITY CENTRE  ↑"],
  ["RE-NEET ROAD", "EXAM BHAWAN  →"],
  ["लोकतंत्र मार्ग", "DEMOCRACY CHOWK  ↑"],
];

/** Overhead green sign gantry spanning the highway. */
function drawGantry(ctx: Ctx, v: View, z: number, k: number) {
  const posts = { front: "#6c7682", side: "#4d5560", top: "#8a949f" };
  for (const side of [-1, 1]) box(ctx, v, side * (RAIL_X + 0.2), 0.3, 0, 7.4, z, z + 0.3, posts);
  box(ctx, v, 0, (RAIL_X + 0.2) * 2, 7.0, 7.4, z, z + 0.3, posts);
  const [top, bottom] = GANTRY_SIGNS[Math.abs(k) % GANTRY_SIGNS.length];
  for (const [i, line] of [top, bottom].entries()) {
    const cx = (i === 0 ? -1 : 1) * LANE_W;
    const r = box(ctx, v, cx, LANE_W * 1.7, 5.2, 6.9, z - 0.05, z, { front: "#0f6b3a", side: "#0b512c", top: "#13804a" });
    if (!r) continue;
    const img = label(`gantry|${line}`, 340, 120, (c, w, h) => {
      c.fillStyle = "#0f6b3a";
      c.fillRect(0, 0, w, h);
      c.strokeStyle = "#ffffff";
      c.lineWidth = 5;
      c.strokeRect(8, 8, w - 16, h - 16);
      text(c, line, w / 2, h / 2 + 2, h * 0.3, "#ffffff", w * 0.85);
    });
    ctx.drawImage(img, r.l, r.t, r.r - r.l, r.b - r.t);
  }
}

const ADS = ["STOP VOTE CHORI", "RE-NEET NOW", "NO MORE DHANDLI", "वोट चोरी बंद करो", "SAVE DEMOCRACY", "पेपर लीक बंद करो"];

/** Neon-edged roadside billboard on a tall pole beyond the guardrail. */
function drawAd(ctx: Ctx, v: View, side: -1 | 1, z: number, k: number) {
  const x = side * (RAIL_X + 6);
  const base = project(v, x, 0, z);
  if (base.s < 1) return;
  const a = project(v, x - 3, 9.5, z);
  const b = project(v, x + 3, 6.5, z);
  ctx.fillStyle = "#2a2f38";
  ctx.fillRect(base.x - 0.15 * base.s, b.y, 0.3 * base.s, base.y - b.y);
  const msg = ADS[Math.abs(k) % ADS.length];
  const neon = k % 2 ? "#ff3fa4" : "#3ad0ff";
  const img = label(`ad|${msg}|${neon}`, 360, 180, (c, w, h) => {
    c.fillStyle = "#0b0d16";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = neon;
    c.lineWidth = 8;
    c.shadowColor = neon;
    c.shadowBlur = 16;
    c.strokeRect(10, 10, w - 20, h - 20);
    c.shadowBlur = 10;
    slogan(c, msg, w / 2, h / 2, w - 40, h - 40, neon);
  });
  ctx.drawImage(img, a.x, a.y, b.x - a.x, b.y - a.y);
}

// ---- vehicles -----------------------------------------------------------------

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function wheels(ctx: Ctx, r: Rect, inset: number, size: number) {
  ctx.fillStyle = "#0b0b0e";
  const s = r.s;
  ctx.fillRect(r.l + inset * s, r.b - 0.05 * s, size * s, 0.32 * s);
  ctx.fillRect(r.r - (inset + size) * s, r.b - 0.05 * s, size * s, 0.32 * s);
}

function tailLights(ctx: Ctx, r: Rect, bright: boolean, y = 0.18) {
  const s = r.s;
  const h = 0.16 * s;
  ctx.fillStyle = bright ? "#ff2b3a" : "#a3161f";
  ctx.fillRect(r.l + 0.06 * s, r.t + y * s, 0.32 * s, h);
  ctx.fillRect(r.r - 0.38 * s, r.t + y * s, 0.32 * s, h);
  if (bright) {
    ctx.fillStyle = "rgba(255, 40, 60, 0.25)";
    for (const cx of [r.l + 0.22 * s, r.r - 0.22 * s]) {
      ctx.beginPath();
      ctx.arc(cx, r.t + (y + 0.08) * s, 0.45 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function plate(ctx: Ctx, r: Rect, str: string) {
  const s = r.s;
  const pw = 0.52 * s;
  const ph = 0.13 * s;
  const img = label(`plate|${str}`, 156, 40, (c, w, h) => {
    c.fillStyle = "#f7f3e3";
    c.fillRect(0, 0, w, h);
    c.strokeStyle = "#222";
    c.lineWidth = 3;
    c.strokeRect(0, 0, w, h);
    text(c, str, w / 2, h / 2 + 1, h * 0.62, "#111", w * 0.9);
  });
  ctx.drawImage(img, (r.l + r.r) / 2 - pw / 2, r.b - 0.3 * s, pw, ph);
}

/** Stuck traffic car seen from behind, hazard lights blinking. */
function drawCar(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = laneX(o.lane);
  const { w, len } = VEHICLE.car;
  shadow(ctx, v, x, o.z + 0.4, w * 0.62);
  const body = box(ctx, v, x, w, 0.3, 0.95, o.z, o.z + len, { front: o.color, side: shade(o.color, 0.75), top: shade(o.color, 1.1) });
  const cabin = box(ctx, v, x, w * 0.84, 0.95, 1.45, o.z + 0.9, o.z + len - 1, { front: shade(o.color, 0.9), side: shade(o.color, 0.7), top: shade(o.color, 1.05) });
  if (cabin) {
    ctx.fillStyle = "#14202e";
    const s = cabin.s;
    ctx.fillRect(cabin.l + 0.1 * s, cabin.t + 0.06 * s, cabin.r - cabin.l - 0.2 * s, cabin.b - cabin.t - 0.1 * s);
  }
  if (!body) return;
  wheels(ctx, body, 0.12, 0.34);
  ctx.fillStyle = "#1b1b1f";
  ctx.fillRect(body.l, body.b - 0.12 * body.s, body.r - body.l, 0.12 * body.s);
  tailLights(ctx, body, false);
  if (Math.sin(clock * 6 + o.seed) > 0) {
    ctx.fillStyle = "#ffb000";
    ctx.fillRect(body.l + 0.06 * body.s, body.t + 0.36 * body.s, 0.2 * body.s, 0.08 * body.s);
    ctx.fillRect(body.r - 0.26 * body.s, body.t + 0.36 * body.s, 0.2 * body.s, 0.08 * body.s);
  }
  plate(ctx, body, "DL 3C 2026");
}

function drawAuto(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = laneX(o.lane);
  const { w, len, h } = VEHICLE.auto;
  shadow(ctx, v, x, o.z + 0.3, w * 0.62);
  const body = box(ctx, v, x, w, 0.28, 0.95, o.z, o.z + len, { front: "#1f8a3a", side: "#166a2c", top: "#27a347" });
  const hood = box(ctx, v, x, w * 1.02, 0.95, h, o.z + 0.1, o.z + len - 0.6, { front: "#141414", side: "#0d0d0d", top: "#f2c200" });
  if (hood) {
    const s = hood.s;
    ctx.fillStyle = "#f2c200";
    ctx.fillRect(hood.l, hood.t, hood.r - hood.l, 0.12 * s);
    ctx.fillStyle = "#2a3644";
    ctx.fillRect(hood.l + 0.35 * s, hood.t + 0.25 * s, hood.r - hood.l - 0.7 * s, 0.3 * s);
  }
  if (!body) return;
  ctx.fillStyle = "#f2c200";
  ctx.fillRect(body.l, body.t, body.r - body.l, 0.14 * body.s);
  wheels(ctx, body, 0.06, 0.26);
  tailLights(ctx, body, Math.sin(clock * 5 + o.seed) > 0.6, 0.3);
}

/** Police Gypsy. Oncoming jeeps show their headlights; stuck ones their tail. */
function drawJeep(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = laneX(o.lane);
  const { w, len, h } = VEHICLE.jeep;
  shadow(ctx, v, x, o.z + 0.4, w * 0.62);
  const body = box(ctx, v, x, w, 0.4, 1.05, o.z, o.z + len, { front: "#f4f4f4", side: "#cfd4da", top: "#ffffff" });
  const top = box(ctx, v, x, w * 0.94, 1.05, h - 0.1, o.z + 0.3, o.z + len - 0.9, { front: "#e9ecef", side: "#c3c9d0", top: "#f8f9fa" });
  if (top) {
    const s = top.s;
    ctx.fillStyle = "#1a2433";
    ctx.fillRect(top.l + 0.12 * s, top.t + 0.1 * s, top.r - top.l - 0.24 * s, 0.38 * s);
    const blink = Math.sin(clock * 12 + o.seed) > 0;
    ctx.fillStyle = blink ? "#ff2d55" : "#5a1020";
    ctx.fillRect(top.l + 0.2 * s, top.t - 0.14 * s, (top.r - top.l) / 2 - 0.2 * s, 0.14 * s);
    ctx.fillStyle = blink ? "#13234a" : "#2d7dff";
    ctx.fillRect((top.l + top.r) / 2, top.t - 0.14 * s, (top.r - top.l) / 2 - 0.2 * s, 0.14 * s);
  }
  if (!body) return;
  const s = body.s;
  ctx.fillStyle = "#1d4ed8";
  ctx.fillRect(body.l, body.t + 0.22 * s, body.r - body.l, 0.1 * s);
  ctx.fillStyle = "#d62828";
  ctx.fillRect(body.l, body.t + 0.32 * s, body.r - body.l, 0.06 * s);
  wheels(ctx, body, 0.12, 0.36);
  const word = label("jeep-police", 200, 40, (c, cw, chh) => text(c, "POLICE", cw / 2, chh / 2, chh * 0.75, "#0b1730", cw));
  ctx.drawImage(word, body.l + (body.r - body.l) * 0.25, body.t + 0.03 * s, (body.r - body.l) * 0.5, 0.17 * s);
  if (o.vz > 0) {
    ctx.fillStyle = "#fff6b0";
    for (const hx of [body.l + 0.3 * s, body.r - 0.3 * s]) {
      ctx.beginPath();
      ctx.arc(hx, body.t + 0.48 * s, 0.13 * s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255, 246, 176, 0.16)";
    ctx.beginPath();
    ctx.arc((body.l + body.r) / 2, body.t + 0.5 * s, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
  } else {
    tailLights(ctx, body, false, 0.42);
  }
}

function drawCones(ctx: Ctx, v: View, o: Obstacle) {
  const x = laneX(o.lane);
  for (const dx of [-0.75, 0, 0.75]) {
    const b = project(v, x + dx, 0, o.z);
    const t = project(v, x + dx, VEHICLE.cones.h, o.z);
    if (b.s < 1) continue;
    const hw = 0.24 * b.s;
    ctx.fillStyle = "#ff6b1a";
    ctx.beginPath();
    ctx.moveTo(b.x - hw, b.y);
    ctx.lineTo(b.x + hw, b.y);
    ctx.lineTo(t.x + 0.04 * b.s, t.y);
    ctx.lineTo(t.x - 0.04 * b.s, t.y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f5f5f5";
    const my = b.y + (t.y - b.y) * 0.55;
    ctx.fillRect(b.x - hw * 0.62, my, hw * 1.24, 0.1 * b.s);
    ctx.fillStyle = "#222";
    ctx.fillRect(b.x - 0.32 * b.s, b.y - 0.05 * b.s, 0.64 * b.s, 0.06 * b.s);
  }
}

function drawPickup(ctx: Ctx, v: View, c: Pickup, clock: number) {
  const p = project(v, laneX(c.lane), 0.75 + Math.sin(clock * 4 + c.z) * 0.08, c.z);
  if (p.s < 1) return;
  if (c.kind === "coin") {
    drawCoin(ctx, p.x, p.y, 0.32 * p.s, Math.cos(clock * 5 + c.z * 0.3));
    return;
  }
  if (c.kind === "lifeline") {
    drawHeartPickup(ctx, p.x, p.y, p.s, clock);
    return;
  }
  // Nitro canister.
  const s = p.s * (1 + Math.sin(clock * 6) * 0.05);
  ctx.fillStyle = "rgba(60, 170, 255, 0.28)";
  ctx.beginPath();
  ctx.arc(p.x, p.y, 0.75 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1e6fff";
  ctx.beginPath();
  ctx.roundRect(p.x - 0.2 * s, p.y - 0.36 * s, 0.4 * s, 0.72 * s, 0.1 * s);
  ctx.fill();
  ctx.fillStyle = "#cfe6ff";
  ctx.fillRect(p.x - 0.08 * s, p.y - 0.46 * s, 0.16 * s, 0.1 * s);
  ctx.fillStyle = "#ffcc00";
  ctx.beginPath();
  ctx.moveTo(p.x + 0.04 * s, p.y - 0.22 * s);
  ctx.lineTo(p.x - 0.1 * s, p.y + 0.04 * s);
  ctx.lineTo(p.x, p.y + 0.04 * s);
  ctx.lineTo(p.x - 0.04 * s, p.y + 0.24 * s);
  ctx.lineTo(p.x + 0.1 * s, p.y - 0.04 * s);
  ctx.lineTo(p.x, p.y - 0.04 * s);
  ctx.closePath();
  ctx.fill();
}

function drawDebris(ctx: Ctx, v: View, d: Debris, clock: number) {
  const p = project(v, d.x, d.y, d.z);
  const size = 0.22 * p.s;
  if (size < 1) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(clock * d.spin);
  ctx.fillStyle = d.color;
  ctx.fillRect(-size, -size * 0.4, size * 2, size * 0.8);
  ctx.restore();
}

/** Police motorbike with a rider, seen from behind. Flanks the player during a chase. */
function drawBike(ctx: Ctx, v: View, x: number, z: number, clock: number) {
  const p = project(v, x, 0, z);
  if (p.s < 1) return;
  const s = p.s;
  shadow(ctx, v, x, z, 0.4);
  ctx.fillStyle = "#0e0e10";
  ctx.beginPath();
  ctx.roundRect(p.x - 0.07 * s, p.y - 0.62 * s, 0.14 * s, 0.62 * s, 0.06 * s);
  ctx.fill();
  ctx.fillStyle = "#e9ecef";
  ctx.beginPath();
  ctx.roundRect(p.x - 0.22 * s, p.y - 0.95 * s, 0.44 * s, 0.38 * s, 0.08 * s);
  ctx.fill();
  const blink = Math.sin(clock * 12) > 0;
  ctx.fillStyle = blink ? "#ff2d55" : "#2d7dff";
  ctx.fillRect(p.x - 0.12 * s, p.y - 0.9 * s, 0.24 * s, 0.08 * s);
  figure(ctx, p.x, p.y - 0.55 * s, s * 0.82, { shirt: "#b59a6a", pants: "#a08657", skin: "#a5694f", back: true, helmet: "#f1f1f1", belt: "#4a2f1a" }, { phase: 0, carry: true });
  if (blink) {
    ctx.fillStyle = "rgba(255, 45, 85, 0.25)";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 2.1 * s, 0.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---- the player's car ---------------------------------------------------------------

/** Mumbai kaali-peeli taxi: black body, yellow roof, the hero visible through the rear window. */
function drawTaxi(ctx: Ctx, v: View, game: DriveGame, clock: number) {
  const c = game.car;
  shadow(ctx, v, c.x, 0.6, CAR_HALF_W + 0.25, 0.5);
  heroRing(ctx, v, c.x, 0.4, 1.25, game.boosting ? "rgba(80, 180, 255, 0.7)" : "rgba(255, 204, 0, 0.55)");
  if (c.invulnT > 0 && Math.sin(clock * 30) > 0.3) return;
  const lean = Math.max(-0.12, Math.min(0.12, c.lean * 0.05));
  const bounce = Math.sin(clock * 22) * 0.012 * (game.speed / 30);
  const w = CAR_HALF_W * 2;
  const body = box(ctx, v, c.x, w, 0.3 + bounce, 0.98 + bounce, 0, CAR_LEN, { front: "#141417", side: "#0c0c0e", top: "#1d1d21" });
  const cabin = box(ctx, v, c.x + lean, w * 0.86, 0.98 + bounce, 1.5 + bounce, 1.0, CAR_LEN - 1.1, { front: "#141417", side: "#0e0e10", top: "#ffcc00" });
  if (cabin) {
    const s = cabin.s;
    ctx.fillStyle = "#ffcc00";
    ctx.fillRect(cabin.l, cabin.t, cabin.r - cabin.l, 0.09 * s);
    // Rear window with the driver: tricolour headband and dark hair.
    const gl = cabin.l + 0.1 * s;
    const gt = cabin.t + 0.12 * s;
    const gw = cabin.r - cabin.l - 0.2 * s;
    const gh = cabin.b - cabin.t - 0.16 * s;
    const glass = ctx.createLinearGradient(0, gt, 0, gt + gh);
    glass.addColorStop(0, "#3a4f6e");
    glass.addColorStop(1, "#141d2b");
    ctx.fillStyle = glass;
    ctx.fillRect(gl, gt, gw, gh);
    const hx = gl + gw * 0.32;
    const hy = gt + gh * 0.62;
    ctx.fillStyle = "#16110e";
    ctx.beginPath();
    ctx.ellipse(hx, hy, 0.13 * s, 0.16 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ["#ff9933", "#ffffff", "#138808"].forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.fillRect(hx - 0.13 * s, hy - 0.08 * s + i * 0.03 * s, 0.26 * s, 0.03 * s);
    });
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.moveTo(gl + gw * 0.55, gt);
    ctx.lineTo(gl + gw * 0.75, gt);
    ctx.lineTo(gl + gw * 0.5, gt + gh);
    ctx.lineTo(gl + gw * 0.3, gt + gh);
    ctx.closePath();
    ctx.fill();
    // Roof light.
    const sign = label("taxi-sign", 160, 48, (cx, cw, chh) => {
      cx.fillStyle = "#ffe066";
      cx.fillRect(0, 0, cw, chh);
      cx.strokeStyle = "#111";
      cx.lineWidth = 4;
      cx.strokeRect(0, 0, cw, chh);
      text(cx, "TAXI", cw / 2, chh / 2 + 1, chh * 0.7, "#111", cw * 0.9);
    });
    const tw = 0.6 * s;
    const top = project(v, c.x + lean, 1.5 + bounce, 1.6);
    ctx.drawImage(sign, top.x - tw / 2, top.y - 0.2 * top.s, tw * (top.s / s), 0.2 * top.s);
  }
  if (!body) return;
  const s = body.s;
  ctx.fillStyle = "#ffcc00";
  ctx.fillRect(body.l, body.t, body.r - body.l, 0.06 * s);
  wheels(ctx, body, 0.14, 0.38);
  // Chrome bumper.
  ctx.fillStyle = "#b9c0c8";
  ctx.fillRect(body.l - 0.04 * s, body.b - 0.16 * s, body.r - body.l + 0.08 * s, 0.1 * s);
  tailLights(ctx, body, game.braking, 0.14);
  plate(ctx, body, "MH 01 AP 26");

  if (game.boosting) {
    // Exhaust flames and a blue glow.
    const ex = body.l + 0.35 * s;
    const ey = body.b - 0.06 * s;
    const flick = 0.7 + Math.random() * 0.5;
    const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 0.6 * s * flick);
    g.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    g.addColorStop(0.3, "rgba(90, 190, 255, 0.85)");
    g.addColorStop(1, "rgba(30, 90, 255, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(ex, ey + 0.1 * s, 0.22 * s * flick, 0.55 * s * flick, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Streaks at the screen edges while the nitro is burning. */
export function speedLines(ctx: Ctx, v: View, clock: number) {
  ctx.strokeStyle = "rgba(200, 230, 255, 0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  const cx = v.cx;
  const cy = v.horizon + (v.h - v.horizon) * 0.25;
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + clock * 0.3;
    const t = (clock * 2.4 + i * 0.37) % 1;
    const r0 = Math.max(v.w, v.h) * (0.35 + t * 0.5);
    const r1 = r0 + Math.max(v.w, v.h) * 0.12;
    ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.7);
    ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * 0.7);
  }
  ctx.stroke();
}

export function renderDrive(ctx: Ctx, v: View, game: DriveGame, clock: number) {
  v.camX += (game.car.x * 0.6 - v.camX) * 0.12;

  drawBackdrop(ctx, v);
  drawRoad(ctx, v, game.distance);
  const d = game.distance;
  const lampStart = Math.ceil((d + v.near) / LAMP_GAP);
  for (let k = lampStart; k * LAMP_GAP - d < VIEW_DIST * 0.7; k++) {
    const z = k * LAMP_GAP - d;
    lampPool(ctx, v, -ROAD_HALF + 2.4, z);
    lampPool(ctx, v, ROAD_HALF - 2.4, z);
  }

  const sprites: Sprite[] = [];
  game.crowd.sprites(ctx, v, clock, VIEW_DIST, sprites);
  for (let k = lampStart; k * LAMP_GAP - d < VIEW_DIST; k++) {
    const z = k * LAMP_GAP - d;
    if (z < 4) continue;
    for (const side of [-1, 1] as const) sprites.push({ z: z + 0.01, draw: () => drawHighwayLamp(ctx, v, side, z) });
  }
  for (let k = Math.ceil((d + 6) / GANTRY_GAP); k * GANTRY_GAP - d < VIEW_DIST; k++) {
    const z = k * GANTRY_GAP - d;
    sprites.push({ z: z + 0.02, draw: () => drawGantry(ctx, v, z, k) });
  }
  for (let k = Math.ceil((d + 4) / AD_GAP); k * AD_GAP - d < VIEW_DIST; k++) {
    const z = k * AD_GAP - d;
    const side = k % 2 ? 1 : -1;
    sprites.push({ z: z + 0.03, draw: () => drawAd(ctx, v, side, z, k) });
  }
  for (const o of game.obstacles) {
    if (o.z > VIEW_DIST || o.z + o.len < v.near) continue;
    const draw =
      o.kind === "car"
        ? () => drawCar(ctx, v, o, clock)
        : o.kind === "auto"
          ? () => drawAuto(ctx, v, o, clock)
          : o.kind === "jeep"
            ? () => drawJeep(ctx, v, o, clock)
            : o.kind === "bus"
              ? () => drawPoliceBus(ctx, v, laneX(o.lane), o.z, o.len, o.vz > 0, clock)
              : o.kind === "barricade"
                ? () => drawBarricade(ctx, v, laneX(o.lane), o.z, clock, VEHICLE.barricade.w)
                : () => drawCones(ctx, v, o);
    sprites.push({ z: o.z, draw });
  }
  for (const c of game.pickups) {
    if (!c.taken && c.z > v.near && c.z < VIEW_DIST) sprites.push({ z: c.z, draw: () => drawPickup(ctx, v, c, clock) });
  }
  for (const d of game.debris) sprites.push({ z: d.z, draw: () => drawDebris(ctx, v, d, clock) });
  sprites.push({ z: 0, draw: () => drawTaxi(ctx, v, game, clock) });
  if (game.chaserZ > v.near + 0.5) {
    for (const dx of [-1.9, 1.9]) {
      sprites.push({ z: game.chaserZ, draw: () => drawBike(ctx, v, game.car.x + dx, game.chaserZ, clock + dx) });
    }
  }
  sprites.sort((a, b) => b.z - a.z);
  for (const sp of sprites) sp.draw();

  if (game.boosting) speedLines(ctx, v, clock);
  vignette(ctx, v);
  sirenGlow(ctx, v, clock, game.chaseT);
}
