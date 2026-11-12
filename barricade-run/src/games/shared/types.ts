import type { storedNumber } from "@/lib/stored";

import type { Ctx, View } from "./scene";

export type Action = "left" | "right" | "up" | "down" | "punch" | "kick" | "grab" | "special";

export type Sound =
  | "coin"
  | "jump"
  | "crouch"
  | "lane"
  | "stumble"
  | "crash"
  | "lifeline"
  | "nitro"
  | "smash"
  | "brake"
  | "clank"
  | "horn"
  | "bell"
  | "whistle"
  | "level"
  | "hit"
  | "cheer";

/** One spoken line, e.g. a station announcement. lang is a BCP 47 tag like "hi-IN". */
export interface Speech {
  text: string;
  lang: string;
}

export interface ArcadeEvents {
  onSound?: (sound: Sound) => void;
  onCrash?: (reason: string) => void;
  /** Announcements, read out with the device's speech voices. */
  onSpeak?: (lines: Speech[]) => void;
}

/** What the shared game shell needs from every game engine. */
export interface ArcadeGame {
  readonly status: "running" | "crashed";
  readonly score: number;
  readonly coins: number;
  readonly distance: number;
  readonly lifelines: number;
  /** Seconds left in a police chase; 0 when nobody is chasing. */
  readonly chaseT: number;
  update(dt: number): void;
  input(action: Action): void;
  /** Spend a lifeline after a crash. Returns false when there is none to spend. */
  revive(): boolean;
  /** Analog movement for stick games, each axis -1..1. */
  steer?(x: number, y: number): void;
  /** Zoom the camera by a factor (above 1 = closer). */
  zoomBy?(factor: number): void;
  /** Turn the camera (360° look), in radians. */
  look?(yaw: number, pitch: number): void;
  /** Train rumble loudness, 0..1, polled every frame. */
  readonly rumble?: number;
}

/** Engine coordinates to screen pixels, for drawing 2D labels over a 3D scene. */
export type Project = (x: number, y: number, z: number) => { x: number; y: number; visible: boolean };

/** A WebGL scene that draws a game in real 3D. Loaded on demand so other games don't download it. */
export interface Scene3D<G extends ArcadeGame = ArcadeGame> {
  resize(w: number, h: number, pixelRatio: number): void;
  render(game: G, clock: number, dt: number): void;
  project: Project;
  dispose(): void;
}

export interface Meter {
  label: string;
  /** 0..1 */
  value: number;
  segments: number;
  active: boolean;
}

/**
 * Everything the shell needs to run one game: how to create and draw it, and the texts around it.
 * Methods (not arrow properties) so a GameDef<RunnerGame> is assignable to GameDef<ArcadeGame>.
 */
export interface GameDef<G extends ArcadeGame = ArcadeGame> {
  id: string;
  title: string;
  titleAccent: string;
  eyebrow: string;
  tagline: string;
  /** Short line on the hub card. */
  blurb: string;
  /** Main colour of the game's branding. */
  color: string;
  canvasLabel: string;
  chaseText: string;
  crashTitle: string;
  overTitle: string;
  crashText: Record<string, string>;
  notes: string[];
  keys: [keys: string[], text: string][];
  gestures: [gesture: string, text: string][];
  best: ReturnType<typeof storedNumber>;
  create(events: ArcadeEvents, ghost: boolean): G;
  makeView(w: number, h: number): View;
  render(ctx: Ctx, view: View, game: G, clock: number): void;
  meter?(game: G): Meter | null;
  /** "swipe" (default): lane games. "stick": free movement with keys or a drag joystick (Slam Night). */
  control?: "swipe" | "stick";
  /** Labels for the two numbers on the game-over screen (defaults: Distance, Coins). */
  resultLabels?: [string, string];
  /** Unit after the first result number (default " m"). */
  resultUnit?: string;
  /** "minimal": the game draws its own HUD; the shell shows only the pause button. */
  hud?: "full" | "minimal";
  /** Real 3D renderer. When it loads, `render` is only used as a fallback and `overlay3d` draws the HUD on top. */
  scene3d?(canvas: HTMLCanvasElement): Promise<Scene3D<G>>;
  overlay3d?(ctx: Ctx, view: View, game: G, clock: number, project: Project): void;
  /** 360° camera: mouse drag, the right side of a touch screen, or Q / E turn the view. */
  look3d?: boolean;
  /** Camera zoom: mouse wheel, pinch, or the + / - keys call game.zoomBy. */
  zoomable?: boolean;
  /** On-screen action buttons (touch screens) and their keyboard keys (KeyboardEvent.code). */
  /** touch: false makes a keyboard-only binding with no on-screen button. */
  buttons?: { action: Action; label: string; keys: string[]; touch?: boolean }[];
}
