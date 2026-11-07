"use client";

import { GameShell } from "@/components/game-shell";

import { localDef } from "./def";

export default function PlayLocal() {
  return <GameShell def={localDef} />;
}
