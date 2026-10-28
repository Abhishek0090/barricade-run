import type { Metadata } from "next";

import PlayRail from "@/games/rail/play";

export const metadata: Metadata = {
  title: "Rail Roko",
  description: "Ride a track trolley through the rail roko. Switch tracks around stopped trains and oncoming locos, jump barricades and duck the police line.",
};

export default function RailPage() {
  return <PlayRail />;
}
