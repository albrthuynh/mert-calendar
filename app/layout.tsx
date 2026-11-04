import { headers } from "next/headers";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Mert Calendar & Opportunity Desk",
  description: "A personal calendar, to-do list, and job application tracker",
  applicationName: "Mert Calendar",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Mert Calendar",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/aut_creature.webp",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111827" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
