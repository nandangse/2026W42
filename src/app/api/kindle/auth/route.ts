import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import {
  currentKindler, hashPassword, kindleAudit, KINDLE_COOKIE, makeKindleCookie, newInviteToken, newSalt,
  notInstalled, passwordMatches, passwordProblem,
} from "@/lib/kindle/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/kindle/auth — the Kindle login realm.
 *   login        { email, password }   → cookie; must_change says what comes next
 *   invite       { token }             → the one-time link from the welcome mail; opens, then forces a password
 *   set_password { password }          → needs a session (even a must_change one); bumps pw_version
 *   forgot       { email }             → mints a fresh invite; the mail is phase 5, so for now the facilitator hands it over
 *   logout
 * GET → who this browser is, or null.
 */
export async function GET() {
  const k = await currentKindler();
  return NextResponse.json({ me: k });
}

const setCookie = (res: NextResponse, c: { name: string; value: string; maxAge: number }) =>
  res.cookies.set(c.name, c.value, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: c.maxAge });

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = String(body.action || "");
    const admin = adminClient();

    if (action === "logout") {
      const res = NextResponse.json({ ok: true });
      res.cookies.set(KINDLE_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) throw new HttpError(400, "E-mail and password, please.");
      const { data: m, error } = await admin.from("kindle_member").select("id,email,name,active,pw_salt,pw_hash,pw_version,must_change").eq("email", email).maybeSingle();
      if (error) { if (notInstalled(error)) throw new HttpError(503, "Kindle is not installed yet — migration 0187."); throw error; }
      /* the same answer whether the e-mail is unknown or the password wrong — no directory by guessing */
      if (!m || !m.active || !passwordMatches(password, m.pw_salt, m.pw_hash)) {
        await kindleAudit(null, "login_failed", { email });
        throw new HttpError(401, "That e-mail and password do not match a Kindler.");
      }
      await admin.from("kindle_member").update({ last_login_at: new Date().toISOString(), login_count: (await loginCount(m.id)) + 1 }).eq("id", m.id);
      const res = NextResponse.json({ ok: true, must_change: !!m.must_change });
      setCookie(res, makeKindleCookie(String(m.id), Number(m.pw_version || 1)));
      await kindleAudit({ id: m.id, email: m.email } as never, "login", {});
      return res;
    }

    if (action === "invite") {
      const token = String(body.token || "");
      if (!token) throw new HttpError(400, "No invite.");
      const { data: m, error } = await admin.from("kindle_member").select("id,email,active,pw_version,invite_expires").eq("invite_token", token).maybeSingle();
      if (error) { if (notInstalled(error)) throw new HttpError(503, "Kindle is not installed yet — migration 0187."); throw error; }
      if (!m || !m.active) throw new HttpError(404, "This link is not valid.");
      if (m.invite_expires && new Date(String(m.invite_expires)).getTime() < Date.now()) throw new HttpError(410, "This link has expired — ask the facilitator for a fresh one.");
      /* the link is one-time: it is spent the moment it opens */
      await admin.from("kindle_member").update({ invite_token: null, invite_expires: null, must_change: true, last_login_at: new Date().toISOString() }).eq("id", m.id);
      const res = NextResponse.json({ ok: true, must_change: true });
      setCookie(res, makeKindleCookie(String(m.id), Number(m.pw_version || 1)));
      await kindleAudit({ id: m.id, email: m.email } as never, "invite_opened", {});
      return res;
    }

    if (action === "set_password") {
      const k = await currentKindler();
      if (!k) throw new HttpError(401, "Sign in first.");
      const password = String(body.password || "");
      const problem = passwordProblem(password, k.email);
      if (problem) throw new HttpError(400, problem);
      const salt = newSalt();
      const { data: cur } = await admin.from("kindle_member").select("pw_version").eq("id", k.id).maybeSingle();
      const v = Number(cur?.pw_version || 1) + 1;
      await admin.from("kindle_member").update({ pw_salt: salt, pw_hash: hashPassword(password, salt), pw_version: v, must_change: false, invite_token: null, invite_expires: null, updated_at: new Date().toISOString() }).eq("id", k.id);
      const res = NextResponse.json({ ok: true });
      /* a Genie-session admin setting a Kindle password does not need the cookie, but it does no harm */
      setCookie(res, makeKindleCookie(k.id, v));
      await kindleAudit(k, "password_set", {});
      return res;
    }

    if (action === "forgot") {
      const email = String(body.email || "").trim().toLowerCase();
      const { data: m } = await admin.from("kindle_member").select("id,active").eq("email", email).maybeSingle();
      if (m && m.active) {
        await admin.from("kindle_member").update({ invite_token: newInviteToken(), invite_expires: new Date(Date.now() + 72 * 3600e3).toISOString(), invited_at: new Date().toISOString() }).eq("id", m.id);
        await kindleAudit({ id: m.id, email } as never, "forgot", {});
      }
      /* same answer either way; the mail itself is phase 5 */
      return NextResponse.json({ ok: true, note: "If that e-mail is a Kindler's, a fresh link has been made. Until the mails are switched on, the facilitator can hand it to you from Settings." });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}

async function loginCount(id: string): Promise<number> {
  const { data } = await adminClient().from("kindle_member").select("login_count").eq("id", id).maybeSingle();
  return Number(data?.login_count || 0);
}
