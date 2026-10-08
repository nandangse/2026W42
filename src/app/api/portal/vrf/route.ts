import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { errJson, HttpError } from "@/lib/auth";
import { VRF_FILE_KINDS, VRF_ITEMS } from "@/lib/vrf-fields";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * THE VENDOR REGISTRATION FORM, OPEN TO THE WORLD (Dr Raghu, 8 Oct 2026):
 * "this form should be openly available as genie.nandan.co.in/portal/vrf …
 * filled by existing suppliers as well as new suppliers." No login. The
 * row is written with the service key; the files go into the private
 * `portal` bucket under vrf/<id>/ and are read only through Saamaan by the
 * purchase team. A honeypot field and a 25 MB ceiling keep the bots and the
 * accidents out; nothing else stands in a supplier's way.
 */
const S = (v: FormDataEntryValue | null) => String(v ?? "").trim().slice(0, 2000);
const MAX_TOTAL = 25 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    if (S(form.get("website_url"))) return NextResponse.json({ ok: true });   // the honeypot: bots fill it, people never see it
    const req_ = (k: string, label: string) => { const v = S(form.get(k)); if (!v) throw new HttpError(400, `${label} is required.`); return v; };
    const email = req_("email", "Email");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "That e-mail does not look right.");
    const items = form.getAll("items_supplied").map((x) => String(x)).filter((x) => VRF_ITEMS.includes(x));
    if (!items.length) throw new HttpError(400, "Tick at least one item you supply.");
    const row = {
      email, supplier_id: S(form.get("supplier_id")), relationship: S(form.get("relationship")),
      storage_facility: req_("storage_facility", "Material storage facility and capacity"),
      inspection_facility: S(form.get("inspection_facility")), inhouse_mfg: S(form.get("inhouse_mfg")), outsourced_processes: S(form.get("outsourced_processes")),
      company_name: req_("company_name", "Company name"), contact_name: req_("contact_name", "Main contact person name"), contact_mobile: req_("contact_mobile", "Main contact person mobile"),
      company_email: req_("company_email", "Company e-mail"), company_phone: req_("company_phone", "Company phone"), address: req_("address", "Company address"),
      city: req_("city", "City"), pin: req_("pin", "PIN code"), established_year: S(form.get("established_year")), pan_no: S(form.get("pan_no")),
      company_type: S(form.get("company_type")), gst_no: req_("gst_no", "Company GST no (write N/A if none)"),
      items_supplied: items, other_items: S(form.get("other_items")), brief: S(form.get("brief")),
      bank_name: req_("bank_name", "Bank name"), account_no: req_("account_no", "Account no"), ifsc: req_("ifsc", "IFSC code").toUpperCase(), branch: req_("branch", "Branch"),
      accounts_contact: req_("accounts_contact", "Contact for accounting"), send_copy: S(form.get("send_copy")) === "yes",
      ip: (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null, user_agent: (req.headers.get("user-agent") || "").slice(0, 300) || null,
    };
    const admin = adminClient();
    const { data: made, error } = await admin.from("portal_vrf").insert(row).select("id").single();
    if (error) { if (/does not exist|schema cache/i.test(error.message)) throw new HttpError(503, "The form is not open yet — the table is missing (migration 0207)."); throw new Error(error.message); }
    const id = String(made.id);
    // the files, by kind, into the private bucket
    const files: { kind: string; name: string; path: string; size: number }[] = [];
    let total = 0;
    for (const [kind] of VRF_FILE_KINDS) {
      for (const f of form.getAll(`file_${kind}`)) {
        if (!(f instanceof File) || !f.size) continue;
        total += f.size; if (total > MAX_TOTAL) throw new HttpError(400, "The attachments come to more than 25 MB together — please send smaller files.");
        const safe = f.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120);
        const path = `vrf/${id}/${kind}-${safe}`;
        const { error: up } = await admin.storage.from("portal").upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type || "application/octet-stream", upsert: true });
        if (!up) files.push({ kind, name: f.name, path, size: f.size });
      }
    }
    if (files.length) await admin.from("portal_vrf").update({ files }).eq("id", id);
    return NextResponse.json({ ok: true, id, files: files.length });
  } catch (e) { return errJson(e); }
}
