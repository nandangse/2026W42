import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

// Keeps the Supabase auth session fresh on every navigation so server
// components & route handlers see a valid user.
export async function middleware(req: NextRequest) {
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
