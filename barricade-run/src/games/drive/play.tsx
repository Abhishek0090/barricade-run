"use client";

import { GameShell } from "@/components/game-shell";

import { driveDef } from "./def";

export default function PlayDrive() {
  return <GameShell def={driveDef} />;
}
