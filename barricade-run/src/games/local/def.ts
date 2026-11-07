import { localBest } from "@/lib/stored";

import type { GameDef } from "../shared/types";

import { LocalGame } from "./engine";
import { drawLocalHud } from "./hud";
import { renderLocal } from "./render2d";

export const localDef: GameDef<LocalGame> = {
  id: "local",
  title: "MUMBAI",
  titleAccent: "LOCAL",
  eyebrow: "Motorman • Kalyan → CSMT • Central line",
  tagline:
    "You are the motorman of a 12-car Central line local. Drive from Kalyan to CSMT: power up after the guard's bell, obey the signals and speed boards, stop dead on the 12-car marker at every halt, and keep to the timetable while thousands of commuters hang from the doors. Station announcements in Marathi, Hindi and English.",
  blurb: "Drive the 12-car local from Kalyan to CSMT: signals, speed limits, precise stops, announcements.",
  color: "#2ec4b6",
  canvasLabel: "Game view: driving a Mumbai local train from the motorman's cab, in 3D",
  chaseText: "",
  crashTitle: "INCIDENT",
  overTitle: "OFF DUTY",
  crashText: {
    spad: "You passed a red signal. The train is stopped and there will be an inquiry.",
    buffer: "You hit the buffer stops at the terminus. Brake earlier on the approach.",
  },
  notes: [
    "Fast locals halt at Dombivli, Thane, Ghatkopar, Kurla, Dadar and Byculla. Slow locals stop at all 25 stations.",
    "Perfect stop within 2 m of the marker +300, on time +200. Red signal or buffer stops = incident.",
    "♥ A lifeline clears an incident and puts you back on the line.",
  ],
  keys: [
    [["↑", "W"], "power notch up / release brake"],
    [["↓", "S"], "brake notch (press more for emergency)"],
    [["←", "→", "C"], "camera: cab, chase, side, drone, front, trackside"],
    [["+", "-", "Wheel"], "zoom in / out"],
    [["Space"], "start duty / depart after the bell"],
    [["H"], "horn"],
    [["Q", "E", "Mouse drag"], "look around 360°"],
    [["P", "Esc"], "pause"],
  ],
  gestures: [
    ["POWER ▲", "notch up"],
    ["BRAKE ▼", "brake"],
    ["Swipe ← →", "change view"],
    ["Drag right side", "look around"],
    ["Pinch", "zoom in / out"],
  ],
  best: localBest,
  hud: "minimal",
  look3d: true,
  buttons: [
    { action: "up", label: "POWER ▲", keys: [] },
    { action: "kick", label: "HORN", keys: ["KeyH"] },
    { action: "down", label: "BRAKE ▼", keys: [] },
    { action: "grab", label: "VIEW", keys: ["KeyC", "KeyV"] },
    // Space / Enter: start the duty, depart after the bell, next duty. Keyboard only.
    { action: "punch", label: "GO", keys: ["Space", "Enter", "NumpadEnter"], touch: false },
  ],
  resultLabels: ["Duties", "Passengers"],
  resultUnit: "",
  create: (events, ghost) => new LocalGame(events, ghost),
  makeView: (w, h) => ({ w, h, cx: w / 2, focal: 0, horizon: 0, camH: 0, back: 1, near: 0, camX: 0, curve: 0, backdrop: null }),
  render: renderLocal,
  scene3d: (canvas) => import("./scene3d").then((m) => m.createLocalScene(canvas)),
  overlay3d: drawLocalHud,
};
