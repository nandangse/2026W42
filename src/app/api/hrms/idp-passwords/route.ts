import { NextResponse } from "next/server";
import { requireHrms, errJson, HttpError } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import { readBody } from "@/lib/validate";
import { people } from "@/lib/hrms-wa";
import { makePassword, hashPassword, newSalt } from "@/lib/idp-password";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * ISSUING THE FIRST PASSWORD FOR /idp (Dr Raghu, 7 Sep 2026: "we will, for
 * the first mail, generate a temporary password and send it to his email").
 *
 * One per person, against their PERSONAL address — never the work one, which
 * five or six people share. The plain password is kept only so the first mail
 * can carry it as {{PERS_PAS}}; the moment the person signs in it is wiped
 * and only the hash remains.
 *
 * Issuing again for somebody who already has one does NOT change their
 * password unless asked: a second run of the same button must not lock out
 * everybody who has already been told theirs.
 */
const ok = (x: unknown) => { const s = String(x || "").trim(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s.toLowerCase() : ""; };

export async function GET() {
  try {
    await requireHrms();
    const admin = adminClient();
    const all = await people(admin);
    const { data: have } = await admin.from("hrms_idp_login").select("employee_id, email, pw_temp, issued_at, last_login_at, login_count");
    const by = new Map((have || []).map((r) => [String(r.employee_id), r]));
    const rows = all.map((p) => {
      const personal = ok(p.value?.personal_email);
      const h = by.get(p.id);
      return {
        id: p.id, name: p.name, type: p.type, department: p.department,
        personal, issued: !!h, issued_at: h?.issued_at ?? null,
        has_temp: !!h?.pw_temp, last_login_at: h?.last_login_at ?? null,
        login_count: Number(h?.login_count || 0),
      };
    });
    return NextResponse.json({
      rows,
      total: rows.length,
      withPersonal: rows.filter((r) => r.personal).length,
      issued: rows.filter((r) => r.issued).length,
      signedIn: rows.filter((r) => r.login_count > 0).length,
      clash: [...new Map(rows.filter((r) => r.personal).map((r) => [r.personal, 0])).keys()].length !== rows.filter((r) => r.personal).length,
    });
  } catch (e) { return errJson(e); }
}

/** POST { action: "issue", ids?: [], reissue?: boolean } — owner or HR. */
export async function POST(req: Request) {
  try {
    const u = await requireHrms();
    if (!u.isOwner && !/^(vinaym|hr)@nandan\.co\.in$/.test(u.email.toLowerCase()))
      throw new HttpError(403, "Passwords are issued by Dr Raghu or HR.");
    const b = await readBody(req, { action: "string" });
    if (b.action !== "issue") throw new HttpError(400, "unknown action");
    const admin = adminClient();
    const wanted = Array.isArray(b.ids) ? b.ids.map(String) : null;
    const reissue = b.reissue === true;

    const all = await people(admin);
    const { data: have } = await admin.from("hrms_idp_login").select("employee_id");
    const already = new Set((have || []).map((r) => String(r.employee_id)));

    // one address may belong to one person only — otherwise a sign-in cannot
    // say who it is, and one man would read another's payslip
    const seen = new Map<string, string>();
    const clashes: { email: string; ids: string[] }[] = [];
    for (const p of all) {
      const e = ok(p.value?.personal_email);
      if (!e) continue;
      if (seen.has(e)) {
        const hit = clashes.find((c) => c.email === e);
        if (hit) hit.ids.push(p.id); else clashes.push({ email: e, ids: [seen.get(e)!, p.id] });
      } else seen.set(e, p.id);
    }
    const clashed = new Set(clashes.flatMap((c) => c.ids));

    const rows: Record<string, unknown>[] = [];
    const issued: { id: string; name: string; email: string; password: string }[] = [];
    const noEmail: { id: string; name: string }[] = [];
    for (const p of all) {
      if (wanted && !wanted.includes(p.id)) continue;
      const email = ok(p.value?.personal_email);
      if (!email) { noEmail.push({ id: p.id, name: p.name }); continue; }
      if (clashed.has(p.id)) continue;                 // named below, never issued
      if (already.has(p.id) && !reissue) continue;
      const password = makePassword(p.name);
      const salt = newSalt();
      rows.push({
        employee_id: p.id, email, pw_hash: hashPassword(password, salt), pw_salt: salt,
        pw_temp: password, must_change: false, issued_by: u.email, issued_at: new Date().toISOString(),
        wrong_tries: 0, locked_until: null,
      });
      issued.push({ id: p.id, name: p.name, email, password });
    }

    if (rows.length) {
      const { error } = await admin.from("hrms_idp_login").upsert(rows, { onConflict: "employee_id" });
      if (error) {
        if (/hrms_idp_login|schema cache|does not exist/i.test(error.message))
          throw new HttpError(503, "Run migration 0154 first — the sign-in has nowhere to live yet.");
        throw new Error(error.message);
      }
    }
    return NextResponse.json({ ok: true, issued: issued.length, noEmail, clashes, rows: issued });
  } catch (e) { return errJson(e); }
}
