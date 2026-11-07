import { dangalBest } from "@/lib/stored";

import type { GameDef } from "../shared/types";

import { DangalGame } from "./engine";
import { drawDangalOverlay, makeDangalView, renderDangal } from "./render";

export const dangalDef: GameDef<DangalGame> = {
  id: "dangal",
  title: "DANGAL",
  titleAccent: "SHOWDOWN",
  eyebrow: "Wrestling • Live from Jantar Mantar • 5-match ladder",
  tagline:
    "The wrestlers take their protest into the ring. Pick your pehelwan, then punch, kick, slam and pin your way past five fictional villains to the federation boss Kursi Kumar, who brings a steel chair. Win the belt, then defend it.",
  blurb: "WWE-style ring fights. Combos, slams, finishers and the 1-2-3 pin.",
  color: "#c77dff",
  canvasLabel: "Game view: a 3D wrestling ring in a packed arena",
  chaseText: "",
  crashTitle: "PINNED!",
  overTitle: "1... 2... 3!",
  crashText: {
    pinned: "You were pinned for the three count. Mash the buttons harder to kick out next time.",
  },
  notes: [
    "Pin a downed opponent with GRAB. When you are pinned, mash any button to kick out.",
    "Landing moves fills your finisher meter. ♥ Lifelines give you a rematch.",
  ],
  keys: [
    [["W", "A", "S", "D", "←", "→", "↑", "↓"], "move around the ring"],
    [["J"], "punch (3 in a row knocks down)"],
    [["K"], "kick"],
    [["L"], "grapple, pin, or pick up the chair"],
    [["I"], "finisher (when the meter is full)"],
  ],
  gestures: [
    ["Drag", "move around the ring"],
    ["Buttons", "punch, kick, grapple/pin and finisher"],
    ["Mash", "any button to kick out of a pin"],
  ],
  best: dangalBest,
  control: "stick",
  hud: "minimal",
  buttons: [
    { action: "kick", label: "KICK", keys: ["KeyK", "KeyX"] },
    { action: "special", label: "FINISH", keys: ["KeyI", "KeyV"] },
    { action: "punch", label: "PUNCH", keys: ["KeyJ", "KeyZ"] },
    { action: "grab", label: "GRAB", keys: ["KeyL", "KeyC"] },
  ],
  resultLabels: ["Matches won", "Moves landed"],
  resultUnit: "",
  create: (events, ghost) => new DangalGame(events, ghost),
  makeView: makeDangalView,
  render: renderDangal,
  // Real 3D arena; the 2D renderer above stays as the fallback when WebGL is unavailable.
  scene3d: (canvas) => import("./scene3d").then((m) => m.createDangalScene(canvas)),
  overlay3d: drawDangalOverlay,
};
