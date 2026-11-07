import type { Ctx, View } from "../shared/scene";

import { type LocalGame, MARKER, PLATFORM_LEN } from "./engine";
import { drawLocalHud } from "./hud";

/** Flat fallback when WebGL is unavailable: a simple driver's-eye track view, plus the HUD. */
export function renderLocal(ctx: Ctx, v: View, g: LocalGame, clock: number) {
  const evening = g.start >= 17 * 3600;
  const horizon = v.h * 0.45;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, evening ? "#141d45" : "#6fa8dc");
  sky.addColorStop(1, evening ? "#ff9a5a" : "#efe1cc");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, v.w, horizon);
  ctx.fillStyle = evening ? "#3d3448" : "#77705f";
  ctx.fillRect(0, horizon, v.w, v.h - horizon);
  const cx = v.w / 2;
  const focal = v.h * 0.9;
  const camH = 2.9;
  const sxOf = (x: number, d: number) => cx + (x * focal) / d;
  const syOf = (y: number, d: number) => horizon + ((camH - y) * focal) / d;
  // Sleepers scrolling towards you, and the rails.
  for (let i = 0; i < 60; i++) {
    const d = 3 + i * 2.4 - (g.pos % 2.4);
    if (d <= 2) continue;
    ctx.strokeStyle = "rgba(160,155,145,0.8)";
    ctx.lineWidth = Math.max(1, 20 / d);
    ctx.beginPath();
    ctx.moveTo(sxOf(-1.3, d), syOf(0, d));
    ctx.lineTo(sxOf(1.3, d), syOf(0, d));
    ctx.stroke();
  }
  ctx.strokeStyle = "#c9ced4";
  ctx.lineWidth = 2;
  for (const x of [-0.84, 0.84]) {
    ctx.beginPath();
    ctx.moveTo(sxOf(x, 2.5), syOf(0, 2.5));
    ctx.lineTo(cx, horizon);
    ctx.stroke();
  }
  // The next platform.
  const h = g.nextHalt ?? g.atHalt;
  if (h) {
    const near = h.pos - PLATFORM_LEN / 2 - g.pos;
    const far = h.pos + PLATFORM_LEN / 2 - g.pos;
    if (far > 2 && near < 400) {
      const s = h.left ? -1 : 1;
      const d0 = Math.max(2.5, near);
      ctx.fillStyle = "#b5ada0";
      ctx.beginPath();
      ctx.moveTo(sxOf(s * 1.85, d0), syOf(0.95, d0));
      ctx.lineTo(sxOf(s * 11, d0), syOf(0.95, d0));
      ctx.lineTo(sxOf(s * 11, far), syOf(0.95, far));
      ctx.lineTo(sxOf(s * 1.85, far), syOf(0.95, far));
      ctx.fill();
      const dm = h.pos + MARKER - g.pos;
      if (dm > 2.5) {
        ctx.fillStyle = "#ffd60a";
        const bx = sxOf(s * 2.6, dm);
        const by = syOf(3.2, dm);
        const size = Math.max(3, 60 / dm) * 10;
        ctx.fillRect(bx - size / 2, by, size, size * 1.2);
      }
    }
  }
  // Cab frame.
  ctx.fillStyle = "#2d3533";
  ctx.fillRect(0, v.h * 0.82, v.w, v.h * 0.18);
  ctx.fillRect(cx - 4, 0, 8, v.h * 0.82);
  drawLocalHud(ctx, v, g, clock);
}
