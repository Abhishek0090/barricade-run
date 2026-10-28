import type { Metadata } from "next";

import PlayDrive from "@/games/drive/play";

export const metadata: Metadata = {
  title: "Barricade Drive",
  description: "Drive a kaali-peeli taxi through the protest's chakka jam at night. Weave through stuck traffic and police jeeps, and burn nitro to smash the barricades.",
};

export default function DrivePage() {
  return <PlayDrive />;
}
