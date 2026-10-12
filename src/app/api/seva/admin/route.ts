import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireSeva } from "@/lib/seva";
import { adminClient } from "@/lib/supabase/admin";
import { mayPlan, serviceTeam } from "@/lib/seva-team";
import { KINDS, LEDGER_FROM, ledgerOf, syncFromKuber, type Entry, type Kind } from "@/lib/seva-admin";
import { sevaMail } from "@/lib/seva-orders";
import { paged } from "@/lib/seva-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * /api/seva/admin — SEVA → ADMIN (Dr Raghu, 12 Oct 2026): expense claims, OD
 * slips, ticket bookings and payments to the team; sent to Kuber's payment
 * plan for Suresh's team; their approval and payment read back here; the
 * ledger per person from the opening balance.
 *
 *   GET                        the entries (and Kuber's word, read first), the team, the ledger totals
 *   GET ?ledger=<employee id>  one person's ledger, line by line
 *   POST (multipart)           a bill on an entry
 *   POST save | remove | send | opening | remove_file
 * Aakash, Yash and the owner write; everyone in Seva sees.
 */
const S = (v: unknown) => String(v ?? "").trim();
const BUCKET = "seva-admin";
const isD = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(S(v));
const istDay = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const RELATED = ["AMC", "Job", "Customer", "Ticket", "Service order", "Other"];

export async function GET(req: Request) {
  try {
    const me = await requireSeva();
    const admin = adminClient();
    const sp = new URL(req.url).searchParams;
    try { await syncFromKuber(admin); } catch (e) { if (/seva_admin_entry|does not exist|schema cache/i.test(String((e as Error).message))) return NextResponse.json({ installed: false, rows: [], team: [] }); }
    const team = await serviceTeam(admin);
    const one = sp.get("ledger");
    if (one) {
      const [{ data: es }, { data: op }] = await Promise.all([
        admin.from("seva_admin_entry").select("*").eq("employee_id", one).order("on_date"),
        admin.from("seva_ledger_opening").select("*").eq("employee_id", one).maybeSingle(),
      ]);
      return NextResponse.json({ person: team.find((t) => t.id === one) || { id: one, name: (es || [])[0]?.person_name || one }, opening_row: op || null, ...ledgerOf((es || []) as Entry[], op ? { amount: Number(op.amount), as_of: String(op.as_of) } : null) });
    }
    let rows: Record<string, unknown>[];
    try { rows = await paged<Record<string, unknown>>((a, b) => admin.from("seva_admin_entry").select("*").order("on_date", { ascending: false }).range(a, b)); }
    catch (e) { if (/does not exist|schema cache/i.test(String((e as Error).message))) return NextResponse.json({ installed: false, rows: [], team }); throw e; }
    const { data: files } = rows.length ? await admin.from("seva_admin_file").select("id, entry_id, name").in("entry_id", rows.map((r) => String(r.id)).slice(0, 2000)) : { data: [] };
    const { data: openings } = await admin.from("seva_ledger_opening").select("*");
    const people = [...new Set([...team.map((t) => t.id), ...rows.map((r) => S(r.employee_id))])];
    const ledgers = people.map((id) => {
      const op = (openings || []).find((o) => o.employee_id === id);
      const l = ledgerOf(rows.filter((r) => S(r.employee_id) === id) as unknown as Entry[], op ? { amount: Number(op.amount), as_of: String(op.as_of) } : null);
      return { employee_id: id, name: team.find((t) => t.id === id)?.name || S(rows.find((r) => S(r.employee_id) === id)?.person_name), opening: l.opening, from: l.from, received: l.received, spent: l.spent, balance: l.balance, has_opening: !!op };
    }).filter((l) => l.opening || l.received || l.spent || rows.some((r) => S(r.employee_id) === l.employee_id));
    return NextResponse.json({ installed: true, today: istDay(), rows: rows.map((r) => ({ ...r, files: (files || []).filter((f) => f.entry_id === r.id).length })), team, kinds: KINDS, related: RELATED, ledgers, ledger_from: LEDGER_FROM, mayWrite: mayPlan(me.email, me.isOwner) });
  } catch (e) { return errJson(e); }
}

export async function POST(req: Request) {
  try {
    const me = await requireSeva();
    if (!mayPlan(me.email, me.isOwner)) throw new HttpError(403, "Aakash or Yash keeps the admin.");
    const admin = adminClient();
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      const fd = await req.formData(); const id = S(fd.get("entry_id")); const f = fd.get("file");
      if (!id || !(f instanceof File)) throw new HttpError(400, "Which entry, which bill?");
      if (f.size > 12 * 1024 * 1024) throw new HttpError(400, "Over 12 MB.");
      const path = `${id}/${Date.now()}-${f.name.replace(/[^\w.\- ]+/g, "_")}`;
      const { error: up } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || "application/octet-stream" });
      if (up) throw new Error(up.message);
      await admin.from("seva_admin_file").insert({ entry_id: id, name: f.name, mime: f.type || null, bytes: f.size, path, uploaded_by: me.email });
      return NextResponse.json({ ok: true });
    }
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const team = await serviceTeam(admin);
    if (b.action === "save") {
      const kind = S(b.kind) as Kind; if (!(kind in KINDS)) throw new HttpError(400, "Which kind?");
      const employee_id = S(b.employee_id); const person = team.find((t) => t.id === employee_id);
      if (!employee_id) throw new HttpError(400, "Whose is it?");
      const amount = Number(b.amount); if (!(amount > 0)) throw new HttpError(400, "The amount.");
      if (!isD(b.on_date)) throw new HttpError(400, "The date.");
      const row = {
        kind, employee_id, person_name: person?.name || S(b.person_name), on_date: S(b.on_date), amount,
        related_kind: RELATED.includes(S(b.related_kind)) ? S(b.related_kind) : null, related_ref: S(b.related_ref) || null, customer: S(b.customer) || null,
        description: S(b.description), from_place: S(b.from_place) || null, to_place: S(b.to_place) || null, travel_mode: S(b.travel_mode) || null,
        return_on: isD(b.return_on) ? S(b.return_on) : null, updated_at: new Date().toISOString(),
      };
      if (b.id) {
        const { data: was } = await admin.from("seva_admin_entry").select("status").eq("id", S(b.id)).maybeSingle();
        if (was && was.status !== "draft") throw new HttpError(409, "Sent to Kuber already — change it there, or ask accounts to drop it.");
        const { error } = await admin.from("seva_admin_entry").update(row).eq("id", S(b.id)); if (error) throw error;
        return NextResponse.json({ ok: true, id: S(b.id) });
      }
      const { data, error } = await admin.from("seva_admin_entry").insert({ ...row, created_by: me.email }).select("id, no").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, id: data.id, no: data.no });
    }
    if (b.action === "remove") {
      const { data: was } = await admin.from("seva_admin_entry").select("status").eq("id", S(b.id)).maybeSingle();
      if (!was) throw new HttpError(404, "No such entry."); if (was.status !== "draft") throw new HttpError(409, "Only a draft can be removed.");
      const { data: fs } = await admin.from("seva_admin_file").select("path").eq("entry_id", S(b.id));
      if (fs?.length) await admin.storage.from(BUCKET).remove(fs.map((f) => String(f.path)));
      await admin.from("seva_admin_entry").delete().eq("id", S(b.id));
      return NextResponse.json({ ok: true });
    }
    /* SEND: each draft becomes a request in Kuber's payment plan; accounts@ gets one line of intimation for the lot */
    if (b.action === "send") {
      const ids: string[] = (Array.isArray(b.ids) ? b.ids : []).map(S).filter(Boolean);
      const { data: drafts } = ids.length ? await admin.from("seva_admin_entry").select("*").in("id", ids).eq("status", "draft") : { data: [] };
      if (!drafts?.length) throw new HttpError(400, "Tick the drafts to send.");
      const now = new Date().toISOString(); const today = istDay(); let made = 0;
      for (const e of drafts) {
        const bits = [e.description, e.related_kind && e.related_ref ? `${e.related_kind} ${e.related_ref}` : e.related_kind, e.customer, e.from_place && e.to_place ? `${e.from_place} → ${e.to_place}` : null, e.travel_mode].filter(Boolean).join(" · ");
        const { data: plan, error } = await admin.from("kuber_payment_plan").insert({
          plan_date: today, party: e.person_name, amount: e.amount, purpose: `Service team — ${KINDS[e.kind as Kind]}`, bill_ref: e.no, status: "planned",
          note: `${e.no} from Seva → Admin by ${me.email.split("@")[0]} · ${e.person_name} · ${e.on_date}${bits ? ` · ${bits}` : ""}`, by: me.email,
        }).select("id").single();
        if (error) throw new Error(`Kuber's payment plan would not take ${e.no}: ${error.message}`);
        await admin.from("seva_admin_entry").update({ status: "sent", plan_id: plan.id, sent_at: now, sent_by: me.email, updated_at: now }).eq("id", e.id);
        made++;
      }
      let mail = "";
      try {
        const total = drafts.reduce((s, e) => s + Number(e.amount), 0);
        const html = `<p>Dear Accounts,</p><p>${made} service-team request${made === 1 ? "" : "s"} for ${inr(total)} are in <b>Kuber → Payment Planning</b>, to approve and pay there. Seva reads the status back from Kuber.</p><table cellpadding="6" style="border-collapse:collapse;font-size:13px"><tr style="background:#1B2A41;color:#fff"><th align="left">No.</th><th align="left">Kind</th><th align="left">Person</th><th align="left">Date</th><th align="left">For</th><th align="right">Amount</th></tr>${drafts.map((e) => `<tr style="border-bottom:1px solid #ddd"><td>${esc(e.no)}</td><td>${esc(KINDS[e.kind as Kind])}</td><td>${esc(e.person_name)}</td><td>${esc(e.on_date)}</td><td>${esc([e.description, e.related_ref].filter(Boolean).join(" · "))}</td><td align="right">${inr(Number(e.amount))}</td></tr>`).join("")}</table><p>— Genie, Seva → Admin</p>`;
        const { data: who } = await admin.from("profiles").select("display_name").ilike("email", me.email).maybeSingle();
        const s = await sevaMail(me.email, (who?.display_name as string) || null, ["accounts@nandan.co.in"], [], `Service team — ${made} request${made === 1 ? "" : "s"} for payment, ${inr(total)}`, html, []);
        mail = `accounts@ told, from ${s.from}`;
      } catch (e) { mail = `in Kuber; the mail to accounts did not go — ${String((e as Error).message).slice(0, 120)}`; }
      return NextResponse.json({ ok: true, sent: made, mail });
    }
    if (b.action === "opening") {
      const employee_id = S(b.employee_id); if (!employee_id) throw new HttpError(400, "Whose opening balance?");
      const { error } = await admin.from("seva_ledger_opening").upsert({ employee_id, person_name: team.find((t) => t.id === employee_id)?.name || "", as_of: isD(b.as_of) ? S(b.as_of) : LEDGER_FROM, amount: Number(b.amount) || 0, note: S(b.note), updated_by: me.email, updated_at: new Date().toISOString() }, { onConflict: "employee_id" });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    throw new HttpError(400, "Unknown action.");
  } catch (e) { return errJson(e); }
}
