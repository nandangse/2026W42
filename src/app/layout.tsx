import type { Metadata, Viewport } from "next";
import "./globals.css";
import A11y from "@/components/A11y";

export const metadata: Metadata = {
  title: "Nandan Genie",
  description: "Nandan GSE's own software — one login for every door",
  // src/app/icon.svg is picked up automatically for the browser tab; this also
  // covers the home-screen icon when the board is pinned on a phone.
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  /**
   * Never indexed, anywhere, by anything — including the login page
   * (Dr Raghu, 22 Aug 2026).
   *
   * This emits <meta name="robots" content="noindex, nofollow, ..."> on every
   * page. It is the layer a crawler sees if it reads the markup but ignores
   * the response headers; next.config.js sends X-Robots-Tag for the crawlers
   * that do the reverse, and /robots.txt asks the polite ones not to come at
   * all. Three layers because each one alone has a hole.
   */
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-snippet": -1,
      "max-image-preview": "none",
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body><A11y />{children}</body>
    </html>
  );
}
