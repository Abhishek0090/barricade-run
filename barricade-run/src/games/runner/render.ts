import { drawBarricade, drawOfficer, drawPoliceBus, drawPoliceLine } from "../shared/props";
import {
  type Ctx,
  drawBackdrop,
  drawBuildings,
  drawCoin,
  drawHeartPickup,
  drawLamp,
  hero,
  heroRing,
  makeView,
  project,
  shadow,
  sirenGlow,
  type Sprite,
  strip,
  type View,
  vignette,
} from "../shared/scene";

import { BUILDING_X, CAM_BACK, CAM_H, LANE_W, PLAYER_HALF_W, ROAD_HALF, SIDEWALK_END, VIEW_DIST } from "./constants";
import type { Pickup, RunnerGame } from "./engine";

export function makeRunnerView(w: number, h: number): View {
  return makeView(w, h, {
    height: CAM_H,
    back: CAM_BACK,
    sky: { top: "#1a1033", mid: "#5b2a5e", low: "#f08a4b", far: "#3a2348", near: "#24172f" },
  });
}

const SEG = 4;

function drawGround(ctx: Ctx, v: View, distance: number) {
  ctx.fillStyle = "#1c1820";
  ctx.fillRect(0, v.horizon, v.w, v.h - v.horizon);

  const far = VIEW_DIST + SEG;
  for (const side of [-1, 1]) {
    strip(ctx, v, "#443c4a", side * (ROAD_HALF + 0.3), side * SIDEWALK_END, v.near, far, 0.15);
    strip(ctx, v, "#222", side * ROAD_HALF, side * (ROAD_HALF + 0.3), v.near, far, 0.15);
  }
  strip(ctx, v, "#302e36", -ROAD_HALF, ROAD_HALF, v.near, far);

  const first = Math.floor((distance + v.near) / SEG);
  const last = Math.ceil((distance + VIEW_DIST) / SEG);
  for (let i = last; i >= first; i--) {
    if (i % 2 !== 0) continue;
    const z1 = i * SEG + SEG - distance;
    const z0 = Math.max(v.near, i * SEG - distance);
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

function drawPickup(ctx: Ctx, v: View, c: Pickup, clock: number) {
  const p = project(v, c.lane * LANE_W, c.y + Math.sin(clock * 4 + c.z) * 0.08, c.z);
  if (p.s < 1) return;
  if (c.kind === "coin") drawCoin(ctx, p.x, p.y, 0.3 * p.s, Math.cos(clock * 5 + c.z * 0.3));
  else drawHeartPickup(ctx, p.x, p.y, p.s, clock);
}

function drawPlayer(ctx: Ctx, v: View, game: RunnerGame, clock: number) {
  const pl = game.player;
  shadow(ctx, v, pl.x, 0, PLAYER_HALF_W + 0.15 - Math.min(0.2, pl.y * 0.08), 0.45);
  heroRing(ctx, v, pl.x, 0, 0.62);
  if (pl.invulnT > 0 && Math.sin(clock * 30) > 0.3) return;
  const p = project(v, pl.x, pl.y, 0);
  hero(ctx, p.x, p.y, p.s, { phase: pl.runPhase, clock, air: pl.y > 0.05, crouch: game.crouching });
  if (pl.invulnT > 0) {
    ctx.strokeStyle = "rgba(120, 220, 255, 0.8)";
    ctx.lineWidth = Math.max(2, 0.05 * p.s);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 0.9 * p.s, 0.75 * p.s, 1.1 * p.s, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function renderRunner(ctx: Ctx, v: View, game: RunnerGame, clock: number) {
  v.camX += (game.player.x * 0.55 - v.camX) * 0.15;

  drawBackdrop(ctx, v);
  drawGround(ctx, v, game.distance);
  drawBuildings(ctx, v, game.distance, BUILDING_X, VIEW_DIST);

  const sprites: Sprite[] = [];
  game.crowd.sprites(ctx, v, clock, VIEW_DIST, sprites);
  const lampStart = Math.ceil((game.distance + v.near) / 30);
  for (let k = lampStart; k * 30 - game.distance < VIEW_DIST; k++) {
    const z = k * 30 - game.distance;
    for (const side of [-1, 1] as const) sprites.push({ z: z + 0.01, draw: () => drawLamp(ctx, v, side * (ROAD_HALF + 0.7), side, z) });
  }
  for (const o of game.obstacles) {
    if (o.z > VIEW_DIST || o.z + o.len < v.near) continue;
    const x = o.lane * LANE_W;
    const draw =
      o.kind === "barricade"
        ? () => drawBarricade(ctx, v, x, o.z, clock)
        : o.kind === "banner"
          ? () => drawPoliceLine(ctx, v, x, o.z, clock)
          : o.kind === "bus"
            ? () => drawPoliceBus(ctx, v, x, o.z, o.len, o.vz > 0, clock)
            : () => drawOfficer(ctx, v, x, o.z + o.len / 2, clock, false, false);
    // Long buses sort by their near end so the player is drawn over them only when actually in front.
    sprites.push({ z: o.z, draw });
  }
  for (const c of game.pickups) {
    if (!c.taken && c.z > v.near && c.z < VIEW_DIST) sprites.push({ z: c.z, draw: () => drawPickup(ctx, v, c, clock) });
  }
  sprites.push({ z: 0, draw: () => drawPlayer(ctx, v, game, clock) });
  if (game.chaserZ > v.near + 0.3) {
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

  vignette(ctx, v);
  sirenGlow(ctx, v, clock, game.chaseT);
}
