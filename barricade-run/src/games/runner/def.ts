import { bestScore } from "@/lib/stored";

import type { GameDef } from "../shared/types";

import { RunnerGame } from "./engine";
import { makeRunnerView, renderRunner } from "./render";

export const runnerDef: GameDef<RunnerGame> = {
  id: "run",
  title: "BARRICADE",
  titleAccent: "RUN",
  eyebrow: "Paper leak • Vote chori • Corruption",
  tagline:
    "The NEET paper leaked. Votes were stolen. The streets are full. Run with the protest, dodge the barricades, riot police and the detention bus, and grab the coins on the way.",
  blurb: "Endless runner through the march. Jump barricades, slide under the police line.",
  color: "#ffcc00",
  canvasLabel: "Game view: running down a road through a protest",
  chaseText: "POLICE ON YOUR TAIL!",
  crashTitle: "BUSTED!",
  overTitle: "CAUGHT!",
  crashText: {
    barricade: "You crashed into a police barricade.",
    banner: "Stopped at the police line. Slide under it next time.",
    police: "The riot police blocked your way.",
    bus: "Detained! You were pushed into the police bus.",
    caught: "The police caught you. The protest goes on without you... for now.",
  },
  notes: ["♥ Every run comes with 1 free lifeline. Grab hearts on the road for more.", "Collect coins on the road (+10 each)."],
  keys: [
    [["←", "→", "A", "D"], "change lane"],
    [["↑", "W", "Space"], "jump"],
    [["↓", "S"], "slide"],
    [["P", "Esc"], "pause"],
  ],
  gestures: [
    ["Swipe ← →", "change lane"],
    ["Swipe ↑", "jump over barricades"],
    ["Swipe ↓", "slide under the police line"],
  ],
  best: bestScore,
  create: (events, ghost) => new RunnerGame(events, ghost),
  makeView: makeRunnerView,
  render: renderRunner,
};
