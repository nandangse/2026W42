import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { errJson, HttpError } from "@/lib/auth";
import { requireMarketing } from "@/lib/marketing";
import { crmDb } from "@/crm/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * UPLOAD A LIST (Dr Raghu, 14 Sep 2026: "can we have lists and then upload a
 * csv or excel which will add it to the list and also to the leads. It will
 * add records and also map them, not overwrite it for now").
 *
 * Two acts in one upload, and the second is the one people forget: the rows
 * become PEOPLE in the CRM, and those people become MEMBERS of the list. A
 * list that holds names the CRM has never heard of cannot be mailed.
 *
 * "NOT OVERWRITE IT FOR NOW" is the rule the whole route is built around.
 * Where a person already exists, their record is LEFT ALONE except for
 * fields that are empty — the file may fill a blank, never replace a value.
 * What is in the CRM was typed by somebody here; what is in a file was
 * exported from somewhere else, and the person here is the better authority.
 *
 * MATCHING IS BY E-MAIL, AND ONLY WHERE THAT E-MAIL IS UNIQUE IN THE FILE.
 * Learned from the employee list, where hr@nandan.co.in belonged to three
 * different people: match on it blindly and two of the three are silently
 * discarded as duplicates of the first. An address shared inside one file
 * identifies nobody, so those rows are inserted separately and flagged.
 *
 * A ROW WITH NO E-MAIL IS STILL A PERSON. It cannot be mailed, but it can be
 * telephoned, and dropping it silently is how a 202-row file becomes 196
 * without anybody noticing.
 *
 * Two passes: `action: "preview"` reads the file and reports what WOULD
 * happen, touching nothing. `action: "commit"` does it. Nothing is written
 * until somebody has seen the preview — a bulk write into 139,000 people is
 * not a thing to do on one click.
 */

/** Every column we know how to fill, and the header spellings that mean it. */
const FIELDS: { key: string; label: string; aliases: string[] }[] = [
  { key: "full_name", label: "Full name", aliases: ["full name", "name", "contact name", "person"] },
  { key: "first_name", label: "First name", aliases: ["first name", "firstname", "given name"] },
  { key: "last_name", label: "Last name", aliases: ["last name", "lastname", "surname", "family name"] },
  { key: "primary_email", label: "E-mail", aliases: ["email", "e-mail", "email 1", "personal email", "work email", "email address", "mail"] },
  { key: "primary_phone", label: "Phone", aliases: ["phone", "mobile", "phone 1", "personal mobile", "contact number", "telephone", "cell"] },
  { key: "whatsapp_number", label: "WhatsApp", aliases: ["whatsapp", "whatsapp number", "wa"] },
  { key: "job_title", label: "Job title", aliases: ["job title", "title", "designation", "role", "position"] },
  { key: "department", label: "Department", aliases: ["department", "dept"] },
  { key: "linkedin_url", label: "LinkedIn", aliases: ["linkedin", "linkedin url", "linkedin profile"] },
  { key: "city", label: "City", aliases: ["city", "town", "location"] },
  { key: "country", label: "Country", aliases: ["country", "nation"] },
  { key: "company_name", label: "Company", aliases: ["company", "organisation", "organization", "employer", "company name", "account"] },
];

const norm = (v: unknown) => String(v ?? "").trim();
const lower = (v: unknown) => norm(v).toLowerCase();
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

/** Guess which column is which, so nobody has to map twelve fields by hand. */
function guessMap(headers: string[]): Record<number, string> {
  const out: Record<number, string> = {};
  const taken = new Set<string>();
  headers.forEach((h, i) => {
    const k = lower(h).replace(/[_.]+/g, " ").replace(/\s+/g, " ");
    if (!k) return;
    for (const f of FIELDS) {
      if (taken.has(f.key)) continue;
      if (f.aliases.includes(k) || k === lower(f.label)) { out[i] = f.key; taken.add(f.key); return; }
    }
  });
  return out;
}

/** Everything that was NOT mapped, written as a readable block for the note. */
function leftovers(headers: string[], row: unknown[], map: Record<number, string>, fileName: string): string | null {
  const bits: string[] = [];
  headers.forEach((h, i) => {
    if (map[i]) return;
    const v = norm(row[i]);
    if (v && norm(h)) bits.push(`${norm(h)}: ${v}`);
  });
  if (!bits.length) return null;
  return `— From ${fileName}, ${new Date().toISOString().slice(0, 10)} —\n${bits.join("\n")}`;
}

export async function POST(req: Request) {
  try {
    const u = await requireMarketing();
    const db = crmDb();
    const form = await req.formData();
    const action = String(form.get("action") || "preview");
    const listId = String(form.get("list_id") || "").trim();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "No file came with the upload.");
    if (!listId) throw new HttpError(400, "Which list?");

    const mapRaw = String(form.get("map") || "");
    const map: Record<number, string> = mapRaw ? JSON.parse(mapRaw) : {};

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", raw: /\.csv$/i.test(file.name), cellDates: false });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) throw new HttpError(400, "That file has no readable sheet in it.");
    const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, raw: false });
    if (grid.length < 2) throw new HttpError(400, "That file has a header and no rows.");

    const headers = (grid[0] || []).map(norm);
    const guessed = Object.keys(map).length ? map : guessMap(headers);
    const emailCol = Number(Object.entries(guessed).find(([, v]) => v === "primary_email")?.[0] ?? -1);
    const body = grid.slice(1);

    /* An address used by two people in ONE file identifies neither. */
    const seen = new Set<string>(), shared = new Set<string>();
    if (emailCol >= 0) for (const r of body) {
      const e = lower(r[emailCol]); if (!e) continue;
      if (seen.has(e)) shared.add(e); seen.add(e);
    }

    /* The CRM's own e-mail index, paged — PostgREST truncates at 1,000. */
    const byEmail = new Map<string, { id: string; [k: string]: unknown }>();
    for (let off = 0; ; off += 1000) {
      const { data, error } = await db.from("person")
        .select("id, primary_email, primary_phone, whatsapp_number, job_title, department, linkedin_url, city, country, full_name")
        .range(off, off + 999);
      if (error) throw new HttpError(500, error.message);
      if (!data || !data.length) break;
      for (const p of data) if (p.primary_email) byEmail.set(lower(p.primary_email), p as { id: string });
      if (data.length < 1000) break;
    }

    const inserts: Record<string, unknown>[] = [];
    const patches: { id: string; patch: Record<string, unknown> }[] = [];
    const memberIds: string[] = [];
    let matched = 0, blankEmail = 0, sharedRows = 0, empty = 0;

    for (const r of body) {
      const vals: Record<string, string> = {};
      for (const [i, key] of Object.entries(guessed)) {
        const v = norm(r[Number(i)]);
        if (v) vals[key] = v;
      }
      if (!vals.full_name && !vals.first_name && !vals.primary_email) { empty++; continue; }
      /* person.full_name is GENERATED from first + last, so it is never
         written. A single "Name" column is split so the generated value
         reproduces it exactly: all but the final token is the first name. */
      if (!vals.first_name && vals.full_name) {
        const n = vals.full_name.replace(/\s+/g, " ").trim();
        const i = n.lastIndexOf(" ");
        if (i < 0) vals.first_name = n;
        else { vals.first_name = n.slice(0, i); vals.last_name = vals.last_name || n.slice(i + 1); }
      }
      const em = lower(vals.primary_email);
      if (!em) blankEmail++;
      if (em && shared.has(em)) sharedRows++;

      const note = leftovers(headers, r, guessed, file.name);
      const hit = em && !shared.has(em) ? byEmail.get(em) : undefined;

      if (hit) {
        matched++;
        memberIds.push(hit.id);
        /* FILL BLANKS ONLY. Never replace what somebody here already typed. */
        const patch: Record<string, unknown> = {};
        for (const k of ["primary_phone", "whatsapp_number", "job_title", "department", "linkedin_url", "city", "country"]) {
          if (vals[k] && !hit[k]) patch[k] = vals[k];
        }
        if (Object.keys(patch).length) patches.push({ id: hit.id, patch });
      } else {
        const row: Record<string, unknown> = {
          first_name: vals.first_name || null,
          last_name: vals.last_name || null,
          primary_email: em || null,
          primary_phone: vals.primary_phone || null,
          whatsapp_number: vals.whatsapp_number || null,
          job_title: vals.job_title || null,
          department: vals.department || null,
          linkedin_url: vals.linkedin_url || null,
          city: vals.city || null,
          country: vals.country || null,
          source: "crm",
          created_by_email: u.email.toLowerCase(),
        };
        inserts.push({ ...row, __note: note });
      }
    }

    const summary = {
      file: file.name,
      rows: body.length,
      headers,
      mapping: Object.fromEntries(Object.entries(guessed).map(([i, k]) => [headers[Number(i)] || `col ${i}`, k])),
      unmapped: headers.filter((h, i) => h && !guessed[i]),
      matched, willInsert: inserts.length, willFill: patches.length,
      blankEmail, sharedAddresses: sharedRows, emptyRows: empty,
    };

    if (action !== "commit") {
      return NextResponse.json({
        ok: true, preview: true, ...summary,
        sample: inserts.slice(0, 5).map((r) => { const { __note, ...rest } = r as Record<string, unknown>; return { ...rest, note: __note }; }),
        note: "Nothing has been written. Press Import to commit.",
      });
    }

    /* Does person.notes exist? Migration 0065 adds it; without it the
       unmapped columns are reported and dropped rather than failing. */
    let hasNotes = true;
    { const { error } = await db.from("person").select("notes").limit(1); if (error) hasNotes = false; }

    for (const p of patches) {
      const { error } = await db.from("person").update(p.patch).eq("id", p.id);
      if (error) throw new HttpError(500, `filling blanks: ${error.message}`);
    }
    for (const c of chunk(inserts, 200)) {
      const rows = c.map((r) => {
        const { __note, ...rest } = r as Record<string, unknown>;
        return hasNotes && __note ? { ...rest, notes: __note } : rest;
      });
      const { data, error } = await db.from("person").insert(rows).select("id");
      if (error) throw new HttpError(500, `inserting: ${error.message}`);
      for (const m of data || []) memberIds.push(String(m.id));
    }
    let listed = 0;
    for (const c of chunk([...new Set(memberIds)], 500)) {
      const { error } = await db.from("mk_list_member")
        .upsert(c.map((pid) => ({ list_id: listId, person_id: pid, added_by_email: u.email.toLowerCase() })),
          { onConflict: "list_id,person_id", ignoreDuplicates: true });
      if (error) throw new HttpError(500, `adding to the list: ${error.message}`);
      listed += c.length;
    }

    return NextResponse.json({
      ok: true, committed: true, ...summary, listed,
      notesCarried: hasNotes,
      note: hasNotes ? undefined : "person.notes does not exist yet — run CRM migration 0065; the unmapped columns were not kept.",
    });
  } catch (e) { return errJson(e); }
}
