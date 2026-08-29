import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The ERP's door, used (Dr Raghu, 28 Aug 2026, pointing at the Frappe REST
 * docs): reads through /api/resource with the stored token pair — acting as
 * Raghu's own ERP user, so the button is HIS alone.
 *
 * POST { action: "pull_quotation_values" } — every imported quotation that
 * stands at zero takes its real value from the ERP, matched by quote number.
 * Reads only; nothing in the ERP is touched.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!me.isOwner) throw new HttpError(403, "The ERP door is Raghu's to use, for now.");
    const db = crmDb();
    const body = await req.json();
    const action = String(body.action || "");

    const { data: row } = await db.from("integration_setting").select("config").eq("key", "erpnext").maybeSingle();
    const cfg = (row?.config || {}) as Record<string, string>;
    if (!cfg.url || !cfg.api_key || !cfg.api_secret)
      throw new HttpError(400, "Save the ERPNext URL, key and secret in Integrations first.");
    const base = cfg.url.replace(/\/+$/, "");
    const H = { authorization: `token ${cfg.api_key}:${cfg.api_secret}` };

    // 🔍 read one document's field names, so the mapping is set from the
    // ERP's own truth, never a guess
    if (action === "inspect") {
      const doctype = String(body.doctype || "").trim();
      const name = String(body.name || "").trim();
      if (!doctype) throw new HttpError(400, "Say the doctype (e.g. Opportunity, or the job doctype).");
      let doc: Record<string, unknown> | null = null;
      if (name) {
        const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { headers: H });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for ${doctype}/${name}`);
        doc = (j as { data?: Record<string, unknown> })?.data ?? null;
      } else {
        const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}?limit_page_length=1`, { headers: H });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} for ${doctype}`);
        const first = ((j as { data?: { name?: string }[] })?.data ?? [])[0];
        if (!first?.name) return NextResponse.json({ ok: true, fields: [], note: "The doctype exists but holds no documents." });
        const r2 = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(String(first.name))}`, { headers: H });
        doc = ((await r2.json().catch(() => null)) as { data?: Record<string, unknown> })?.data ?? null;
      }
      const fields = Object.entries(doc || {})
        .filter(([, v]) => v !== null && typeof v !== "object")
        .map(([k, v]) => ({ field: k, sample: String(v).slice(0, 60) }))
        .slice(0, 200);
      return NextResponse.json({ ok: true, name: String((doc || {}).name ?? name), fields });
    }

    // ⬆ push TDD / kitting % / production % for every active job — writes
    // ONLY through the confirmed mapping, only where the value differs
    if (action === "push_jobs") {
      const doctype = String(cfg.push_doctype || "").trim();
      const fTdd = String(cfg.push_tdd_field || "").trim();
      const fKit = String(cfg.push_kit_field || "").trim();
      const fPct = String(cfg.push_pct_field || "").trim();
      if (!doctype || (!fTdd && !fKit && !fPct))
        throw new HttpError(400, "Set the mapping first — the job doctype and at least one field name. 🔍 Inspect shows the ERP's own names.");
      const { adminClient } = await import("@/lib/supabase/admin");
      const gdb = adminClient();
      const jobs: { id: string; tdd: string | null; kit: number; pct: number }[] = [];
      for (let a = 0; ; a += 1000) {
        const { data, error } = await gdb.from("jobs").select("id, tdd, kit, pct").eq("active", true).order("id").range(a, a + 999);
        if (error) throw new Error(error.message);
        jobs.push(...((data || []) as typeof jobs));
        if (!data || data.length < 1000) break;
      }
      let pushed = 0, unchanged = 0, missing = 0, failed = 0;
      let firstErr = "";
      for (const j of jobs) {
        try {
          const r = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(j.id)}`, { headers: H });
          if (r.status === 404) { missing++; continue; }
          const doc = ((await r.json().catch(() => null)) as { data?: Record<string, unknown> })?.data;
          if (!r.ok || !doc) { failed++; continue; }
          const patch: Record<string, unknown> = {};
          if (fTdd && j.tdd && String(doc[fTdd] ?? "").slice(0, 10) !== j.tdd) patch[fTdd] = j.tdd;
          if (fKit && Number(doc[fKit] ?? NaN) !== Number(j.kit ?? 0)) patch[fKit] = Number(j.kit ?? 0);
          if (fPct && Number(doc[fPct] ?? NaN) !== Number(j.pct ?? 0)) patch[fPct] = Number(j.pct ?? 0);
          if (!Object.keys(patch).length) { unchanged++; continue; }
          const w = await fetch(`${base}/api/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(j.id)}`, {
            method: "PUT", headers: { ...H, "content-type": "application/json" }, body: JSON.stringify(patch),
          });
          if (w.ok) pushed++;
          else { failed++; if (!firstErr) firstErr = `${j.id}: ${w.status}`; }
        } catch { failed++; }
      }
      return NextResponse.json({ ok: true, jobs: jobs.length, pushed, unchanged, missing, failed, firstErr });
    }

    // ⬇ enquiry info as RICH TEXT: the ERP's HTML becomes the markdown our
    // reader renders — bold, links, bullets — never raw angle brackets
    if (action === "pull_enquiry_info") {
      const field = String(cfg.opp_info_field || "").trim();
      if (!field) throw new HttpError(400, "Set the Opportunity field first — 🔍 Inspect an ERP Opportunity to see its field names.");
      const htmlToRich = (h: string) => h
        .replace(/<br\s*\/?\s*>/gi, "\n")
        .replace(/<\/(p|div|tr|h[1-6])>/gi, "\n")
        .replace(/<li[^>]*>/gi, "\n- ")
        .replace(/<img[^>]*src="([^"]+)"[^>]*>/gi, " [🖼 image]($1) ")
        .replace(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (_m, u, t) => ` [${String(t).replace(/<[^>]+>/g, "").trim() || "link"}](${u}) `)
        .replace(/<(b|strong)>(.*?)<\/\1>/gi, "**$2**")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, "\"")
        .replace(/\n{3,}/g, "\n\n").trim();
      const erpInfo = new Map<string, string>();
      for (let start = 0; ; start += 200) {
        const u2 = `${base}/api/resource/Opportunity?fields=${encodeURIComponent(JSON.stringify(["name", field]))}&limit_start=${start}&limit_page_length=200`;
        const r = await fetch(u2, { headers: H });
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status} — is "${field}" a real Opportunity field?`);
        const page = ((j as { data?: Record<string, unknown>[] } | null)?.data || []);
        for (const o of page) {
          const v = String(o[field] ?? "").trim();
          if (o.name && v) erpInfo.set(String(o.name), htmlToRich(v));
        }
        if (page.length < 200) break;
        if (start > 100000) break;
      }
      let matched = 0, updated = 0;
      for (let a = 0; ; a += 1000) {
        const { data: opps, error } = await db.from("opportunity")
          .select("id, opportunity_no, enquiry_info").order("id").range(a, a + 999);
        if (error) throw new Error(error.message);
        for (const o of opps || []) {
          const rich = erpInfo.get(String(o.opportunity_no));
          if (!rich) continue;
          matched++;
          if (String(o.enquiry_info ?? "").trim() === rich) continue;
          const { error: ue } = await db.from("opportunity").update({ enquiry_info: rich }).eq("id", o.id);
          if (!ue) updated++;
        }
        if (!opps || opps.length < 1000) break;
      }
      return NextResponse.json({ ok: true, erpWithInfo: erpInfo.size, matched, updated });
    }

    if (action !== "pull_quotation_values") throw new HttpError(400, "Unknown action.");

    // the ERP's quotations, paged the Frappe way
    const erp = new Map<string, { total: number; net: number }>();
    for (let start = 0; ; start += 500) {
      const u = `${base}/api/resource/Quotation?fields=${encodeURIComponent(JSON.stringify(["name", "base_grand_total", "grand_total", "base_net_total", "net_total"]))}&limit_start=${start}&limit_page_length=500`;
      const r = await fetch(u, { headers: H });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new HttpError(502, `The ERP answered ${r.status}${j && (j as { exc_type?: string }).exc_type ? ` — ${(j as { exc_type?: string }).exc_type}` : ""}`);
      const page = ((j as { data?: Record<string, unknown>[] } | null)?.data || []);
      for (const q of page) {
        const total = Number(q.base_grand_total ?? q.grand_total) || 0;
        const net = Number(q.base_net_total ?? q.net_total) || 0;
        if (q.name) erp.set(String(q.name), { total, net });
      }
      if (page.length < 500) break;
      if (start > 100000) break;
    }
    if (!erp.size) return NextResponse.json({ ok: true, note: "The ERP returned no quotations.", matched: 0, filled: 0 });

    // our zero-value quotations, matched by number
    let filled = 0, matched = 0, scanned = 0;
    for (let a = 0; ; a += 1000) {
      const { data: quotes, error } = await db.from("quotation")
        .select("id, quote_no, grand_total, quoted_value").order("id").range(a, a + 999);
      if (error) throw new Error(error.message);
      for (const q of quotes || []) {
        scanned++;
        const hit = erp.get(String(q.quote_no));
        if (!hit || !hit.total) continue;
        matched++;
        if (Number(q.grand_total) || Number(q.quoted_value)) continue; // never overwrite a typed value
        const { error: ue } = await db.from("quotation")
          .update({ grand_total: hit.total, quoted_value: hit.total, subtotal: hit.net || hit.total })
          .eq("id", q.id);
        if (!ue) filled++;
      }
      if (!quotes || quotes.length < 1000) break;
    }
    return NextResponse.json({ ok: true, erpCount: erp.size, scanned, matched, filled });
  } catch (e) {
    return errJson(e);
  }
}
