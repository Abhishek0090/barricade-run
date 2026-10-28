"use client";

import { GameShell } from "@/components/game-shell";

import { railDef } from "./def";

export default function PlayRail() {
  return <GameShell def={railDef} />;
}
