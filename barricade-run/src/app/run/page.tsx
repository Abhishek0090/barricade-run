import type { Metadata } from "next";

import PlayRunner from "@/games/runner/play";

export const metadata: Metadata = {
  title: "Barricade Run",
  description: "Run with the street protest against the NEET paper leak, vote chori and corruption. Jump barricades, slide under the police line and dodge the detention bus.",
};

export default function RunPage() {
  return <PlayRunner />;
}
