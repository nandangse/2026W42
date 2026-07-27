import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nandan Works Planning Suite",
  description: "Milestones · Load · Tasking · Delivery — standalone planning app",
  // src/app/icon.svg is picked up automatically for the browser tab; this also
  // covers the home-screen icon when the board is pinned on a phone.
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
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
      <body>{children}</body>
    </html>
  );
}
