import { NextResponse } from "next/server";
import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";

export const dynamic = "force-dynamic";

/**
 * Enrich a contact from Apollo.io.
 *
 * Two steps, deliberately: LOOKUP shows what Apollo claims, APPLY writes
 * only the fields the human ticked. Enrichment data is a claim by an
 * outside service, not a fact — it goes through the same hands as a
 * visiting card.
 */
export async function POST(req: Request) {
  try {
    const me = await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const body = await req.json();
    const action = String(body.action || "lookup");

    // THE WEEK HAS AN APOLLO ALLOTMENT (Dr Raghu, 29 Aug 2026): lookups and
    // company enrichments both spend real Apollo credits, so each salesperson
    // gets a weekly number — 25 by default, 200 for Raghu, editable in
    // Settings → Integrations → Apollo.io. Applying ticked fields is free.
    // Counted from the audit trail, Monday to Sunday on the IST calendar.
    const apolloGate = async () => {
      const { data: qRow } = await db.from("integration_setting").select("config").eq("key", "apollo").maybeSingle();
      const qc = (qRow?.config || {}) as Record<string, string>;
      const limit = me.isOwner ? (Number(qc.raghu_per_week) || 200) : (Number(qc.per_week) || 25);
      const nowIst = Date.now() + 330 * 60000;
      const dIst = new Date(nowIst);
      const dow = (dIst.getUTCDay() + 6) % 7;
      const weekStart = new Date(Date.UTC(dIst.getUTCFullYear(), dIst.getUTCMonth(), dIst.getUTCDate() - dow) - 330 * 60000).toISOString();
      let used = 0;
      if (me.profileId) {
        const { count } = await db.from("crm_audit")
          .select("id", { count: "exact", head: true })
          .in("action", ["apollo_lookup", "apollo_enrich"]).eq("by_user", me.profileId).gte("at", weekStart);
        used = count ?? 0;
      }
      if (used >= limit)
        throw new HttpError(429,
          `Your Apollo allotment for the week is spent — ${used} of ${limit} asks since Monday. It resets Monday; ${me.isOwner ? "raise your own number in Settings → Integrations." : "ask Raghu or the Sales Head if it cannot wait."}`);
      return { used, limit };
    };

    // ---- a whole COMPANY in one stroke (Dr Raghu, 29 Aug 2026: "Enrich
    // with Apollo" on the blue strip) — the org's facts onto empty fields,
    // up to ten people in as contacts, everything else into Notes. The
    // person flow below keeps its tick-through hands; a company's volume
    // makes the confirm dialog the consent.
    if (action === "company") {
      const companyId = String(body.company_id || "");
      if (!companyId) throw new HttpError(400, "Which company?");
      const quota = await apolloGate();
      const { data: cfgRow2 } = await db.from("integration_setting").select("config").eq("key", "apollo").maybeSingle();
      const key2 = String(((cfgRow2?.config || {}) as Record<string, string>).api_key || "");
      if (!key2) throw new HttpError(503, "Apollo is not connected — paste its API key in Settings → Integrations first.");
      const AH = { "content-type": "application/json", "x-api-key": key2 };
      const { data: co } = await db.from("company")
        .select("id, name, website, domain_name, city, state, country, notes")
        .eq("id", companyId).maybeSingle();
      if (!co) throw new HttpError(404, "No such company.");

      const host = (u: string) => { try { return new URL(/^https?:/i.test(u) ? u : "https://" + u).hostname.replace(/^www\./, ""); } catch { return ""; } };
      let domain = String(co.domain_name || "") || host(String(co.website || ""));
      type Org = { id?: string; name?: string; website_url?: string; primary_domain?: string; linkedin_url?: string;
        industry?: string; estimated_num_employees?: number; founded_year?: number; phone?: string;
        city?: string; state?: string; country?: string; keywords?: string[]; short_description?: string };
      let org: Org | null = null;
      if (domain) {
        const r1 = await fetch(`https://api.apollo.io/api/v1/organizations/enrich?domain=${encodeURIComponent(domain)}`, { headers: AH });
        if (r1.ok) org = ((await r1.json()) as { organization?: Org }).organization ?? null;
      }
      if (!org) {
        const r2 = await fetch("https://api.apollo.io/api/v1/mixed_companies/search", {
          method: "POST", headers: AH,
          body: JSON.stringify({ q_organization_name: String(co.name), page: 1, per_page: 3 }),
        });
        if (!r2.ok) throw new HttpError(502, r2.status === 401 || r2.status === 403
          ? "Apollo refused the key — check it in Settings → Integrations."
          : `Apollo answered ${r2.status} on the company search.`);
        const hits = ((await r2.json()) as { organizations?: Org[] }).organizations ?? [];
        org = hits[0] ?? null;
        if (org?.primary_domain && !domain) domain = String(org.primary_domain);
      }
      if (!org) return NextResponse.json({ found: false, note: "Apollo has no match for this company." });

      // the org's facts onto EMPTY fields only — enrichment never overwrites
      const patch: Record<string, string> = {};
      if (!String(co.website || "").trim() && org.website_url) patch.website = String(org.website_url);
      if (!String(co.domain_name || "").trim() && (org.primary_domain || domain)) patch.domain_name = String(org.primary_domain || domain);
      if (!String(co.city || "").trim() && org.city) patch.city = String(org.city);
      if (!String(co.state || "").trim() && org.state) patch.state = String(org.state);
      if (!String(co.country || "").trim() && org.country) patch.country = String(org.country);

      // up to ten people, in as contacts — names and titles are search-tier
      // (no per-person email credits burned); emails come one at a time
      // through the contact's own tick-through enrich
      let created = 0, already = 0;
      const people: { name?: string; title?: string }[] = [];
      if (org.id) {
        const r3 = await fetch("https://api.apollo.io/api/v1/mixed_people/search", {
          method: "POST", headers: AH,
          body: JSON.stringify({ organization_ids: [org.id], page: 1, per_page: 10 }),
        });
        if (r3.ok) {
          const ppl = ((await r3.json()) as { people?: { name?: string; title?: string }[] }).people ?? [];
          people.push(...ppl);
          const { data: existing } = await db.from("person").select("first_name").eq("company_id", companyId).limit(500);
          const have = new Set((existing || []).map((p) => String(p.first_name || "").trim().toLowerCase()));
          const rows2 = [];
          for (const p of ppl) {
            const nm = String(p.name || "").trim();
            if (!nm) continue;
            if (have.has(nm.toLowerCase())) { already++; continue; }
            have.add(nm.toLowerCase());
            rows2.push({ first_name: nm.slice(0, 180), job_title: String(p.title || "").slice(0, 160) || null, company_id: companyId });
          }
          if (rows2.length) {
            const { error: pe } = await db.from("person").insert(rows2);
            if (!pe) created = rows2.length;
          }
        }
      }

      // everything else into Notes, dated and sourced
      const extra = [
        `— Apollo enrichment (${new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10)}) —`,
        [org.industry && `Industry: ${org.industry}`,
         org.estimated_num_employees && `Employees: ~${org.estimated_num_employees}`,
         org.founded_year && `Founded: ${org.founded_year}`].filter(Boolean).join(" · "),
        org.linkedin_url && `LinkedIn: ${org.linkedin_url}`,
        org.phone && `Phone: ${org.phone}`,
        Array.isArray(org.keywords) && org.keywords.length ? `Keywords: ${org.keywords.slice(0, 12).join(", ")}` : "",
        org.short_description ? String(org.short_description).slice(0, 600) : "",
      ].filter(Boolean).join("\n");
      const prevNotes = String(co.notes || "").trim();
      if (!prevNotes.includes("— Apollo enrichment"))
        patch.notes = (prevNotes ? prevNotes + "\n\n" : "") + extra;

      if (Object.keys(patch).length) {
        const { error: ue } = await db.from("company").update(patch).eq("id", companyId);
        if (ue) throw new HttpError(500, ue.message);
      }
      await db.from("crm_audit").insert({
        entity: "company", entity_id: companyId, action: "apollo_enrich",
        after: { fields: Object.keys(patch), contacts_created: created }, by_user: me.profileId,
      }).then(() => null, () => null);
      return NextResponse.json({
        found: true, org: org.name ?? co.name,
        filled: Object.keys(patch).filter((k) => k !== "notes"),
        noted: "notes" in patch, contacts_created: created, contacts_already: already,
        people_seen: people.length,
        allotment: { used: quota.used + 1, limit: quota.limit },
      });
    }

    const personId = String(body.person_id || "");
    if (!personId) throw new HttpError(400, "Which contact?");

    if (action === "apply") {
      const ALLOWED = ["job_title", "department", "primary_phone", "primary_email", "whatsapp_number"];
      const patch: Record<string, string> = {};
      for (const k of ALLOWED) {
        const v = String((body.fields || {})[k] ?? "").trim();
        if (v) patch[k] = v;
      }
      if (!Object.keys(patch).length) throw new HttpError(400, "Nothing ticked to apply.");
      const { error } = await db.from("person").update(patch).eq("id", personId);
      if (error) throw new HttpError(500, error.message);
      return NextResponse.json({ ok: true, applied: Object.keys(patch) });
    }

    // ---- lookup ----
    const { data: cfgRow } = await db.from("integration_setting").select("config").eq("key", "apollo").maybeSingle();
    const apiKey = String(((cfgRow?.config || {}) as Record<string, string>).api_key || "");
    if (!apiKey)
      throw new HttpError(503, "Apollo is not connected — paste its API key in Settings → Integrations first.");

    const { data: person } = await db.from("person")
      .select("id, first_name, primary_email, company_id").eq("id", personId).maybeSingle();
    if (!person) throw new HttpError(404, "No such contact.");
    let companyName = "";
    if (person.company_id) {
      const { data: c } = await db.from("company").select("name").eq("id", String(person.company_id)).maybeSingle();
      companyName = String(c?.name || "");
    }
    if (!person.primary_email && !companyName)
      throw new HttpError(409, "Apollo needs at least an email or a company name to match on — this contact has neither.");
    const quota = await apolloGate();

    const r = await fetch("https://api.apollo.io/api/v1/people/match", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        name: String(person.first_name || "") || undefined,
        email: String(person.primary_email || "") || undefined,
        organization_name: companyName || undefined,
        reveal_personal_emails: false,
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      throw new HttpError(502,
        r.status === 401 || r.status === 403 ? "Apollo refused the key — check it in Settings → Integrations."
        : r.status === 429 ? "Apollo's rate limit — try again in a minute."
        : `Apollo answered ${r.status}: ${t.slice(0, 160)}`);
    }
    const j = await r.json();
    // the ask happened, match or not — it counts against the allotment
    await db.from("crm_audit").insert({
      entity: "person", entity_id: personId, action: "apollo_lookup",
      after: { matched: !!j?.person }, by_user: me.profileId,
    }).then(() => null, () => null);
    const p = j?.person;
    if (!p) return NextResponse.json({ found: false, allotment: { used: quota.used + 1, limit: quota.limit } });

    return NextResponse.json({
      found: true,
      allotment: { used: quota.used + 1, limit: quota.limit },
      suggestion: {
        name: p.name ?? null,
        job_title: p.title ?? null,
        department: Array.isArray(p.departments) && p.departments.length ? String(p.departments[0]) : null,
        primary_email: p.email && !/not_unlocked|domain\.com/i.test(String(p.email)) ? String(p.email) : null,
        primary_phone: p.organization?.phone ?? p.phone_numbers?.[0]?.sanitized_number ?? null,
        linkedin: p.linkedin_url ?? null,
        city: [p.city, p.state, p.country].filter(Boolean).join(", ") || null,
        company: p.organization?.name ?? null,
        seniority: p.seniority ?? null,
        photo: p.photo_url ?? null,
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
