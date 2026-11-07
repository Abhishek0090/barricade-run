import type { Metadata } from "next";

import PlayLocal from "@/games/local/play";

export const metadata: Metadata = {
  title: "Mumbai Local",
  description: "3D commute simulator on the Mumbai local: Kalyan to CSMT by 10 AM, back home at 7 PM. Push in, keep your balance, grab a seat and don't miss your stop.",
};

export default function LocalPage() {
  return <PlayLocal />;
}
