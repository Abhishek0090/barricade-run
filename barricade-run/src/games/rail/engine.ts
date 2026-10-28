import { CHASE_TIME, FREE_LIFELINES, INVULN_TIME, MAX_LIFELINES, START_CHASE_TIME } from "../shared/constants";
import { Crowd } from "../shared/crowd";
import { OFFICER, POLICE_LINE } from "../shared/props";
import { pick, rand, shuffle, weighted } from "../shared/random";
import type { Action, ArcadeEvents, ArcadeGame } from "../shared/types";

import {
  BELL_COOLDOWN,
  BELL_RANGE,
  CART_BACK,
  CART_FRONT,
  CART_HALF_W,
  DUCK_TIME,
  DUCK_TOP,
  GAP_MAX,
  GAP_MIN,
  LANE_W,
  MAX_SPEED,
  PLATFORM_H,
  PLATFORM_X,
  RIDER_TOP,
  SPEED_GAIN,
  START_SPEED,
  SWITCH_RATE,
  type Track,
  VIEW_DIST,
} from "./constants";

/**
 * Everything on the line. The trolley can't leave the rails, so only the overhead police line can be
 * passed in place (by ducking); everything else means switching track, or ringing the bell for police.
 */
export const OBSTACLE = {
  /** Steel barricade bolted across the track. */
  barricade: { w: 2.2, h: 1.05, len: 0.5 },
  banner: POLICE_LINE,
  police: OFFICER,
  /** Last coach of a stopped train, showing the yellow X board. */
  coach: { w: 2.9, h: 3.9, len: 16 },
  /** Locomotive coming down the line. */
  loco: { w: 3.0, h: 4.2, len: 17 },
  /** Buffer stop where a track has been pulled up. */
  buffer: { w: 2.2, h: 1.4, len: 0.6 },
} as const;

export type ObstacleKind = keyof typeof OBSTACLE;
export type CrashReason = ObstacleKind | "caught";

export interface Obstacle {
  kind: ObstacleKind;
  lane: Track;
  z: number;
  len: number;
  vz: number;
  grazed: boolean;
  honked: boolean;
  /** Police only: 0 on the track, rising to 1 once they have stepped off after the bell. */
  cleared: number;
}

/** Stretch of one track with no rails. */
export interface Gap {
  lane: Track;
  z: number;
  len: number;
}

export interface Pickup {
  kind: "coin" | "lifeline";
  lane: Track;
  z: number;
  y: number;
  taken: boolean;
}

export interface Spark {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  life: number;
}

export interface Trolley {
  lane: Track;
  prevLane: Track;
  x: number;
  duckT: number;
  invulnT: number;
  /** Seconds until the bell can ring again. */
  bellT: number;
  /** Sideways tilt while switching tracks, for drawing. */
  tilt: number;
  wheel: number;
  phase: number;
}

const LANES: Track[] = [-1, 0, 1];

/** Rail Roko rules. Rendering lives in render.ts. */
export class RailGame implements ArcadeGame {
  status: "running" | "crashed" = "running";
  time = 0;
  distance = 0;
  speed = START_SPEED;
  coins = 0;
  lifelines = FREE_LIFELINES;
  crashReason: CrashReason | null = null;
  chaseT = START_CHASE_TIME;
  chaserZ = -2.2;

  cart: Trolley = { lane: 0, prevLane: 0, x: 0, duckT: 0, invulnT: 0, bellT: 0, tilt: 0, wheel: 0, phase: 0 };
  obstacles: Obstacle[] = [];
  gaps: Gap[] = [];
  pickups: Pickup[] = [];
  sparks: Spark[] = [];
  crowd = new Crowd({ edge: PLATFORM_X, depth: 4, floor: PLATFORM_H, spacing: [1.6, 3.6] });

  private nextRowZ = 45;

  constructor(
    private events: ArcadeEvents = {},
    readonly ghost = false,
  ) {
    if (ghost) this.chaseT = 0;
  }

  get score() {
    return Math.floor(this.distance) + this.coins * 10;
  }

  get ducking() {
    return this.cart.duckT > 0;
  }

  /** True for half a second after the bell rings, for drawing the rings around it. */
  get ringing() {
    return this.cart.bellT > BELL_COOLDOWN - 0.5;
  }

  private get difficulty() {
    return Math.min(1, this.time / 120);
  }

  /** True when the track in `lane` has rails everywhere between z0 and z1. */
  hasRail(lane: Track, z0: number, z1 = z0) {
    return !this.gapOverlaps(lane, z0, z1);
  }

  private gapOverlaps(lane: Track, z0: number, z1: number) {
    return this.gaps.some((g) => g.lane === lane && g.z < z1 && g.z + g.len > z0);
  }

  // ---- input -------------------------------------------------------------

  input(action: Action) {
    if (this.status !== "running") return;
    if (action === "left") this.switchTrack(-1);
    else if (action === "right") this.switchTrack(1);
    else if (action === "up") this.ringBell();
    else this.duck();
  }

  private switchTrack(dir: -1 | 1) {
    const c = this.cart;
    const target = Math.max(-1, Math.min(1, c.lane + dir)) as Track;
    if (target === c.lane) return;
    // No switching onto a track that has been pulled up.
    if (this.gapOverlaps(target, -CART_BACK - 1, CART_FRONT + 2)) {
      this.events.onSound?.("clank");
      return;
    }
    c.prevLane = c.lane;
    c.lane = target;
    this.events.onSound?.("lane");
    this.sparkBurst(c.x + dir * 0.6);
  }

  /** Railway police on your track up ahead step off the line. */
  private ringBell() {
    const c = this.cart;
    if (c.bellT > 0) {
      this.events.onSound?.("clank");
      return;
    }
    c.bellT = BELL_COOLDOWN;
    this.events.onSound?.("bell");
    for (const o of this.obstacles) {
      if (o.kind === "police" && o.lane === c.lane && o.z > -1 && o.z < BELL_RANGE && o.cleared === 0) o.cleared = 0.01;
    }
  }

  private duck() {
    this.cart.duckT = DUCK_TIME;
    this.events.onSound?.("crouch");
  }

  revive() {
    if (this.status !== "crashed" || this.lifelines <= 0) return false;
    this.lifelines--;
    this.status = "running";
    this.crashReason = null;
    this.chaseT = 0;
    this.obstacles = this.obstacles.filter((o) => o.z > 30);
    this.gaps = this.gaps.filter((g) => g.z > 30);
    this.nextRowZ = Math.max(this.nextRowZ, 30);
    const c = this.cart;
    c.duckT = 0;
    c.x = c.lane * LANE_W;
    c.invulnT = INVULN_TIME;
    return true;
  }

  // ---- simulation --------------------------------------------------------

  update(dt: number) {
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps && this.status === "running"; i++) this.step(dt / steps);
  }

  private step(dt: number) {
    this.time += dt;
    this.speed = this.ghost ? START_SPEED : Math.min(MAX_SPEED, START_SPEED + this.time * SPEED_GAIN);
    const dz = this.speed * dt;
    this.distance += dz;

    this.updateCart(dt, dz);
    this.chaseT = Math.max(0, this.chaseT - dt);
    const chaserTarget = this.chaseT > 0 ? -2.2 : -14;
    this.chaserZ += (chaserTarget - this.chaserZ) * Math.min(1, dt * 2.5);

    for (const o of this.obstacles) {
      o.z -= dz + o.vz * dt;
      if (o.cleared > 0) o.cleared = Math.min(1, o.cleared + dt * 2.2);
      if (o.kind === "loco" && !o.honked && o.z < 70) {
        o.honked = true;
        if (!this.ghost) this.events.onSound?.("horn");
      }
    }
    for (const g of this.gaps) g.z -= dz;
    for (const p of this.pickups) p.z -= dz;
    for (const s of this.sparks) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z -= dz * 0.6;
      s.vy -= 18 * dt;
      s.life -= dt;
    }
    this.crowd.update(dz, dt);
    this.obstacles = this.obstacles.filter((o) => o.z + o.len > -8);
    this.gaps = this.gaps.filter((g) => g.z + g.len > -10);
    this.pickups = this.pickups.filter((p) => p.z > -8 && !p.taken);
    this.sparks = this.sparks.filter((s) => s.life > 0);

    this.nextRowZ -= dz;
    while (this.nextRowZ < VIEW_DIST) {
      const z = this.nextRowZ;
      let len: number;
      if (this.time > 6 && Math.random() < 0.2 + 0.1 * this.difficulty && !this.gaps.some((g) => g.z + g.len > z - 12)) {
        len = this.spawnGap(z);
      } else {
        len = this.spawnRow(z);
      }
      const gap = Math.max(13, this.speed * rand(0.85, 1.25) * (1.25 - 0.4 * this.difficulty));
      this.spawnCoins(z + len + 3, gap - 6);
      this.nextRowZ += len + gap;
    }

    if (this.ghost) this.autopilot();
    else this.collide();
  }

  private updateCart(dt: number, dz: number) {
    const c = this.cart;
    const before = c.x;
    c.x += (c.lane * LANE_W - c.x) * Math.min(1, dt * SWITCH_RATE);
    const vx = (c.x - before) / Math.max(dt, 1e-4);
    c.tilt += (vx * 0.018 - c.tilt) * Math.min(1, dt * 12);
    c.duckT = Math.max(0, c.duckT - dt);
    c.invulnT = Math.max(0, c.invulnT - dt);
    c.bellT = Math.max(0, c.bellT - dt);
    c.wheel += dz * 2.2;
    c.phase += dt * 6;
  }

  private sparkBurst(x: number) {
    for (let i = 0; i < 6; i++) {
      this.sparks.push({ x, y: 0.2, z: rand(-0.2, 0.6), vx: rand(-3, 3), vy: rand(1.5, 4.5), life: rand(0.2, 0.45) });
    }
  }

  /** Whether an obstacle still blocks the trolley (police who stepped off don't). */
  private blocks(o: Obstacle) {
    return o.kind !== "police" || o.cleared === 0;
  }

  private autopilot() {
    const c = this.cart;
    const ahead = (lane: Track, from: number, to: number) =>
      this.obstacles.find((o) => o.lane === lane && this.blocks(o) && o.z + o.len > from && o.z < to);
    const blocked = (lane: Track, from: number, to: number) => !!ahead(lane, from, to) || this.gapOverlaps(lane, from, to);
    if (!blocked(c.lane, 0, 14)) return;
    const free = LANES.filter((l) => !blocked(l, -1, 18));
    if (free.length) {
      const target = free.sort((a, b) => Math.abs(a - c.lane) - Math.abs(b - c.lane))[0];
      const step = Math.sign(target - c.lane) as -1 | 1;
      if (target !== c.lane && !blocked((c.lane + step) as Track, -1, 3)) this.switchTrack(step);
      return;
    }
    const block = ahead(c.lane, 0, 14);
    if (block?.kind === "police") this.ringBell();
    else if (block && block.z < 2.5 && block.kind === "banner" && !this.ducking) this.duck();
  }

  private collide() {
    const c = this.cart;
    const top = this.ducking ? DUCK_TOP : RIDER_TOP;

    for (const p of this.pickups) {
      if (p.taken || p.z > CART_FRONT || p.z < -CART_BACK - 0.4 || Math.abs(c.x - p.lane * LANE_W) > 1.1) continue;
      if (p.y > top + 0.4) continue;
      p.taken = true;
      if (p.kind === "coin") {
        this.coins++;
        this.events.onSound?.("coin");
      } else {
        this.lifelines = Math.min(MAX_LIFELINES, this.lifelines + 1);
        this.events.onSound?.("lifeline");
      }
    }

    if (c.invulnT > 0) return;

    // Still on a pulled-up track when the post-revive protection runs out: derailed.
    if (!this.hasRail(c.lane, -0.2, 0.2)) {
      this.crash("buffer");
      return;
    }

    for (const o of this.obstacles) {
      if (o.grazed || !this.blocks(o)) continue;
      if (o.z > CART_FRONT || o.z + o.len < -CART_BACK) continue;
      const dx = Math.abs(c.x - o.lane * LANE_W);
      if (dx > CART_HALF_W + OBSTACLE[o.kind].w / 2 - 0.2) continue;
      if (o.kind === "banner" && top <= OBSTACLE.banner.clearance) continue;

      if (o.lane === c.lane && dx < 0.6) {
        this.crash(o.kind);
        return;
      }
      o.grazed = true;
      if (o.lane === c.lane) c.lane = c.prevLane;
      this.stumble();
      if (this.status !== "running") return;
    }
  }

  private stumble() {
    if (this.cart.invulnT > 0) return;
    if (this.chaseT > 0) {
      this.crash("caught");
      return;
    }
    this.chaseT = CHASE_TIME;
    this.events.onSound?.("stumble");
  }

  private crash(reason: CrashReason) {
    this.status = "crashed";
    this.crashReason = reason;
    this.events.onSound?.("crash");
    this.events.onCrash?.(reason);
  }

  // ---- spawning ----------------------------------------------------------

  /** A track ends at a buffer stop and resumes later. */
  private spawnGap(z: number) {
    const lane = pick(LANES);
    const len = rand(GAP_MIN, GAP_MAX);
    this.gaps.push({ lane, z: z + OBSTACLE.buffer.len, len });
    this.obstacles.push({ kind: "buffer", lane, z, len: OBSTACLE.buffer.len, vz: 0, grazed: false, honked: false, cleared: 0 });
    this.pickups = this.pickups.filter((p) => p.lane !== lane || p.z < z || p.z > z + len + 2);
    return 4;
  }

  /**
   * One row of obstacles. Always leaves a way through: tracks that have been pulled up count as blocked,
   * and when every remaining track is blocked the last one gets a police line you can duck under.
   */
  private spawnRow(z: number) {
    const d = this.difficulty;
    const open = shuffle(LANES.filter((l) => !this.gapOverlaps(l, z - 3, z + OBSTACLE.coach.len + 3)));
    const railOpen = LANES.filter((l) => !this.gapOverlaps(l, z - 3, z + 3));
    const r = Math.random();
    let count = r < 0.45 - 0.25 * d ? 1 : r < 0.88 ? 2 : 3;
    count = Math.min(count, railOpen.length);
    let rowLen = 0;

    for (let i = 0; i < count; i++) {
      // Long trains only go where the track stays intact for their whole length.
      const lane = i < open.length ? open[i] : railOpen.filter((l) => !open.includes(l))[0];
      if (lane === undefined) break;
      const last = i === count - 1 && count === railOpen.length;
      const longOk = open.includes(lane);
      const kind: ObstacleKind = last
        ? "banner"
        : weighted({ barricade: 3, banner: 2, police: 2.5, coach: longOk ? 2 + d : 0, loco: longOk ? 1 + 1.5 * d : 0 });
      const len = OBSTACLE[kind].len;
      let vz = 0;
      if (kind === "loco" && this.laneClearAhead(lane, z)) {
        vz = 7 + 7 * d;
        this.pickups = this.pickups.filter((p) => p.lane !== lane || p.z < 0);
      }
      this.obstacles.push({ kind, lane, z, len, vz, grazed: false, honked: false, cleared: 0 });
      rowLen = Math.max(rowLen, len);
    }
    return rowLen;
  }

  private laneClearAhead(lane: Track, z: number) {
    return !this.obstacles.some((o) => o.lane === lane && o.z < z && o.z + o.len > -2) && !this.gapOverlaps(lane, -2, z);
  }

  private spawnCoins(z: number, span: number) {
    if (span < 4) return;
    const lanes = LANES.filter((l) => !this.gapOverlaps(l, z - 1, z + span + 1));
    if (!lanes.length) return;
    const lane = pick(lanes);
    const count = Math.min(10, Math.floor(span / 2.2));
    const heartAt = this.lifelines < MAX_LIFELINES && Math.random() < 0.04 ? Math.floor(count / 2) : -1;
    for (let i = 0; i < count; i++) {
      this.pickups.push({ kind: i === heartAt ? "lifeline" : "coin", lane, z: z + i * 2.2, y: 1.1, taken: false });
    }
  }
}
