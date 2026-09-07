import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readBody } from "@/lib/validate";
import { errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { passwordMatches } from "@/lib/idp-password";
import { makeIdpCookie, IDP_COOKIE } from "@/lib/idp-session";
import { swallow } from "@/lib/swallow";

export const dynamic = "force-dynamic";

/**
 * SIGNING IN TO /idp WITH A PERSONAL E-MAIL (Dr Raghu, 7 Sep 2026).
 *
 * The workers have no Genie login, and their company mailbox is shared by
 * five or six people — so the personal address is the only one that
 * identifies one person. They sign in here with it and the password HR
 * issued.
 *
 * Five wrong tries locks the address for fifteen minutes. A wrong password
 * and an unknown address give the SAME answer, so this cannot be used to
 * find out who works here.
 */
const MAX_TRIES = 5;
const LOCK_MINUTES = 15;
const SAME = "That e-mail and password do not match. Check the mail HR sent you, or ask HR.";

export async function POST(req: Request) {
  try {
    const b = await readBody(req, { email: "string?", password: "string?", action: "string?" });

    if (String(b.action || "") === "logout") {
      (await cookies()).set(IDP_COOKIE, "", { maxAge: 0, path: "/" });
      return NextResponse.json({ ok: true });
    }

    const email = String(b.email || "").trim().toLowerCase();
    const password = String(b.password || "");
    if (!email || !password) throw new HttpError(400, "Your e-mail and the password, please.");

    const admin = adminClient();
    const { data: row, error } = await admin
      .from("hrms_idp_login")
      .select("employee_id, email, pw_hash, pw_salt, wrong_tries, locked_until, login_count")
      .eq("email", email).maybeSingle();
    if (error && /hrms_idp_login|schema cache|does not exist/i.test(error.message))
      throw new HttpError(503, "Sign-in is not switched on yet — migration 0154 has to run first.");
    if (!row) throw new HttpError(401, SAME);

    if (row.locked_until && new Date(String(row.locked_until)) > new Date())
      throw new HttpError(429, `Too many tries. Wait ${LOCK_MINUTES} minutes, or ask HR to send the password again.`);

    if (!passwordMatches(password, String(row.pw_salt), String(row.pw_hash))) {
      const tries = Number(row.wrong_tries || 0) + 1;
      await admin.from("hrms_idp_login").update({
        wrong_tries: tries,
        locked_until: tries >= MAX_TRIES ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null,
      }).eq("employee_id", row.employee_id).then(() => null, (e) => swallow("idp/login", e));
      throw new HttpError(401, SAME);
    }

    // In: the temporary password is wiped, because it has done its one job.
    await admin.from("hrms_idp_login").update({
      pw_temp: null, wrong_tries: 0, locked_until: null,
      last_login_at: new Date().toISOString(), login_count: Number(row.login_count || 0) + 1,
    }).eq("employee_id", row.employee_id).then(() => null, (e) => swallow("idp/login", e));

    const c = makeIdpCookie(String(row.employee_id));
    (await cookies()).set(c.name, c.value, {
      maxAge: c.maxAge, path: "/", httpOnly: true, sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });
    return NextResponse.json({ ok: true, employee_id: row.employee_id });
  } catch (e) {
    return errJson(e);
  }
}
