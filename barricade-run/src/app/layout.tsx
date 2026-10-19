import type { Metadata, Viewport } from "next";

import { ServiceWorker } from "@/components/pwa";

import "./globals.css";

const description = "Run with the street protest against the NEET paper leak, vote chori and corruption. Dodge police barricades, riot police and the detention bus. Plays on laptop and mobile, works offline.";

export const metadata: Metadata = {
  title: "Barricade Run",
  description,
  applicationName: "Barricade Run",
  appleWebApp: {
    capable: true,
    title: "Barricade Run",
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
  themeColor: "#1a1033",
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
