import type { Metadata } from "next";

import PlayLocal from "@/games/local/play";

export const metadata: Metadata = {
  title: "Mumbai Local",
  description: "Motorman sim: drive a 12-car Mumbai local from Kalyan to CSMT. Signals, speed limits, stops on the 12-car marker, and announcements in Marathi, Hindi and English.",
};

export default function LocalPage() {
  return <PlayLocal />;
}
