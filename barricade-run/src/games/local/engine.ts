import { FREE_LIFELINES } from "../shared/constants";
import { pick, rand } from "../shared/random";
import type { Action, ArcadeEvents, ArcadeGame, Speech } from "../shared/types";

/**
 * Mumbai Local: Motorman. You drive a 12-car Central line local from Kalyan to CSMT (and back),
 * stopping at the 12-car marker of every halt, obeying 4-aspect signals and speed limits, and
 * keeping to the timetable. Distances are the real ones scaled by SCALE; speeds are real.
 */

export interface Station {
  en: string;
  /** Marathi / Devanagari name, as on the station boards. */
  mr: string;
  /** Kilometres from CSMT. */
  km: number;
  /** Fast locals halt here. */
  fast: boolean;
  big: boolean;
}

/** Kalyan to CSMT, in order. */
export const STATIONS: Station[] = [
  { en: "Kalyan", mr: "कल्याण", km: 53.9, fast: true, big: true },
  { en: "Thakurli", mr: "ठाकुर्ली", km: 50.3, fast: false, big: false },
  { en: "Dombivli", mr: "डोंबिवली", km: 48.4, fast: true, big: true },
  { en: "Kopar", mr: "कोपर", km: 46.2, fast: false, big: false },
  { en: "Diva", mr: "दिवा", km: 42.7, fast: false, big: false },
  { en: "Mumbra", mr: "मुंब्रा", km: 40.0, fast: false, big: false },
  { en: "Kalwa", mr: "कळवा", km: 36.0, fast: false, big: false },
  { en: "Thane", mr: "ठाणे", km: 33.6, fast: true, big: true },
  { en: "Mulund", mr: "मुलुंड", km: 30.8, fast: false, big: false },
  { en: "Nahur", mr: "नाहूर", km: 28.9, fast: false, big: false },
  { en: "Bhandup", mr: "भांडुप", km: 26.6, fast: false, big: false },
  { en: "Kanjurmarg", mr: "कांजुरमार्ग", km: 24.6, fast: false, big: false },
  { en: "Vikhroli", mr: "विक्रोळी", km: 22.6, fast: false, big: false },
  { en: "Ghatkopar", mr: "घाटकोपर", km: 19.7, fast: true, big: true },
  { en: "Vidyavihar", mr: "विद्याविहार", km: 17.8, fast: false, big: false },
  { en: "Kurla", mr: "कुर्ला", km: 15.8, fast: true, big: true },
  { en: "Sion", mr: "शीव", km: 13.6, fast: false, big: false },
  { en: "Matunga", mr: "माटुंगा", km: 11.2, fast: false, big: false },
  { en: "Dadar", mr: "दादर", km: 9.0, fast: true, big: true },
  { en: "Parel", mr: "परळ", km: 7.8, fast: false, big: false },
  { en: "Currey Road", mr: "करी रोड", km: 6.6, fast: false, big: false },
  { en: "Chinchpokli", mr: "चिंचपोकळी", km: 5.6, fast: false, big: false },
  { en: "Byculla", mr: "भायखळा", km: 4.3, fast: true, big: true },
  { en: "Sandhurst Road", mr: "सँडहर्स्ट रोड", km: 2.6, fast: false, big: false },
  { en: "Masjid", mr: "मशीद", km: 1.3, fast: false, big: false },
  { en: "CSMT", mr: "छत्रपती शिवाजी महाराज टर्मिनस", km: 0, fast: true, big: true },
];

/** Real distances are scaled down so a duty takes minutes, not an hour. */
export const SCALE = 0.35;
export const PLATFORM_LEN = 260;
export const CAR_LEN = 20;
export const CARS = 12;
export const TRAIN_LEN = CAR_LEN * CARS;
export const SIGNAL_GAP = 600;
/** Where the 12-car stop marker sits, from the platform centre. */
export const MARKER = PLATFORM_LEN / 2 - 8;
/** The buffer stops at the terminus, past the marker. */
export const BUFFER = 14;

export type Notch = -5 | -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
export type Aspect = "G" | "YY" | "Y" | "R";
export type Phase = "select" | "dwell" | "run" | "done";
export type View = "cab" | "chase" | "side" | "top" | "front" | "track";
export const VIEWS: View[] = ["cab", "chase", "side", "top", "front", "track"];
export const VIEW_NAMES: Record<View, string> = { cab: "CAB", chase: "CHASE", side: "SIDE", top: "DRONE", front: "FRONT", track: "TRACKSIDE" };

export interface Signal {
  pos: number;
  /** Seconds this signal stays red once you are near it (0 = clear). */
  hold: number;
  passed: boolean;
}

export interface Halt {
  idx: number;
  /** Position of the platform centre along the line. */
  pos: number;
  /** Scheduled arrival, seconds from the start of the duty. */
  due: number;
  /** Platform side, for the announcement. */
  left: boolean;
  arrived?: number;
  error?: number;
}

export interface Report {
  title: string;
  grade: string;
  lines: string[];
}

export interface Banner {
  text: string;
  sub: string;
  t: number;
  tone: "info" | "good" | "bad";
}

const GOOD = ["Smooth stop!", "Bilkul sahi!", "Perfect halt!", "Ekdum barobar!"];

/** Rough running time for a hop, used by the timetable. */
const hopTime = (m: number) => m / Math.min(19, 5 + m / 90);

export class LocalGame implements ArcadeGame {
  status: "running" | "crashed" = "running";
  lifelines = FREE_LIFELINES;
  readonly chaseT = 0;
  phase: Phase = "select";
  phaseT = 0;
  /** Menu choice: 0 = fast, 1 = slow. */
  pick = 0;
  fast = true;
  duty = 0;
  /** Direction of this duty: towards CSMT (up) or back to Kalyan. */
  up = true;
  /** Seconds since the duty started (the timetable runs on this). */
  t = 0;
  /** Clock at the start of the duty, seconds since midnight. */
  start = 8 * 3600 + 12 * 60;
  /** Front of the train, metres along the line. */
  pos = 0;
  /** Speed, m/s. */
  v = 0;
  notch: Notch = -4;
  passengers = 0;
  carried = 0;
  points = 0;
  halts: Halt[] = [];
  /** Index into halts of the next stop. */
  next = 1;
  signals: Signal[] = [];
  dwellT = 0;
  guardReady = false;
  emergency = 0;
  view: View = "cab";
  camYaw = 0;
  camPitch = 0;
  /** Camera zoom: above 1 is closer (narrower lens in the cab). */
  zoom = 1;
  /** Seconds the view name stays on screen after switching. */
  viewT = 0;
  banner: Banner | null = null;
  report: Report | null = null;
  /** Doors open (dwell after a stop). */
  doors = false;
  stats = { perfect: 0, onTime: 0, late: 0, overshoots: 0, overspeed: 0 };
  /** Running total for the duty grade: up to 2 per halt (stop accuracy + timing). */
  private rating = 0;
  private warnedLimit = -1;
  private overspeedT = 0;
  private lastLimit = 100;
  private announcedApproach = -1;

  constructor(
    private ev: ArcadeEvents = {},
    readonly ghost = false,
  ) {
    this.layout(true, true);
    if (ghost) this.begin(true, true);
    else this.phase = "select";
  }

  // ---- route ------------------------------------------------------------------------

  /** Stations in the order of this duty. */
  get route() {
    return this.up ? STATIONS : [...STATIONS].reverse();
  }

  /** Line position of a station's platform centre. */
  stationPos(i: number) {
    const r = this.route;
    return Math.abs(r[0].km - r[i].km) * 1000 * SCALE;
  }

  get lineEnd() {
    return this.stationPos(this.route.length - 1);
  }

  /** Where the front of the train should stop at a halt. */
  stopAt(h: Halt) {
    return h.pos + MARKER;
  }

  get nextHalt(): Halt | null {
    return this.halts[this.next] ?? null;
  }

  /** The halt the train is standing at (during a dwell). */
  get atHalt(): Halt | null {
    return this.phase === "dwell" ? (this.halts[this.next - 1] ?? null) : null;
  }

  get kmh() {
    return this.v * 3.6;
  }

  /** Real kilometre post (from CSMT) at a line position. */
  kmAt(p: number) {
    const k0 = this.route[0].km;
    return this.up ? k0 - p / (1000 * SCALE) : k0 + p / (1000 * SCALE);
  }

  /** Line speed in km/h: the Kalwa-Thane curves, Sion, and the approach to the terminus. */
  limitAt(p: number) {
    const k = this.kmAt(p);
    const toEnd = this.lineEnd + MARKER - p;
    if (toEnd < 330) return 25;
    if (toEnd < 1100) return 50;
    if (k < 36.2 && k > 33.8) return 60;
    if (k < 15.6 && k > 13.8) return 70;
    return 100;
  }

  get limit() {
    return this.limitAt(this.pos);
  }

  /** 4-aspect automatic signalling: a held signal is red, the two before it show yellow and double yellow. */
  aspect(i: number): Aspect {
    const s = this.signals[i];
    if (!s) return "G";
    if (s.hold > 0) return "R";
    if ((this.signals[i + 1]?.hold ?? 0) > 0) return "Y";
    if ((this.signals[i + 2]?.hold ?? 0) > 0) return "YY";
    // The last signal before the terminus only clears to yellow.
    if (this.lineEnd - s.pos < SIGNAL_GAP) return "Y";
    return "G";
  }

  get nextSignal() {
    const i = this.signals.findIndex((s) => s.pos > this.pos);
    return i < 0 ? null : { i, s: this.signals[i], aspect: this.aspect(i), dist: this.signals[i].pos - this.pos };
  }

  // ---- what the shell reads -----------------------------------------------------------

  get score() {
    return Math.max(0, Math.round(this.points));
  }

  /** "Duties" on the result screen. */
  get distance() {
    return this.duty + (this.phase === "done" ? 1 : 0);
  }

  /** "Passengers" on the result screen. */
  get coins() {
    return this.carried;
  }

  get rumble() {
    if (this.status !== "running" || (this.phase !== "run" && this.phase !== "dwell")) return 0;
    return Math.min(1, 0.1 + this.kmh / 90);
  }

  get clock() {
    return this.start + this.t;
  }

  /** Projected seconds late (+) or early (-) at the next halt. */
  get lateness() {
    const h = this.nextHalt;
    if (!h) return 0;
    const dist = Math.max(0, this.stopAt(h) - this.pos);
    const eta = this.v > 8 ? dist / Math.max(this.v * 0.8, 1) : hopTime(dist);
    return this.t + (this.phase === "dwell" ? Math.max(0, this.dwellT) : 0) + eta - h.due;
  }

  // ---- input ------------------------------------------------------------------------

  input(action: Action) {
    if (this.status !== "running") return;
    if (this.phase === "select") {
      if (action === "left" || action === "right" || action === "down" || action === "grab") this.pick = this.pick ? 0 : 1;
      else this.begin(this.pick === 0, true);
      this.ev.onSound?.("lane");
      return;
    }
    if (this.phase === "done") {
      if (this.phaseT > 1.5) this.nextDuty();
      return;
    }
    if (action === "up") this.setNotch(this.notch + 1);
    else if (action === "down") this.setNotch(this.notch - 1);
    // Space: depart once the guard has rung the bell, otherwise the horn.
    else if (action === "punch") {
      if (this.phase === "dwell" && this.guardReady && this.notch <= 0) this.setNotch(2);
      else this.ev.onSound?.("horn");
    }
    else if (action === "kick") this.ev.onSound?.("horn");
    else if (action === "special") this.setNotch(-5);
    else if (action === "grab" || action === "left" || action === "right") {
      const n = VIEWS.length;
      this.view = VIEWS[(VIEWS.indexOf(this.view) + (action === "left" ? n - 1 : 1)) % n];
      this.camYaw = 0;
      this.camPitch = 0;
      this.zoom = 1;
      this.viewT = 1.6;
    }
  }

  look(yaw: number, pitch: number) {
    this.camYaw += yaw;
    this.camPitch = Math.max(-0.4, Math.min(0.5, this.camPitch + pitch));
  }

  /** Multiplies the zoom (wheel, pinch, + / - keys). */
  zoomBy(factor: number) {
    this.zoom = Math.max(0.45, Math.min(3, this.zoom * factor));
  }


  private setNotch(n: number) {
    const was = this.notch;
    this.notch = Math.max(-5, Math.min(4, n)) as Notch;
    if (this.notch === was) return;
    this.ev.onSound?.(this.notch < was && this.notch < 0 ? "brake" : "lane");
    if (this.notch === -5) this.say("EMERGENCY BRAKE", "Full brake application", "bad");
  }

  revive() {
    if (this.status !== "crashed" || this.lifelines <= 0) return false;
    this.lifelines--;
    this.status = "running";
    // Back on the line after the inquiry, stopped short of where it went wrong, signals cleared.
    this.v = 0;
    this.notch = -4;
    this.emergency = 0;
    this.pos = Math.max(0, this.pos - 120);
    for (const s of this.signals) {
      if (s.pos > this.pos) s.passed = false;
      if (s.pos > this.pos - 5 && s.pos < this.pos + SIGNAL_GAP * 3) s.hold = 0;
    }
    this.say("BACK ON DUTY", "Watch the signals and the speed board", "good");
    return true;
  }

  // ---- duties -----------------------------------------------------------------------

  /** Builds the timetable and signals for a duty and puts the train at the first platform. */
  private layout(fast: boolean, up: boolean) {
    this.fast = fast;
    this.up = up;
    this.t = 0;
    this.v = 0;
    this.notch = -4;
    this.emergency = 0;
    this.stats = { perfect: 0, onTime: 0, late: 0, overshoots: 0, overspeed: 0 };
    this.rating = 0;
    this.warnedLimit = -1;
    this.start = up ? 8 * 3600 + 12 * 60 + Math.floor(this.duty / 2) * 3600 : 18 * 3600 + 52 * 60;
    const r = this.route;
    this.halts = [];
    let due = 0;
    let prev = 0;
    r.forEach((s, i) => {
      if (fast && !s.fast) return;
      const pos = this.stationPos(i);
      // Dwell at the previous halt, the run, and a little recovery time.
      if (i > 0) due += (r[this.halts[this.halts.length - 1].idx].big ? 16 : 10) + hopTime(pos - prev) + 10 + (i === r.length - 1 ? 45 : 0);
      this.halts.push({ idx: i, pos, due: Math.round(due), left: Math.random() < 0.5 });
      prev = pos;
    });
    this.halts[0].arrived = 0;
    this.halts[0].error = 0;
    this.next = 1;
    this.pos = this.stopAt(this.halts[0]);
    // A signal every SIGNAL_GAP or so. Some are held red for a while when you get near (a train ahead).
    this.signals = [];
    const holdChance = Math.min(0.3, 0.12 + this.duty * 0.04);
    for (let p = this.pos + 420; p < this.lineEnd - 200; p += SIGNAL_GAP * rand(0.85, 1.15)) {
      const held = !this.ghost && p > this.pos + 1500 && Math.random() < holdChance;
      this.signals.push({ pos: p, hold: held ? rand(8, 20) : 0, passed: false });
    }
    this.passengers = Math.round(rand(300, 600));
    this.carried = this.duty === 0 ? 0 : this.carried;
    this.announcedApproach = -1;
  }

  private begin(fast: boolean, up: boolean) {
    this.layout(fast, up);
    this.startDwell(true);
    this.doors = true;
    const r = this.route;
    const first = r[0];
    const last = r[r.length - 1];
    this.say(`${first.en.toUpperCase()} → ${last.en.toUpperCase()}`, `${fast ? "FAST" : "SLOW"} local. Wait for the guard's bell, then power up`, "info");
    const time = fmtClock(this.start).slice(0, 5);
    this.speak([
      { text: `प्रवाशांनी कृपया लक्ष द्यावे. ${time} ची ${first.mr} ते ${last.mr} जाणारी ${fast ? "जलद" : "धीमी"} लोकल फलाट क्रमांक एक वर उभी आहे.`, lang: "mr-IN" },
      { text: `यात्रीगण कृपया ध्यान दें. ${time} की ${first.mr} से ${last.mr} जाने वाली ${fast ? "फ़ास्ट" : "धीमी"} लोकल प्लेटफ़ॉर्म क्रमांक एक पर खड़ी है.`, lang: "hi-IN" },
      { text: `Attention please. The ${time} ${fast ? "fast" : "slow"} local from ${first.en} to ${last.en} is standing on platform number one.`, lang: "en-IN" },
    ]);
  }

  private nextDuty() {
    this.duty++;
    this.report = null;
    // Alternate: up to CSMT, then back down to Kalyan.
    this.begin(this.fast, !this.up);
  }

  private startDwell(big: boolean) {
    this.phase = "dwell";
    this.phaseT = 0;
    this.dwellT = big ? 16 : 10;
    this.guardReady = false;
    this.doors = true;
  }

  // ---- simulation ---------------------------------------------------------------------

  update(dt: number) {
    if (this.status !== "running") return;
    dt = Math.min(dt, 0.05);
    this.phaseT += dt;
    this.viewT = Math.max(0, this.viewT - dt);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    if (this.phase === "select") return;
    if (this.phase === "done") {
      if (this.ghost && this.phaseT > 3) this.nextDuty();
      return;
    }
    this.t += dt;
    if (this.ghost) this.autopilot();

    // Traction fades with speed; each brake notch adds about 0.3 m/s².
    const n = this.emergency > 0 ? -5 : this.notch;
    let a = 0;
    if (n > 0 && !this.doors) a = n * 0.28 * Math.max(0.2, 1 - this.v / 31);
    else if (n < 0) a = n === -5 ? -1.9 : n * 0.3;
    a -= 0.012 + this.v * 0.0012;
    this.v = Math.max(0, this.v + a * dt);
    if (this.emergency > 0) {
      this.emergency -= dt;
      if (this.v === 0) this.emergency = 0;
    }
    const before = this.pos;
    this.pos += this.v * dt;

    this.checkSignals(before, dt);
    if (this.status !== "running") return;
    this.checkSpeed(dt);
    if (this.phase === "dwell") this.updateDwell(dt);
    else this.updateRun();
  }

  /** Driver for the hub preview and the attract mode: keep to limits and signals, brake on a curve to the marker. */
  private autopilot() {
    if (this.phase === "dwell") {
      this.notch = this.guardReady ? 4 : -3;
      return;
    }
    let target = this.limit / 3.6 - 1.2;
    for (let d = 30; d <= 480; d += 30) {
      const ahead = this.limitAt(this.pos + d) / 3.6 - 1.2;
      if (ahead < target) target = Math.min(target, Math.sqrt(ahead * ahead + 2 * 0.7 * Math.max(0, d - 25)));
    }
    const sig = this.nextSignal;
    if (sig && sig.aspect === "R") target = Math.min(target, Math.sqrt(Math.max(0, 2 * 0.8 * (sig.dist - 30))));
    const h = this.nextHalt;
    if (h) target = Math.min(target, Math.sqrt(Math.max(0, 2 * 0.85 * (this.stopAt(h) - this.pos - 0.5))) + 0.2);
    const err = target - this.v;
    this.notch = (err > 2 ? 4 : err > 0.6 ? 2 : err > -0.3 ? 0 : err > -1.5 ? -2 : -4) as Notch;
    if (h && this.stopAt(h) - this.pos < 1.2) this.notch = -4;
  }

  private checkSignals(before: number, dt: number) {
    for (let i = 0; i < this.signals.length; i++) {
      const s = this.signals[i];
      // A held signal clears some time after you get close (the train ahead moves on).
      if (s.hold > 0 && s.pos - this.pos < 700) s.hold = Math.max(0, s.hold - dt);
      if (!s.passed && before < s.pos && this.pos >= s.pos) {
        s.passed = true;
        if (this.aspect(i) === "R" && !this.ghost) {
          this.status = "crashed";
          this.v = 0;
          this.ev.onSound?.("crash");
          this.ev.onCrash?.("spad");
          return;
        }
      }
    }
  }

  private checkSpeed(dt: number) {
    const lim = this.limit;
    // Warn once per restriction, about 500 m before it starts.
    const ahead = this.limitAhead;
    if (ahead && Math.abs(this.pos + ahead.dist - this.warnedLimit) > 120 && this.banner?.tone !== "bad") {
      this.warnedLimit = this.pos + ahead.dist;
      this.say(`CAUTION: ${ahead.lim} KM/H AHEAD`, `Speed restriction in ${ahead.dist} m. Start braking`, "info");
      this.ev.onSound?.("lane");
    }
    if (lim < this.lastLimit) this.say(`LIMIT ${lim} KM/H`, "Speed restriction: ease off", "info");
    else if (lim > this.lastLimit) this.say(`LINE SPEED ${lim}`, "Restriction over", "good");
    this.lastLimit = lim;
    const over = this.kmh - lim;
    if (over > 3 && !this.ghost) {
      const was = this.overspeedT;
      this.overspeedT += dt;
      this.points -= dt * 5;
      // Overspeed alarm: a beep every half second.
      if (Math.floor(this.overspeedT * 2) !== Math.floor(was * 2)) this.ev.onSound?.("clank");
      // Far over the limit, the safety system trips the brakes.
      if (over > 15 && this.emergency <= 0) {
        this.emergency = 4;
        this.points -= 150;
        this.stats.overspeed++;
        this.rating -= 0.5;
        this.say("AUTO EMERGENCY BRAKE", `Overspeed: ${Math.round(this.kmh)} in a ${lim} zone. −150`, "bad");
        this.ev.onSound?.("brake");
      }
    } else this.overspeedT = 0;
  }

  /** The next lower speed limit within 500 m, or null. */
  get limitAhead() {
    for (let d = 20; d <= 500; d += 20) {
      const l = this.limitAt(this.pos + d);
      if (l < this.limit) return { lim: l, dist: d };
    }
    return null;
  }

  /** True while the overspeed alarm is sounding. */
  get overspeed() {
    return this.overspeedT > 0;
  }

  private updateDwell(dt: number) {
    this.dwellT -= dt;
    // Passengers off and on, in a rush at first.
    if (this.doors && this.dwellT > 3 && Math.random() < dt * 4) {
      const big = this.route[this.atHalt?.idx ?? 0].big;
      const rate = big ? 70 : 32;
      const first = this.next === 1;
      const off = first ? 0 : Math.round(rand(0, rate * 0.5));
      const on = Math.round(rand(rate * 0.2, rate * (this.up ? 0.7 : 0.4)));
      const out = Math.min(this.passengers, off);
      this.passengers = Math.min(5200, this.passengers - out + on);
      this.carried += out;
      this.points += out * 0.3;
    }
    if (this.doors && this.dwellT <= 1.5) this.doors = false;
    if (!this.guardReady && this.dwellT <= 0) {
      this.guardReady = true;
      this.ev.onSound?.("bell");
      this.say("GUARD: READY ✓", "Ding ding! Release the brake and power up", "good");
    }
    // Moving off before the guard's bell leaves people behind.
    if (this.v > 0.5) {
      if (!this.guardReady && !this.ghost) {
        this.points -= 120;
        this.say("NO GUARD SIGNAL!", "You moved before the bell. Passengers left behind. −120", "bad");
        this.ev.onSound?.("whistle");
      }
      this.doors = false;
      this.depart();
    }
  }

  private depart() {
    this.phase = "run";
    this.phaseT = 0;
    const h = this.nextHalt;
    if (!h) return;
    const s = this.route[h.idx];
    this.say(`NEXT: ${s.en.toUpperCase()}`, `पुढील स्थानक ${s.mr} • अगला स्टेशन ${s.mr}`, "info");
    this.speak([
      { text: `पुढील स्थानक ${s.mr}`, lang: "mr-IN" },
      { text: `अगला स्टेशन ${s.mr}`, lang: "hi-IN" },
      { text: `The next station is ${s.en}`, lang: "en-IN" },
    ]);
  }

  private updateRun() {
    const h = this.nextHalt;
    if (!h) return;
    const stop = this.stopAt(h);
    const togo = stop - this.pos;
    const s = this.route[h.idx];
    const terminus = h.idx === this.route.length - 1;
    if (togo < 650 && this.announcedApproach !== this.next) {
      this.announcedApproach = this.next;
      const side = h.left;
      this.speak([
        { text: `${s.mr} स्थानक. ${terminus ? "ही गाडी इथेच थांबते." : `दरवाजे ${side ? "डाव्या" : "उजव्या"} बाजूला उघडतील.`}`, lang: "mr-IN" },
        { text: `${s.mr} स्टेशन. ${terminus ? "यह गाड़ी यहीं तक है." : `दरवाज़े ${side ? "बाईं" : "दाईं"} तरफ़ खुलेंगे.`}`, lang: "hi-IN" },
        { text: `${s.en}. ${terminus ? "This train terminates here." : `Doors will open on the ${side ? "left" : "right"} side.`}`, lang: "en-IN" },
      ]);
    }
    // The buffer stops at the terminus.
    if (terminus && this.pos > stop + BUFFER) {
      this.pos = stop + BUFFER;
      if (this.v > 1.5 && !this.ghost) {
        this.status = "crashed";
        this.v = 0;
        this.ev.onSound?.("crash");
        this.ev.onCrash?.("buffer");
        return;
      }
      this.v = 0;
    }
    // Stopped alongside the platform: a halt. Stopped further back (at a signal) is just waiting.
    if (this.v < 0.05 && this.notch <= 0 && togo < 45 && togo > -PLATFORM_LEN * 0.6) {
      this.arrive(h, -togo);
      return;
    }
    // Ran through the platform without stopping.
    if (togo <= -PLATFORM_LEN * 0.6) {
      this.points -= 300;
      this.stats.overshoots++;
      this.rating -= 1;
      this.say(`MISSED ${s.en.toUpperCase()}!`, "You ran through a halt. Furious passengers. −300", "bad");
      this.ev.onSound?.("crash");
      h.arrived = this.t;
      h.error = -togo;
      this.next++;
      this.announcedApproach = -1;
      if (!this.nextHalt) this.finish();
      else this.depart();
    }
  }

  private arrive(h: Halt, error: number) {
    h.arrived = this.t;
    h.error = error;
    const late = this.t - h.due;
    const s = this.route[h.idx];
    const e = Math.abs(error);
    let pts = 0;
    let msg: string;
    this.rating += e <= 2 ? 1 : e <= 6 ? 0.7 : e <= 15 ? 0.3 : -0.5;
    this.rating += late >= -45 && late <= 20 ? 1 : late < 0 ? 0.6 : late <= 60 ? 0.5 : -0.3;
    if (e <= 2) {
      pts += 300;
      this.stats.perfect++;
      msg = `${pick(GOOD)} ${e.toFixed(1)} m from the marker. +300`;
    } else if (e <= 6) {
      pts += 150;
      msg = `Good stop, ${e.toFixed(1)} m off the marker. +150`;
    } else if (e <= 15) {
      pts += 50;
      msg = `${error > 0 ? "Overshot" : "Short of"} the marker by ${e.toFixed(0)} m. +50`;
    } else {
      pts -= 100;
      this.stats.overshoots++;
      msg = `${error > 0 ? "Overshot" : "Stopped short"} by ${e.toFixed(0)} m: coaches off the platform. −100`;
    }
    let timing: string;
    if (late >= -45 && late <= 20) {
      pts += 200;
      this.stats.onTime++;
      timing = "On time +200";
    } else if (late < 0) {
      pts += 60;
      timing = `${Math.round(-late)} s early +60`;
    } else if (late <= 60) {
      pts += 80;
      timing = `${Math.round(late)} s late +80`;
    } else {
      pts -= 50;
      this.stats.late++;
      timing = `${Math.round(late)} s late −50`;
    }
    this.points += pts;
    this.say(s.en.toUpperCase(), `${msg} • ${timing}`, e <= 6 ? "good" : e <= 15 ? "info" : "bad");
    this.ev.onSound?.(e <= 6 ? "level" : "stumble");
    this.notch = -4;
    this.next++;
    if (!this.nextHalt) {
      // Everyone off at the end of the line.
      this.carried += this.passengers;
      this.points += this.passengers * 0.3;
      this.passengers = 0;
      this.doors = true;
      this.finish();
      return;
    }
    this.startDwell(s.big);
  }

  private finish() {
    this.phase = "done";
    this.phaseT = 0;
    const st = this.stats;
    const stops = this.halts.length - 1;
    const ratio = this.rating / (2 * Math.max(1, stops));
    const grade = ratio > 0.85 ? "A+" : ratio > 0.7 ? "A" : ratio > 0.5 ? "B" : ratio > 0.3 ? "C" : "D";
    const last = this.route[this.route.length - 1];
    this.report = {
      title: `${last.en.toUpperCase()} • DUTY COMPLETE`,
      grade,
      lines: [
        `${this.fast ? "Fast" : "Slow"} local, ${this.route[0].en} → ${last.en}: ${Math.floor(this.t / 60)} min ${Math.round(this.t % 60)} s`,
        `Perfect stops ${st.perfect}/${stops} • On time ${st.onTime}/${stops}`,
        `Bad stops ${st.overshoots} • Overspeed trips ${st.overspeed} • Late ${st.late}`,
        `Passengers carried ${this.carried.toLocaleString()} • Score ${this.score.toLocaleString()}`,
      ],
    };
    this.ev.onSound?.("cheer");
    this.speak([
      { text: `${last.mr}. ही गाडी इथेच थांबते. कृपया सर्व प्रवाशांनी उतरावे.`, lang: "mr-IN" },
      { text: `${last.mr}. यह गाड़ी यहीं तक है. कृपया सभी यात्री उतर जाएं.`, lang: "hi-IN" },
      { text: `${last.en}. This train terminates here. Thank you for travelling with Central Railway.`, lang: "en-IN" },
    ]);
  }

  private speak(lines: Speech[]) {
    if (!this.ghost) this.ev.onSpeak?.(lines);
  }

  private say(text: string, sub: string, tone: Banner["tone"]) {
    this.banner = { text, sub, t: 3.4, tone };
  }
}

/** 08:05:30 style. */
export function fmtClock(sec: number) {
  const s = ((Math.floor(sec) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
