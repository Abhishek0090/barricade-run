import { FREE_LIFELINES } from "../shared/constants";
import { pick, rand } from "../shared/random";
import type { Action, ArcadeEvents, ArcadeGame } from "../shared/types";

/**
 * Slam Night: a ring fight. The mat is a plane: x runs left-right (-RING_X..RING_X),
 * z runs from the front ropes (0) to the back ropes (RING_Z). y is height above the mat.
 * Every character is fictional.
 */

export const RING_X = 4.6;
export const RING_Z = 4.8;

export type Hair = "turban" | "ponytail" | "short" | "bald" | "cap" | "mohawk";
export type Extra = "none" | "headband" | "garland" | "papers" | "evm";

export interface Look {
  skin: string;
  /** Singlet colour, or "tricolour". */
  top: string;
  trunks: string;
  boots: string;
  hair: Hair;
  hairColor: string;
  mustache: boolean;
  belly: boolean;
  glasses: boolean;
  jacket: boolean;
  extra: Extra;
  /** Body size, 1 = normal. */
  size: number;
}

export interface Fighter {
  name: string;
  title: string;
  look: Look;
  power: number;
  speed: number;
  finisher: string;
  /** Line shown when they enter the ring. */
  intro: string;
  chair?: boolean;
}

export const HEROES: Fighter[] = [
  {
    name: "Thunder Singh",
    title: "The Punjab Powerhouse",
    look: { skin: "#b9774a", top: "#1d4ed8", trunks: "#0b1d4d", boots: "#f1f1f1", hair: "turban", hairColor: "#ff9933", mustache: true, belly: false, glasses: false, jacket: false, extra: "none", size: 1.08 },
    power: 1.18,
    speed: 0.94,
    finisher: "THUNDER DROP",
    intro: "Can you hear the thunder?!",
  },
  {
    name: "Rani Blaze",
    title: "Queen of Fire",
    look: { skin: "#d89a5e", top: "#e63946", trunks: "#1b1b1b", boots: "#ff9933", hair: "ponytail", hairColor: "#16110e", mustache: false, belly: false, glasses: false, jacket: false, extra: "none", size: 0.96 },
    power: 0.96,
    speed: 1.18,
    finisher: "BLAZE BOMB",
    intro: "The fire is coming for that belt!",
  },
  {
    name: "Kid Cyclone",
    title: "The High Flyer",
    look: { skin: "#e0ac69", top: "#22c55e", trunks: "#0f3d2e", boots: "#f7f7f7", hair: "short", hairColor: "#16110e", mustache: false, belly: false, glasses: false, jacket: false, extra: "headband", size: 1 },
    power: 1.04,
    speed: 1.06,
    finisher: "CYCLONE SPLASH",
    intro: "Strap in. It's going to get windy!",
  },
];

/** The title ladder: five fictional heels, ending with the champion. */
export const VILLAINS: Fighter[] = [
  {
    name: "Brick Bouncer",
    title: "The Doorman",
    look: { skin: "#c68642", top: "#111111", trunks: "#333", boots: "#111", hair: "bald", hairColor: "#000", mustache: false, belly: true, glasses: true, jacket: false, extra: "none", size: 1.1 },
    power: 0.85,
    speed: 0.82,
    finisher: "BOUNCER BOMB",
    intro: "You're not on the list!",
  },
  {
    name: "Iron Danda",
    title: "The Enforcer",
    look: { skin: "#a5694f", top: "#6b7280", trunks: "#374151", boots: "#1a1a1a", hair: "short", hairColor: "#111", mustache: true, belly: false, glasses: false, jacket: false, extra: "none", size: 1.04 },
    power: 0.95,
    speed: 0.95,
    finisher: "IRON DROP",
    intro: "Nobody gets past the Enforcer!",
  },
  {
    name: "Venom Vikram",
    title: "The Viper",
    look: { skin: "#e0ac69", top: "#4d7c0f", trunks: "#1a2e05", boots: "#5c4d3c", hair: "mohawk", hairColor: "#84cc16", mustache: false, belly: false, glasses: false, jacket: false, extra: "none", size: 1 },
    power: 1.0,
    speed: 1.05,
    finisher: "VENOM DDT",
    intro: "One bite and you're done!",
  },
  {
    name: "Dr. Destructo",
    title: "The Mad Scientist",
    look: { skin: "#c68642", top: "#5b5f6a", trunks: "#2b2d42", boots: "#111", hair: "mohawk", hairColor: "#d62828", mustache: false, belly: false, glasses: true, jacket: false, extra: "none", size: 1.06 },
    power: 1.08,
    speed: 1.08,
    finisher: "SHOCK THERAPY",
    intro: "Time for your treatment!",
  },
  {
    name: "King Kursi",
    title: "Undisputed Champion",
    look: { skin: "#d9a074", top: "#7c2d12", trunks: "#facc15", boots: "#5c3a1a", hair: "bald", hairColor: "#bbb", mustache: true, belly: true, glasses: true, jacket: true, extra: "none", size: 1.15 },
    power: 1.2,
    speed: 0.98,
    finisher: "THRONE CRASH",
    intro: "Bow to the King! This belt never leaves me!",
    chair: true,
  },
];

export type State =
  | "idle"
  | "walk"
  | "punch"
  | "kick"
  | "grab"
  | "slam"
  | "lifted"
  | "down"
  | "getup"
  | "pin"
  | "pinned"
  | "hit"
  | "block"
  | "special"
  | "celebrate"
  | "stomp";

export interface Wrestler {
  f: Fighter;
  x: number;
  z: number;
  y: number;
  vx: number;
  vz: number;
  /** Spin of the body in the air or on the mat, radians. */
  rot: number;
  facing: 1 | -1;
  hp: number;
  special: number;
  state: State;
  t: number;
  dur: number;
  hitDone: boolean;
  combo: number;
  comboT: number;
  /** Kick-out power while pinned (player mashing). */
  kickPower: number;
  chairShots: number;
  phase: number;
  ai: boolean;
}

export type Phase = "select" | "intro" | "fight" | "won" | "champion";

const WALK = 3.1;
const MOVES = {
  punch: { dur: 0.32, at: 0.12, range: 1.15, dmg: 5 },
  kick: { dur: 0.5, at: 0.24, range: 1.45, dmg: 8 },
  stomp: { dur: 0.45, at: 0.25, range: 1.2, dmg: 4 },
  grab: { dur: 0.28, range: 1.05 },
  slam: { dur: 0.95, dmg: 13 },
  special: { dur: 1.5, dmg: 26 },
};
const COUNT_GAP = 0.85;
const THROWS = ["BODY SLAM", "SUPLEX", "PILEDRIVER", "SPINEBUSTER", "DDT"];

function wrestler(f: Fighter, x: number, ai: boolean): Wrestler {
  return {
    f,
    x,
    z: RING_Z * 0.45,
    y: 0,
    vx: 0,
    vz: 0,
    rot: 0,
    facing: x < 0 ? 1 : -1,
    hp: 100,
    special: 0,
    state: "idle",
    t: 0,
    dur: 0,
    hitDone: false,
    combo: 0,
    comboT: 0,
    kickPower: 0,
    chairShots: 0,
    phase: rand(0, 6),
    ai,
  };
}

export class DangalGame implements ArcadeGame {
  status: "running" | "crashed" = "running";
  phase: Phase = "select";
  phaseT = 0;
  time = 0;
  chaseT = 0;
  lifelines = FREE_LIFELINES;
  xp = 0;
  wins = 0;
  moves = 0;
  /** Which hero is highlighted on the select screen. */
  pick = 2;
  match = 0;
  me: Wrestler;
  foe: Wrestler;
  ref = { x: 0, z: RING_Z * 0.85, phase: 0 };
  /** Pin count in progress: who is pinning, and the count so far. */
  pin: { by: Wrestler; count: number; t: number } | null = null;
  chair: { x: number; z: number } | null = null;
  banner: { text: string; sub: string; t: number; big: boolean } | null = null;
  pops: { x: number; y: number; text: string; color: string; t: number }[] = [];
  shake = 0;
  slowmo = 0;
  flash = 0;
  crowdHype = 0.3;

  private steerX = 0;
  private steerZ = 0;
  private lastSteerX = 0;
  private aiT = 0;

  constructor(
    private events: ArcadeEvents = {},
    readonly ghost = false,
  ) {
    this.me = wrestler(HEROES[this.pick], -2, ghost);
    this.foe = wrestler(VILLAINS[0], 2, true);
    if (ghost) {
      this.me = wrestler(pick(HEROES), -2, true);
      this.foe = wrestler(pick(VILLAINS), 2, true);
      this.phase = "fight";
    }
  }

  get score() {
    return this.xp;
  }

  /** Shown as "Matches won" on the result screen. */
  get distance() {
    return this.wins;
  }

  get coins() {
    return this.moves;
  }

  get opponentIndex() {
    return this.match % VILLAINS.length;
  }

  /** 0 for the first match; keeps rising through title defences. */
  get level() {
    return this.match;
  }

  // ---- input ----------------------------------------------------------------

  steer(x: number, y: number) {
    this.steerX = x;
    this.steerZ = -y;
    if (this.phase === "select") {
      const s = Math.sign(Math.round(x));
      if (s !== 0 && s !== this.lastSteerX) {
        this.pick = (this.pick + s + HEROES.length) % HEROES.length;
        this.events.onSound?.("lane");
      }
      this.lastSteerX = s;
    }
  }

  input(action: Action) {
    if (this.status !== "running") return;
    if (this.phase === "select") {
      if (action === "left" || action === "right") {
        this.pick = (this.pick + (action === "left" ? -1 : 1) + HEROES.length) % HEROES.length;
        return;
      }
      this.choose();
      return;
    }
    const me = this.me;
    // Pinned: every button press is a struggle to kick out.
    if (me.state === "pinned") {
      me.kickPower += 0.13 * (0.55 + me.hp / 100);
      this.events.onSound?.("lane");
      return;
    }
    if (this.phase !== "fight") return;
    const a = action === "up" ? "punch" : action;
    if (a === "punch") this.attack(me, "punch");
    else if (a === "kick") this.attack(me, "kick");
    else if (a === "grab") this.grapple(me);
    else if (a === "special") this.finisher(me);
  }

  private choose() {
    this.me = wrestler(HEROES[this.pick], -2, false);
    this.startMatch();
  }

  private startMatch() {
    const v = VILLAINS[this.opponentIndex];
    this.foe = wrestler(v, 2.2, true);
    const keep = this.me.special;
    this.me = { ...wrestler(this.me.f, -2.2, false), special: keep };
    this.pin = null;
    this.chair = v.chair ? { x: RING_X - 0.6, z: RING_Z - 0.5 } : null;
    this.phase = "intro";
    this.phaseT = 0;
    const defence = this.match >= VILLAINS.length;
    this.say(defence ? `TITLE DEFENCE ${this.match - VILLAINS.length + 1}` : `MATCH ${this.match + 1} OF ${VILLAINS.length}`, `${this.me.f.name} vs ${v.name}, ${v.title}`, 2.6, true);
    this.events.onSound?.("bell");
  }

  revive() {
    if (this.status !== "crashed" || this.lifelines <= 0) return false;
    this.lifelines--;
    this.status = "running";
    this.startMatch();
    this.say("REMATCH!", "The crowd wants another round", 2.4, true);
    return true;
  }

  // ---- moves --------------------------------------------------------------------

  private canAct(w: Wrestler) {
    return w.state === "idle" || w.state === "walk" || (w.state === "punch" && w.t > MOVES.punch.dur * 0.7);
  }

  private setState(w: Wrestler, s: State, dur: number) {
    w.state = s;
    w.t = 0;
    w.dur = dur;
    w.hitDone = false;
  }

  private other(w: Wrestler) {
    return w === this.me ? this.foe : this.me;
  }

  private attack(w: Wrestler, kind: "punch" | "kick") {
    if (!this.canAct(w)) return;
    const o = this.other(w);
    // Attacks on a downed opponent are stomps.
    if (o.state === "down" && Math.abs(o.x - w.x) < 1.6 && Math.abs(o.z - w.z) < 0.8) {
      this.setState(w, "stomp", MOVES.stomp.dur);
      return;
    }
    this.setState(w, kind, MOVES[kind].dur);
    w.facing = o.x > w.x ? 1 : -1;
  }

  private grapple(w: Wrestler) {
    if (!this.canAct(w)) return;
    const o = this.other(w);
    const dx = Math.abs(o.x - w.x);
    const dz = Math.abs(o.z - w.z);
    // Pick up the steel chair from the corner.
    if (this.chair && Math.hypot(this.chair.x - w.x, this.chair.z - w.z) < 1.2) {
      this.chair = null;
      w.chairShots = 3;
      this.pop(w, "STEEL CHAIR!", "#ffd447");
      return;
    }
    if (o.state === "down" && dx < 1.8 && dz < 0.9) {
      this.startPin(w, o);
      return;
    }
    w.facing = o.x > w.x ? 1 : -1;
    if (dx < MOVES.grab.range && dz < 0.6 && (o.state === "idle" || o.state === "walk" || o.state === "hit" || o.state === "getup")) {
      this.throwMove(w, o, false);
    } else {
      this.setState(w, "grab", MOVES.grab.dur);
    }
  }

  private finisher(w: Wrestler) {
    if (!this.canAct(w) || w.special < 100) return;
    const o = this.other(w);
    const dx = Math.abs(o.x - w.x);
    if (dx < 1.5 && Math.abs(o.z - w.z) < 0.7 && o.state !== "down" && o.state !== "lifted") {
      w.special = 0;
      w.facing = o.x > w.x ? 1 : -1;
      this.throwMove(w, o, true);
    } else {
      this.pop(w, "GET CLOSER!", "#ffffff");
    }
  }

  private throwMove(w: Wrestler, o: Wrestler, special: boolean) {
    const m = special ? MOVES.special : MOVES.slam;
    this.setState(w, special ? "special" : "slam", m.dur);
    this.setState(o, "lifted", m.dur);
    o.x = w.x + w.facing * 0.7;
    o.z = w.z;
    if (special) {
      this.slowmo = 0.9;
      this.flash = 1;
      this.say(`${w.f.finisher}!`, w === this.me ? "Finisher! The crowd is on its feet" : `${w.f.name} hits the finisher`, 2, true);
      this.events.onSound?.("cheer");
    } else {
      this.pop(o, pick(THROWS), "#ffffff");
    }
  }

  private startPin(w: Wrestler, o: Wrestler) {
    this.setState(w, "pin", 99);
    this.setState(o, "pinned", 99);
    o.kickPower = 0;
    w.x = o.x;
    w.z = o.z - 0.05;
    this.pin = { by: w, count: 0, t: 0 };
    this.events.onSound?.("whistle");
  }

  private damage(o: Wrestler, amount: number) {
    o.hp = Math.max(0, o.hp - amount);
  }

  private land(attacker: Wrestler, o: Wrestler, special: boolean) {
    const dmg = (special ? MOVES.special.dmg : MOVES.slam.dmg) * attacker.f.power;
    this.damage(o, dmg);
    this.setState(o, "down", special ? 3.2 : 1.7 + (o.hp <= 0 ? 2 : 0));
    o.y = 0;
    this.shake = special ? 1 : 0.6;
    this.events.onSound?.("crash");
    attacker.special = Math.min(100, attacker.special + (special ? 0 : 16));
    o.special = Math.min(100, o.special + 8);
    this.crowdHype = Math.min(1, this.crowdHype + (special ? 0.5 : 0.2));
    if (attacker === this.me) {
      this.xp += special ? 120 : 40;
      this.moves++;
    }
  }

  // ---- simulation ------------------------------------------------------------------

  update(dt: number) {
    if (this.status !== "running") return;
    this.time += dt;
    // Finishers play in slow motion.
    if (this.slowmo > 0) {
      this.slowmo = Math.max(0, this.slowmo - dt);
      dt *= 0.45;
    }
    this.phaseT += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.crowdHype = Math.max(0.25, this.crowdHype - dt * 0.05);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    for (const p of this.pops) {
      p.t -= dt;
      p.y += dt * 0.8;
    }
    this.pops = this.pops.filter((p) => p.t > 0);

    if (this.phase === "select") return;
    if (this.phase === "intro") {
      this.idleAnim(this.me, dt);
      this.idleAnim(this.foe, dt);
      if (this.phaseT > 2.6) {
        this.phase = "fight";
        this.say("FIGHT!", "", 0.9, true);
        this.events.onSound?.("bell");
      }
      return;
    }
    if (this.phase === "won" || this.phase === "champion") {
      this.idleAnim(this.me, dt);
      this.stepWrestler(this.foe, dt);
      if (this.phaseT > 3.4) {
        this.match++;
        this.me.hp = 100;
        this.startMatch();
      }
      return;
    }

    if (this.ghost || this.me.ai) this.think(this.me, dt);
    else this.control(this.me, dt);
    this.think(this.foe, dt);
    this.stepWrestler(this.me, dt);
    this.stepWrestler(this.foe, dt);
    this.separate();
    this.updatePin(dt);
    this.updateRef(dt);
  }

  private idleAnim(w: Wrestler, dt: number) {
    w.phase += dt * 3;
    w.t += dt;
  }

  private control(w: Wrestler, dt: number) {
    if (w.state !== "idle" && w.state !== "walk") return;
    const sp = WALK * w.f.speed;
    w.vx = this.steerX * sp;
    w.vz = this.steerZ * sp * 0.7;
    const moving = Math.abs(this.steerX) + Math.abs(this.steerZ) > 0.1;
    w.state = moving ? "walk" : "idle";
    if (moving) w.phase += dt * 9;
    const o = this.foe;
    if (Math.abs(o.x - w.x) > 0.2) w.facing = o.x > w.x ? 1 : -1;
  }

  /** Opponent AI. Gets sharper with every match. */
  private think(w: Wrestler, dt: number) {
    const o = this.other(w);
    const lvl = Math.min(8, this.level + (this.ghost ? 2 : 0));
    if (w.state === "idle" || w.state === "walk") {
      const dx = o.x - w.x;
      const dz = o.z - w.z;
      const dist = Math.abs(dx);
      if (Math.abs(dx) > 0.2) w.facing = dx > 0 ? 1 : -1;
      this.aiT -= dt;
      const want = o.state === "down" ? 1.0 : 0.95;
      const sp = WALK * w.f.speed * (0.7 + lvl * 0.04);
      if (dist > want || Math.abs(dz) > 0.35) {
        w.vx = Math.sign(dx) * (dist > want ? sp : 0);
        w.vz = Math.abs(dz) > 0.35 ? Math.sign(dz) * sp * 0.6 : 0;
        w.state = "walk";
        w.phase += dt * 9;
      } else {
        w.vx = 0;
        w.vz = 0;
        w.state = "idle";
      }
      // Blocking when the other one swings.
      if ((o.state === "punch" || o.state === "kick") && dist < 1.6 && Math.random() < (0.1 + lvl * 0.05) * dt * 10) {
        this.setState(w, "block", 0.5);
        return;
      }
      if (this.aiT > 0) return;
      this.aiT = Math.max(0.18, 0.75 - lvl * 0.07) * rand(0.7, 1.3);
      if (o.state === "down" && dist < 1.6 && Math.abs(dz) < 0.8) {
        if (Math.random() < 0.45 + lvl * 0.05 || o.hp <= 0) this.grapple(w);
        else this.attack(w, "kick");
        return;
      }
      if (dist < 1.4 && Math.abs(dz) < 0.5) {
        if (w.special >= 100 && Math.random() < 0.6) {
          this.finisher(w);
          return;
        }
        const r = Math.random();
        if (r < 0.45) this.attack(w, "punch");
        else if (r < 0.72) this.attack(w, "kick");
        else this.grapple(w);
      } else if (this.chair && w.f.chair && Math.random() < 0.3) {
        // The boss goes for his chair.
        w.vx = Math.sign(this.chair.x - w.x) * WALK;
        w.vz = Math.sign(this.chair.z - w.z) * WALK * 0.6;
        if (Math.hypot(this.chair.x - w.x, this.chair.z - w.z) < 1.2) this.grapple(w);
      }
    }
  }

  private stepWrestler(w: Wrestler, dt: number) {
    w.t += dt;
    w.comboT = Math.max(0, w.comboT - dt);
    if (w.comboT === 0) w.combo = 0;
    const o = this.other(w);

    switch (w.state) {
      case "punch":
      case "kick":
      case "stomp": {
        const m = MOVES[w.state];
        w.vx *= 0.8;
        w.vz *= 0.8;
        if (!w.hitDone && w.t >= m.at) {
          w.hitDone = true;
          this.resolveHit(w, o, w.state);
        }
        if (w.t >= m.dur) this.setState(w, "idle", 0);
        break;
      }
      case "grab":
      case "block":
      case "hit":
      case "getup":
        if (w.state === "hit") {
          w.vx *= 0.9;
        } else {
          w.vx = 0;
          w.vz = 0;
        }
        if (w.t >= w.dur) this.setState(w, "idle", 0);
        break;
      case "slam":
      case "special": {
        w.vx = 0;
        w.vz = 0;
        if (w.t >= w.dur) this.setState(w, "idle", 0);
        break;
      }
      case "lifted": {
        // Carried up over the attacker's head, then driven down behind them.
        const a = o;
        const p = Math.min(1, w.t / w.dur);
        const special = a.state === "special";
        const peak = special ? 2.4 : 1.7;
        if (p < 0.5) {
          w.y = peak * (p / 0.5);
          w.x = a.x + a.facing * (0.7 - p * 1.2);
          w.rot = -a.facing * p * Math.PI;
        } else {
          const q = (p - 0.5) / 0.5;
          w.y = peak * (1 - q * q);
          w.x = a.x - a.facing * (0.1 + q * 1.0);
          w.rot = -a.facing * (Math.PI / 2 + q * Math.PI * (special ? 1.5 : 0.5));
        }
        w.x = Math.max(-RING_X + 0.4, Math.min(RING_X - 0.4, w.x));
        if (w.t >= w.dur) this.land(a, w, special);
        break;
      }
      case "down":
        w.vx *= 0.85;
        w.vz *= 0.85;
        w.y = 0;
        w.rot = Math.PI / 2;
        if (w.t >= w.dur && w.hp > 0) this.setState(w, "getup", 0.6);
        // At zero health they stay down until pinned.
        if (w.hp <= 0 && w.t > 6) {
          w.hp = 6;
          this.setState(w, "getup", 0.8);
        }
        break;
      case "pinned":
        w.kickPower = Math.max(0, w.kickPower - dt * 0.28);
        break;
      default:
        break;
    }
    if (w.state !== "lifted" && w.state !== "down" && w.state !== "pinned") w.rot = 0;
    if (w.state !== "lifted") w.y = Math.max(0, w.y - dt * 6);

    w.x += w.vx * dt;
    w.z += w.vz * dt;
    // The ropes: bounce off them.
    if (Math.abs(w.x) > RING_X) {
      w.x = Math.sign(w.x) * RING_X;
      w.vx = -w.vx * 0.6;
    }
    w.z = Math.max(0.2, Math.min(RING_Z - 0.2, w.z));
  }

  private resolveHit(w: Wrestler, o: Wrestler, kind: "punch" | "kick" | "stomp") {
    const m = MOVES[kind];
    const dx = o.x - w.x;
    if (Math.abs(dx) > m.range || Math.abs(o.z - w.z) > 0.6) return;
    if (kind !== "stomp" && Math.sign(dx) !== w.facing && Math.abs(dx) > 0.2) return;
    if (kind === "stomp" ? o.state !== "down" : o.state === "down" || o.state === "lifted" || o.state === "pinned") return;
    let dmg = m.dmg * w.f.power;
    const chair = w.chairShots > 0 && kind !== "stomp";
    if (chair) {
      dmg *= 2.4;
      w.chairShots--;
      this.pop(o, "CLANG!", "#ffd447");
      this.shake = 0.5;
    }
    if (o.state === "block" && Math.sign(o.x - w.x) !== o.facing && !chair) {
      this.damage(o, dmg * 0.2);
      this.pop(o, "BLOCKED", "#9ad1ff");
      o.vx = w.facing * 1.2;
      return;
    }
    this.damage(o, dmg);
    this.events.onSound?.("hit");
    w.special = Math.min(100, w.special + (kind === "kick" ? 9 : 6));
    o.special = Math.min(100, o.special + 4);
    w.combo++;
    w.comboT = 0.9;
    if (w === this.me) {
      this.xp += Math.round(dmg * 3);
      this.moves++;
    }
    if (kind === "stomp") return;
    // A kick or the third punch in a combo drops them; so does running out of health.
    if (kind === "kick" && (w.combo >= 2 || o.hp < 30) || w.combo >= 3 || o.hp <= 0 || chair) {
      this.setState(o, "down", o.hp <= 0 ? 6 : 1.4);
      o.vx = w.facing * 3;
      this.shake = 0.35;
      if (w.combo >= 3) this.pop(o, `${w.combo} HIT COMBO`, "#ff9933");
      w.combo = 0;
    } else {
      this.setState(o, "hit", kind === "kick" ? 0.42 : 0.3);
      o.vx = w.facing * (kind === "kick" ? 3.6 : 2.2);
    }
  }

  /** Wrestlers can't walk through each other. */
  private separate() {
    const a = this.me;
    const b = this.foe;
    if (a.state === "pin" || a.state === "pinned" || b.state === "pin" || b.state === "pinned" || a.state === "lifted" || b.state === "lifted") return;
    if (a.state === "down" || b.state === "down") return;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (Math.abs(dx) < 0.62 && Math.abs(dz) < 0.45) {
      const push = (0.62 - Math.abs(dx)) / 2;
      const s = dx >= 0 ? 1 : -1;
      a.x -= s * push;
      b.x += s * push;
    }
  }

  private updatePin(dt: number) {
    const p = this.pin;
    if (!p) return;
    const pinner = p.by;
    const pinned = this.other(pinner);
    p.t += dt;
    if (p.t < COUNT_GAP) return;
    p.t = 0;
    // Kick out before the count?
    const kicked = pinned.ai ? this.aiKicksOut(pinned, p.count) : pinned.kickPower >= 0.55 + (1 - pinned.hp / 100) * 0.65;
    if (kicked) {
      this.pin = null;
      this.setState(pinner, "hit", 0.6);
      pinner.vx = -pinner.facing * 3;
      this.setState(pinned, "getup", 0.5);
      this.say(`KICK OUT AT ${p.count}!`, pinned === this.me ? "You're still in this!" : "Not yet! Wear them down", 1.4, false);
      this.events.onSound?.("cheer");
      return;
    }
    p.count++;
    this.pops.push({ x: pinned.x, y: 1.6, text: String(p.count), color: "#ffffff", t: 0.8 });
    this.events.onSound?.("clank");
    if (p.count < 3) return;
    this.pin = null;
    if (pinner === this.me) {
      this.wins++;
      this.xp += 500 + Math.round(this.me.hp * 5) + this.match * 100;
      this.setState(pinner, "celebrate", 99);
      this.setState(pinned, "down", 99);
      const champ = this.match === VILLAINS.length - 1;
      this.phase = champ ? "champion" : "won";
      this.phaseT = 0;
      this.events.onSound?.("level");
      this.events.onSound?.("cheer");
      this.say(champ ? "NEW CHAMPION!" : "1... 2... 3! YOU WIN!", champ ? `${this.me.f.name} takes the belt from King Kursi` : `${pinned.f.name} is done. Next opponent coming`, 3.2, true);
    } else if (this.ghost) {
      this.startMatch();
    } else {
      this.setState(pinner, "celebrate", 99);
      this.status = "crashed";
      this.events.onSound?.("crash");
      this.events.onCrash?.("pinned");
    }
  }

  private aiKicksOut(w: Wrestler, count: number) {
    if (w.hp <= 0) return false;
    if (this.ghost) return count >= 1 && Math.random() < 0.6;
    const chance = w.hp > 60 ? 0.9 : w.hp > 35 ? 0.65 : w.hp > 15 ? 0.35 : 0.12;
    // Most kick-outs happen at two, for drama.
    return count === 2 ? Math.random() < chance : count === 1 && Math.random() < chance * 0.25;
  }

  private updateRef(dt: number) {
    const tx = this.pin ? this.pin.by.x + 0.6 : (this.me.x + this.foe.x) / 2 + 1.6;
    const tz = this.pin ? this.pin.by.z + 0.6 : RING_Z * 0.85;
    this.ref.x += (Math.max(-RING_X + 0.3, Math.min(RING_X - 0.3, tx)) - this.ref.x) * Math.min(1, dt * 2);
    this.ref.z += (tz - this.ref.z) * Math.min(1, dt * 2);
    this.ref.phase += dt * 3;
  }

  private pop(w: Wrestler, text: string, color: string) {
    this.pops.push({ x: w.x, y: 2.3, text, color, t: 1.1 });
  }

  private say(text: string, sub: string, t: number, big: boolean) {
    this.banner = { text, sub, t, big };
  }
}
