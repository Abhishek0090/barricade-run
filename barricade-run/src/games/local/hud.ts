import { FONT } from "../shared/constants";
import type { View } from "../shared/scene";

import { type Aspect, fmtClock, type LocalGame, type Notch, VIEW_NAMES, VIEWS } from "./engine";

type Ctx = CanvasRenderingContext2D;

const PANEL = "rgba(10, 14, 22, 0.78)";
const LED = "#ff9f1c";
const DIM = "rgba(255,255,255,0.6)";

function card(ctx: Ctx, x: number, y: number, w: number, h: number, r = 12, fill = PANEL) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function txt(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left", weight = 800, maxW?: number) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y, maxW);
}

function mono(ctx: Ctx, s: string, x: number, y: number, size: number, color: string, align: CanvasTextAlign = "left") {
  ctx.font = `900 ${size}px ui-monospace, Consolas, "Courier New", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(m))} m`);

function lateText(s: number): [string, string] {
  if (s >= -45 && s <= 20) return ["ON TIME", "#4cd964"];
  if (s < 0) return [`${Math.round(-s)}s EARLY`, "#7ee0d2"];
  return [`${Math.round(s)}s LATE`, s > 60 ? "#ff5d73" : "#ffd447"];
}

/** Speedometer: 0-120 km/h dial with the line speed marked, digital readout in the middle. */
function speedo(ctx: Ctx, cx: number, cy: number, r: number, g: LocalGame, clock: number) {
  ctx.fillStyle = "rgba(8, 10, 16, 0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.stroke();
  const a0 = Math.PI * 0.75;
  const span = Math.PI * 1.5;
  const at = (kmh: number) => a0 + (Math.min(120, kmh) / 120) * span;
  // Green band up to the limit, red beyond it.
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(76, 217, 100, 0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, a0, at(g.limit));
  ctx.stroke();
  ctx.strokeStyle = "rgba(255, 70, 90, 0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, r - 4, at(g.limit), a0 + span);
  ctx.stroke();
  for (let k = 0; k <= 120; k += 10) {
    const a = at(k);
    const big = k % 20 === 0;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = big ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (r - (big ? 14 : 10)), cy + Math.sin(a) * (r - (big ? 14 : 10)));
    ctx.lineTo(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6));
    ctx.stroke();
    if (big && r > 50) txt(ctx, String(k), cx + Math.cos(a) * (r - 24), cy + Math.sin(a) * (r - 24), 9, DIM, "center", 700);
  }
  const over = g.overspeed;
  const a = at(g.kmh);
  ctx.strokeStyle = over ? "#ff3b5c" : "#ffd447";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(a) * (r - 10), cy + Math.sin(a) * (r - 10));
  ctx.stroke();
  ctx.fillStyle = "#222";
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
  mono(ctx, String(Math.round(g.kmh)), cx, cy + r * 0.4, r * 0.36, over && Math.sin(clock * 14) > 0 ? "#ff3b5c" : "#ffffff", "center");
  txt(ctx, "km/h", cx, cy + r * 0.68, 10, DIM, "center", 700);
}

const NOTCHES: [Notch, string][] = [
  [4, "P4"],
  [3, "P3"],
  [2, "P2"],
  [1, "P1"],
  [0, "N"],
  [-1, "B1"],
  [-2, "B2"],
  [-3, "B3"],
  [-4, "B4"],
  [-5, "EB"],
];

/** Master controller: power notches, neutral, brake steps, emergency. */
function notchStrip(ctx: Ctx, x: number, y: number, h: number, g: LocalGame) {
  const w = 38;
  card(ctx, x, y, w, h, 10);
  const step = (h - 12) / NOTCHES.length;
  NOTCHES.forEach(([n, label], i) => {
    const cy = y + 6 + step * (i + 0.5);
    const on = g.notch === n;
    if (on) {
      ctx.fillStyle = n > 0 ? "#2ec4b6" : n === 0 ? "#8892a0" : n === -5 ? "#ff3b5c" : "#ff9f1c";
      ctx.beginPath();
      ctx.roundRect(x + 4, cy - step / 2 + 1, w - 8, step - 2, 5);
      ctx.fill();
    }
    txt(ctx, label, x + w / 2, cy, Math.min(11, step * 0.62), on ? "#0b0f16" : n > 0 ? "#7ee0d2" : n === 0 ? "#cfd6dc" : "#ffb870", "center", 900);
  });
}

/** Cab signal repeater: the next signal's aspect and how far it is. */
function signalBox(ctx: Ctx, x: number, y: number, g: LocalGame, clock: number) {
  const sig = g.nextSignal;
  const w = 74;
  const h = 112;
  card(ctx, x, y, w, h, 10);
  txt(ctx, "SIGNAL", x + w / 2, y + 12, 9, DIM, "center", 800);
  const lit = (a: Aspect | null) => (a === "G" ? [1] : a === "Y" ? [3] : a === "YY" ? [0, 3] : a === "R" ? [2] : []);
  const shown = sig && sig.dist < 1400;
  const on = lit(shown ? sig.aspect : null);
  const colors = ["#ffc61a", "#2bff6a", "#ff2a2a", "#ffc61a"];
  ctx.fillStyle = "#050505";
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 22, 22, 72, 8);
  ctx.fill();
  colors.forEach((c, i) => {
    const lampOn = on.includes(i) && !(i === 2 && Math.sin(clock * 10) < -0.6);
    ctx.fillStyle = lampOn ? c : "rgba(255,255,255,0.08)";
    if (lampOn) {
      ctx.shadowColor = c;
      ctx.shadowBlur = 10;
    }
    ctx.beginPath();
    ctx.arc(x + 21, y + 32 + i * 17, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });
  if (sig && shown) {
    const name = sig.aspect === "G" ? "GREEN" : sig.aspect === "YY" ? "2 YEL" : sig.aspect === "Y" ? "YELLOW" : "RED";
    txt(ctx, name, x + 52, y + 44, 9, colors[on[0] ?? 1], "center", 900, 38);
    mono(ctx, String(Math.round(sig.dist)), x + 52, y + 66, 14, "#fff", "center");
    txt(ctx, "m", x + 52, y + 82, 9, DIM, "center", 700);
  } else txt(ctx, "-", x + 52, y + 56, 14, DIM, "center");
}

/** The whole duty as a line of halts, with the train on it. */
function routeStrip(ctx: Ctx, x: number, y: number, w: number, g: LocalGame) {
  card(ctx, x, y, w, 54, 12);
  const x0 = x + 18;
  const x1 = x + w - 18;
  const end = Math.max(1, g.lineEnd);
  const px = (p: number) => x0 + (x1 - x0) * Math.max(0, Math.min(1, p / end));
  const ly = y + 30;
  ctx.strokeStyle = "rgba(255,255,255,0.25)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x0, ly);
  ctx.lineTo(x1, ly);
  ctx.stroke();
  ctx.strokeStyle = "#2ec4b6";
  ctx.beginPath();
  ctx.moveTo(x0, ly);
  ctx.lineTo(px(g.pos), ly);
  ctx.stroke();
  const route = g.route;
  const halts = new Set(g.halts.map((h) => h.idx));
  const next = g.nextHalt?.idx ?? -1;
  route.forEach((st, i) => {
    const sx = px(g.stationPos(i));
    const stop = halts.has(i);
    ctx.fillStyle = i === next ? "#ffd447" : stop ? "#ffffff" : "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(sx, ly, stop ? 4 : 2, 0, Math.PI * 2);
    ctx.fill();
    if (i === 0 || i === route.length - 1) txt(ctx, st.en.toUpperCase(), sx, y + 12, 9, DIM, i === 0 ? "left" : "right", 800);
  });
  if (next >= 0) txt(ctx, route[next].en, Math.max(x0 + 30, Math.min(x1 - 30, px(g.stationPos(next)))), y + 46, 10, "#ffd447", "center", 800);
  const tx = px(g.pos);
  ctx.fillStyle = "#ff9f1c";
  ctx.beginPath();
  ctx.moveTo(tx + 7, ly);
  ctx.lineTo(tx - 5, ly - 6);
  ctx.lineTo(tx - 5, ly + 6);
  ctx.closePath();
  ctx.fill();
}

/** Precision stop assist: where the cab is against the 12-car marker. */
function stopAssist(ctx: Ctx, cx: number, y: number, w: number, togo: number) {
  const x = cx - w / 2;
  card(ctx, x, y, w, 46, 10);
  const range = 60;
  const mx = x + w * 0.62;
  const scale = (w * 0.55) / range;
  const zone = (m: number, color: string) => {
    ctx.fillStyle = color;
    ctx.fillRect(mx - m * scale, y + 24, m * 2 * scale, 12);
  };
  zone(15, "rgba(255,212,71,0.35)");
  zone(6, "rgba(76,217,100,0.45)");
  zone(2, "rgba(76,217,100,0.9)");
  ctx.fillStyle = "#fff";
  ctx.fillRect(mx - 1, y + 20, 2, 20);
  const tx = Math.max(x + 8, Math.min(x + w - 8, mx - togo * scale));
  ctx.fillStyle = "#ff9f1c";
  ctx.beginPath();
  ctx.moveTo(tx, y + 22);
  ctx.lineTo(tx - 6, y + 14);
  ctx.lineTo(tx + 6, y + 14);
  ctx.closePath();
  ctx.fill();
  const msg = togo >= 0 ? `12-CAR MARKER IN ${togo.toFixed(togo < 20 ? 1 : 0)} m` : `PAST THE MARKER BY ${(-togo).toFixed(1)} m`;
  txt(ctx, msg, x + 10, y + 11, 10, Math.abs(togo) <= 2 ? "#4cd964" : togo < -2 ? "#ff5d73" : "#ffffff", "left", 900, w - 20);
}

function wrap(ctx: Ctx, s: string, cx: number, y: number, maxW: number, lineH: number) {
  let line = "";
  let ly = y;
  for (const word of s.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, ly);
      line = word;
      ly += lineH;
    } else line = test;
  }
  ctx.fillText(line, cx, ly);
}

function menu(ctx: Ctx, v: View, g: LocalGame) {
  const small = v.w < 600;
  const w = Math.min(560, v.w - 24);
  const h = small ? 330 : 300;
  const x = (v.w - w) / 2;
  const y = Math.max(70, (v.h - h) / 2 - 30);
  card(ctx, x, y, w, h, 18, "rgba(8, 12, 20, 0.86)");
  txt(ctx, "MOTORMAN DUTY • मोटरमन", v.w / 2, y + 26, 12, "#2ec4b6", "center", 900);
  txt(ctx, "Kalyan → CSMT", v.w / 2, y + 56, small ? 22 : 26, "#ffffff", "center", 900);
  const cw = (w - 48) / 2;
  const ch = small ? 150 : 130;
  const opts = [
    { t: "FAST LOCAL", s: "7 halts: Dombivli, Thane, Ghatkopar, Kurla, Dadar, Byculla", tag: "F", c: "#ff9f1c" },
    { t: "SLOW LOCAL", s: "All 25 halts: every station on the line", tag: "S", c: "#2ec4b6" },
  ];
  opts.forEach((o, i) => {
    const cx = x + 16 + i * (cw + 16);
    const cy = y + 84;
    const on = g.pick === i;
    card(ctx, cx, cy, cw, ch, 14, on ? "rgba(46,196,182,0.18)" : "rgba(255,255,255,0.04)");
    if (on) {
      ctx.strokeStyle = o.c;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cw, ch, 14);
      ctx.stroke();
    }
    ctx.fillStyle = "#0b0b0b";
    ctx.beginPath();
    ctx.roundRect(cx + 12, cy + 12, cw - 24, 30, 6);
    ctx.fill();
    mono(ctx, `CSMT  ${o.tag}`, cx + cw / 2, cy + 28, 16, LED, "center");
    txt(ctx, o.t, cx + cw / 2, cy + 60, small ? 14 : 16, "#fff", "center", 900);
    ctx.font = `600 ${small ? 10 : 11}px ${FONT}`;
    ctx.fillStyle = DIM;
    ctx.textAlign = "center";
    wrap(ctx, o.s, cx + cw / 2, cy + 84, cw - 20, 15);
  });
  const hy = y + h - 58;
  txt(ctx, "Stop at the 12-car marker • Obey signals and speed boards • Keep time", v.w / 2, hy, small ? 10 : 12, "#e6e6e6", "center", 700, w - 24);
  txt(ctx, small ? "BRAKE ▼ switches • POWER ▲ starts the duty" : "SPACE to start  •  ← → switch  •  ↑ ↓ notch  •  H horn  •  C view", v.w / 2, hy + 24, small ? 11 : 12, "#ffd447", "center", 800, w - 24);
}

function report(ctx: Ctx, v: View, g: LocalGame) {
  const r = g.report;
  if (!r) return;
  const w = Math.min(520, v.w - 24);
  const h = 250;
  const x = (v.w - w) / 2;
  const y = Math.max(70, (v.h - h) / 2 - 30);
  card(ctx, x, y, w, h, 18, "rgba(8, 12, 20, 0.88)");
  txt(ctx, r.title, x + 20, y + 28, 15, "#2ec4b6", "left", 900, w - 110);
  const gradeColor = r.grade.startsWith("A") ? "#4cd964" : r.grade === "B" ? "#ffd447" : "#ff9f43";
  ctx.strokeStyle = gradeColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x + w - 46, y + 46, 30, 0, Math.PI * 2);
  ctx.stroke();
  txt(ctx, r.grade, x + w - 46, y + 47, 26, gradeColor, "center", 900);
  r.lines.forEach((l, i) => txt(ctx, l, x + 20, y + 84 + i * 30, 13, i === 3 ? "#ffd447" : "#ffffff", "left", 700, w - 40));
  const back = g.up ? "Kalyan" : "CSMT";
  if (g.phaseT > 1.5) txt(ctx, `Press SPACE (or POWER) for the return duty to ${back}`, v.w / 2, y + h - 22, 12, "#7ee0d2", "center", 800, w - 24);
}

/** HUD over the 3D view: next halt, route, clock, speedometer, notches, signal and stop assist. */
export function drawLocalHud(ctx: Ctx, v: View, g: LocalGame, clock: number) {
  if (g.ghost) return;
  const small = v.w < 600;
  const pad = 12;
  if (g.phase === "select") {
    menu(ctx, v, g);
    return;
  }

  if (g.overspeed) {
    const k = 0.25 + Math.abs(Math.sin(clock * 8)) * 0.3;
    const grad = ctx.createRadialGradient(v.w / 2, v.h / 2, Math.min(v.w, v.h) * 0.35, v.w / 2, v.h / 2, Math.max(v.w, v.h) * 0.75);
    grad.addColorStop(0, "rgba(255,0,40,0)");
    grad.addColorStop(1, `rgba(255,0,40,${k})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, v.w, v.h);
  }

  // Next halt.
  const h = g.nextHalt;
  const nw = small ? 168 : 214;
  const nh = small ? 82 : 92;
  card(ctx, pad, pad, nw, nh);
  if (h) {
    const at = g.atHalt;
    const show = g.phase === "dwell" && at ? g.route[at.idx] : g.route[h.idx];
    txt(ctx, g.phase === "dwell" ? "NOW AT" : "NEXT HALT", pad + 12, pad + 14, 10, DIM, "left", 800);
    txt(ctx, show.en.toUpperCase(), pad + 12, pad + 36, small ? 17 : 20, "#ffd447", "left", 900, nw - 24);
    txt(ctx, show.mr, pad + 12, pad + 58, small ? 11 : 12, "#ffffff", "left", 700, nw - 24);
    if (g.phase !== "dwell") txt(ctx, fmtDist(g.stopAt(h) - g.pos), pad + nw - 12, pad + 14, 11, "#ffffff", "right", 900);
    const [lt, lc] = lateText(g.lateness);
    txt(ctx, `next due ${fmtClock(g.start + h.due).slice(0, 5)}`, pad + 12, pad + nh - 12, 10, DIM, "left", 700);
    txt(ctx, lt, pad + nw - 12, pad + nh - 12, 10, lc, "right", 900);
  } else {
    txt(ctx, "END OF LINE", pad + 12, pad + 36, 18, "#ffd447");
  }

  // Clock, passengers, score (left of the pause button).
  const cw = small ? 112 : 150;
  const cx = v.w - pad - 58 - cw;
  card(ctx, cx, pad, cw, nh);
  ctx.fillStyle = "#050505";
  ctx.beginPath();
  ctx.roundRect(cx + 8, pad + 8, cw - 16, 28, 6);
  ctx.fill();
  mono(ctx, fmtClock(g.clock), cx + cw / 2, pad + 23, small ? 15 : 18, LED, "center");
  txt(ctx, `PAX ${g.passengers.toLocaleString()}`, cx + 10, pad + 52, small ? 11 : 13, "#ffffff", "left", 800, cw - 20);
  txt(ctx, `★ ${g.score.toLocaleString()}`, cx + 10, pad + 72, small ? 11 : 13, "#ffd447", "left", 900, cw - 20);
  if (!small) txt(ctx, g.fast ? "FAST" : "SLOW", cx + cw - 10, pad + 72, 10, g.fast ? "#ff9f1c" : "#2ec4b6", "right", 900);

  // Route strip: across the top on wide screens, under the cards on phones.
  const rw = small ? v.w - pad * 2 : Math.min(620, cx - nw - pad * 4);
  const rx = small ? pad : pad + nw + (cx - pad - nw - rw) / 2;
  const ry = small ? pad + nh + 8 : pad;
  if (rw > 160) routeStrip(ctx, rx, ry, rw, g);
  const below = small ? ry + 62 : pad + nh + 10;

  if (g.banner) {
    const b = g.banner;
    ctx.globalAlpha = Math.min(1, b.t * 3);
    const bw = Math.min(520, v.w - 24);
    const bx = (v.w - bw) / 2;
    const bh = b.sub ? 54 : 34;
    const color = b.tone === "good" ? "#4cd964" : b.tone === "bad" ? "#ff5d73" : "#ffd447";
    card(ctx, bx, below, bw, bh, 12);
    ctx.fillStyle = color;
    ctx.fillRect(bx, below + 8, 4, bh - 16);
    txt(ctx, b.text, v.w / 2, below + 17, small ? 14 : 16, color, "center", 900, bw - 24);
    if (b.sub) txt(ctx, b.sub, v.w / 2, below + 39, small ? 10 : 12, "#ffffff", "center", 700, bw - 24);
    ctx.globalAlpha = 1;
  }

  // Camera: the view name after switching, and the zoom level.
  if (g.viewT > 0 || Math.abs(g.zoom - 1) > 0.02) {
    const label = `${VIEW_NAMES[g.view]} ${VIEWS.indexOf(g.view) + 1}/${VIEWS.length}${Math.abs(g.zoom - 1) > 0.02 ? `  •  ${g.zoom.toFixed(1)}×` : ""}`;
    ctx.globalAlpha = g.viewT > 0 ? Math.min(1, g.viewT * 2) : 0.75;
    ctx.font = `900 13px ${FONT}`;
    const lw = ctx.measureText(label).width + 28;
    const ly = small ? v.h * 0.6 : v.h * 0.62;
    card(ctx, (v.w - lw) / 2, ly, lw, 30, 15);
    txt(ctx, label, v.w / 2, ly + 15, 13, "#7ee0d2", "center", 900);
    ctx.globalAlpha = 1;
  }

  // Dwell: doors and the guard.
  if (g.phase === "dwell") {
    const dw = small ? 230 : 270;
    const dx = (v.w - dw) / 2;
    const dy = v.h * (small ? 0.44 : 0.4);
    card(ctx, dx, dy, dw, 50, 12);
    if (g.guardReady) {
      txt(ctx, "GUARD: READY ✓", v.w / 2, dy + 17, 15, "#4cd964", "center", 900);
      txt(ctx, small ? "Tap POWER ▲ to depart" : "Press SPACE (or ↑) to depart", v.w / 2, dy + 36, 11, "#ffffff", "center", 700);
    } else {
      txt(ctx, g.doors ? "BOARDING • चढा / उतरा" : "WAIT FOR THE BELL", v.w / 2, dy + 17, 14, "#ffd447", "center", 900);
      txt(ctx, `${Math.max(0, Math.ceil(g.dwellT))} s • keep the brakes on`, v.w / 2, dy + 36, 11, "#ffffff", "center", 700);
    }
  }

  // Bottom-left cluster: speedometer with the line speed, notch strip, signal.
  const r = small ? 50 : 66;
  const sx = pad + r + 8;
  const sy = v.h - pad - r - 10;
  speedo(ctx, sx, sy, r, g, clock);
  const bx = sx + r * 0.8;
  const by = sy - r * 0.88;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(bx, by, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#d62828";
  ctx.lineWidth = 4;
  ctx.stroke();
  txt(ctx, String(g.limit), bx, by + 1, g.limit >= 100 ? 10 : 12, "#111", "center", 900);
  // The next restriction, if one is coming up.
  const la = g.limitAhead;
  if (la) {
    const ax = bx + 36;
    card(ctx, ax - 16, by - 16, 76, 32, 8);
    ctx.fillStyle = "#ffd447";
    ctx.beginPath();
    ctx.arc(ax, by, 11, 0, Math.PI * 2);
    ctx.fill();
    txt(ctx, String(la.lim), ax, by + 1, 10, "#111", "center", 900);
    txt(ctx, `${la.dist} m`, ax + 16, by + 1, 11, "#ffd447", "left", 900);
  }
  const nhh = r * 2 + 16;
  notchStrip(ctx, sx + r + 16, v.h - pad - nhh, nhh, g);
  // Phones: the touch buttons own the bottom right, so the signal box sits above the notch strip.
  const sigX = small ? sx + r - 2 : sx + r + 62;
  const sigY = small ? v.h - pad - nhh - 8 - 112 : v.h - pad - 112;
  signalBox(ctx, sigX, sigY, g, clock);

  if (h && g.phase === "run") {
    const togo = g.stopAt(h) - g.pos;
    if (togo < 320 && togo > -60) {
      const aw = small ? v.w - 24 : 340;
      const ay = small ? sigY - 54 : v.h - pad - 46;
      const left = sx + r + 150;
      const acx = small ? v.w / 2 : Math.max(left + aw / 2, Math.min(v.w / 2, v.w - 190 - aw / 2));
      stopAssist(ctx, acx, ay, aw, togo);
    }
  }

  if (g.phase === "done") report(ctx, v, g);
}
