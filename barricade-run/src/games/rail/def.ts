import { railBest } from "@/lib/stored";

import type { GameDef } from "../shared/types";

import { BELL_COOLDOWN } from "./constants";
import { RailGame } from "./engine";
import { makeRailView, renderRail } from "./render";

export const railDef: GameDef<RailGame> = {
  id: "rail",
  title: "RAIL",
  titleAccent: "ROKO",
  eyebrow: "Rail roko • Andolan Junction • Daylight run",
  tagline:
    "The protest has stopped the trains. Ride a track trolley out of the city, switch tracks around stopped coaches, oncoming locos and barricades, ring the bell to clear railway police off the line, and duck the police line.",
  blurb: "Daytime trolley ride on a curving line. Switch tracks, ring the bell, duck.",
  color: "#ff5d73",
  canvasLabel: "Game view: riding a rail trolley through the countryside past protesters",
  chaseText: "RPF ON YOUR TAIL!",
  crashTitle: "DERAILED!",
  overTitle: "STOPPED!",
  crashText: {
    barricade: "You hit a barricade bolted across the track. Switch tracks next time.",
    banner: "Stopped at the police line. Duck under it next time.",
    police: "Railway police blocked the track. Ring the bell or switch tracks.",
    coach: "You ran into a stopped train.",
    loco: "Head-on with a locomotive. Switch tracks when you hear the horn.",
    buffer: "The track ended at a buffer stop. Switch before the rails run out.",
    caught: "The railway police caught up with your trolley.",
  },
  notes: [
    "♥ Every run comes with 1 free lifeline. Grab hearts on the track for more.",
    "A trolley can't jump: switch tracks. The bell clears police off your track. A horn means a loco is coming.",
  ],
  keys: [
    [["←", "→", "A", "D"], "switch track"],
    [["↑", "W", "Space"], "ring the bell"],
    [["↓", "S"], "duck"],
    [["P", "Esc"], "pause"],
  ],
  gestures: [
    ["Swipe ← →", "switch track"],
    ["Swipe ↑", "ring the bell (clears police)"],
    ["Swipe ↓", "duck under the police line"],
  ],
  best: railBest,
  create: (events, ghost) => new RailGame(events, ghost),
  makeView: makeRailView,
  render: renderRail,
  meter: (g) => ({
    label: "BELL",
    value: 1 - g.cart.bellT / BELL_COOLDOWN,
    segments: 1,
    active: g.cart.bellT === 0,
  }),
};
