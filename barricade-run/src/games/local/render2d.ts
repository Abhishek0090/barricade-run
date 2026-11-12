import { FONT } from "../shared/constants";
import { hash } from "../shared/random";
import type { Ctx, View } from "../shared/scene";

import { type Aspect, BUFFER, CAR_LEN, CARS, type LocalGame, MARKER, PLATFORM_LEN, SCALE } from "./engine";
import { drawLocalHud } from "./hud";

/**
 * Mumbai Local in 2D canvas. Three views:
 *  - cab: the motorman's view down the line, in simple perspective;
 *  - side: the 12-car rake in profile, scrolling past platforms and the city;
 *  - top: an overhead map of the four tracks.
 * Line positions are metres along the line; d = p - game.pos is how far ahead of the cab a thing is.
 */

const DOWN_X = 14;
const FAST_X = [19.5, 24.1];
const TRACKS = [0, DOWN_X, ...FAST_X];
const GAUGE = 0.84;
const PLAT_Y = 0.95;
const PLAT_EDGE = 1.85;
const PLAT_W = 9;
const WIRE_Y = 5.55;
const BODY_Y0 = 1.05;
const BODY_H = 3.3;
const PINK = "#c2368f";
const YELLOW = "#f7d117";
const BUILD = ["#efe8dc", "#e9dcc6", "#f2d4c9", "#cfdbe6", "#d8d5cf", "#f4e3c3", "#cbd5c0", "#e7c9b0", "#bfc6cc"];
const SHIRTS = ["#9cc3e6", "#f1f1f1", "#f7c9d0", "#cfe8d0", "#e9d8a6", "#b8c6db", "#d7b8f3", "#ff9f43", "#c1272d", "#2a9d8f"];
const LAMP = ["#ffc61a", "#2bff6a", "#ff2a2a", "#ffc61a"];

const isEvening = (g: LocalGame) => g.start >= 17 * 3600;

// ---- other trains: a slow local the other way and a fast one on the through line ----

interface Other {
  x: number;
  dir: 1 | -1;
  q: number;
  u: number;
  on: boolean;
  wait: number;
}
const traffic = new WeakMap<LocalGame, { others: Other[]; t: number }>();

function updateTraffic(g: LocalGame, clock: number) {
  let tr = traffic.get(g);
  if (!tr) {
    tr = {
      t: clock,
      others: [
        { x: DOWN_X, dir: -1, q: 0, u: 20, on: false, wait: 6 },
        { x: FAST_X[0], dir: 1, q: 0, u: 26, on: false, wait: 22 },
      ],
    };
    traffic.set(g, tr);
  }
  const dt = Math.max(0, Math.min(0.1, clock - tr.t));
  tr.t = clock;
  const moving = g.phase === "run" || g.phase === "dwell";
  for (const o of tr.others) {
    if (!o.on) {
      o.wait -= dt;
      if (o.wait <= 0 && moving) {
        o.on = true;
        o.q = o.dir < 0 ? g.pos + 900 : g.pos - 300;
        o.u = o.dir < 0 ? 18 + Math.random() * 8 : Math.max(24, g.v + 6);
      }
      continue;
    }
    o.q += o.dir * o.u * dt;
    const rel = o.q - g.pos;
    if (rel < -400 || rel > 1200) {
      o.on = false;
      o.wait = 20 + Math.random() * 30;
    }
  }
  return tr.others;
}

// ---- shared bits ---------------------------------------------------------------------

/** Sky with a far skyline, painted once per size and time of day. */
const skyCache = new Map<string, HTMLCanvasElement>();
function skyline(w: number, h: number, horizon: number, evening: boolean) {
  const key = `${Math.round(w)}|${Math.round(h)}|${Math.round(horizon)}|${evening}`;
  let c = skyCache.get(key);
  if (c) return c;
  if (skyCache.size > 6) skyCache.clear();
  c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(horizon + 2));
  const x = c.getContext("2d")!;
  const sky = x.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, evening ? "#141d45" : "#6fa8dc");
  sky.addColorStop(0.6, evening ? "#6d4a7c" : "#bcd5ea");
  sky.addColorStop(1, evening ? "#ff9a5a" : "#efe1cc");
  x.fillStyle = sky;
  x.fillRect(0, 0, c.width, c.height);
  const sun = x.createRadialGradient(w * 0.72, horizon - 30, 0, w * 0.72, horizon - 30, 120);
  sun.addColorStop(0, evening ? "rgba(255,190,120,0.9)" : "rgba(255,250,230,0.8)");
  sun.addColorStop(1, "rgba(255,240,200,0)");
  x.fillStyle = sun;
  x.fillRect(0, 0, c.width, c.height);
  for (const [row, n, maxH, color] of [
    [0, 90, horizon * 0.42, evening ? "#2f2a48" : "#9eabb9"],
    [1, 60, horizon * 0.3, evening ? "#211d33" : "#808da2"],
  ] as const) {
    x.fillStyle = color;
    for (let i = 0; i < n; i++) {
      const bx = hash(i, 11 + row) * w;
      const bw = 8 + hash(i, 21 + row) * 30;
      const bh = 8 + hash(i, 31 + row) * hash(i, 41 + row) * maxH;
      x.fillRect(bx, horizon - bh, bw, bh);
    }
  }
  if (evening) {
    x.fillStyle = "rgba(255,214,140,0.65)";
    for (let i = 0; i < 260; i++) x.fillRect(hash(i, 5) * w, horizon - hash(i, 6) * horizon * 0.35, 2, 2);
  }
  skyCache.set(key, c);
  return c;
}

function person(ctx: Ctx, x: number, y: number, size: number, look: number) {
  // size = screen height of a person.
  const w = size * 0.28;
  ctx.fillStyle = "#2b2d42";
  ctx.fillRect(x - w * 0.4, y - size * 0.48, w * 0.8, size * 0.48);
  ctx.fillStyle = SHIRTS[look % SHIRTS.length];
  ctx.fillRect(x - w / 2, y - size * 0.82, w, size * 0.38);
  ctx.fillStyle = ["#f1c27d", "#e0ac69", "#c68642", "#a5694f", "#8d5524"][(look >> 3) % 5];
  ctx.beginPath();
  ctx.arc(x, y - size * 0.9, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function signalHead(ctx: Ctx, x: number, y: number, size: number, a: Aspect) {
  // size = height of the head on screen; (x, y) the top centre.
  const lit = a === "G" ? [1] : a === "Y" ? [3] : a === "YY" ? [0, 3] : [2];
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.roundRect(x - size * 0.2, y, size * 0.4, size, size * 0.12);
  ctx.fill();
  for (let i = 0; i < 4; i++) {
    const ly = y + size * (0.14 + i * 0.24);
    const on = lit.includes(i);
    if (on && size > 6) {
      ctx.fillStyle = LAMP[i] + "55";
      ctx.beginPath();
      ctx.arc(x, ly, size * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = on ? LAMP[i] : "#2a2a2a";
    ctx.beginPath();
    ctx.arc(x, ly, Math.max(1, size * 0.09), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Platform crowd at a station, thinned out after you have picked them up. */
function crowdFraction(g: LocalGame, routeIdx: number) {
  const hi = g.halts.findIndex((h) => h.idx === routeIdx);
  if (hi < 0) return 1;
  if (hi < g.next - 1 || (hi === g.next - 1 && g.phase !== "dwell")) return 0.18;
  if (hi === g.next - 1) return Math.max(0.18, Math.min(1, (g.dwellT - 2) / 10));
  return 1;
}

function platformSide(g: LocalGame, routeIdx: number) {
  const h = g.halts.find((x) => x.idx === routeIdx);
  return (h ? h.left : hash(routeIdx, 13) > 0.5) ? -1 : 1;
}

// ---- cab view --------------------------------------------------------------------------

function renderCab(ctx: Ctx, v: View, g: LocalGame, clock: number) {
  const w = v.w;
  const h = v.h;
  const evening = isEvening(g);
  const horizon = h * 0.44;
  const f = h * 0.95 * Math.max(0.6, Math.min(2.5, g.zoom));
  const camH = 2.9;
  const eyeX = -0.7;
  const cx = w / 2;
  const shake = Math.min(1, g.kmh / 100);
  const sway = Math.sin(clock * 9.3) * 1.2 * shake;
  // A gentle curve that changes along the line.
  const curv = Math.sin(g.pos / 900) * 0.00012;
  const px = (x: number, d: number) => cx + sway + ((x - eyeX + curv * d * d) * f) / d;
  const py = (y: number, d: number) => horizon + ((camH - y) * f) / d;

  ctx.drawImage(skyline(w, h, horizon, evening), 0, 0);
  const ground = ctx.createLinearGradient(0, horizon, 0, h);
  ground.addColorStop(0, evening ? "#4a3e55" : "#b8ad97");
  ground.addColorStop(0.2, evening ? "#3d3448" : "#857c69");
  ground.addColorStop(1, evening ? "#2d2735" : "#6f675a");
  ctx.fillStyle = ground;
  ctx.fillRect(0, horizon, w, h - horizon);

  const FAR = 700;
  const ds: number[] = [];
  for (let d = 2.2; d < FAR; d *= 1.09) ds.push(d);
  ds.push(FAR);

  // Platforms are ground-level surfaces: drawn before anything stands on them.
  const route = g.route;
  const stations: { i: number; d0: number; d1: number; s: number; big: boolean; terminus: boolean }[] = [];
  route.forEach((st, i) => {
    const p = g.stationPos(i);
    const d0 = p - PLATFORM_LEN / 2 - g.pos;
    const d1 = p + PLATFORM_LEN / 2 - g.pos;
    if (d1 < 2.2 || d0 > FAR) return;
    stations.push({ i, d0: Math.max(2.2, d0), d1: Math.min(FAR, d1), s: platformSide(g, i), big: st.big, terminus: i === route.length - 1 });
  });

  // Ballast beds, then platforms, then sleepers and rails.
  for (const tx of TRACKS) {
    ctx.fillStyle = evening ? "#55504d" : "#7a7369";
    ctx.beginPath();
    ds.forEach((d, k) => (k ? ctx.lineTo(px(tx - 1.9, d), py(0, d)) : ctx.moveTo(px(tx - 1.9, d), py(0, d))));
    for (let k = ds.length - 1; k >= 0; k--) ctx.lineTo(px(tx + 1.9, ds[k]), py(0, ds[k]));
    ctx.fill();
  }
  for (const st of stations) {
    const sides = st.big || st.terminus ? [st.s, -st.s] : [st.s];
    for (const s of sides) {
      const xi = s * PLAT_EDGE;
      const xo = s * (PLAT_EDGE + PLAT_W);
      ctx.fillStyle = evening ? "#8d8579" : "#c9c1b3";
      ctx.beginPath();
      ctx.moveTo(px(xi, st.d0), py(PLAT_Y, st.d0));
      ctx.lineTo(px(xo, st.d0), py(PLAT_Y, st.d0));
      ctx.lineTo(px(xo, st.d1), py(PLAT_Y, st.d1));
      ctx.lineTo(px(xi, st.d1), py(PLAT_Y, st.d1));
      ctx.fill();
      // The platform edge wall and the yellow line.
      ctx.fillStyle = evening ? "#5f5850" : "#8f887c";
      ctx.beginPath();
      ctx.moveTo(px(xi, st.d0), py(PLAT_Y, st.d0));
      ctx.lineTo(px(xi, st.d1), py(PLAT_Y, st.d1));
      ctx.lineTo(px(xi, st.d1), py(0, st.d1));
      ctx.lineTo(px(xi, st.d0), py(0, st.d0));
      ctx.fill();
      // Yellow safety line, as a flat strip on the platform.
      const ya = s * (PLAT_EDGE + 0.3);
      const yb = s * (PLAT_EDGE + 0.5);
      ctx.fillStyle = "#f5c518";
      ctx.beginPath();
      ctx.moveTo(px(ya, st.d0), py(PLAT_Y + 0.01, st.d0));
      ctx.lineTo(px(yb, st.d0), py(PLAT_Y + 0.01, st.d0));
      ctx.lineTo(px(yb, st.d1), py(PLAT_Y + 0.01, st.d1));
      ctx.lineTo(px(ya, st.d1), py(PLAT_Y + 0.01, st.d1));
      ctx.fill();
    }
  }
  // Sleepers on your line (scrolling with the train), every 0.6 m up close.
  ctx.strokeStyle = evening ? "#8a857d" : "#a9a398";
  ctx.lineWidth = 1;
  ctx.beginPath();
  const off = g.pos % 0.6;
  for (let d = 2.4 - off; d < 160; d += d < 40 ? 0.6 : 1.2) {
    if (d < 2.2) continue;
    ctx.moveTo(px(-1.3, d), py(0.02, d));
    ctx.lineTo(px(1.3, d), py(0.02, d));
  }
  ctx.stroke();
  // Rails.
  for (const tx of TRACKS) {
    ctx.strokeStyle = tx === 0 ? "#dfe4ea" : "#b9bfc6";
    ctx.lineWidth = tx === 0 ? 2 : 1.2;
    for (const dx of [-GAUGE, GAUGE]) {
      ctx.beginPath();
      ds.forEach((d, k) => (k ? ctx.lineTo(px(tx + dx, d), py(0.12, d)) : ctx.moveTo(px(tx + dx, d), py(0.12, d))));
      ctx.stroke();
    }
  }

  // Everything that stands up, far to near.
  type Item = { d: number; draw: () => void };
  const items: Item[] = [];

  // City blocks along both sides.
  const SLOT = 26;
  for (let k = Math.floor((g.pos + 8) / SLOT); k <= Math.floor((g.pos + FAR) / SLOT); k++) {
    const p = k * SLOT;
    const km = g.kmAt(p);
    const creek = km > 33.9 && km < 35.9;
    const city = km < 16 ? 1.6 : km < 34 ? 1.1 : 0.75;
    for (const side of [-1, 1]) {
      for (let row = 0; row < 2; row++) {
        if (hash(k * 3 + row, side > 0 ? 17 : 5) < 0.15) continue;
        if (side < 0 && creek) continue;
        const bw = 10 + hash(k, row * 2 + side + 40) * 10;
        const depth = 9 + hash(k, row * 3 + side + 50) * 10;
        let bh = (6 + hash(k, row + side * 7 + 60) * 22) * city;
        if (hash(k, row + 77 + side) > 0.93) bh = 45 + hash(k, 88) * 70;
        const bx = side < 0 ? -(17 + row * 26 + depth / 2) : 30 + row * 26 + depth / 2;
        const dn = p - g.pos - bw / 2;
        const df = dn + bw;
        if (dn < 3) continue;
        const color = BUILD[Math.floor(hash(k, row * 5 + side + 99) * BUILD.length)];
        items.push({
          d: dn,
          draw: () => {
            const inner = bx - (side * depth) / 2;
            const outer = bx + (side * depth) / 2;
            // Side wall facing the track.
            ctx.fillStyle = shade(color, 0.82);
            ctx.beginPath();
            ctx.moveTo(px(inner, dn), py(0, dn));
            ctx.lineTo(px(inner, df), py(0, df));
            ctx.lineTo(px(inner, df), py(bh, df));
            ctx.lineTo(px(inner, dn), py(bh, dn));
            ctx.fill();
            // Front face.
            const x0 = px(inner, dn);
            const x1 = px(outer, dn);
            const y0 = py(bh, dn);
            const y1 = py(0, dn);
            ctx.fillStyle = color;
            ctx.fillRect(Math.min(x0, x1), y0, Math.abs(x1 - x0), y1 - y0);
            // Windows, only when they are big enough to see.
            const fh = y1 - y0;
            const fw = Math.abs(x1 - x0);
            if (fh > 24 && fw > 14) {
              ctx.fillStyle = evening ? "rgba(255,214,140,0.8)" : "rgba(60,70,85,0.75)";
              const rows = Math.min(14, Math.floor(bh / 3));
              const cols = Math.max(2, Math.min(6, Math.floor(fw / 10)));
              const cw = fw / cols;
              const rh = fh / rows;
              for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!evening || hash(k * 31 + r, c + row) > 0.45) ctx.fillRect(Math.min(x0, x1) + c * cw + cw * 0.25, y0 + r * rh + rh * 0.25, cw * 0.5, rh * 0.45);
            }
            if (bh < 40 && fh > 30) {
              ctx.fillStyle = "#1d1d1d";
              const tw = Math.max(2, fw * 0.12);
              ctx.fillRect((x0 + x1) / 2 - tw / 2, y0 - tw * 0.8, tw, tw * 0.8);
            }
          },
        });
      }
    }
  }
  // Trees and the boundary wall.
  for (let k = Math.floor((g.pos + 6) / 13); k <= Math.floor((g.pos + 400) / 13); k++) {
    if (hash(k, 400) > 0.45) continue;
    const d = k * 13 - g.pos;
    if (d < 4) continue;
    const side = hash(k, 401) > 0.5 ? 1 : -1;
    const tx = side < 0 ? -12 - hash(k, 402) * 4 : FAST_X[1] + 3.5 + hash(k, 403) * 2;
    const r = 1.8 + hash(k, 404) * 2;
    items.push({
      d,
      draw: () => {
        const sx = px(tx, d);
        ctx.fillStyle = "#5c4033";
        ctx.fillRect(sx - (0.2 * f) / d, py(r + 1.4, d), (0.4 * f) / d, py(0, d) - py(r + 1.4, d));
        ctx.fillStyle = ["#3c6e3a", "#4f7d3a", "#2f5d34"][k % 3];
        ctx.beginPath();
        ctx.arc(sx, py(r + 1.6, d), (r * f) / d, 0, Math.PI * 2);
        ctx.fill();
      },
    });
  }

  // Overhead masts, every 60 m.
  for (let k = Math.ceil((g.pos + 4) / 60); k * 60 < g.pos + 500; k++) {
    const d = k * 60 - g.pos;
    items.push({
      d,
      draw: () => {
        ctx.strokeStyle = "#8b9097";
        ctx.lineWidth = Math.max(1, (0.3 * f) / d);
        ctx.beginPath();
        ctx.moveTo(px(-3.3, d), py(0, d));
        ctx.lineTo(px(-3.3, d), py(7.2, d));
        ctx.lineTo(px(0.3, d), py(6.7, d));
        ctx.moveTo(px(DOWN_X - 3, d), py(0, d));
        ctx.lineTo(px(DOWN_X - 3, d), py(7.8, d));
        ctx.lineTo(px(FAST_X[1] + 3, d), py(7.8, d));
        ctx.lineTo(px(FAST_X[1] + 3, d), py(0, d));
        ctx.stroke();
      },
    });
  }

  // Stations: canopy, pillars, boards, the stop marker, the crowd, and CSMT at the end.
  for (const st of stations) {
    const stn = route[st.i];
    const p = g.stationPos(st.i);
    const s = st.s;
    const roofLen = PLATFORM_LEN * (st.big ? 0.8 : 0.55);
    const r0 = Math.max(2.5, p - roofLen / 2 - g.pos);
    const r1 = p + roofLen / 2 - g.pos;
    const sides = st.big || st.terminus ? [s, -s] : [s];
    for (const ss of sides) {
      if (r1 > 2.5) {
        items.push({
          d: r1,
          draw: () => {
            ctx.fillStyle = "#4d5d74";
            ctx.beginPath();
            ctx.moveTo(px(ss * (PLAT_EDGE + 1.7), r0), py(PLAT_Y + 4.6, r0));
            ctx.lineTo(px(ss * (PLAT_EDGE + 8.7), r0), py(PLAT_Y + 4.6, r0));
            ctx.lineTo(px(ss * (PLAT_EDGE + 8.7), r1), py(PLAT_Y + 4.6, r1));
            ctx.lineTo(px(ss * (PLAT_EDGE + 1.7), r1), py(PLAT_Y + 4.6, r1));
            ctx.fill();
          },
        });
      }
      for (let z = -roofLen / 2 + 6; z < roofLen / 2; z += 12) {
        const d = p + z - g.pos;
        if (d < 2.5 || d > FAR) continue;
        items.push({
          d,
          draw: () => {
            ctx.strokeStyle = "#2f6b4f";
            ctx.lineWidth = Math.max(1, (0.3 * f) / d);
            ctx.beginPath();
            ctx.moveTo(px(ss * (PLAT_EDGE + 5.6), d), py(PLAT_Y, d));
            ctx.lineTo(px(ss * (PLAT_EDGE + 5.6), d), py(PLAT_Y + 4.6, d));
            ctx.stroke();
          },
        });
      }
      for (let z = -roofLen / 2 + 15; z < roofLen / 2; z += 38) {
        const d = p + z - g.pos;
        if (d < 3 || d > 260) continue;
        items.push({ d, draw: () => board(ctx, px(ss * (PLAT_EDGE + 2.4), d), py(PLAT_Y + 4.1, d), (3.2 * f) / d, (1.06 * f) / d, stn.mr, stn.en) });
      }
    }
    // Crowd.
    const frac = crowdFraction(g, st.i);
    const n = Math.round((st.big ? 70 : 40) * frac);
    for (let i = 0; i < n; i++) {
      const d = p + (hash(i, stn.km * 10) - 0.5) * (PLATFORM_LEN - 30) - g.pos;
      if (d < 3 || d > 260) continue;
      const x = s * (PLAT_EDGE + 1.6 + hash(i, 7) * 5.5);
      items.push({ d, draw: () => person(ctx, px(x, d), py(PLAT_Y, d), (1.65 * f) / d, Math.floor(hash(i, 3) * 4096)) });
    }
    // 12-car stop marker.
    const dm = p + MARKER - g.pos;
    if (dm > 2.5 && dm < 400) {
      items.push({
        d: dm,
        draw: () => {
          const bx = px(s * (PLAT_EDGE + 0.9), dm);
          const top = py(PLAT_Y + 2.8, dm);
          const bw = (0.8 * f) / dm;
          ctx.strokeStyle = "#333";
          ctx.lineWidth = Math.max(1, (0.08 * f) / dm);
          ctx.beginPath();
          ctx.moveTo(bx, py(PLAT_Y, dm));
          ctx.lineTo(bx, top);
          ctx.stroke();
          ctx.fillStyle = "#111";
          ctx.fillRect(bx - bw / 2 - 1, top - bw * 1.25 - 1, bw + 2, bw * 1.25 + 2);
          ctx.fillStyle = "#ffd60a";
          ctx.fillRect(bx - bw / 2, top - bw * 1.25, bw, bw * 1.25);
          if (bw > 8) {
            ctx.fillStyle = "#111";
            ctx.font = `900 ${bw * 0.6}px ${FONT}`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("12", bx, top - bw * 0.62);
          }
        },
      });
    }
    // Foot overbridge.
    const dfob = p - 70 - g.pos;
    if (dfob > 3 && dfob < FAR) {
      items.push({
        d: dfob,
        draw: () => {
          ctx.fillStyle = "#8b8f94";
          const y0 = py(8.4, dfob);
          const y1 = py(7.4, dfob);
          ctx.fillRect(px(-16, dfob), y0, px(30, dfob) - px(-16, dfob), y1 - y0);
          ctx.fillStyle = "#5d6e86";
          ctx.fillRect(px(-16, dfob), py(10, dfob), px(30, dfob) - px(-16, dfob), (0.3 * f) / dfob);
          for (const x of [-16, -8, 10, 28]) ctx.fillRect(px(x, dfob) - (0.25 * f) / dfob, y1, (0.5 * f) / dfob, py(0, dfob) - y1);
        },
      });
    }
    if (st.terminus) {
      const db = p + MARKER + BUFFER + 1.6 - g.pos;
      if (db > 2.5) {
        items.push({
          d: db,
          draw: () => {
            ctx.fillStyle = "#c1272d";
            ctx.fillRect(px(-1.5, db), py(1.5, db), px(1.5, db) - px(-1.5, db), py(0.3, db) - py(1.5, db));
            ctx.fillStyle = "#ff3030";
            ctx.beginPath();
            ctx.arc(px(0, db), py(1.9, db), Math.max(2, (0.25 * f) / db), 0, Math.PI * 2);
            ctx.fill();
          },
        });
      }
      if (stn.en === "CSMT") {
        const dc = p + MARKER + 70 - g.pos;
        if (dc > 3) items.push({ d: dc, draw: () => csmt(ctx, px, py, dc, f) });
      }
    }
  }

  // Signals and speed boards.
  const first = g.signals.findIndex((s) => s.pos > g.pos + 3);
  for (let i = Math.max(0, first); i >= 0 && i < g.signals.length; i++) {
    const s = g.signals[i];
    const d = s.pos - g.pos;
    if (d > 900) break;
    const a = g.aspect(i);
    items.push({
      d,
      draw: () => {
        const sx = px(-2.6, d);
        ctx.strokeStyle = YELLOW;
        ctx.lineWidth = Math.max(1, (0.25 * f) / d);
        ctx.beginPath();
        ctx.moveTo(sx, py(0, d));
        ctx.lineTo(sx, py(4.6, d));
        ctx.stroke();
        signalHead(ctx, sx, py(6.6, d), Math.max(4, (2 * f) / d), a);
      },
    });
  }
  for (let p = Math.ceil((g.pos + 4) / 10) * 10; p < g.pos + 450; p += 10) {
    const lim = g.limitAt(p);
    if (lim === g.limitAt(p - 10)) continue;
    const d = p - g.pos;
    items.push({
      d,
      draw: () => {
        const sx = px(-3.1, d);
        const r = Math.max(3, (0.55 * f) / d);
        ctx.strokeStyle = "#333";
        ctx.lineWidth = Math.max(1, (0.08 * f) / d);
        ctx.beginPath();
        ctx.moveTo(sx, py(0, d));
        ctx.lineTo(sx, py(3, d));
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(sx, py(3, d), r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#d62828";
        ctx.lineWidth = r * 0.2;
        ctx.stroke();
        if (r > 6) {
          ctx.fillStyle = "#111";
          ctx.font = `900 ${r * 0.9}px ${FONT}`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(String(lim), sx, py(3, d) + 1);
        }
      },
    });
  }

  // Other trains: a white-and-magenta box with a yellow cab facing you.
  for (const o of updateTraffic(g, clock)) {
    if (!o.on) continue;
    const dn = o.dir < 0 ? o.q - g.pos : o.q - CARS * CAR_LEN - g.pos;
    const dfar = dn + CARS * CAR_LEN;
    if (dfar < 3 || dn > FAR) continue;
    const d0 = Math.max(3, dn);
    items.push({ d: d0, draw: () => trainBox(ctx, px, py, o.x, d0, Math.min(FAR, dfar), f, dn >= 3) });
  }

  items.sort((a, b) => b.d - a.d);
  for (const it of items) it.draw();

  // Contact wire over your line.
  ctx.strokeStyle = "#2a2a2a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ds.forEach((d, k) => (k ? ctx.lineTo(px(0, d), py(WIRE_Y, d)) : ctx.moveTo(px(0, d), py(WIRE_Y, d))));
  ctx.stroke();

  if (evening) {
    // Headlight on the track.
    const beam = ctx.createRadialGradient(cx, h * 0.8, 10, cx, h * 0.62, h * 0.5);
    beam.addColorStop(0, "rgba(255,240,190,0.35)");
    beam.addColorStop(1, "rgba(255,240,190,0)");
    ctx.fillStyle = beam;
    ctx.fillRect(0, horizon, w, h - horizon);
  }

  cabFrame(ctx, v, g);
}

function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const gg = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return `rgb(${r},${gg},${b})`;
}

function board(ctx: Ctx, x: number, y: number, w: number, h: number, mr: string, en: string) {
  ctx.fillStyle = "#151515";
  ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = "#ffd60a";
  ctx.fillRect(x - w / 2, y, w, h);
  if (h < 10) return;
  ctx.fillStyle = "#111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${h * 0.34}px ${FONT}`;
  ctx.fillText(mr, x, y + h * 0.3, w * 0.92);
  ctx.font = `900 ${h * 0.36}px ${FONT}`;
  ctx.fillText(en.toUpperCase(), x, y + h * 0.72, w * 0.92);
}

type Proj = (x: number, d: number) => number;

function trainBox(ctx: Ctx, px: Proj, py: Proj, x: number, dn: number, df: number, f: number, front: boolean) {
  const hw = 1.83;
  const top = BODY_Y0 + BODY_H;
  // The side you can see (towards your line).
  const sx = x - hw;
  ctx.fillStyle = "#eceef0";
  ctx.beginPath();
  ctx.moveTo(px(sx, dn), py(BODY_Y0, dn));
  ctx.lineTo(px(sx, df), py(BODY_Y0, df));
  ctx.lineTo(px(sx, df), py(top, df));
  ctx.lineTo(px(sx, dn), py(top, dn));
  ctx.fill();
  ctx.strokeStyle = PINK;
  ctx.lineWidth = Math.max(1, (0.4 * f) / dn);
  ctx.beginPath();
  ctx.moveTo(px(sx, dn), py(BODY_Y0 + 1.2, dn));
  ctx.lineTo(px(sx, df), py(BODY_Y0 + 1.2, df));
  ctx.stroke();
  ctx.fillStyle = "#a9adb2";
  ctx.beginPath();
  ctx.moveTo(px(sx, dn), py(top, dn));
  ctx.lineTo(px(sx, df), py(top, df));
  ctx.lineTo(px(x + hw, df), py(top, df));
  ctx.lineTo(px(x + hw, dn), py(top, dn));
  ctx.fill();
  if (!front) return;
  // Yellow cab face.
  const x0 = px(x - hw, dn);
  const x1 = px(x + hw, dn);
  const y0 = py(top, dn);
  const y1 = py(BODY_Y0 - 0.4, dn);
  const fw = x1 - x0;
  const fh = y1 - y0;
  ctx.fillStyle = YELLOW;
  ctx.beginPath();
  ctx.roundRect(x0, y0, fw, fh, fw * 0.08);
  ctx.fill();
  ctx.fillStyle = "#111";
  ctx.fillRect(x0 + fw * 0.06, y0 + fh * 0.18, fw * 0.88, fh * 0.34);
  ctx.fillStyle = "#33465a";
  ctx.fillRect(x0 + fw * 0.09, y0 + fh * 0.21, fw * 0.39, fh * 0.28);
  ctx.fillRect(x0 + fw * 0.52, y0 + fh * 0.21, fw * 0.39, fh * 0.28);
  ctx.fillStyle = "#151515";
  ctx.fillRect(x0 + fw * 0.04, y0 + fh * 0.58, fw * 0.92, fh * 0.13);
  ctx.fillStyle = "#fffbe6";
  for (const u of [0.13, 0.24, 0.76, 0.87]) {
    ctx.beginPath();
    ctx.arc(x0 + fw * u, y0 + fh * 0.645, Math.max(1, fw * 0.045), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#8d949b";
  ctx.fillRect(x0, y0 + fh * 0.8, fw, fh * 0.2);
}

function csmt(ctx: Ctx, px: Proj, py: Proj, d: number, f: number) {
  const stone = "#c9a27a";
  const x0 = px(-41, d);
  const x1 = px(49, d);
  const y0 = py(20, d);
  const y1 = py(0, d);
  ctx.fillStyle = stone;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  // Arched windows.
  ctx.fillStyle = "#5c4a3a";
  const unit = f / d;
  for (let x = -38; x < 46; x += 4.5) {
    for (const y of [4, 10, 16]) {
      ctx.beginPath();
      ctx.roundRect(px(x, d), py(y + 2.5, d), unit * 2, unit * 2.5, [unit, unit, 0, 0]);
      ctx.fill();
    }
  }
  // Central tower and dome.
  ctx.fillStyle = shade(stone, 0.95);
  ctx.fillRect(px(-6, d), py(28, d), px(14, d) - px(-6, d), py(20, d) - py(28, d));
  ctx.fillStyle = "#8a9a8a";
  ctx.beginPath();
  ctx.arc(px(4, d), py(31, d), 7.2 * unit, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(px(-3, d), py(31, d), px(11, d) - px(-3, d), py(28, d) - py(31, d));
  ctx.fillStyle = "#d9c9a0";
  ctx.beginPath();
  ctx.arc(px(4, d), py(42, d), 0.9 * unit, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a9a8a";
  ctx.lineWidth = Math.max(1, 0.5 * unit);
  ctx.beginPath();
  ctx.moveTo(px(4, d), py(38, d));
  ctx.lineTo(px(4, d), py(41, d));
  ctx.stroke();
  // Turrets.
  ctx.fillStyle = "#7a6a5a";
  for (const x of [-40, -18, 26, 48]) {
    ctx.beginPath();
    ctx.moveTo(px(x - 2, d), py(22, d));
    ctx.lineTo(px(x, d), py(28, d));
    ctx.lineTo(px(x + 2, d), py(22, d));
    ctx.fill();
  }
  if (unit > 1.2) {
    ctx.fillStyle = "#2b2016";
    ctx.fillRect(px(-16, d), py(18.5, d), px(24, d) - px(-16, d), unit * 2.4);
    ctx.fillStyle = "#f2d38a";
    ctx.font = `900 ${unit * 1.6}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("CHHATRAPATI SHIVAJI MAHARAJ TERMINUS", px(4, d), py(18.5, d) + unit * 1.2, px(24, d) - px(-16, d));
  }
}

/** Windscreen pillars, header and a slim desk at the bottom. */
function cabFrame(ctx: Ctx, v: View, g: LocalGame) {
  const w = v.w;
  const h = v.h;
  ctx.fillStyle = "#3e4a48";
  ctx.fillRect(0, 0, w, h * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(w * 0.06, 0);
  ctx.lineTo(w * 0.03, h * 0.86);
  ctx.lineTo(0, h * 0.86);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w, 0);
  ctx.lineTo(w * 0.94, 0);
  ctx.lineTo(w * 0.97, h * 0.86);
  ctx.lineTo(w, h * 0.86);
  ctx.fill();
  ctx.fillStyle = "#22272b";
  ctx.fillRect(w * 0.497, h * 0.06, w * 0.006, h * 0.78);
  // Desk.
  ctx.fillStyle = "#2b3135";
  ctx.beginPath();
  ctx.moveTo(0, h * 0.86);
  ctx.lineTo(w, h * 0.86);
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.fill();
  ctx.fillStyle = "#3a4246";
  ctx.fillRect(0, h * 0.86, w, 4);
  // Wipers.
  ctx.strokeStyle = "#151515";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.84);
  ctx.lineTo(w * 0.22, h * 0.6);
  ctx.moveTo(w * 0.72, h * 0.84);
  ctx.lineTo(w * 0.8, h * 0.6);
  ctx.stroke();
  // Master controller handle, angled with the notch.
  const a = -0.5 + (g.notch + 5) * 0.11;
  const bx = w * 0.62;
  const by = h * 0.97;
  ctx.strokeStyle = "#9aa0a6";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + Math.sin(a) * h * 0.09, by - Math.cos(a) * h * 0.09);
  ctx.stroke();
  ctx.fillStyle = g.notch > 0 ? "#2ec4b6" : g.notch < 0 ? "#c1272d" : "#111";
  ctx.beginPath();
  ctx.arc(bx + Math.sin(a) * h * 0.09, by - Math.cos(a) * h * 0.09, 9, 0, Math.PI * 2);
  ctx.fill();
}

// ---- side view ---------------------------------------------------------------------------

function renderSide(ctx: Ctx, v: View, g: LocalGame, clock: number) {
  const w = v.w;
  const h = v.h;
  const evening = isEvening(g);
  const portrait = w < h;
  const s = (w / (portrait ? 30 : 58)) * Math.max(0.4, Math.min(3, g.zoom));
  const gy = h * (portrait ? 0.66 : 0.78);
  const X0 = w * (portrait ? 0.82 : 0.7);
  const sx = (p: number) => X0 + (p - g.pos) * s;
  const horizon = gy - 6 * s;

  ctx.drawImage(skyline(w, h, horizon, evening), 0, 0);
  ctx.fillStyle = evening ? "#3d3448" : "#8f8676";
  ctx.fillRect(0, horizon, w, h - horizon);

  // Mid-distance blocks with parallax.
  const par = 0.35;
  const SLOT = 26;
  const pmin = g.pos - (X0 / s) / par;
  const pmax = g.pos + ((w - X0) / s) / par;
  for (let k = Math.floor(pmin / SLOT); k <= Math.ceil(pmax / SLOT); k++) {
    if (hash(k, 5) < 0.15) continue;
    const km = g.kmAt(k * SLOT);
    const city = km < 16 ? 1.6 : km < 34 ? 1.1 : 0.75;
    const bh = (6 + hash(k, 60) * 22) * city * (hash(k, 77) > 0.93 ? 3 : 1);
    const bw = 10 + hash(k, 40) * 10;
    const x = X0 + (k * SLOT - g.pos) * s * par;
    const bs = s * 0.45;
    const color = BUILD[Math.floor(hash(k, 99) * BUILD.length)];
    ctx.fillStyle = shade(color, evening ? 0.45 : 0.9);
    ctx.fillRect(x, horizon + 10 - bh * bs, bw * bs, bh * bs);
    if (bh * bs > 20) {
      ctx.fillStyle = evening ? "rgba(255,214,140,0.7)" : "rgba(60,70,85,0.55)";
      for (let r = 0; r < Math.min(12, Math.floor(bh / 3)); r++) ctx.fillRect(x + 2, horizon + 10 - bh * bs + 4 + r * 3 * bs, bw * bs - 4, bs * 1.1);
    }
  }

  const pLeft = g.pos - X0 / s;
  const pRight = g.pos + (w - X0) / s;
  // Far track (the line you aren't on) and other trains on it.
  const farY = gy - 1.2 * s;
  ctx.fillStyle = evening ? "#4a4542" : "#6f675d";
  ctx.fillRect(0, farY - 0.3 * s, w, 0.5 * s);
  for (const o of updateTraffic(g, clock)) {
    if (!o.on) continue;
    const head = o.q;
    const tail = o.dir < 0 ? o.q + CARS * CAR_LEN : o.q - CARS * CAR_LEN;
    const a = Math.min(head, tail);
    const b = Math.max(head, tail);
    if (b < pLeft || a > pRight) continue;
    ctx.globalAlpha = 0.75;
    profileTrain(ctx, sx, farY, s * 0.9, a, b, o.dir < 0 ? "left" : "right", g.pos, false, 0);
    ctx.globalAlpha = 1;
  }

  // Platforms, canopy, crowd and boards.
  const route = g.route;
  route.forEach((st, i) => {
    const p = g.stationPos(i);
    const a = p - PLATFORM_LEN / 2;
    const b = p + PLATFORM_LEN / 2;
    if (b < pLeft || a > pRight) return;
    const x0 = sx(a);
    const x1 = sx(b);
    ctx.fillStyle = evening ? "#8d8579" : "#c9c1b3";
    ctx.fillRect(x0, gy - PLAT_Y * s, x1 - x0, PLAT_Y * s);
    ctx.fillStyle = "#f5c518";
    ctx.fillRect(x0, gy - PLAT_Y * s, x1 - x0, Math.max(1, 0.12 * s));
    const roofLen = PLATFORM_LEN * (st.big ? 0.8 : 0.55);
    ctx.fillStyle = "#4d5d74";
    ctx.fillRect(sx(p - roofLen / 2), gy - (PLAT_Y + 4.8) * s, roofLen * s, 0.3 * s);
    ctx.fillStyle = "#2f6b4f";
    for (let z = -roofLen / 2 + 6; z < roofLen / 2; z += 12) ctx.fillRect(sx(p + z) - 0.15 * s, gy - (PLAT_Y + 4.6) * s, 0.3 * s, 4.6 * s);
    for (let z = -roofLen / 2 + 15; z < roofLen / 2; z += 38) board(ctx, sx(p + z), gy - (PLAT_Y + 4.3) * s, 3.2 * s, 1.06 * s, st.mr, st.en);
    const n = Math.round((st.big ? 70 : 40) * crowdFraction(g, i));
    for (let k = 0; k < n; k++) {
      const pp = p + (hash(k, st.km * 10) - 0.5) * (PLATFORM_LEN - 30);
      if (pp < pLeft || pp > pRight) continue;
      person(ctx, sx(pp), gy - PLAT_Y * s - hash(k, 7) * 0.4 * s, 1.65 * s, Math.floor(hash(k, 3) * 4096));
    }
    // 12-car marker.
    const mx = sx(p + MARKER);
    ctx.fillStyle = "#333";
    ctx.fillRect(mx - 0.05 * s, gy - (PLAT_Y + 2.8) * s, 0.1 * s, 2.8 * s);
    ctx.fillStyle = "#ffd60a";
    ctx.fillRect(mx - 0.4 * s, gy - (PLAT_Y + 3.8) * s, 0.8 * s, 1 * s);
    if (s > 10) {
      ctx.fillStyle = "#111";
      ctx.font = `900 ${0.6 * s}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("12", mx, gy - (PLAT_Y + 3.3) * s);
    }
    if (i === route.length - 1) {
      const bx = sx(p + MARKER + BUFFER + 1.6);
      ctx.fillStyle = "#c1272d";
      ctx.fillRect(bx, gy - 1.6 * s, 1.2 * s, 1.3 * s);
      if (st.en === "CSMT") {
        // The heritage building beyond the buffers.
        const cx0 = sx(p + MARKER + 40);
        ctx.fillStyle = "#c9a27a";
        ctx.fillRect(cx0, gy - 20 * s, 90 * s, 20 * s);
        ctx.fillStyle = "#8a9a8a";
        ctx.beginPath();
        ctx.arc(cx0 + 45 * s, gy - 28 * s, 7 * s, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = "#c9a27a";
        ctx.fillRect(cx0 + 35 * s, gy - 28 * s, 20 * s, 8 * s);
        ctx.fillStyle = "#5c4a3a";
        for (let x = 2; x < 88; x += 4.5) for (const y of [4, 10, 16]) ctx.fillRect(cx0 + x * s, gy - (y + 2.5) * s, 2 * s, 2.5 * s);
      }
    }
  });

  // Our track, sleepers scrolling.
  ctx.fillStyle = evening ? "#55504d" : "#7a7369";
  ctx.fillRect(0, gy - 0.1 * s, w, h - gy + 0.1 * s);
  ctx.fillStyle = "#9c978f";
  const step = 0.6 * s;
  if (step > 3) for (let x = sx(Math.floor(pLeft / 0.6) * 0.6); x < w; x += step) ctx.fillRect(x, gy, step * 0.45, 0.2 * s);
  ctx.fillStyle = "#dfe4ea";
  ctx.fillRect(0, gy - 0.16 * s, w, Math.max(1, 0.12 * s));

  // Masts and the contact wire.
  ctx.fillStyle = "#8b9097";
  for (let k = Math.floor(pLeft / 60); k * 60 < pRight; k++) ctx.fillRect(sx(k * 60) - 0.15 * s, gy - 7.4 * s, 0.3 * s, 7.4 * s);
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(0, gy - WIRE_Y * s, w, 1);

  // Signals and speed boards.
  g.signals.forEach((sig, i) => {
    if (sig.pos < pLeft || sig.pos > pRight) return;
    const x = sx(sig.pos);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(x - 0.12 * s, gy - 4.6 * s, 0.24 * s, 4.6 * s);
    signalHead(ctx, x, gy - 6.6 * s, 2 * s, g.aspect(i));
  });
  for (let p = Math.ceil(pLeft / 10) * 10; p < pRight; p += 10) {
    const lim = g.limitAt(p);
    if (lim === g.limitAt(p - 10)) continue;
    const x = sx(p);
    ctx.fillStyle = "#333";
    ctx.fillRect(x - 0.04 * s, gy - 3 * s, 0.08 * s, 3 * s);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, gy - 3 * s, 0.55 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#d62828";
    ctx.lineWidth = 0.12 * s;
    ctx.stroke();
    if (s > 9) {
      ctx.fillStyle = "#111";
      ctx.font = `900 ${0.5 * s}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(lim), x, gy - 3 * s);
    }
  }

  // Your train, front to the right.
  const load = g.passengers;
  const hang = load > 2600 ? 3 : load > 1500 ? 2 : load > 700 ? 1 : 0;
  profileTrain(ctx, sx, gy, s, g.pos - CARS * CAR_LEN, g.pos, "right", g.pos, true, hang);
}

/** A rake in profile between line positions a and b, with the cab on the given end. */
function profileTrain(ctx: Ctx, sx: (p: number) => number, gy: number, s: number, a: number, b: number, cab: "left" | "right", pos: number, pantos: boolean, hang: number) {
  const top = gy - (BODY_Y0 + BODY_H) * s;
  const bodyH = BODY_H * s;
  for (let c = 0; c < CARS; c++) {
    const ca = a + c * CAR_LEN + 0.3;
    const cb = ca + CAR_LEN - 0.6;
    const x0 = sx(ca);
    const x1 = sx(cb);
    if (x1 < -20 || x0 > sx(b) + 40 + 2000) continue;
    const cw = x1 - x0;
    // Body.
    ctx.fillStyle = "#f6f7f8";
    ctx.fillRect(x0, top, cw, bodyH);
    ctx.fillStyle = "#a9adb2";
    ctx.beginPath();
    ctx.roundRect(x0, top - 0.35 * s, cw, 0.5 * s, [0.3 * s, 0.3 * s, 0, 0]);
    ctx.fill();
    ctx.fillStyle = PINK;
    ctx.fillRect(x0, top + 0.25 * s, cw, 0.14 * s);
    ctx.fillRect(x0, top + 2.0 * s, cw, 0.4 * s);
    ctx.fillStyle = "#8e9399";
    ctx.fillRect(x0, top + bodyH - 0.3 * s, cw, 0.3 * s);
    // Windows and doors.
    const doors = [0.17, 0.5, 0.83];
    if (cw > 40) {
      ctx.fillStyle = "#4a5b6c";
      for (let u = 0.04; u < 0.97; u += 0.065) {
        if (doors.some((d) => Math.abs(d - u - 0.02) < 0.07)) continue;
        ctx.fillRect(x0 + cw * u, top + 0.6 * s, cw * 0.04, 1.2 * s);
      }
    }
    for (const d of doors) {
      const dx = x0 + cw * d;
      ctx.fillStyle = PINK;
      ctx.fillRect(dx - 0.9 * s, top + 0.4 * s, 1.8 * s, bodyH - 0.7 * s);
      ctx.fillStyle = "#0e1217";
      ctx.fillRect(dx - 0.65 * s, top + 0.5 * s, 1.3 * s, bodyH - 0.8 * s);
      for (let k = 0; k < hang; k++) person(ctx, dx + (k - (hang - 1) / 2) * 0.5 * s, top + bodyH - 0.3 * s, 1.65 * s, c * 97 + Math.round(d * 10) * 13 + k * 7);
    }
    // Bogies and wheels.
    ctx.fillStyle = "#25272c";
    for (const bz of [0.17, 0.83]) {
      const bx = x0 + cw * bz;
      ctx.fillRect(bx - 1.3 * s, gy - 0.95 * s, 2.6 * s, 0.45 * s);
      for (const wo of [-1.05, 1.05]) {
        ctx.beginPath();
        ctx.arc(bx + wo * s, gy - 0.46 * s, 0.46 * s, 0, Math.PI * 2);
        ctx.fill();
        if (s > 6) {
          // Spokes turning with the distance travelled.
          const ang = (pos / 0.46) % (Math.PI * 2);
          ctx.strokeStyle = "#8d949b";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(bx + wo * s - Math.cos(ang) * 0.36 * s, gy - 0.46 * s - Math.sin(ang) * 0.36 * s);
          ctx.lineTo(bx + wo * s + Math.cos(ang) * 0.36 * s, gy - 0.46 * s + Math.sin(ang) * 0.36 * s);
          ctx.stroke();
        }
      }
    }
    // Pantograph on the motor coaches.
    if (pantos && (c === 0 || c === 5 || c === 10)) {
      const px0 = x0 + cw * (cab === "right" ? 0.75 : 0.25);
      ctx.strokeStyle = "#5a5f66";
      ctx.lineWidth = Math.max(1, 0.08 * s);
      ctx.beginPath();
      ctx.moveTo(px0 - 0.8 * s, top - 0.3 * s);
      ctx.lineTo(px0, top - 1.2 * s);
      ctx.lineTo(px0 - 0.5 * s, gy - WIRE_Y * s);
      ctx.moveTo(px0 - 1.0 * s, gy - WIRE_Y * s);
      ctx.lineTo(px0 + 0.2 * s, gy - WIRE_Y * s);
      ctx.stroke();
    }
  }
  // Yellow cab noses at both ends; the leading one gets the headlight.
  for (const end of ["left", "right"] as const) {
    const x = end === "right" ? sx(b) : sx(a);
    const dir = end === "right" ? 1 : -1;
    ctx.fillStyle = YELLOW;
    ctx.beginPath();
    if (dir > 0) ctx.roundRect(x - 2.4 * s, top - 0.35 * s, 2.4 * s, bodyH + 0.35 * s, [0, 0.5 * s, 0.2 * s, 0]);
    else ctx.roundRect(x, top - 0.35 * s, 2.4 * s, bodyH + 0.35 * s, [0.5 * s, 0, 0, 0.2 * s]);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.fillRect(dir > 0 ? x - 1.6 * s : x + 0.3 * s, top + 0.4 * s, 1.3 * s, 1.3 * s);
    ctx.fillStyle = "#8d949b";
    ctx.fillRect(dir > 0 ? x - 2.4 * s : x, gy - 1.3 * s, 2.4 * s, 0.4 * s);
    if (end === cab) {
      ctx.fillStyle = "#fffbe6";
      ctx.beginPath();
      ctx.arc(x - dir * 0.25 * s, top + 2.2 * s, Math.max(1.5, 0.22 * s), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- map view ---------------------------------------------------------------------------

function renderTop(ctx: Ctx, v: View, g: LocalGame, clock: number) {
  const w = v.w;
  const h = v.h;
  const evening = isEvening(g);
  const s = (w / (w < h ? 120 : 220)) * Math.max(0.4, Math.min(3, g.zoom));
  const X0 = w * 0.62;
  const cy = h * 0.55;
  const sx = (p: number) => X0 + (p - g.pos) * s;
  const sy = (x: number) => cy + (x - 10) * s;
  ctx.fillStyle = evening ? "#3a3542" : "#8c8a74";
  ctx.fillRect(0, 0, w, h);
  const pLeft = g.pos - X0 / s;
  const pRight = g.pos + (w - X0) / s;
  // Blocks.
  const SLOT = 26;
  for (let k = Math.floor(pLeft / SLOT); k <= Math.ceil(pRight / SLOT); k++) {
    for (const side of [-1, 1]) {
      for (let row = 0; row < 3; row++) {
        if (hash(k * 3 + row, side > 0 ? 17 : 5) < 0.15) continue;
        const bw = 10 + hash(k, row * 2 + side + 40) * 10;
        const depth = 9 + hash(k, row * 3 + side + 50) * 10;
        const bx = side < 0 ? -(17 + row * 26 + depth / 2) : 30 + row * 26 + depth / 2;
        ctx.fillStyle = shade(BUILD[Math.floor(hash(k, row * 5 + side + 99) * BUILD.length)], evening ? 0.5 : 0.85);
        ctx.fillRect(sx(k * SLOT - bw / 2), sy(bx - depth / 2), bw * s, depth * s);
      }
    }
  }
  // Ballast and rails.
  for (const tx of TRACKS) {
    ctx.fillStyle = evening ? "#55504d" : "#7a7369";
    ctx.fillRect(0, sy(tx - 1.9), w, 3.8 * s);
    ctx.fillStyle = "#dfe4ea";
    ctx.fillRect(0, sy(tx - GAUGE) - 0.5, w, 1);
    ctx.fillRect(0, sy(tx + GAUGE) - 0.5, w, 1);
  }
  // Platforms and names.
  g.route.forEach((st, i) => {
    const p = g.stationPos(i);
    if (p + PLATFORM_LEN / 2 < pLeft || p - PLATFORM_LEN / 2 > pRight) return;
    const side = platformSide(g, i);
    const sides = st.big || i === g.route.length - 1 ? [side, -side] : [side];
    for (const sd of sides) {
      ctx.fillStyle = evening ? "#8d8579" : "#d6cfc2";
      const y0 = sd < 0 ? sy(-PLAT_EDGE - PLAT_W) : sy(PLAT_EDGE);
      ctx.fillRect(sx(p - PLATFORM_LEN / 2), y0, PLATFORM_LEN * s, PLAT_W * s);
      ctx.fillStyle = "#4d5d74";
      const roofLen = PLATFORM_LEN * (st.big ? 0.8 : 0.55);
      ctx.fillRect(sx(p - roofLen / 2), sd < 0 ? sy(-PLAT_EDGE - 8.7) : sy(PLAT_EDGE + 1.7), roofLen * s, 7 * s);
    }
    ctx.fillStyle = "#ffd60a";
    ctx.font = `900 ${Math.max(11, 3 * s)}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(st.en.toUpperCase(), sx(p), sy(side < 0 ? -PLAT_EDGE - PLAT_W - 4 : PLAT_EDGE + PLAT_W + 4));
    ctx.fillStyle = "#ffd60a";
    ctx.fillRect(sx(p + MARKER) - 1, sy(side < 0 ? -PLAT_EDGE - 1.2 : PLAT_EDGE + 0.4), 2, 0.8 * s + 2);
  });
  // Signals.
  g.signals.forEach((sig, i) => {
    if (sig.pos < pLeft || sig.pos > pRight) return;
    const a = g.aspect(i);
    ctx.fillStyle = a === "G" ? LAMP[1] : a === "R" ? LAMP[2] : LAMP[0];
    ctx.beginPath();
    ctx.arc(sx(sig.pos), sy(-2.6), Math.max(3, 0.8 * s), 0, Math.PI * 2);
    ctx.fill();
  });
  // Other trains, then yours.
  const rake = (x: number, a: number, b: number, mine: boolean) => {
    ctx.fillStyle = "#f6f7f8";
    ctx.fillRect(sx(a), sy(x - 1.83), (b - a) * s, 3.66 * s);
    ctx.fillStyle = PINK;
    ctx.fillRect(sx(a), sy(x - 0.3), (b - a) * s, 0.6 * s);
    ctx.fillStyle = "#555";
    for (let c = 1; c < CARS; c++) ctx.fillRect(sx(a + c * CAR_LEN) - 0.5, sy(x - 1.83), 1, 3.66 * s);
    ctx.fillStyle = YELLOW;
    ctx.fillRect(sx(b) - 2.4 * s, sy(x - 1.83), 2.4 * s, 3.66 * s);
    ctx.fillRect(sx(a), sy(x - 1.83), 2.4 * s, 3.66 * s);
    if (mine) {
      ctx.strokeStyle = "#ff9f1c";
      ctx.lineWidth = 2;
      ctx.strokeRect(sx(a) - 2, sy(x - 1.83) - 2, (b - a) * s + 4, 3.66 * s + 4);
    }
  };
  for (const o of updateTraffic(g, clock)) {
    if (!o.on) continue;
    const tail = o.dir < 0 ? o.q + CARS * CAR_LEN : o.q - CARS * CAR_LEN;
    rake(o.x, Math.min(o.q, tail), Math.max(o.q, tail), false);
  }
  rake(0, g.pos - CARS * CAR_LEN, g.pos, true);
  // Kilometre posts.
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = `800 11px ${FONT}`;
  ctx.textAlign = "center";
  const kmStep = 1000 * SCALE;
  for (let p = Math.ceil(pLeft / kmStep) * kmStep; p < pRight; p += kmStep) ctx.fillText(`${Math.round(g.kmAt(p))} km`, sx(p), sy(-6));
}

/** Draws the current view, then the HUD. */
export function renderLocal(ctx: Ctx, v: View, g: LocalGame, clock: number) {
  // The menu, the end of a duty and the hub preview use the cab view.
  const view = g.phase === "select" || g.phase === "done" || g.ghost ? "cab" : g.view;
  if (view === "side") renderSide(ctx, v, g, clock);
  else if (view === "top") renderTop(ctx, v, g, clock);
  else renderCab(ctx, v, g, clock);
  drawLocalHud(ctx, v, g, clock);
}
