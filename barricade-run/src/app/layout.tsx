import type { Metadata, Viewport } from "next";

import { ServiceWorker } from "@/components/pwa";
import { ARCADE_NAME, AUTHOR } from "@/games/shared/constants";

import "./globals.css";

const description =
  "Three street games set in the protest against the NEET paper leak, vote chori and corruption: Barricade Run, Barricade Drive and Rail Roko. Plays on laptop and mobile, works offline.";

export const metadata: Metadata = {
  title: { default: ARCADE_NAME, template: `%s • ${ARCADE_NAME}` },
  description,
  applicationName: ARCADE_NAME,
  authors: [{ name: AUTHOR }],
  creator: AUTHOR,
  appleWebApp: {
    capable: true,
    title: ARCADE_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#140c29",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
