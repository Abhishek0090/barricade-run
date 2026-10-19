import {
  CHASE_TIME,
  CROUCH_H,
  CROUCH_TIME,
  FAST_FALL_V,
  FREE_LIFELINES,
  GRAVITY,
  INVULN_TIME,
  JUMP_V,
  LANE_SWITCH_RATE,
  LANE_W,
  type Lane,
  MAX_LIFELINES,
  MAX_SPEED,
  OBSTACLE,
  PLACARDS,
  PLAYER_H,
  PLAYER_HALF_D,
  PLAYER_HALF_W,
  ROAD_HALF,
  SPEED_GAIN,
  START_CHASE_TIME,
  START_SPEED,
  VIEW_DIST,
} from "./constants";

export type ObstacleKind = keyof typeof OBSTACLE;
export type CrashReason = ObstacleKind | "caught";

export interface Obstacle {
  kind: ObstacleKind;
  lane: Lane;
  z: number;
  len: number;
  /** Extra speed towards the player (oncoming detention buses). */
  vz: number;
  grazed: boolean;
}

export interface Pickup {
  kind: "coin" | "lifeline";
  lane: Lane;
  z: number;
  y: number;
  taken: boolean;
}

export interface Protester {
  side: -1 | 1;
  x: number;
  z: number;
  shirt: string;
  skin: string;
  sign: string | null;
  signColor: string;
  phase: number;
  height: number;
}

export interface Player {
  lane: Lane;
  prevLane: Lane;
  x: number;
  y: number;
  vy: number;
  crouchT: number;
  invulnT: number;
  runPhase: number;
}

export interface GameEvents {
  onCoin?: () => void;
  onJump?: () => void;
  onCrouch?: () => void;
  onLane?: () => void;
  onStumble?: () => void;
  onLifelinePickup?: () => void;
  onCrash?: (reason: CrashReason) => void;
}

export type RunStatus = "running" | "crashed";

const SHIRTS = ["#e63946", "#f4a261", "#2a9d8f", "#e9c46a", "#8338ec", "#ff006e", "#3a86ff", "#fb5607", "#06d6a0", "#ffffff"];
const SKINS = ["#f1c27d", "#e0ac69", "#c68642", "#8d5524", "#ffdbac"];
const SIGN_COLORS = ["#fffbe6", "#ffe066", "#ffffff", "#ffd6e0", "#c8f7c5"];
const PROTESTER_SPAN = 150;

const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function weighted<T extends string>(weights: Record<T, number>): T {
  const entries = Object.entries(weights) as [T, number][];
  let roll = Math.random() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries[0][0];
}

/** All game rules: movement, spawning, collisions, chase and lifelines. Rendering lives in render.ts. */
export class Game {
  status: RunStatus = "running";
  time = 0;
  distance = 0;
  speed = START_SPEED;
  coins = 0;
  lifelines = FREE_LIFELINES;
  crashReason: CrashReason | null = null;
  /** Seconds left before the police give up the chase. */
  chaseT = START_CHASE_TIME;
  /** Where the chasing officers are drawn, in z. Eases towards the player during a chase. */
  chaserZ = -2.4;

  player: Player = { lane: 0, prevLane: 0, x: 0, y: 0, vy: 0, crouchT: 0, invulnT: 0, runPhase: 0 };
  obstacles: Obstacle[] = [];
  pickups: Pickup[] = [];
  protesters: Protester[] = [];

  private nextRowZ = 45;

  /**
   * @param ghost Attract mode for the home screen: no collisions, simple autopilot dodging.
   */
  constructor(
    private events: GameEvents = {},
    readonly ghost = false,
  ) {
    if (ghost) this.chaseT = 0;
    for (const side of [-1, 1] as const) {
      for (let z = -4; z < PROTESTER_SPAN - 4; z += rand(1.1, 2.6)) {
        this.protesters.push(this.makeProtester(side, z));
      }
    }
  }

  get score() {
    return Math.floor(this.distance) + this.coins * 10;
  }

  get crouching() {
    return this.player.crouchT > 0;
  }

  get grounded() {
    return this.player.y <= 0 && this.player.vy <= 0;
  }

  private get difficulty() {
    return Math.min(1, this.time / 120);
  }

  // ---- input -------------------------------------------------------------

  move(dir: -1 | 1) {
    if (this.status !== "running") return;
    const p = this.player;
    const target = Math.max(-1, Math.min(1, p.lane + dir)) as Lane;
    if (target === p.lane) return;
    p.prevLane = p.lane;
    p.lane = target;
    this.events.onLane?.();
  }

  jump() {
    if (this.status !== "running" || !this.grounded) return;
    this.player.crouchT = 0;
    this.player.vy = JUMP_V;
    this.events.onJump?.();
  }

  crouch() {
    if (this.status !== "running") return;
    const p = this.player;
    if (!this.grounded) p.vy = Math.min(p.vy, FAST_FALL_V);
    p.crouchT = CROUCH_TIME;
    this.events.onCrouch?.();
  }

  /** Spend a lifeline after a crash. Clears the road ahead and gives a few seconds of protection. */
  revive() {
    if (this.status !== "crashed" || this.lifelines <= 0) return false;
    this.lifelines--;
    this.status = "running";
    this.crashReason = null;
    this.chaseT = 0;
    this.obstacles = this.obstacles.filter((o) => o.z > 30);
    this.nextRowZ = Math.max(this.nextRowZ, 30);
    const p = this.player;
    p.y = 0;
    p.vy = 0;
    p.crouchT = 0;
    p.x = p.lane * LANE_W;
    p.invulnT = INVULN_TIME;
    return true;
  }

  // ---- simulation --------------------------------------------------------

  update(dt: number) {
    // Small fixed substeps so thin obstacles can't be skipped over at high speed or low frame rates.
    const steps = Math.ceil(dt / (1 / 120));
    for (let i = 0; i < steps && this.status === "running"; i++) this.step(dt / steps);
  }

  private step(dt: number) {
    this.time += dt;
    this.speed = this.ghost ? START_SPEED : Math.min(MAX_SPEED, START_SPEED + this.time * SPEED_GAIN);
    const dz = this.speed * dt;
    this.distance += dz;

    this.updatePlayer(dt);
    this.chaseT = Math.max(0, this.chaseT - dt);
    const chaserTarget = this.chaseT > 0 ? -2.4 : -14;
    this.chaserZ += (chaserTarget - this.chaserZ) * Math.min(1, dt * 2.5);

    for (const o of this.obstacles) o.z -= dz + o.vz * dt;
    for (const c of this.pickups) c.z -= dz;
    for (const pr of this.protesters) {
      pr.z -= dz;
      if (pr.z < -6) Object.assign(pr, this.makeProtester(pr.side, pr.z + PROTESTER_SPAN));
    }
    this.obstacles = this.obstacles.filter((o) => o.z + o.len > -8);
    this.pickups = this.pickups.filter((c) => c.z > -8 && !c.taken);

    this.nextRowZ -= dz;
    while (this.nextRowZ < VIEW_DIST) {
      const rowLen = this.spawnRow(this.nextRowZ);
      const gap = Math.max(11, this.speed * rand(0.8, 1.25) * (1.25 - 0.45 * this.difficulty));
      this.spawnCoins(this.nextRowZ + rowLen + 3, gap - 6);
      this.nextRowZ += rowLen + gap;
    }

    if (this.ghost) this.autopilot();
    else this.collide();
  }

  private autopilot() {
    const p = this.player;
    const ahead = (lane: Lane, from: number, to: number) =>
      this.obstacles.find((o) => o.lane === lane && o.z + o.len > from && o.z < to);
    const block = ahead(p.lane, 0, 14);
    if (!block) return;
    const free = ([-1, 0, 1] as Lane[]).filter((l) => !ahead(l, -1, 18));
    if (free.length) {
      const target = free.sort((a, b) => Math.abs(a - p.lane) - Math.abs(b - p.lane))[0];
      if (target !== p.lane && !ahead((p.lane + Math.sign(target - p.lane)) as Lane, -1, 3)) {
        this.move(Math.sign(target - p.lane) as -1 | 1);
      }
    } else if (block.z < 2.5 && block.kind === "barricade") this.jump();
    else if (block.z < 2.5 && block.kind === "banner" && !this.crouching) this.crouch();
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    p.x += (p.lane * LANE_W - p.x) * Math.min(1, dt * LANE_SWITCH_RATE);
    if (p.y > 0 || p.vy > 0) {
      p.vy -= GRAVITY * dt;
      p.y += p.vy * dt;
      if (p.y <= 0) {
        p.y = 0;
        p.vy = 0;
      }
    }
    p.crouchT = Math.max(0, p.crouchT - dt);
    p.invulnT = Math.max(0, p.invulnT - dt);
    p.runPhase += dt * (6 + this.speed * 0.25);
  }

  private collide() {
    const p = this.player;
    const top = p.y + (this.crouching ? CROUCH_H : PLAYER_H);

    for (const c of this.pickups) {
      if (c.taken || Math.abs(c.z) > 0.9 || Math.abs(p.x - c.lane * LANE_W) > 1.1) continue;
      if (c.y < p.y - 0.4 || c.y > top + 0.4) continue;
      c.taken = true;
      if (c.kind === "coin") {
        this.coins++;
        this.events.onCoin?.();
      } else {
        this.lifelines = Math.min(MAX_LIFELINES, this.lifelines + 1);
        this.events.onLifelinePickup?.();
      }
    }

    if (p.invulnT > 0) return;

    for (const o of this.obstacles) {
      if (o.grazed) continue;
      if (o.z > PLAYER_HALF_D || o.z + o.len < -PLAYER_HALF_D) continue;
      const dx = Math.abs(p.x - o.lane * LANE_W);
      if (dx > PLAYER_HALF_W + OBSTACLE[o.kind].w / 2 - 0.15) continue;

      const blocked =
        o.kind === "barricade"
          ? p.y < OBSTACLE.barricade.h - 0.05
          : o.kind === "banner"
            ? top > OBSTACLE.banner.clearance
            : true;
      if (!blocked) continue;

      if (o.lane === p.lane && dx < 0.6) {
        this.crash(o.kind);
        return;
      }
      // Clipped the side while changing lanes: stumble and bounce back.
      o.grazed = true;
      if (o.lane === p.lane) p.lane = p.prevLane;
      this.stumble();
      if (this.status !== "running") return;
    }
  }

  private stumble() {
    if (this.player.invulnT > 0) return;
    if (this.chaseT > 0) {
      this.crash("caught");
      return;
    }
    this.chaseT = CHASE_TIME;
    this.events.onStumble?.();
  }

  private crash(reason: CrashReason) {
    this.status = "crashed";
    this.crashReason = reason;
    this.events.onCrash?.(reason);
  }

  // ---- spawning ----------------------------------------------------------

  /** Places one row of obstacles at z and returns its length. Always leaves a way through. */
  private spawnRow(z: number) {
    const d = this.difficulty;
    const lanes = shuffle([-1, 0, 1] as Lane[]);
    const r = Math.random();
    const count = r < 0.4 - 0.25 * d ? 1 : r < 0.85 ? 2 : 3;
    let rowLen = 0;

    for (let i = 0; i < count; i++) {
      const lane = lanes[i];
      // With all three lanes blocked, the last one must be jumpable or slidable.
      const kind: ObstacleKind =
        count === 3 && i === 2
          ? pick(["barricade", "banner"] as const)
          : weighted({ barricade: 3, banner: 2, police: 3, bus: 2 + 2 * d });
      const len = OBSTACLE[kind].len;
      let vz = 0;
      if (kind === "bus" && Math.random() < 0.15 + 0.3 * d && this.laneClearAhead(lane, z)) {
        vz = 6 + 6 * d;
        this.pickups = this.pickups.filter((c) => c.lane !== lane || c.z < 0);
      }
      this.obstacles.push({ kind, lane, z, len, vz, grazed: false });
      rowLen = Math.max(rowLen, len);

      if (kind === "barricade" && Math.random() < 0.35) this.spawnCoinArc(lane, z + len / 2);
    }
    return rowLen;
  }

  private laneClearAhead(lane: Lane, z: number) {
    return !this.obstacles.some((o) => o.lane === lane && o.z < z && o.z + o.len > -2);
  }

  private spawnCoins(z: number, span: number) {
    if (span < 4) return;
    const lane = pick([-1, 0, 1] as const);
    const count = Math.min(10, Math.floor(span / 2.2));
    const heartAt = this.lifelines < MAX_LIFELINES && Math.random() < 0.04 ? Math.floor(count / 2) : -1;
    for (let i = 0; i < count; i++) {
      this.pickups.push({ kind: i === heartAt ? "lifeline" : "coin", lane, z: z + i * 2.2, y: 0.8, taken: false });
    }
  }

  private spawnCoinArc(lane: Lane, z: number) {
    for (let i = -2; i <= 2; i++) {
      this.pickups.push({ kind: "coin", lane, z: z + i * 1.8, y: 1.9 - 0.18 * i * i, taken: false });
    }
  }

  private makeProtester(side: -1 | 1, z: number): Protester {
    return {
      side,
      x: side * (ROAD_HALF + rand(1.4, 5.8)),
      z,
      shirt: pick(SHIRTS),
      skin: pick(SKINS),
      sign: Math.random() < 0.45 ? pick(PLACARDS) : null,
      signColor: pick(SIGN_COLORS),
      phase: rand(0, Math.PI * 2),
      height: rand(1.55, 1.85),
    };
  }
}
