import { driveBest } from "@/lib/stored";

import type { GameDef } from "../shared/types";

import { BOOST_COST, BOOST_TIME } from "./constants";
import { DriveGame } from "./engine";
import { makeDriveView, renderDrive } from "./render";

export const driveDef: GameDef<DriveGame> = {
  id: "drive",
  title: "BARRICADE",
  titleAccent: "DRIVE",
  eyebrow: "Chakka jam • Night drive • Nitro",
  tagline:
    "The march has jammed the highway. Weave your kaali-peeli taxi through stuck traffic, police jeeps and detention buses, grab the coins and burn nitro to smash straight through the barricades.",
  blurb: "Four-lane night drive through the jam. Burn nitro to smash barricades.",
  color: "#3ab0ff",
  canvasLabel: "Game view: driving a taxi through a traffic jam at night",
  chaseText: "POLICE BIKES ON YOUR TAIL!",
  crashTitle: "CRASHED!",
  overTitle: "PULLED OVER!",
  crashText: {
    car: "You rear-ended a car stuck in the jam.",
    auto: "You hit an auto-rickshaw. The driver is not happy.",
    jeep: "Head-on with a police jeep.",
    bus: "You slammed into the detention bus.",
    barricade: "You hit a barricade. Use nitro to smash through next time.",
    cones: "You ploughed through the cones.",
    caught: "The police bikes boxed you in and pulled you over.",
  },
  notes: ["♥ Every run comes with 1 free lifeline. Grab hearts on the road for more.", "Blue cans fill the nitro meter. Coins +10, smashed barricades +25."],
  keys: [
    [["←", "→", "A", "D"], "change lane"],
    [["↑", "W", "Space"], "nitro boost"],
    [["↓", "S"], "brake"],
    [["P", "Esc"], "pause"],
  ],
  gestures: [
    ["Swipe ← →", "change lane"],
    ["Swipe ↑", "nitro boost"],
    ["Swipe ↓", "brake"],
  ],
  best: driveBest,
  create: (events, ghost) => new DriveGame(events, ghost),
  makeView: makeDriveView,
  render: renderDrive,
  meter: (g) => ({
    label: "NITRO",
    value: g.boosting ? g.car.boostT / BOOST_TIME : g.car.nitro,
    segments: Math.round(1 / BOOST_COST),
    active: g.boosting,
  }),
};
