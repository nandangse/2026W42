import type { MetadataRoute } from "next";

/**
 * THE WEB APP MANIFEST — what lets a phone keep Genie as an icon
 * (Dr Raghu, 8 Sep 2026: "can you popup to 'Add to your desktop', so they can
 * put this as a shortcut app on the shortcut, then they can click it and
 * open").
 *
 * `start_url` is /idp deliberately. The people who will install this are the
 * two hundred who have nothing else in Genie — they open it to read a payslip
 * or an IDP, and the icon should land them there rather than on a front page
 * they have no business in.
 *
 * `display: standalone` is what removes the browser chrome, which is the
 * whole point: once installed it stops looking like a website they were sent
 * a link to, and starts looking like the company's app.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nandan Genie — my sheet & IDP",
    short_name: "Nandan Genie",
    description: "Your payslip, your leave, your IDP and your record — Nandan GSE.",
    start_url: "/idp",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1B2233",
    theme_color: "#1B2233",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
