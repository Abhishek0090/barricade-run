import { box, type Ctx, figure, label, poly, project, shadow, text, type View } from "./scene";

/** Police obstacles shared by the games: barricade, police line, riot police and the detention bus. */

export const BARRICADE = { w: 2.1, h: 1.05, len: 0.5 } as const;
export const POLICE_LINE = { w: 2.3, h: 2.4, len: 0.3, clearance: 1.15 } as const;
export const OFFICER = { w: 0.9, h: 1.85, len: 0.6 } as const;
export const POLICE_BUS = { w: 2.3, h: 3.1, len: 11 } as const;

export function drawBarricade(ctx: Ctx, v: View, x: number, z: number, clock: number, w: number = BARRICADE.w) {
  const h = BARRICADE.h;
  shadow(ctx, v, x, z + 0.2, w * 0.55);
  for (const lx of [-w * 0.4, w * 0.4]) {
    box(ctx, v, x + lx, 0.1, 0, h - 0.1, z + 0.1, z + 0.2, { front: "#3a3a3a", side: "#2a2a2a", top: "#444" });
  }
  const lower = box(ctx, v, x, w - 0.3, 0.25, 0.4, z, z + 0.1, { front: "#f1f1f1", side: "#bbb", top: "#ddd" });
  const board = box(ctx, v, x, w, 0.6, h, z, z + 0.12, { front: "#f1f1f1", side: "#bbb", top: "#ddd" });
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
    const plate = label("barricade-plate", 124, 80, (c, cw, chh) => {
      c.fillStyle = "#ffffff";
      c.fillRect(0, 0, cw, chh);
      c.strokeStyle = "#1d3557";
      c.lineWidth = 4;
      c.strokeRect(0, 0, cw, chh);
      text(c, "पुलिस", cw / 2, chh * 0.3, chh * 0.36, "#1d3557", cw * 0.9);
      text(c, "POLICE", cw / 2, chh * 0.74, chh * 0.3, "#c1121f", cw * 0.9);
    });
    ctx.drawImage(plate, mid - pw / 2, board.t + (board.b - board.t) * 0.1, pw, ph);
    if (Math.sin(clock * 8 + z) > 0) {
      ctx.fillStyle = "#ffb703";
      ctx.beginPath();
      ctx.arc(board.l + 0.15 * board.s, board.t - 0.1 * board.s, 0.1 * board.s, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Yellow "POLICE LINE" board on two posts. Players must crouch under it. */
export function drawPoliceLine(ctx: Ctx, v: View, x: number, z: number, clock: number) {
  const { w, h, clearance } = POLICE_LINE;
  for (const lx of [-w / 2, w / 2]) {
    box(ctx, v, x + lx, 0.12, 0, h, z, z + 0.12, { front: "#9a9a9a", side: "#777", top: "#bbb" });
  }
  const r = box(ctx, v, x, w, clearance + 0.05, h - 0.2, z, z + 0.08, { front: "#ffd60a", side: "#c9a800", top: "#ffe55c" });
  if (r) {
    const img = label("police-line", 460, 200, (c, cw, chh) => {
      c.fillStyle = "#ffd60a";
      c.fillRect(0, 0, cw, chh);
      c.fillStyle = "#111";
      c.fillRect(0, 0, cw, chh * 0.12);
      c.fillRect(0, chh * 0.88, cw, chh * 0.12);
      text(c, "POLICE LINE", cw / 2, chh * 0.38, chh * 0.3, "#111", cw * 0.9);
      text(c, "DO NOT CROSS", cw / 2, chh * 0.68, chh * 0.2, "#111", cw * 0.9);
    });
    ctx.drawImage(img, r.l, r.t, r.r - r.l, r.b - r.t);
  }
  const lamp = project(v, x, h + 0.1, z);
  if (lamp.s > 1) {
    ctx.fillStyle = Math.sin(clock * 10) > 0 ? "#ff2d55" : "#2d7dff";
    ctx.beginPath();
    ctx.arc(lamp.x, lamp.y, 0.14 * lamp.s, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Police officer in khaki. Chasers (seen from behind) wear caps; officers blocking the road are in riot gear. */
export function drawOfficer(ctx: Ctx, v: View, x: number, z: number, clock: number, back: boolean, running: boolean) {
  const p = project(v, x, 0, z);
  if (p.s < 1) return;
  shadow(ctx, v, x, z, 0.45);
  const phase = running ? clock * 14 : 0;
  const bob = running ? Math.abs(Math.sin(phase)) * 0.06 * p.s : 0;
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
  ctx.fillStyle = "rgba(190, 220, 255, 0.42)";
  ctx.strokeStyle = "rgba(230, 240, 255, 0.9)";
  ctx.lineWidth = Math.max(1, 0.03 * p.s);
  ctx.beginPath();
  ctx.roundRect(p.x - 0.45 * p.s, p.y - 1.55 * p.s, 0.7 * p.s, 1.15 * p.s, 0.06 * p.s);
  ctx.fill();
  ctx.stroke();
  const lettering = label("shield", 140, 100, (c, cw, chh) => {
    text(c, "पुलिस", cw / 2, chh * 0.3, chh * 0.36, "#0b1730", cw * 0.95);
    text(c, "POLICE", cw / 2, chh * 0.75, chh * 0.3, "#0b1730", cw * 0.95);
  });
  ctx.drawImage(lettering, p.x - 0.42 * p.s, p.y - 1.45 * p.s, 0.64 * p.s, 0.46 * p.s);
}

/** Blue detention bus. `oncoming` buses drive at the player with their headlights on. */
export function drawPoliceBus(ctx: Ctx, v: View, x: number, z: number, len: number, oncoming: boolean, clock: number) {
  const { w, h } = POLICE_BUS;
  const z1 = z + len;
  shadow(ctx, v, x, z + 0.5, w * 0.6);
  const r = box(ctx, v, x, w, 0.35, h, z, z1, { front: "#1f4e8c", side: "#183f73", top: "#2b5fa6" });

  // Side windows with bars on whichever side faces the camera.
  const xl = x - w / 2;
  const xr = x + w / 2;
  const sideX = v.camX < xl ? xl : v.camX > xr ? xr : null;
  if (sideX !== null) {
    for (let wz = z + 1.4; wz < z1 - 1; wz += 1.6) {
      if (wz < v.near) continue;
      poly(ctx, v, "#0d1b2a", [[sideX, 1.6, wz], [sideX, 2.6, wz], [sideX, 2.6, wz + 1.2], [sideX, 1.6, wz + 1.2]]);
    }
    if (z > v.near) poly(ctx, v, "#e9ecef", [[sideX, 1.15, z], [sideX, 1.35, z], [sideX, 1.35, z1], [sideX, 1.15, z1]]);
    for (const wz of [z + 1.6, z1 - 2]) {
      if (wz < v.near) continue;
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
  ctx.fillStyle = "#e9ecef";
  ctx.fillRect(r.l, r.t + 1.85 * s, r.r - r.l, 0.2 * s);
  const busText = label("bus", 320, 60, (c, cw, chh) => text(c, "पुलिस  POLICE", cw / 2, chh / 2, chh * 0.7, "#fff", cw * 0.95));
  ctx.drawImage(busText, r.l + (r.r - r.l) * 0.05, r.t + 0.06 * s, (r.r - r.l) * 0.9, 0.34 * s);
  ctx.fillStyle = oncoming ? "#fff6b0" : "#bfb68a";
  for (const hx of [r.l + 0.35 * s, r.r - 0.35 * s]) {
    ctx.beginPath();
    ctx.arc(hx, r.b - 0.55 * s, 0.16 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  if (oncoming) {
    ctx.fillStyle = "rgba(255, 246, 176, 0.18)";
    ctx.beginPath();
    ctx.arc(mid, r.b - 0.55 * s, 1.6 * s, 0, Math.PI * 2);
    ctx.fill();
  }
  const blink = Math.sin(clock * 12) > 0;
  ctx.fillStyle = blink ? "#ff2d55" : "#5a1020";
  ctx.fillRect(mid - 0.6 * s, r.t - 0.15 * s, 0.55 * s, 0.15 * s);
  ctx.fillStyle = blink ? "#13234a" : "#2d7dff";
  ctx.fillRect(mid + 0.05 * s, r.t - 0.15 * s, 0.55 * s, 0.15 * s);
}
