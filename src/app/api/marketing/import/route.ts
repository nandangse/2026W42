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

    /**
     * WHERE THIS NAME CAME FROM (0073).
     *
     * Defaults to the file's own name, and is editable because a file called
     * "Book1 (3).xlsx" tells nobody anything while "Aahar 2024" tells them
     * everything. Recorded on the MEMBERSHIP: the same person can arrive on
     * one list from two different shows, and both reasons are true.
     */
    const source = String(form.get("source") || "").trim().slice(0, 160) || file.name;

    const mapRaw = String(form.get("map") || "");
    const map: Record<number, string> = mapRaw ? JSON.parse(mapRaw) : {};

    const buf = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buf, { type: "buffer", raw: /\.csv$/i.test(file.name), cellDates: false });

    /**
     * THE SHEET WITH THE PEOPLE ON IT, NOT SIMPLY THE FIRST ONE.
     *
     * An exhibitor book opens on a cover page, or a legend, or an empty tab
     * somebody left behind — and reading SheetNames[0] blindly meant the
     * whole file was refused as "a header and no rows" while the 400 names
     * sat on the next tab along. One unreadable file out of forty then
     * stopped the batch, which is how "intralogistic warehousing show 2025"
     * took thirty-nine others down with it.
     *
     * So every sheet is looked at and the one that actually carries a table
     * is used: most rows wins, and a sheet whose header row names something
     * we recognise beats a bigger one that names nothing. The chosen sheet is
     * reported, because a file with four tabs should say which it read.
     */
    type Pick = { name: string; grid: unknown[][]; score: number };
    const candidates: Pick[] = [];
    for (const name of wb.SheetNames) {
      const sh = wb.Sheets[name];
      if (!sh) continue;
      const g = XLSX.utils.sheet_to_json<unknown[]>(sh, { header: 1, blankrows: false, raw: false });
      if (g.length < 2) continue;
      const hdr = (g[0] || []).map(norm);
      const known = Object.keys(guessMap(hdr)).length;
      candidates.push({ name, grid: g, score: known * 100000 + g.length });
    }
    if (!candidates.length) {
      const tabs = wb.SheetNames.length;
      throw new HttpError(400, tabs > 1
        ? `No sheet in this file has a header row and data under it — ${tabs} tabs were tried.`
        : "That file has a header and no rows.");
    }
    candidates.sort((a, b) => b.score - a.score);
    const chosen = candidates[0];
    const grid = chosen.grid;
    const sheetName = chosen.name;

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

    /**
     * A COMMIT DOES ONE SLICE OF THE FILE (14 Sep 2026).
     *
     * A 10,505-row file died on commit with a reply that was not even JSON —
     * it was Vercel's own timeout page. No single serverless invocation
     * should be asked to carry a whole import, so the browser walks the file
     * in slices and each request does a bounded piece of work. A slice that
     * fails can be repeated; nothing is written twice, because a person the
     * previous slice created is simply found rather than inserted.
     *
     * The PREVIEW still reads the whole file — it writes nothing and the
     * reader needs the true totals before pressing anything.
     */
    const from = Math.max(0, Number(form.get("from") || 0));
    const size = Math.min(4000, Math.max(200, Number(form.get("size") || 1500)));
    const slice = action === "commit" ? body.slice(from, from + size) : body;
    const to = action === "commit" ? Math.min(body.length, from + size) : body.length;

    /**
     * ONLY THE ADDRESSES IN THIS FILE, NOT THE WHOLE TABLE.
     *
     * This used to page the entire person table to build an e-mail index:
     * 140 round trips and 139,807 rows held in memory, twice — once to
     * preview and again to commit — to answer a question about 10,000
     * addresses. That, more than anything else, is what ran the clock out.
     *
     * Both spellings are asked for: the address lowercased, and exactly as
     * the file writes it. 34 of the 139,807 rows in the CRM are stored with
     * a capital in them, and an address stored in a case neither form
     * matches would be inserted as a second person rather than found. Rare,
     * visible, and never silent — far better than the scan it replaces.
     */
    const want = new Set<string>();
    if (emailCol >= 0) for (const r of slice) {
      const raw = norm(r[emailCol]); if (!raw) continue;
      want.add(raw.toLowerCase()); want.add(raw);
    }
    const byEmail = new Map<string, { id: string; [k: string]: unknown }>();
    for (const c of chunk([...want], 300)) {
      const { data, error } = await db.from("person")
        .select("id, primary_email, primary_phone, whatsapp_number, job_title, department, linkedin_url, city, country, full_name, notes")
        .in("primary_email", c);
      if (error) throw new HttpError(500, error.message);
      for (const p of data || []) if (p.primary_email) byEmail.set(lower(p.primary_email), p as { id: string });
    }

    const inserts: Record<string, unknown>[] = [];
    const patches: { id: string; patch: Record<string, unknown> }[] = [];
    const memberIds: string[] = [];
    let matched = 0, blankEmail = 0, sharedRows = 0, empty = 0;

    for (const r of slice) {
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
        /**
         * AND THE COLUMNS WITH NOWHERE TO GO ARE ADDED TO THEIR NOTES
         * (Dr Raghu, 15 Sep 2026: "also the fields in the record that don't
         * have a cell to go to should be merged in the notes").
         *
         * A new person has always kept them. Somebody ALREADY in the CRM did
         * not: their landlines, their PIN code, their business description
         * were read out of the file and then dropped, which is the worst of
         * both — the work of reading with none of the keeping.
         *
         * APPENDED, NEVER REPLACED, and skipped when the same block is
         * already there, so importing the same file twice does not write the
         * same paragraph twice.
         */
        if (note) {
          const had = String(hit.notes || "").trim();
          const body = note.split("\n").slice(1).join("\n").trim();   // without its own header line
          if (!had) patch.notes = note;
          else if (body && !had.includes(body)) patch.notes = `${had}\n\n${note}`;
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
      source,
      sheet: sheetName,
      sheets: wb.SheetNames.length,
      rows: slice.length,
      fileRows: body.length,
      headers,
      mapping: Object.fromEntries(Object.entries(guessed).map(([i, k]) => [headers[Number(i)] || `col ${i}`, k])),
      unmapped: headers.filter((h, i) => h && !guessed[i]),
      matched, willInsert: inserts.length, willFill: patches.length,
      willNote: patches.filter((p) => p.patch.notes !== undefined).length,
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

    /* Fill blanks in parallel batches. One request per person meant 468
       sequential round trips on the file that failed — minutes of the
       budget spent on a job that takes seconds twenty at a time. */
    for (const c of chunk(patches, 20)) {
      const rs = await Promise.all(c.map((p) => db.from("person").update(p.patch).eq("id", p.id)));
      const bad = rs.find((r) => r.error);
      if (bad?.error) throw new HttpError(500, `filling blanks: ${bad.error.message}`);
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
      const rows = c.map((pid) => ({ list_id: listId, person_id: pid, added_by_email: u.email.toLowerCase(), source }));
      let { error } = await db.from("mk_list_member")
        .upsert(rows, { onConflict: "list_id,person_id", ignoreDuplicates: true });
      /* Before 0073 there is no column for it; the membership still matters
         more than the note about where it came from. */
      if (error && /source/i.test(error.message)) {
        ({ error } = await db.from("mk_list_member")
          .upsert(rows.map(({ source: _s, ...r }) => r), { onConflict: "list_id,person_id", ignoreDuplicates: true }));
      }
      if (error) throw new HttpError(500, `adding to the list: ${error.message}`);
      listed += c.length;
    }

    return NextResponse.json({
      ok: true, committed: true, ...summary, listed,
      /* Where the browser should carry on from, and whether it is finished. */
      from, to, total: body.length, done: to >= body.length,
      notesCarried: hasNotes,
      note: hasNotes ? undefined : "person.notes does not exist yet — run CRM migration 0065; the unmapped columns were not kept.",
    });
  } catch (e) { return errJson(e); }
}
