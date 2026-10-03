import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import {
  currentPortalUser, hashPassword, makePortalCookie, newInviteToken, newSalt, notInstalled,
  passwordMatches, passwordProblem, PORTAL_COOKIE, portalAudit, tooManyTries,
} from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

/**
 * POST /api/portal/auth — the portal's login realm.
 *   login        { email, password }   → cookie; must_change says what comes next
 *   invite       { token }             → the one-time link from the invite mail; opens, then forces a password
 *   set_password { password }          → needs a session (even a must_change one); bumps pw_version
 *   forgot       { email }             → mints a fresh invite; the admin hands it over or mails it
 *   logout
 * GET → who this browser is, or null.
 */
export async function GET() {
  const u = await currentPortalUser();
  return NextResponse.json({ me: u });
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
      res.cookies.set(PORTAL_COOKIE, "", { path: "/", maxAge: 0 });
      return res;
    }

    if (action === "login") {
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!email || !password) throw new HttpError(400, "E-mail and password, please.");
      if (await tooManyTries(email)) throw new HttpError(429, "Too many tries — wait fifteen minutes and try again.");
      const { data: m, error } = await admin.from("portal_user").select("id,email,name,active,pw_salt,pw_hash,pw_version,must_change,login_count,org_slug").eq("email", email).maybeSingle();
      if (error) { if (notInstalled(error)) throw new HttpError(503, "The portal is not installed yet — migration 0198."); throw error; }
      /* the same answer whether the e-mail is unknown or the password wrong */
      if (!m || !m.active || !passwordMatches(password, m.pw_salt, m.pw_hash)) {
        await portalAudit({ id: "", email }, "login_failed", {});
        throw new HttpError(401, "That e-mail and password do not match a portal login.");
      }
      await admin.from("portal_user").update({ last_login_at: new Date().toISOString(), login_count: Number(m.login_count || 0) + 1 }).eq("id", m.id);
      const res = NextResponse.json({ ok: true, must_change: !!m.must_change, org_slug: m.org_slug ?? null });
      setCookie(res, makePortalCookie(String(m.id), Number(m.pw_version || 1)));
      await portalAudit({ id: String(m.id), email: m.email }, "login", {});
      return res;
    }

    if (action === "invite") {
      const token = String(body.token || "");
      if (!token) throw new HttpError(400, "No invite.");
      const { data: m, error } = await admin.from("portal_user").select("id,email,active,pw_version,invite_expires,org_slug").eq("invite_token", token).maybeSingle();
      if (error) { if (notInstalled(error)) throw new HttpError(503, "The portal is not installed yet — migration 0198."); throw error; }
      if (!m || !m.active) throw new HttpError(404, "This link is not valid.");
      if (m.invite_expires && new Date(String(m.invite_expires)).getTime() < Date.now()) throw new HttpError(410, "This link has expired — ask Nandan for a fresh one.");
      await admin.from("portal_user").update({ invite_token: null, invite_expires: null, must_change: true, last_login_at: new Date().toISOString() }).eq("id", m.id);
      const res = NextResponse.json({ ok: true, must_change: true, org_slug: m.org_slug ?? null });
      setCookie(res, makePortalCookie(String(m.id), Number(m.pw_version || 1)));
      await portalAudit({ id: String(m.id), email: m.email }, "invite_opened", {});
      return res;
    }

    if (action === "set_password") {
      const u = await currentPortalUser();
      if (!u) throw new HttpError(401, "Sign in first.");
      if (u.via === "genie" && !/^[0-9a-f-]{36}$/.test(u.id)) throw new HttpError(400, "Your Genie login has no portal password to set.");
      const password = String(body.password || "");
      const problem = passwordProblem(password, u.email);
      if (problem) throw new HttpError(400, problem);
      const salt = newSalt();
      const { data: cur } = await admin.from("portal_user").select("pw_version").eq("id", u.id).maybeSingle();
      const v = Number(cur?.pw_version || 1) + 1;
      await admin.from("portal_user").update({ pw_salt: salt, pw_hash: hashPassword(password, salt), pw_version: v, must_change: false, invite_token: null, invite_expires: null, updated_at: new Date().toISOString() }).eq("id", u.id);
      const res = NextResponse.json({ ok: true });
      setCookie(res, makePortalCookie(u.id, v));
      await portalAudit(u, "password_set", {});
      return res;
    }

    if (action === "forgot") {
      const email = String(body.email || "").trim().toLowerCase();
      const { data: m } = await admin.from("portal_user").select("id,active").eq("email", email).maybeSingle();
      if (m && m.active) {
        await admin.from("portal_user").update({ invite_token: newInviteToken(), invite_expires: new Date(Date.now() + 72 * 3600e3).toISOString(), invited_at: new Date().toISOString() }).eq("id", m.id);
        await portalAudit({ id: String(m.id), email }, "forgot", {});
      }
      return NextResponse.json({ ok: true, note: "If that e-mail has a portal login, a fresh link has been made. Nandan's portal admin can mail it to you from Settings." });
    }

    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
