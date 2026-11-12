import { drawBarricade, drawOfficer, drawPoliceLine } from "../shared/props";
import { hash } from "../shared/random";
import {
  box,
  type Ctx,
  curvedStrip,
  drawBackdrop,
  drawCoin,
  drawHeartPickup,
  hero,
  heroRing,
  label,
  makeView,
  poly,
  project,
  type Rect,
  shadow,
  sirenGlow,
  type Sprite,
  text,
  tricolour,
  type View,
  vignette,
} from "../shared/scene";

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
import { OBSTACLE, type Obstacle, type Pickup, type RailGame } from "./engine";

/** Rail Roko is the daytime game: out of the city, under a blue sky, past fields and small stations. */
export function makeRailView(w: number, h: number): View {
  return makeView(w, h, {
    height: CAM_H,
    back: CAM_BACK,
    portraitBack: CAM_BACK_PORTRAIT,
    sky: { top: "#3d8fe0", mid: "#8cc6f2", low: "#ffe7b8", far: "#7aa8a0", near: "#5e9165", day: true, hills: true },
  });
}

const SEG = 4;
const SLEEPER_GAP = 1.1;
const SLEEPER_DIST = 75;
const FIELDS_END = 70;

/** Whether world position d is inside a station. */
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

function drawTrackBed(ctx: Ctx, v: View, game: RailGame) {
  // Green countryside under everything.
  const ground = ctx.createLinearGradient(0, v.horizon, 0, v.h);
  ground.addColorStop(0, "#7fae63");
  ground.addColorStop(1, "#4f8a3c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, v.horizon, v.w, v.h - v.horizon);
  const far = VIEW_DIST + SEG;
  const d = game.distance;

  // Crop strips in the fields, so the ground visibly rushes past.
  const first = Math.floor((d + v.near) / SEG);
  const last = Math.ceil((d + VIEW_DIST) / SEG);
  for (let i = last; i >= first; i--) {
    const z1 = i * SEG + SEG - d;
    const z0 = Math.max(v.near, i * SEG - d);
    if (z1 <= z0 || i % 3 !== 0) continue;
    for (const side of [-1, 1]) curvedStrip(ctx, v, hash(i, side) > 0.5 ? "#8bbd5f" : "#6c9f4c", side * PLATFORM_END, side * FIELDS_END, z0, z1);
  }

  for (const side of [-1, 1]) curvedStrip(ctx, v, "#8d8166", side * PLATFORM_X, side * PLATFORM_END, v.near, far, PLATFORM_H);
  // Light gravel cess under and between the three lines.
  curvedStrip(ctx, v, "#b0a490", -BALLAST_HALF - 0.9, BALLAST_HALF + 0.9, v.near, far);

  for (let i = last; i >= first; i--) {
    const z1 = i * SEG + SEG - d;
    const z0 = Math.max(v.near, i * SEG - d);
    if (z1 <= z0) continue;
    const station = inStation(i * SEG);
    for (const side of [-1, 1]) {
      const x = side * PLATFORM_X;
      if (station) {
        // Concrete platform with the yellow safety line.
        curvedStrip(ctx, v, i % 2 ? "#d3cdc2" : "#c9c3b8", x, side * PLATFORM_END, z0, z1, PLATFORM_H);
        curvedStrip(ctx, v, "#f5c518", side * (PLATFORM_X + 0.25), side * (PLATFORM_X + 0.45), z0, z1, PLATFORM_H + 0.01);
        poly(ctx, v, "#8f887c", [[x, 0, z0], [x, PLATFORM_H, z0], [x, PLATFORM_H, z1], [x, 0, z1]]);
      } else {
        // Earth embankment between stations.
        if (i % 2 === 0) curvedStrip(ctx, v, "#978a6c", x, side * PLATFORM_END, z0, z1, PLATFORM_H);
        poly(ctx, v, i % 2 ? "#6f6450" : "#776b55", [[x, 0, z0], [x, PLATFORM_H, z0], [x, PLATFORM_H, z1], [x, 0, z1]]);
      }
    }
  }

  // Each line sits on its own dark ballast bed, only where it still has rails, so the three
  // tracks read clearly and a missing stretch shows as bare gravel.
  for (const lane of [-1, 0, 1] as Track[]) {
    const cx = lane * LANE_W;
    for (const [a, b] of railSpans(game, lane, v.near, far)) {
      curvedStrip(ctx, v, "#5f5852", cx - 1.25, cx + 1.25, a, b, 0.02);
      curvedStrip(ctx, v, "#6c645c", cx - 0.95, cx + 0.95, a, b, 0.03);
    }
  }

  // Concrete sleepers, one batched path per line.
  const sFirst = Math.floor((d + v.near) / SLEEPER_GAP);
  const sLast = Math.ceil((d + SLEEPER_DIST) / SLEEPER_GAP);
  for (const lane of [-1, 0, 1] as Track[]) {
    const cx = lane * LANE_W;
    ctx.fillStyle = "#cfc8bc";
    ctx.beginPath();
    for (let i = sLast; i >= sFirst; i--) {
      const z0 = i * SLEEPER_GAP - d;
      if (z0 < v.near || !game.hasRail(lane, z0, z0 + 0.26)) continue;
      const p0 = project(v, cx - 1.05, 0.06, z0);
      const p1 = project(v, cx + 1.05, 0.06, z0);
      const p2 = project(v, cx + 1.05, 0.06, z0 + 0.26);
      const p3 = project(v, cx - 1.05, 0.06, z0 + 0.26);
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.lineTo(p3.x, p3.y);
      ctx.closePath();
    }
    ctx.fill();
  }
  // Rails: dark web, bright running surface.
  for (const lane of [-1, 0, 1] as Track[]) {
    const cx = lane * LANE_W;
    for (const [a, b] of railSpans(game, lane, v.near, VIEW_DIST)) {
      for (const gx of [-GAUGE_HALF, GAUGE_HALF]) {
        curvedStrip(ctx, v, "#4d5158", cx + gx - 0.08, cx + gx + 0.08, a, b, 0.12);
        curvedStrip(ctx, v, "#f4f7fb", cx + gx - 0.035, cx + gx + 0.035, a, b, 0.17);
      }
      // End of the line: a red-and-white stop board where the rails run out ahead.
      if (b < VIEW_DIST - 1) {
        const e = project(v, cx, 0.2, b);
        const sz = Math.max(3, 0.9 * e.s);
        ctx.fillStyle = "#c1272d";
        ctx.fillRect(e.x - sz, e.y - sz * 0.9, sz * 2, sz * 0.9);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(e.x - sz, e.y - sz * 0.55, sz * 2, sz * 0.22);
      }
    }
  }
}

/** Overhead electric contact wires above each track. */
function drawWires(ctx: Ctx, v: View) {
  ctx.strokeStyle = "rgba(40, 44, 52, 0.75)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (const lane of [-1, 0, 1]) {
    for (let z = v.near + 0.5; z < 110; z += 6) {
      const p = project(v, lane * LANE_W, 6.0, z);
      if (z === v.near + 0.5) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  }
  ctx.stroke();
}

function drawMast(ctx: Ctx, v: View, side: -1 | 1, z: number) {
  const x = side * (PLATFORM_X + 0.6);
  const base = project(v, x, PLATFORM_H, z);
  if (base.s < 1) return;
  const top = project(v, x, 7.2, z);
  const arm = project(v, -side * (LANE_W + 0.8), 6.6, z);
  ctx.strokeStyle = "#59606b";
  ctx.lineWidth = Math.max(1, 0.2 * base.s);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();
  ctx.lineWidth = Math.max(1, 0.08 * base.s);
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(arm.x, arm.y);
  ctx.stroke();
}

/** A leafy tree out in the fields. */
function drawTree(ctx: Ctx, v: View, x: number, z: number, size: number, tint: number) {
  const base = project(v, x, 0, z);
  if (base.s * size < 2) return;
  const k = base.s * size;
  const greens = ["#3f7d3a", "#4e8f3f", "#2f6b33"];
  ctx.fillStyle = "#6b4a2b";
  ctx.fillRect(base.x - 0.12 * k, base.y - 1.6 * k, 0.24 * k, 1.6 * k);
  ctx.fillStyle = greens[Math.abs(tint) % 3];
  ctx.beginPath();
  ctx.arc(base.x, base.y - 2.3 * k, 1.0 * k, 0, Math.PI * 2);
  ctx.arc(base.x - 0.7 * k, base.y - 1.8 * k, 0.75 * k, 0, Math.PI * 2);
  ctx.arc(base.x + 0.7 * k, base.y - 1.9 * k, 0.8 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255, 255, 210, 0.16)";
  ctx.beginPath();
  ctx.arc(base.x - 0.3 * k, base.y - 2.6 * k, 0.55 * k, 0, Math.PI * 2);
  ctx.fill();
}

/** Wooden telegraph pole with a cross-arm. */
function drawPole(ctx: Ctx, v: View, x: number, z: number) {
  const b = project(v, x, 0, z);
  if (b.s < 1) return;
  const t = project(v, x, 7, z);
  ctx.fillStyle = "#5c4330";
  ctx.fillRect(b.x - 0.08 * b.s, t.y, 0.16 * b.s, b.y - t.y);
  ctx.fillRect(b.x - 0.7 * b.s, t.y + 0.3 * b.s, 1.4 * b.s, 0.1 * b.s);
}

/** Platform shelter: two pillars and a red roof. */
function drawShelter(ctx: Ctx, v: View, side: -1 | 1, z: number) {
  const x = side * (PLATFORM_X + 2.4);
  const p = project(v, x, PLATFORM_H, z);
  if (p.s < 1.5) return;
  for (const dx of [-1.4, 1.4]) {
    box(ctx, v, x + dx, 0.18, PLATFORM_H, PLATFORM_H + 3.2, z, z + 0.18, { front: "#d7cfc2", side: "#b5ad9f", top: "#e8e1d6" });
  }
  const roof = box(ctx, v, x, 4.2, PLATFORM_H + 3.2, PLATFORM_H + 3.5, z - 3, z + 3, { front: "#b23a2e", side: "#8e2c22", top: "#c84a3c" });
  if (roof) {
    ctx.fillStyle = "#f2e6c9";
    ctx.fillRect(roof.l, roof.b - 0.06 * roof.s, roof.r - roof.l, 0.06 * roof.s);
  }
}

/** Yellow Indian Railways station board. */
function drawStationBoard(ctx: Ctx, v: View, side: -1 | 1, z: number) {
  const x = side * (PLATFORM_X + 2.5);
  const a = project(v, x - 1.6, PLATFORM_H + 3.0, z);
  const b = project(v, x + 1.6, PLATFORM_H + 1.9, z);
  const l = Math.min(a.x, b.x);
  const r = Math.max(a.x, b.x);
  if (r - l < 6) return;
  const legL = project(v, x - 1.2, PLATFORM_H, z);
  const legR = project(v, x + 1.2, PLATFORM_H, z);
  ctx.fillStyle = "#222";
  ctx.fillRect(legL.x, b.y, Math.max(1, 0.08 * a.s), legL.y - b.y);
  ctx.fillRect(legR.x, b.y, Math.max(1, 0.08 * a.s), legR.y - b.y);
  const img = label("station-board", 360, 130, (c, w, h) => {
    c.fillStyle = "#111";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#ffd60a";
    c.fillRect(5, 5, w - 10, h - 10);
    text(c, "आंदोलन जं.", w / 2, h * 0.32, h * 0.3, "#111", w * 0.9);
    text(c, "ANDOLAN JN.", w / 2, h * 0.7, h * 0.3, "#111", w * 0.9);
  });
  ctx.drawImage(img, l, a.y, r - l, b.y - a.y);
}

// ---- obstacles ----------------------------------------------------------------

function sideWindows(ctx: Ctx, v: View, x: number, w: number, z: number, z1: number, y0: number, y1: number, color: string) {
  const xl = x - w / 2;
  const xr = x + w / 2;
  const bend = v.curve * Math.max(z, v.near) ** 2;
  const sideX = v.camX < xl + bend ? xl : v.camX > xr + bend ? xr : null;
  if (sideX === null) return;
  for (let wz = z + 1.2; wz < z1 - 1; wz += 1.9) {
    if (wz < v.near) continue;
    poly(ctx, v, color, [[sideX, y0, wz], [sideX, y1, wz], [sideX, y1, wz + 1.1], [sideX, y0, wz + 1.1]]);
  }
}

function bogies(ctx: Ctx, r: Rect) {
  const s = r.s;
  ctx.fillStyle = "#16161a";
  ctx.fillRect(r.l + 0.25 * s, r.b, r.r - r.l - 0.5 * s, 0.38 * s);
  ctx.fillStyle = "#2b2b31";
  ctx.fillRect(r.l + 0.35 * s, r.b + 0.05 * s, 0.4 * s, 0.3 * s);
  ctx.fillRect(r.r - 0.75 * s, r.b + 0.05 * s, 0.4 * s, 0.3 * s);
}

/** Last coach of a stopped train: blue ICF coach with the yellow X board and a red tail lamp. */
function drawCoach(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = o.lane * LANE_W;
  const { w, h } = OBSTACLE.coach;
  shadow(ctx, v, x, o.z + 0.4, w * 0.6);
  const r = box(ctx, v, x, w, 0.55, h, o.z, o.z + o.len, { front: "#1d4e89", side: "#173f70", top: "#5d6b7d" });
  sideWindows(ctx, v, x, w, o.z, o.z + o.len, 2.0, 2.9, "#0d1b2a");
  if (!r) return;
  const s = r.s;
  ctx.fillStyle = "#f1e3c2";
  ctx.fillRect(r.l, r.t + 1.1 * s, r.r - r.l, 0.18 * s);
  // Gangway door.
  ctx.fillStyle = "#12325a";
  ctx.fillRect((r.l + r.r) / 2 - 0.45 * s, r.t + 0.45 * s, 0.9 * s, (r.b - r.t) - 0.6 * s);
  bogies(ctx, r);
  const xb = label("x-board", 80, 80, (c, cw, chh) => {
    c.fillStyle = "#ffd60a";
    c.fillRect(0, 0, cw, chh);
    c.strokeStyle = "#111";
    c.lineWidth = 14;
    c.beginPath();
    c.moveTo(12, 12);
    c.lineTo(cw - 12, chh - 12);
    c.moveTo(cw - 12, 12);
    c.lineTo(12, chh - 12);
    c.stroke();
  });
  ctx.drawImage(xb, r.l + 0.2 * s, r.t + 1.5 * s, 0.6 * s, 0.6 * s);
  if (Math.sin(clock * 4 + o.z) > 0) {
    ctx.fillStyle = "#ff2b3a";
    ctx.beginPath();
    ctx.arc(r.r - 0.45 * s, r.t + 1.8 * s, 0.14 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 40, 60, 0.25)";
    ctx.beginPath();
    ctx.arc(r.r - 0.45 * s, r.t + 1.8 * s, 0.5 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Red-and-white electric locomotive. Moving ones have the headlight on. */
function drawLoco(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = o.lane * LANE_W;
  const { w, h } = OBSTACLE.loco;
  shadow(ctx, v, x, o.z + 0.4, w * 0.6);
  const r = box(ctx, v, x, w, 0.55, h, o.z, o.z + o.len, { front: "#c62828", side: "#9e1f1f", top: "#6f7884" });
  sideWindows(ctx, v, x, w, o.z, o.z + o.len, 2.6, 3.4, "#20232b");
  if (!r) return;
  const s = r.s;
  const mid = (r.l + r.r) / 2;
  ctx.fillStyle = "#f4f1e8";
  ctx.fillRect(r.l, r.t + 2.3 * s, r.r - r.l, 0.22 * s);
  ctx.fillStyle = "#ffcc00";
  ctx.fillRect(r.l, r.t + 2.55 * s, r.r - r.l, 0.1 * s);
  // Cab windows.
  ctx.fillStyle = "#1a2433";
  ctx.fillRect(r.l + 0.2 * s, r.t + 0.6 * s, (r.r - r.l) / 2 - 0.3 * s, 0.9 * s);
  ctx.fillRect(mid + 0.1 * s, r.t + 0.6 * s, (r.r - r.l) / 2 - 0.3 * s, 0.9 * s);
  // Cow-catcher.
  ctx.fillStyle = "#2b2b31";
  ctx.beginPath();
  ctx.moveTo(r.l + 0.1 * s, r.b - 0.2 * s);
  ctx.lineTo(r.r - 0.1 * s, r.b - 0.2 * s);
  ctx.lineTo(r.r - 0.45 * s, r.b + 0.35 * s);
  ctx.lineTo(r.l + 0.45 * s, r.b + 0.35 * s);
  ctx.closePath();
  ctx.fill();
  const lit = o.vz > 0;
  ctx.fillStyle = lit ? "#fffbe0" : "#9a937a";
  ctx.beginPath();
  ctx.arc(mid, r.t + 0.3 * s, 0.17 * s, 0, Math.PI * 2);
  ctx.fill();
  for (const hx of [r.l + 0.4 * s, r.r - 0.4 * s]) {
    ctx.beginPath();
    ctx.arc(hx, r.t + 2.95 * s, 0.11 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (lit) {
    const g = ctx.createRadialGradient(mid, r.t + 0.3 * s, 0, mid, r.t + 0.3 * s, 2.6 * s);
    g.addColorStop(0, `rgba(255, 250, 210, ${0.4 + Math.sin(clock * 20) * 0.05})`);
    g.addColorStop(1, "rgba(255, 250, 210, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(mid, r.t + 0.3 * s, 2.6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Buffer stop at the end of a pulled-up track. */
function drawBuffer(ctx: Ctx, v: View, o: Obstacle, clock: number) {
  const x = o.lane * LANE_W;
  const { w, h } = OBSTACLE.buffer;
  shadow(ctx, v, x, o.z + 0.3, w * 0.55);
  const r = box(ctx, v, x, w, 0.3, h, o.z, o.z + o.len, { front: "#c1121f", side: "#8f0d17", top: "#e03a45" });
  if (!r) return;
  const s = r.s;
  ctx.save();
  ctx.beginPath();
  ctx.rect(r.l, r.t, r.r - r.l, r.b - r.t);
  ctx.clip();
  ctx.fillStyle = "#f5f5f5";
  const step = 0.3 * s;
  for (let sx = r.l - (r.b - r.t); sx < r.r; sx += step * 2) {
    ctx.beginPath();
    ctx.moveTo(sx, r.b);
    ctx.lineTo(sx + step, r.b);
    ctx.lineTo(sx + step + (r.b - r.t), r.t);
    ctx.lineTo(sx + (r.b - r.t), r.t);
    ctx.fill();
  }
  ctx.restore();
  // Spring buffers and a red lamp on top.
  ctx.fillStyle = "#222";
  ctx.fillRect(r.l + 0.25 * s, r.t + 0.35 * s, 0.35 * s, 0.25 * s);
  ctx.fillRect(r.r - 0.6 * s, r.t + 0.35 * s, 0.35 * s, 0.25 * s);
  ctx.fillStyle = Math.sin(clock * 6) > 0 ? "#ff2b3a" : "#5a1020";
  ctx.beginPath();
  ctx.arc((r.l + r.r) / 2, r.t - 0.15 * s, 0.14 * s, 0, Math.PI * 2);
  ctx.fill();
  const plateImg = label("track-closed", 220, 60, (c, cw, chh) => {
    c.fillStyle = "#fff";
    c.fillRect(0, 0, cw, chh);
    text(c, "रेल रोको", cw / 2, chh / 2 + 1, chh * 0.6, "#c1121f", cw * 0.9);
  });
  ctx.drawImage(plateImg, (r.l + r.r) / 2 - 0.55 * s, r.t + 0.62 * s, 1.1 * s, 0.3 * s);
}

function drawPickup(ctx: Ctx, v: View, c: Pickup, clock: number) {
  const p = project(v, c.lane * LANE_W, c.y + Math.sin(clock * 4 + c.z) * 0.08, c.z);
  if (p.s < 1) return;
  if (c.kind === "coin") drawCoin(ctx, p.x, p.y, 0.3 * p.s, Math.cos(clock * 5 + c.z * 0.3));
  else drawHeartPickup(ctx, p.x, p.y, p.s, clock);
}


// ---- the trolley ----------------------------------------------------------------

function drawTrolley(ctx: Ctx, v: View, game: RailGame, clock: number) {
  const c = game.cart;
  shadow(ctx, v, c.x, 0.4, CART_HALF_W + 0.2, 0.45);
  heroRing(ctx, v, c.x, 0.4, 1.05);
  if (c.invulnT > 0 && Math.sin(clock * 30) > 0.3) return;
  // A small rattle on the rail joints that grows with speed. The trolley never leaves the rails.
  const rattle = Math.sin(clock * 31) * 0.012 * (game.speed / 20);
  const base = project(v, c.x, 0, -CART_BACK);
  ctx.save();
  ctx.translate(base.x, base.y);
  ctx.rotate(Math.max(-0.25, Math.min(0.25, c.tilt)));
  ctx.translate(-base.x, -base.y);

  const w = CART_HALF_W * 2;
  const colors = { front: "#e0a526", side: "#a8761a", top: "#3b2a12" };
  const r = box(ctx, v, c.x, w, 0.25 + rattle, 1.1 + rattle, -CART_BACK, CART_FRONT, colors);
  // Flag pole on the front corner, behind the rider.
  const pole = project(v, c.x + 0.62, 1.1, CART_FRONT - 0.2);
  const poleTop = project(v, c.x + 0.62, 3.2, CART_FRONT - 0.2);
  ctx.strokeStyle = "#8b5a2b";
  ctx.lineWidth = Math.max(1, 0.05 * pole.s);
  ctx.beginPath();
  ctx.moveTo(pole.x, pole.y);
  ctx.lineTo(poleTop.x, poleTop.y);
  ctx.stroke();
  tricolour(ctx, poleTop.x, poleTop.y, pole.s, clock * 9, -1);

  // Rider stands inside: draw them, then the back panel of the cart over their legs.
  const floor = project(v, c.x, 0.3 + rattle, 0.3);
  hero(ctx, floor.x, floor.y, floor.s, { phase: c.phase, clock, crouch: game.ducking, brace: true });
  if (!r) {
    ctx.restore();
    return;
  }
  const s = r.s;
  ctx.fillStyle = colors.front;
  ctx.fillRect(r.l, r.t, r.r - r.l, r.b - r.t);
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(r.l, r.t + (r.b - r.t) * 0.48, r.r - r.l, 0.04 * s);
  ctx.fillStyle = "#3b2a12";
  ctx.fillRect(r.l, r.t, r.r - r.l, 0.06 * s);
  ctx.fillStyle = "#6b4a10";
  for (const fx of [0.08, 0.92]) {
    for (const fy of [0.2, 0.8]) {
      ctx.beginPath();
      ctx.arc(r.l + (r.r - r.l) * fx, r.t + (r.b - r.t) * fy, 0.03 * s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const stencil = label("cart-stencil", 240, 60, (cx, cw, chh) => text(cx, "RAIL ROKO", cw / 2, chh / 2 + 2, chh * 0.62, "#2a1c08", cw * 0.92));
  ctx.drawImage(stencil, r.l + (r.r - r.l) * 0.15, r.t + (r.b - r.t) * 0.22, (r.r - r.l) * 0.7, (r.b - r.t) * 0.5);

  // Brass bell on the rim. Rings spread out from it while it rings; dull while recharging.
  const bx = r.l + 0.14 * s;
  const by = r.t - 0.3 * s;
  const swing = game.ringing ? Math.sin(clock * 40) * 0.35 : 0;
  ctx.fillStyle = "#3b2a12";
  ctx.fillRect(bx - 0.02 * s, by, 0.04 * s, 0.3 * s);
  ctx.save();
  ctx.translate(bx, by - 0.04 * s);
  ctx.rotate(swing);
  ctx.fillStyle = c.bellT > 0 && !game.ringing ? "#9c8a55" : "#f2c94c";
  ctx.beginPath();
  ctx.moveTo(-0.14 * s, 0.16 * s);
  ctx.quadraticCurveTo(-0.12 * s, -0.08 * s, 0, -0.08 * s);
  ctx.quadraticCurveTo(0.12 * s, -0.08 * s, 0.14 * s, 0.16 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (game.ringing) {
    ctx.strokeStyle = "rgba(255, 220, 120, 0.85)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const t = (clock * 3 + i / 3) % 1;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(bx, by, (0.2 + t * 0.9) * s, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Wheels sitting on the rails.
  ctx.fillStyle = "#1a1a1e";
  for (const gx of [-GAUGE_HALF, GAUGE_HALF]) {
    const wp = project(v, c.x + gx, 0.2, -CART_BACK);
    ctx.beginPath();
    ctx.ellipse(wp.x, wp.y, 0.08 * wp.s, 0.2 * wp.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderRail(ctx: Ctx, v: View, game: RailGame, clock: number) {
  v.camX += (game.cart.x * 0.55 - v.camX) * 0.15;
  // The line bends gently left and right; purely visual.
  v.curve = 0.0011 * Math.sin(game.distance / 260) + 0.0005 * Math.sin(game.distance / 97);
  const d = game.distance;

  drawBackdrop(ctx, v);
  drawTrackBed(ctx, v, game);

  const sprites: Sprite[] = [];
  game.crowd.sprites(ctx, v, clock, VIEW_DIST, sprites);
  // Trees and telegraph poles out in the fields.
  const treeFirst = Math.ceil((d + v.near) / 9);
  for (let k = treeFirst; k * 9 - d < VIEW_DIST; k++) {
    const z = k * 9 - d;
    for (const side of [-1, 1] as const) {
      if (hash(k, side * 3) < 0.35) continue;
      const x = side * (PLATFORM_END + 3 + hash(k, side) * 26);
      sprites.push({ z, draw: () => drawTree(ctx, v, x, z, 1 + hash(k, side + 5) * 0.9, k) });
    }
  }
  const poleFirst = Math.ceil((d + v.near) / 40);
  for (let k = poleFirst; k * 40 - d < VIEW_DIST; k++) {
    const z = k * 40 - d;
    sprites.push({ z, draw: () => drawPole(ctx, v, PLATFORM_END + 1.5, z) });
  }
  const mastStart = Math.ceil((d + v.near) / 30);
  for (let k = mastStart; k * 30 - d < VIEW_DIST; k++) {
    const z = k * 30 - d;
    for (const side of [-1, 1] as const) sprites.push({ z: z + 0.02, draw: () => drawMast(ctx, v, side, z) });
  }
  // Stations: shelters along both platforms and a name board at each end.
  const stFirst = Math.floor((d + v.near) / STATION_EVERY);
  for (let k = stFirst; k * STATION_EVERY + 60 - d < VIEW_DIST; k++) {
    const start = k * STATION_EVERY + 60;
    for (let off = 14; off < STATION_LEN - 8; off += 22) {
      const z = start + off - d;
      if (z < v.near + 3 || z > VIEW_DIST) continue;
      for (const side of [-1, 1] as const) sprites.push({ z: z + 3, draw: () => drawShelter(ctx, v, side, z) });
    }
    for (const [off, side] of [[4, -1], [STATION_LEN - 4, 1]] as const) {
      const z = start + off - d;
      if (z > v.near + 1 && z < VIEW_DIST) sprites.push({ z, draw: () => drawStationBoard(ctx, v, side, z) });
    }
  }
  for (const o of game.obstacles) {
    if (o.z > VIEW_DIST || o.z + o.len < v.near) continue;
    const x = o.lane * LANE_W;
    // Police step off towards the outside once the bell rings.
    const aside = (o.lane === -1 ? -1 : 1) * o.cleared * 1.35;
    const draw =
      o.kind === "barricade"
        ? () => drawBarricade(ctx, v, x, o.z, clock, OBSTACLE.barricade.w)
        : o.kind === "banner"
          ? () => drawPoliceLine(ctx, v, x, o.z, clock)
          : o.kind === "coach"
            ? () => drawCoach(ctx, v, o, clock)
            : o.kind === "loco"
              ? () => drawLoco(ctx, v, o, clock)
              : o.kind === "buffer"
                ? () => drawBuffer(ctx, v, o, clock)
                : () => drawOfficer(ctx, v, x + aside, o.z + o.len / 2, clock, false, o.cleared > 0 && o.cleared < 1);
    sprites.push({ z: o.z, draw });
  }
  for (const c of game.pickups) {
    if (!c.taken && c.z > v.near && c.z < VIEW_DIST) sprites.push({ z: c.z, draw: () => drawPickup(ctx, v, c, clock) });
  }
  sprites.push({ z: 0, draw: () => drawTrolley(ctx, v, game, clock) });
  if (game.chaserZ > v.near + 0.3) {
    const running = game.status === "running";
    for (const dx of [-1.5, 1.5]) {
      sprites.push({ z: game.chaserZ, draw: () => drawOfficer(ctx, v, game.cart.x + dx, game.chaserZ, clock + dx, true, running) });
    }
  }
  sprites.sort((a, b) => b.z - a.z);
  for (const sp of sprites) sp.draw();

  ctx.strokeStyle = "#ffd36b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (const s of game.sparks) {
    const p = project(v, s.x, s.y, s.z);
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - s.vx * 0.012 * p.s, p.y + s.vy * 0.012 * p.s);
  }
  ctx.stroke();

  drawWires(ctx, v);
  vignette(ctx, v);
  sirenGlow(ctx, v, clock, game.chaseT);
}
