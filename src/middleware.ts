import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Keeps the Supabase auth session fresh on every navigation so server
// components & route handlers see a valid user.
/**
 * THE LANDING-PAGE DOMAIN (Dr Raghu, 6 Sep 2026: "we will have a landing
 * page creator at nandangse.com/<lpname>").
 *
 * On that host a bare one-word address IS a landing page: nandangse.com/
 * gse-loaders is served by /lp/gse-loaders, with nothing else on the domain.
 * Genie's own address keeps the /lp prefix. Nothing happens until the domain
 * is added to the Vercel project and its DNS points there.
 */
const LANDING_HOSTS = new Set(["nandangse.com", "www.nandangse.com"]);
const SLUG_PATH = /^\/[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;

export async function middleware(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase().replace(/:\d+$/, "");
  if (LANDING_HOSTS.has(host)) {
    const path = req.nextUrl.pathname.replace(/\/$/, "");
    if (path === "") return NextResponse.rewrite(new URL("/lp/home", req.url));
    if (!path.startsWith("/api") && !path.startsWith("/_next") && !path.startsWith("/lp/") && SLUG_PATH.test(path)) {
      return NextResponse.rewrite(new URL(`/lp${path}`, req.url));
    }
  }

  const res = NextResponse.next({ request: { headers: req.headers } });
  const supabase = createServerClient(
    env("NEXT_PUBLIC_SUPABASE_URL"),
    env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        get: (name: string) => req.cookies.get(name)?.value,
        set: (name: string, value: string, options: CookieOptions) => {
          res.cookies.set({ name, value, ...options });
        },
        remove: (name: string, options: CookieOptions) => {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    },
  );
  await supabase.auth.getUser();
  return res;
}

export const config = {
  // run on everything except static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
