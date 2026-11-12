import type { Metadata } from "next";

import PlayDangal from "@/games/dangal/play";

export const metadata: Metadata = {
  title: "Slam Night",
  description: "WWE-style championship wrestling. Pick Thunder Singh, Rani Blaze or Kid Cyclone and fight up the ladder to King Kursi for the belt. All wrestlers are fictional.",
};

export default function DangalPage() {
  return <PlayDangal />;
}
