import type { storedNumber } from "@/lib/stored";

import type { Ctx, View } from "./scene";

export type Action = "left" | "right" | "up" | "down";

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
  | "bell";

export interface ArcadeEvents {
  onSound?: (sound: Sound) => void;
  onCrash?: (reason: string) => void;
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
}
