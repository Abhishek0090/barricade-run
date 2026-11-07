import type { Metadata } from "next";

import PlayDangal from "@/games/dangal/play";

export const metadata: Metadata = {
  title: "Dangal Showdown",
  description: "WWE-style wrestling in a packed arena. Pick a protest wrestler, punch, kick, slam and pin your way past five fictional villains to win the belt.",
};

export default function DangalPage() {
  return <PlayDangal />;
}
