import { CHASE_TIME, FREE_LIFELINES, INVULN_TIME, MAX_LIFELINES, START_CHASE_TIME } from "../shared/constants";
import { Crowd } from "../shared/crowd";
import { POLICE_BUS } from "../shared/props";
import { pick, rand, shuffle, weighted } from "../shared/random";
import type { Action, ArcadeEvents, ArcadeGame } from "../shared/types";

import {
  BOOST_COST,
  BOOST_MULT,
  BOOST_TIME,
  BRAKE_MULT,
  BRAKE_TIME,
  CAR_HALF_W,
  CAR_LEN,
  LANE_COUNT,
  LANE_SWITCH_RATE,
  laneX,
  MAX_SPEED,
  ROAD_HALF,
  SMASH_POINTS,
  SPEED_GAIN,
  START_SPEED,
  VIEW_DIST,
} from "./constants";

/** Sizes of everything on the road. `soft` obstacles only scrape you; `smash` ones break under nitro. */
export const VEHICLE = {
  car: { w: 1.8, len: 4.0, h: 1.45, smash: false, soft: false },
  auto: { w: 1.4, len: 2.7, h: 1.75, smash: false, soft: false },
  jeep: { w: 1.8, len: 3.8, h: 1.9, smash: false, soft: false },
  bus: { w: POLICE_BUS.w, len: POLICE_BUS.len, h: POLICE_BUS.h, smash: false, soft: false },
  barricade: { w: 2.3, len: 0.5, h: 1.05, smash: true, soft: false },
  cones: { w: 2.0, len: 0.5, h: 0.75, smash: true, soft: true },
} as const;

export type ObstacleKind = keyof typeof VEHICLE;
export type CrashReason = ObstacleKind | "caught";

export interface Obstacle {
  kind: ObstacleKind;
  lane: number;
  z: number;
  len: number;
  /** Speed towards the player (oncoming jeeps and buses). */
  vz: number;
  grazed: boolean;
  color: string;
  /** Seed for per-vehicle details (hazard blink timing). */
  seed: number;
}

export interface Pickup {
  kind: "coin" | "nitro" | "lifeline";
  lane: number;
  z: number;
  taken: boolean;
}

/** Flying pieces of a smashed barricade (decoration only). */
export interface Debris {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  color: string;
  life: number;
}

export interface Car {
  lane: number;
  prevLane: number;
  x: number;
  invulnT: number;
  boostT: number;
  brakeT: number;
  /** Nitro meter, 0..1. */
  nitro: number;
  /** Sideways lean while changing lanes, for drawing. */
  lean: number;
  wheel: number;
}

const CAR_COLORS = ["#e63946", "#f1f1f1", "#3a86ff", "#adb5bd", "#2a9d8f", "#6d597a", "#ffb703", "#264653"];

/** Barricade Drive rules. Rendering lives in render.ts. */
export class DriveGame implements ArcadeGame {
  status: "running" | "crashed" = "running";
  time = 0;
  distance = 0;
  speed = START_SPEED;
  coins = 0;
  smashes = 0;
  lifelines = FREE_LIFELINES;
  crashReason: CrashReason | null = null;
  chaseT = START_CHASE_TIME;
  /** Where the police bikes ride, in z. */
  chaserZ = -1.2;

  car: Car = { lane: 1, prevLane: 1, x: laneX(1), invulnT: 0, boostT: 0, brakeT: 0, nitro: BOOST_COST, lean: 0, wheel: 0 };
  obstacles: Obstacle[] = [];
  pickups: Pickup[] = [];
  debris: Debris[] = [];
  // A thin line of protesters on the verge beyond the guardrail: this is a highway, not the march.
  crowd = new Crowd({ edge: ROAD_HALF + 1.6, depth: 4, floor: 0, spacing: [2.5, 7], banners: false });

  private nextRowZ = 80;

  constructor(
    private events: ArcadeEvents = {},
    readonly ghost = false,
  ) {
    if (ghost) this.chaseT = 0;
  }

  get score() {
    return Math.floor(this.distance) + this.coins * 10 + this.smashes * SMASH_POINTS;
  }

  get boosting() {
    return this.car.boostT > 0;
  }

  get braking() {
    return this.car.brakeT > 0;
  }

  private get difficulty() {
    return Math.min(1, this.time / 120);
  }

  // ---- input -------------------------------------------------------------

  input(action: Action) {
    if (this.status !== "running") return;
    if (action === "left") this.changeLane(-1);
    else if (action === "right") this.changeLane(1);
    else if (action === "up") this.boost();
    else this.brake();
  }

  private changeLane(dir: -1 | 1) {
    const c = this.car;
    const target = Math.max(0, Math.min(LANE_COUNT - 1, c.lane + dir));
    if (target === c.lane) return;
    c.prevLane = c.lane;
    c.lane = target;
    this.events.onSound?.("lane");
  }

  private boost() {
    const c = this.car;
    if (c.boostT > 0 || c.nitro < BOOST_COST - 0.001) return;
    c.nitro = Math.max(0, c.nitro - BOOST_COST);
    c.boostT = BOOST_TIME;
    c.brakeT = 0;
    this.events.onSound?.("nitro");
  }

  private brake() {
    const c = this.car;
    c.brakeT = BRAKE_TIME;
    c.boostT = 0;
    this.events.onSound?.("brake");
  }

  revive() {
    if (this.status !== "crashed" || this.lifelines <= 0) return false;
    this.lifelines--;
    this.status = "running";
    this.crashReason = null;
    this.chaseT = 0;
    this.obstacles = this.obstacles.filter((o) => o.z > 35);
    this.nextRowZ = Math.max(this.nextRowZ, 35);
    const c = this.car;
    c.x = laneX(c.lane);
    c.invulnT = INVULN_TIME;
    c.boostT = 0;
    c.brakeT = 0;
    this.speed = Math.min(this.speed, START_SPEED + 6);
    return true;
  }

  // ---- simulation --------------------------------------------------------

  update(dt: number) {
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps && this.status === "running"; i++) this.step(dt / steps);
    if (this.status !== "running") this.updateDebris(dt);
  }

  private step(dt: number) {
    this.time += dt;
    const c = this.car;
    const cruise = this.ghost ? START_SPEED : Math.min(MAX_SPEED, START_SPEED + this.time * SPEED_GAIN);
    const target = cruise * (c.boostT > 0 ? BOOST_MULT : 1) * (c.brakeT > 0 ? BRAKE_MULT : 1);
    this.speed += (target - this.speed) * Math.min(1, dt * (c.brakeT > 0 ? 6 : 3));
    const dz = this.speed * dt;
    this.distance += dz;

    const tx = laneX(c.lane);
    const before = c.x;
    c.x += (tx - c.x) * Math.min(1, dt * LANE_SWITCH_RATE);
    c.lean += ((c.x - before) / Math.max(dt, 1e-4) / 12 - c.lean) * Math.min(1, dt * 10);
    c.invulnT = Math.max(0, c.invulnT - dt);
    c.boostT = Math.max(0, c.boostT - dt);
    c.brakeT = Math.max(0, c.brakeT - dt);
    c.wheel += dz * 2;

    this.chaseT = Math.max(0, this.chaseT - dt);
    const chaserTarget = this.chaseT > 0 ? -1.2 : -16;
    this.chaserZ += (chaserTarget - this.chaserZ) * Math.min(1, dt * 2.5);

    for (const o of this.obstacles) o.z -= dz + o.vz * dt;
    for (const p of this.pickups) p.z -= dz;
    this.crowd.update(dz, dt);
    this.updateDebris(dt, dz);
    this.obstacles = this.obstacles.filter((o) => o.z + o.len > -10);
    this.pickups = this.pickups.filter((p) => p.z > -8 && !p.taken);

    this.nextRowZ -= dz;
    while (this.nextRowZ < VIEW_DIST) {
      const rowLen = this.spawnRow(this.nextRowZ);
      const gap = Math.max(16, cruise * rand(0.85, 1.3) * (1.3 - 0.45 * this.difficulty));
      this.spawnPickups(this.nextRowZ + rowLen + 4, gap - 8);
      this.nextRowZ += rowLen + gap;
    }

    if (this.ghost) this.autopilot();
    else this.collide();
  }

  private updateDebris(dt: number, dz = 0) {
    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt - dz;
      d.vy -= 22 * dt;
      if (d.y < 0) {
        d.y = 0;
        d.vy *= -0.3;
        d.vx *= 0.7;
      }
      d.life -= dt;
    }
    this.debris = this.debris.filter((d) => d.life > 0 && d.z > -8);
  }

  private autopilot() {
    const c = this.car;
    const ahead = (lane: number, from: number, to: number) =>
      this.obstacles.find((o) => o.lane === lane && o.z + o.len > from && o.z < to);
    if (!ahead(c.lane, 0, 26)) return;
    const lanes = Array.from({ length: LANE_COUNT }, (_, i) => i);
    const free = lanes.filter((l) => !ahead(l, -2, 30));
    if (!free.length) return;
    const target = free.sort((a, b) => Math.abs(a - c.lane) - Math.abs(b - c.lane))[0];
    const dir = Math.sign(target - c.lane) as -1 | 1;
    if (target !== c.lane && !ahead(c.lane + dir, -5, CAR_LEN + 3)) this.changeLane(dir);
  }

  private collide() {
    const c = this.car;
    for (const p of this.pickups) {
      if (p.taken || p.z > CAR_LEN || p.z < -0.5 || Math.abs(c.x - laneX(p.lane)) > 1.3) continue;
      p.taken = true;
      if (p.kind === "coin") {
        this.coins++;
        c.nitro = Math.min(1, c.nitro + 0.01);
        this.events.onSound?.("coin");
      } else if (p.kind === "nitro") {
        c.nitro = Math.min(1, c.nitro + BOOST_COST);
        this.events.onSound?.("lifeline");
      } else {
        this.lifelines = Math.min(MAX_LIFELINES, this.lifelines + 1);
        this.events.onSound?.("lifeline");
      }
    }

    for (const o of this.obstacles) {
      if (o.grazed) continue;
      if (o.z > CAR_LEN || o.z + o.len < 0) continue;
      const spec = VEHICLE[o.kind];
      const dx = Math.abs(c.x - laneX(o.lane));
      if (dx > CAR_HALF_W + spec.w / 2 - 0.15) continue;

      if (spec.smash && (c.boostT > 0 || c.invulnT > 0)) {
        this.smash(o);
        continue;
      }
      if (c.invulnT > 0) continue;
      if (spec.soft) {
        this.smash(o, false);
        this.stumble();
        if (this.status !== "running") return;
        continue;
      }
      if (o.lane === c.lane && dx < 0.75) {
        this.crash(o.kind);
        return;
      }
      // Scraped the side while changing lanes: bounce back and the police notice.
      o.grazed = true;
      if (o.lane === c.lane) c.lane = c.prevLane;
      this.stumble();
      if (this.status !== "running") return;
    }
  }

  private smash(o: Obstacle, score = true) {
    o.grazed = true;
    o.z = -100;
    if (score) this.smashes++;
    this.events.onSound?.("smash");
    const colors = o.kind === "cones" ? ["#ff6b1a", "#ffffff"] : ["#f1f1f1", "#d62828", "#3a3a3a"];
    for (let i = 0; i < 12; i++) {
      this.debris.push({
        x: laneX(o.lane) + rand(-1, 1),
        y: rand(0.3, 1),
        z: CAR_LEN + rand(0, 1),
        vx: rand(-6, 6),
        vy: rand(4, 10),
        vz: rand(4, 14),
        spin: rand(-12, 12),
        color: pick(colors),
        life: rand(0.6, 1.2),
      });
    }
  }

  private stumble() {
    if (this.car.invulnT > 0) return;
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

  /** One row of the jam. Never blocks all four lanes. */
  private spawnRow(z: number) {
    const d = this.difficulty;
    const lanes = shuffle(Array.from({ length: LANE_COUNT }, (_, i) => i));
    const r = Math.random();
    const count = r < 0.35 - 0.2 * d ? 1 : r < 0.8 ? 2 : 3;
    let rowLen = 0;
    for (let i = 0; i < count; i++) {
      const lane = lanes[i];
      const kind = weighted<ObstacleKind>({ car: 4, auto: 2.5, jeep: 1.5 + d, bus: 1 + 1.5 * d, barricade: 2, cones: 1.5 });
      const spec = VEHICLE[kind];
      let vz = 0;
      if ((kind === "jeep" || kind === "bus") && Math.random() < 0.2 + 0.3 * d && this.laneClearAhead(lane, z)) {
        vz = 8 + 8 * d;
        this.pickups = this.pickups.filter((p) => p.lane !== lane || p.z < 0);
      }
      this.obstacles.push({
        kind,
        lane,
        z: z + (spec.len < 1 ? 0 : rand(0, 2)),
        len: spec.len,
        vz,
        grazed: false,
        color: pick(CAR_COLORS),
        seed: Math.random() * 10,
      });
      rowLen = Math.max(rowLen, spec.len + 2);
    }
    return rowLen;
  }

  private laneClearAhead(lane: number, z: number) {
    return !this.obstacles.some((o) => o.lane === lane && o.z < z && o.z + o.len > -2);
  }

  private spawnPickups(z: number, span: number) {
    if (span < 6) return;
    const lane = Math.floor(Math.random() * LANE_COUNT);
    const count = Math.min(10, Math.floor(span / 2.6));
    const roll = Math.random();
    const special =
      this.lifelines < MAX_LIFELINES && roll < 0.035 ? "lifeline" : roll < 0.16 && this.car.nitro < 1 ? "nitro" : null;
    for (let i = 0; i < count; i++) {
      const kind = special && i === Math.floor(count / 2) ? special : "coin";
      this.pickups.push({ kind, lane, z: z + i * 2.6, taken: false });
    }
  }
}
