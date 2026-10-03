import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";
import { HttpError } from "@/lib/auth";
import { crmConfigured, crmDb } from "@/crm/db";
import { isLocationBound, isStaff, seesAll, seesCommercials, type PortalUser } from "./auth";

/**
 * WHAT THE PORTAL SHOWS, AND TO WHOM.
 *
 * Nothing here is typed into the portal. The jobs are the jobmaster's rows,
 * the PO number comes off the CRM's sales order through the project, the
 * tickets are Seva's. The portal only decides the SCOPE — whose rows a login
 * may see — and lays beside each job the few things the ERP cannot know
 * (portal_job: vehicle number, invoice, location, remarks).
 *
 *   customer / supplier   → their own organisation's rows, by its match names
 *   admin / national mgr  → everything, or one organisation when they open it
 *   location roles        → only the jobs tagged to their locations, and the
 *                           tickets raised at them
 */
type Doc = Record<string, unknown>;
const S = (v: unknown) => String(v ?? "").trim();
const N = (v: unknown) => (v == null || v === "" ? null : Number(v));
export const norm = (s: unknown) => S(s).toLowerCase().replace(/\s+/g, " ");

export interface Org { slug: string; name: string; kind: "customer" | "supplier"; match_names: string[]; intro: string; logo_path: string | null; active: boolean }
export interface Scope { kind: "org" | "all" | "locations"; org: Org | null; locations: string[]; commercials: boolean; staff: boolean }

export async function loadOrg(admin: SupabaseClient, slug: string): Promise<Org | null> {
  const { data } = await admin.from("portal_org").select("slug,name,kind,match_names,intro,logo_path,active").eq("slug", slug).maybeSingle();
  return (data as Org | null) ?? null;
}

/** Which rows this login may see — their own door, or the door they opened. */
export async function resolveScope(u: PortalUser, slug: string | null): Promise<Scope> {
  const admin = adminClient();
  const commercials = seesCommercials(u);
  if (!isStaff(u)) {
    if (!u.org_slug) throw new HttpError(403, "This login is not attached to an organisation yet — ask Nandan.");
    if (slug && slug !== u.org_slug && slug !== "all") throw new HttpError(403, "That is another organisation's page.");
    const org = await loadOrg(admin, u.org_slug);
    if (!org || !org.active) throw new HttpError(403, "This organisation's page is not open.");
    return { kind: "org", org, locations: [], commercials, staff: false };
  }
  if (slug && slug !== "all") {
    const org = await loadOrg(admin, slug);
    if (!org) throw new HttpError(404, "No such organisation on the portal.");
    return { kind: "org", org, locations: isLocationBound(u) ? u.locations : [], commercials, staff: true };
  }
  if (seesAll(u)) return { kind: "all", org: null, locations: [], commercials, staff: true };
  return { kind: "locations", org: null, locations: u.locations, commercials, staff: true };
}

const matches = (names: string[], v: unknown) => names.includes(norm(v));

/* ------------------------------------------------------------------ jobs */
export interface PortalJob {
  id: string; job: string; project: string; so_no: string; po_no: string; po_date: string | null;
  customer: string; fam: string; engine_no: string; chassis_no: string; model: string; vehicle_type: string;
  tdd: string | null; otd: string | null; stat: string; pct: number; on_floor: boolean;
  delivered: boolean; delivered_on: string | null;
  vehicle_no: string; invoice_no: string; location: string; remarks: string;
  client_update: string | null;
  commercials?: { value: number | null; so_amount: number | null; advance: number | null; pay_on_delivery: number | null; amt_needed: number | null; pct_on: number | null; pct_30: number | null; pct_60: number | null; pct_90: number | null; gst: number | null };
}

const JOB_COLS = "id,tag,fam,cust,val,gst,tdd,otd,proj,stat,pct,on_floor,active,delivered,delivered_on,chassis_no,engine_no,vehicle_model,client_update,advance,pay_on_delivery,amt_needed,pay_pct_on,pay_pct_30,pay_pct_60,pay_pct_90";

async function pageAll(q: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Doc[]> {
  const out: Doc[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new Error(error.message);
    const rows = (data as Doc[]) ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}

/** The customer's jobs — open (under delivery) or delivered. */
export async function loadJobs(scope: Scope, which: "open" | "delivered"): Promise<PortalJob[]> {
  const admin = adminClient();
  if (scope.org?.kind === "supplier") return [];
  const names = scope.org ? scope.org.match_names.map(norm) : null;

  let rows = await pageAll((a, b) => {
    let q = admin.from("jobs").select(JOB_COLS).range(a, b).order("tdd", { ascending: true, nullsFirst: false });
    q = which === "open" ? q.eq("active", true).eq("delivered", false) : q.eq("delivered", true);
    return q;
  });
  if (which === "delivered") {
    /* the bank of deliveries predates the jobs table's own flag (0020) */
    const seen = new Set(rows.map((r) => S(r.id)));
    const bank = await pageAll((a, b) => admin.from("delivered_jobs").select("id,tag,fam,cust,val,tdd,otd,proj,stat,pct,delivered_on").range(a, b).order("delivered_on", { ascending: false, nullsFirst: false }));
    for (const r of bank) if (!seen.has(S(r.id))) rows.push({ ...r, delivered: true, active: false });
  }
  if (names) rows = rows.filter((r) => matches(names, r.cust));

  /* beside the job */
  const ids = rows.map((r) => S(r.id));
  const side = new Map<string, Doc>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await admin.from("portal_job").select("job_id,po_no,vehicle_no,vehicle_type,invoice_no,location,remarks").in("job_id", ids.slice(i, i + 500));
    for (const d of (data as Doc[]) ?? []) side.set(S(d.job_id), d);
  }
  if (scope.kind === "locations" || (scope.kind === "org" && scope.locations.length)) {
    const locs = new Set(scope.locations.map(norm));
    rows = rows.filter((r) => locs.has(norm(side.get(S(r.id))?.location)));
  }

  /* the project carries the sales order; the sales order carries the PO */
  const projIds = Array.from(new Set(rows.map((r) => S(r.proj)).filter(Boolean)));
  const soByProj = new Map<string, string>();
  for (let i = 0; i < projIds.length; i += 500) {
    const { data } = await admin.from("projects").select("id,so").in("id", projIds.slice(i, i + 500));
    for (const d of (data as Doc[]) ?? []) if (S(d.so)) soByProj.set(S(d.id), S(d.so));
  }
  const so = new Map<string, { po_no: string; po_date: string | null; amount: number | null }>();
  const soNos = Array.from(new Set(Array.from(soByProj.values())));
  if (soNos.length && crmConfigured()) {
    try {
      const crm = crmDb();
      for (let i = 0; i < soNos.length; i += 300) {
        const { data } = await crm.from("sales_order").select("so_no,po_no,po_date,amount").in("so_no", soNos.slice(i, i + 300));
        for (const d of (data as Doc[]) ?? []) so.set(S(d.so_no), { po_no: S(d.po_no), po_date: (d.po_date as string) ?? null, amount: N(d.amount) });
      }
    } catch { /* the CRM being away must not empty the portal */ }
  }

  return rows.map((r) => {
    const s = side.get(S(r.id)) || {};
    const soNo = soByProj.get(S(r.proj)) || "";
    const o = so.get(soNo);
    const j: PortalJob = {
      id: S(r.id), job: S(r.tag) || S(r.id), project: S(r.proj), so_no: soNo,
      po_no: S(s.po_no) || o?.po_no || "", po_date: o?.po_date ?? null,
      customer: S(r.cust), fam: S(r.fam), engine_no: S(r.engine_no), chassis_no: S(r.chassis_no), model: S(r.vehicle_model),
      vehicle_type: S(s.vehicle_type) || S(r.fam),
      tdd: (r.tdd as string) ?? null, otd: (r.otd as string) ?? null, stat: S(r.stat), pct: Number(r.pct) || 0, on_floor: !!r.on_floor,
      delivered: !!r.delivered, delivered_on: (r.delivered_on as string) ?? null,
      vehicle_no: S(s.vehicle_no), invoice_no: S(s.invoice_no), location: S(s.location), remarks: S(s.remarks),
      client_update: (r.client_update as string) ?? null,
    };
    if (scope.commercials) j.commercials = {
      value: N(r.val), so_amount: o?.amount ?? null, advance: N(r.advance), pay_on_delivery: N(r.pay_on_delivery), amt_needed: N(r.amt_needed),
      pct_on: N(r.pay_pct_on), pct_30: N(r.pay_pct_30), pct_60: N(r.pay_pct_60), pct_90: N(r.pay_pct_90), gst: N(r.gst),
    };
    return j;
  });
}

/* --------------------------------------------------------------- tickets */
export interface PortalIssue {
  id: string; title: string; customer: string; location: string; machine: string; status: string; job_number: string;
  issue_date: string | null; resolved_at: string | null; category: string; description: string; resolution: string;
}
export async function loadIssues(scope: Scope): Promise<PortalIssue[]> {
  const admin = adminClient();
  if (scope.org?.kind === "supplier") return [];
  const names = scope.org ? scope.org.match_names.map(norm) : null;
  let rows: Doc[] = [];
  try {
    rows = await pageAll((a, b) => admin.from("seva_issue").select("id,title,customer,location,machine,equipment,status,job_number,issue_date,resolved_at,category,description,resolution,at").range(a, b).order("at", { ascending: false }));
  } catch (e) { if (!/does not exist|schema cache/i.test(String(e))) throw e; }
  if (names) rows = rows.filter((r) => matches(names, r.customer));
  if (scope.kind === "locations" || (scope.kind === "org" && scope.locations.length)) {
    const locs = scope.locations.map(norm).filter(Boolean);
    rows = rows.filter((r) => { const l = norm(r.location); return locs.some((x) => l.includes(x)); });
  }
  return rows.map((r) => ({
    id: S(r.id), title: S(r.title), customer: S(r.customer), location: S(r.location), machine: S(r.machine) || S(r.equipment), status: S(r.status),
    job_number: S(r.job_number), issue_date: (r.issue_date as string) ?? (r.at ? S(r.at).slice(0, 10) : null), resolved_at: (r.resolved_at as string) ?? null,
    category: S(r.category), description: S(r.description), resolution: S(r.resolution),
  }));
}

/* ------------------------------------------------------- supplier's POs */
export interface PortalPo {
  name: string; supplier: string; status: string; date: string | null; schedule: string | null; grand_total: number | null;
  per_received: number; per_billed: number; project: string; items: { item: string; qty: number | null; uom: string; rate: number | null; amount: number | null; received: number | null; schedule: string | null }[];
}
export async function loadPos(scope: Scope, which: "open" | "done"): Promise<PortalPo[]> {
  const admin = adminClient();
  if (scope.org && scope.org.kind !== "supplier") return [];
  const names = scope.org ? scope.org.match_names.map(norm) : null;
  let rows: Doc[] = [];
  try {
    rows = await pageAll((a, b) => admin.from("material_po").select("name,supplier,supplier_name,status,docstatus,transaction_date,schedule_date,grand_total,per_received,per_billed,project").eq("docstatus", 1).range(a, b).order("transaction_date", { ascending: false, nullsFirst: false }));
  } catch (e) { if (!/does not exist|schema cache/i.test(String(e))) throw e; }
  if (names) rows = rows.filter((r) => matches(names, r.supplier_name) || matches(names, r.supplier));
  const done = (r: Doc) => /completed|closed|cancelled/i.test(S(r.status)) || Number(r.per_received) >= 100;
  rows = rows.filter((r) => (which === "done" ? done(r) : !done(r)));
  const items = new Map<string, PortalPo["items"]>();
  const poNames = rows.map((r) => S(r.name));
  for (let i = 0; i < poNames.length; i += 300) {
    const { data } = await admin.from("material_po_item").select("po_name,idx,item_code,item_name,qty,uom,rate,amount,received_qty,schedule_date").in("po_name", poNames.slice(i, i + 300)).order("idx");
    for (const d of (data as Doc[]) ?? []) {
      const list = items.get(S(d.po_name)) || [];
      list.push({ item: S(d.item_name) || S(d.item_code), qty: N(d.qty), uom: S(d.uom), rate: N(d.rate), amount: N(d.amount), received: N(d.received_qty), schedule: (d.schedule_date as string) ?? null });
      items.set(S(d.po_name), list);
    }
  }
  return rows.map((r) => ({
    name: S(r.name), supplier: S(r.supplier_name) || S(r.supplier), status: S(r.status), date: (r.transaction_date as string) ?? null, schedule: (r.schedule_date as string) ?? null,
    grand_total: N(r.grand_total), per_received: Number(r.per_received) || 0, per_billed: Number(r.per_billed) || 0, project: S(r.project), items: items.get(S(r.name)) || [],
  }));
}
