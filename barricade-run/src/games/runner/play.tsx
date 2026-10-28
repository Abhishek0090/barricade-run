"use client";

import { GameShell } from "@/components/game-shell";

import { runnerDef } from "./def";

export default function PlayRunner() {
  return <GameShell def={runnerDef} />;
}
