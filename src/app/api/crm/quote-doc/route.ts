import { errJson, HttpError } from "@/lib/auth";
import { requireCrm } from "@/crm/auth";
import { crmDb, crmConfigured, CrmNotConfigured } from "@/crm/db";
import { LOGO } from "@/lib/logo";
import { cleanDesc } from "@/lib/desc-clean";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/crm/quote-doc?id=<quotation>&sections=cover,letter,…&print=1
 *
 * THE QUOTE AS A DOCUMENT (Dr Raghu, 30 Aug 2026): real A4 pages, the
 * Nandan logo in every header; the footer carries a rule, then
 * Quotation No + Date left, "Private and Confidential" centre, Page x of y
 * right. A DRAFT watermark rides every page. ?print=1 opens the browser's
 * Save-as-PDF at once. Section order is fixed: cover → covering letter →
 * situational analysis → items (their own pages, with rates) → terms →
 * about nandan → back page.
 */

const ORDER = ["cover", "letter", "situational", "items", "items_split", "terms", "about", "back"] as const;
const CHARS_PER_PAGE = 1750;

const esc = (x: unknown) => String(x ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dIN = (v: unknown) => (v ? String(v).slice(0, 10).split("-").reverse().join("/") : "");
const money = (v: unknown, cur: string, dec: boolean) => {
  const n = Number(v) || 0;
  const sym = cur === "USD" ? "$" : cur === "EUR" ? "€" : "₹";
  return `${sym} ${n.toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: dec ? 2 : 0, maximumFractionDigits: dec ? 2 : 0 })}`;
};

const W_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const W_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const w2 = (n: number): string => n < 20 ? W_ONES[n] : `${W_TENS[Math.floor(n / 10)]}${n % 10 ? " " + W_ONES[n % 10] : ""}`;
const w3 = (n: number): string => n < 100 ? w2(n) : `${W_ONES[Math.floor(n / 100)]} Hundred${n % 100 ? " " + w2(n % 100) : ""}`;
function wordsIndian(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7), lakh = Math.floor((n % 1e7) / 1e5), thou = Math.floor((n % 1e5) / 1000), rest = n % 1000;
  if (crore) parts.push(`${crore > 99 ? wordsIndian(crore) : w2(crore)} Crore`);
  if (lakh) parts.push(`${w2(lakh)} Lakh`);
  if (thou) parts.push(`${w2(thou)} Thousand`);
  if (rest) parts.push(w3(rest));
  return parts.join(" ");
}
function wordsWestern(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const bil = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), thou = Math.floor((n % 1e6) / 1000), rest = n % 1000;
  if (bil) parts.push(`${w3(bil)} Billion`);
  if (mil) parts.push(`${w3(mil)} Million`);
  if (thou) parts.push(`${w3(thou)} Thousand`);
  if (rest) parts.push(w3(rest));
  return parts.join(" ");
}

/** Split rich HTML into page-sized chunks on top-level block boundaries. */
function paginate(html: string): string[] {
  const blocks = html.split(/(?=<(?:p|h1|h2|h3|ul|ol|table|blockquote|div)[\s>])/i).filter((b) => b.trim());
  const pages: string[] = [];
  let cur = "";
  for (const b of blocks) {
    const plain = b.replace(/<[^>]+>/g, "").length + 80;
    if (cur && cur.replace(/<[^>]+>/g, "").length + plain > CHARS_PER_PAGE) { pages.push(cur); cur = ""; }
    cur += b;
  }
  if (cur.trim()) pages.push(cur);
  return pages.length ? pages : [""];
}

export async function GET(req: Request) {
  try {
    await requireCrm();
    if (!crmConfigured()) throw new HttpError(503, new CrmNotConfigured().message);
    const db = crmDb();
    const u = new URL(req.url);
    const qid = String(u.searchParams.get("id") || "");
    if (!qid) throw new HttpError(400, "Which quotation?");
    const wantPrint = u.searchParams.get("print") === "1";
    let isFinal = u.searchParams.get("final") === "1";
    const secParam = String(u.searchParams.get("sections") || "").split(",").map((s) => s.trim()).filter(Boolean);

    const { data: q } = await db.from("quotation").select("*").eq("id", qid).maybeSingle();
    if (!q) throw new HttpError(404, "That quotation no longer exists.");
    // once SUBMITTED, the DRAFT watermark is gone for good (Dr Raghu, 30 Aug 2026)
    if (String(q.status) === "submitted") isFinal = true;
    const sections = (secParam.length ? secParam : Array.isArray(q.print_sections) ? (q.print_sections as string[]) : [...ORDER])
      .filter((s) => (ORDER as readonly string[]).includes(s));

    const [{ data: lines }, { data: co }, { data: contact }, { data: tax }, { data: addr }, { data: tpls }] = await Promise.all([
      db.from("quotation_line").select("*").eq("quotation_id", qid).order("line_no"),
      q.company_id ? db.from("company").select("name").eq("id", String(q.company_id)).maybeSingle() : Promise.resolve({ data: null }),
      q.contact_id ? db.from("person").select("full_name").eq("id", String(q.contact_id)).maybeSingle() : Promise.resolve({ data: null }),
      q.tax_id ? db.from("tax_master").select("name, total_pct, components").eq("id", String(q.tax_id)).maybeSingle() : Promise.resolve({ data: null }),
      q.address_id ? db.from("address").select("label, line1, line2, city, state, pincode").eq("id", String(q.address_id)).maybeSingle() : Promise.resolve({ data: null }),
      db.from("quote_template").select("kind, name, content, sort_order").order("sort_order"),
    ] as const);
    let situational = "";
    if (q.opportunity_id) {
      const { data: opp } = await db.from("opportunity").select("id").eq("id", String(q.opportunity_id)).maybeSingle();
      if (opp) situational = String(q.situational_details || "");
    } else situational = String(q.situational_details || "");

    const customer = String(co?.name || "");
    const subject = String(q.subject || "").trim();
    // Qtn No · Date / To / Subject — the head the FIRST page wears, and the
    // covering letter too (Dr Raghu, 30 Aug 2026)
    let ownerName = "";
    if (q.owner_id) {
      const { data: ow } = await db.from("profile").select("full_name").eq("id", String(q.owner_id)).maybeSingle();
      ownerName = String(ow?.full_name || "");
    }
    const compactHead = `<div style="display:flex;justify-content:space-between;gap:6mm;border-bottom:1px solid #C9C6BD;padding-bottom:2mm;margin-bottom:4mm;font-size:10pt">
      <span><b>Qtn No:</b> ${esc(q.quote_no)} &nbsp;·&nbsp; <b>Date:</b> ${esc(dIN(q.quoted_on))}</span>
      <span><b>To:</b> ${esc(customer)}</span>
    </div>`;
    const headBlock = `<div style="border:1px solid #C9C6BD;border-left:4px solid #1B3A5C;padding:3mm 4mm;margin-bottom:5mm;font-size:10.5pt">
      <div><b>Qtn No:</b> ${esc(q.quote_no)} &nbsp;·&nbsp; <b>Date:</b> ${esc(dIN(q.quoted_on))}</div>
      <div><b>To:</b> ${esc(customer)}</div>
      ${addr ? `<div style="padding-left:9mm">${esc([addr.line1, addr.line2, [addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")].filter(Boolean).join(", "))}</div>` : ""}
      ${contact?.full_name ? `<div><b>Kind Attn:</b> ${esc(contact.full_name)}</div>` : ""}
      <div><b>From:</b> Nandan GSE Pvt Ltd${ownerName ? ` — ${esc(ownerName)}` : ""}</div>
      ${subject ? `<div><b>Subject:</b> ${esc(subject)}</div>` : ""}
      <div><b>Authorized by:</b> ${esc(q.authorized_by || "Dr Raghunandan Jagdish, MD and CEO")}</div>
    </div>`;
    const dec = q.show_decimals === true;
    const cur = String(q.currency || "INR");
    const cur2 = cur;
    const tplOf = (kind: string, chosen?: unknown) => {
      const list = (tpls ?? []).filter((t) => t.kind === kind);
      return (chosen ? list.find((t) => t.name === String(chosen)) : null) ?? list[0] ?? null;
    };
    // every section fills its variables (Dr Raghu, 30 Aug 2026: "this also
    // didn't replace the variable") — the whole set, wherever they appear
    const fill = (html: string) => html
      .replace(/\{\{customer\}\}/g, esc(customer))
      .replace(/\{\{quote_no\}\}/g, esc(q.quote_no))
      .replace(/\{\{quote_date\}\}/g, esc(dIN(q.quoted_on)))
      .replace(/\{\{subject\}\}/g, esc(String(q.subject || "")))
      .replace(/\{\{valid_until\}\}/g, esc(dIN(q.valid_until)))
      .replace(/\{\{delivery\}\}/g, esc(String(q.delivery_weeks || "")))
      .replace(/\{\{contact\}\}/g, esc(String(contact?.full_name || "")));

    // ---- content per section: [sectionKey, title, html-chunks] ----------
    type Sec = { key: string; title: string; chunks: string[]; centered?: boolean };
    const secs: Sec[] = [];
    for (const key of ORDER) {
      if (!sections.includes(key)) continue;
      if (key === "cover") {
        const t = tplOf("cover", q.cover_template);
        secs.push({ key, title: "", chunks: [fill(String(q.cover_text || t?.content || ""))], centered: true });
      } else if (key === "letter") {
        const html = fill(String(q.letter_text || "").trim());
        if (html) {
          const head = headBlock;
          const tail = `<p><br>Yours faithfully,<br><b>${esc(q.authorized_by || "Dr Raghunandan Jagdish, MD and CEO")}</b><br>Nandan GSE Pvt Ltd</p>`;
          secs.push({ key, title: "", chunks: paginate(head + html + tail) });
        }
      } else if (key === "situational") {
        if (situational.trim()) secs.push({ key, title: "Situational Details", chunks: paginate(fill(situational)) });
      } else if (key === "items" || key === "items_split") {
        const rows = (lines ?? []).filter((l) => !l.is_optional);
        if (rows.length) {
          const pids = [...new Set(rows.map((l) => l.product_id).filter(Boolean).map(String))];
          const prodMap = new Map<string, Record<string, unknown>>();
          for (let i = 0; i < pids.length; i += 100) {
            const { data: ps } = await db.from("product").select("id, name, sku, item_group, image, description").in("id", pids.slice(i, i + 100));
            for (const p of ps ?? []) prodMap.set(String(p.id), p as Record<string, unknown>);
          }
          let major = 0, minor = 0;
          const numbered = rows.map((l) => {
            if ((l.indent ?? 0) === 0) { major++; minor = 0; return { l, sr: String(major) }; }
            minor++; return { l, sr: `${Math.max(major, 1)}.${minor}` };
          });
          const specsOf = (l: Record<string, unknown>) => (l.specs && typeof l.specs === "object" ? l.specs as { rich?: string; image?: string } : {});
          const partsOf = (l: Record<string, unknown>) => {
            const p = l.product_id ? prodMap.get(String(l.product_id)) : undefined;
            const sp = specsOf(l);
            return {
              code: String(p?.sku ?? ""), group: String(l.item_group ?? p?.item_group ?? ""),
              // The ERP's "_place_holder;" never prints on a quotation
              // (Dr Raghu, 30 Aug 2026).
              img: String(sp.image || p?.image || ""), desc: cleanDesc(sp.rich ?? p?.description ?? ""),
            };
          };
          const cellHead = (l: Record<string, unknown>) => {
            const { code, group, img } = partsOf(l);
            return `<div class="ig">${esc([group, code].filter(Boolean).join(" :: "))}</div>
              <div class="inm">${esc(cleanDesc(l.description))}</div>
              ${img ? `<img class="thumb" src="${esc(img)}"/>` : ""}`;
          };
          /** Split rich HTML into char-budgeted pieces on block boundaries —
           *  A DESCRIPTION LONGER THAN A PAGE FLOWS TO THE NEXT
           *  (Dr Raghu, 30 Aug 2026: "it should go to the next page"). */
          const splitDesc = (html: string, firstBudget: number, restBudget: number): string[] => {
            const blocks = html.split(/(?=<(?:p|h1|h2|h3|ul|ol|table|blockquote|div)[\s>])/i).filter((b) => b.trim());
            if (!blocks.length) return html.trim() ? [html] : [];
            const out: string[] = [];
            let cur = "", used = 0, budget = firstBudget;
            for (const b of blocks) {
              const w = b.replace(/<[^>]+>/g, "").length + 60;
              if (cur && used + w > budget) { out.push(cur); cur = ""; used = 0; budget = restBudget; }
              cur += b; used += w;
            }
            if (cur.trim()) out.push(cur);
            return out;
          };
          const CAP = 5.2, CHARS = 350;
          type Frag = { sr: string; cell: string; l: Record<string, unknown> | null; w: number };
          const frags: Frag[] = [];
          for (const { l, sr } of numbered) {
            const { img, desc } = partsOf(l);
            const plain = desc.replace(/<[^>]+>/g, "").length;
            const baseW = 1 + (img ? 1 : 0);
            if (baseW + plain / CHARS <= CAP - 0.4) {
              frags.push({ sr, cell: `${cellHead(l)}${desc ? `<div class="idesc">${desc}</div>` : ""}`, l, w: baseW + plain / CHARS });
            } else {
              const pieces = splitDesc(desc, Math.max(400, Math.floor((CAP - 0.6 - baseW) * CHARS)), Math.floor((CAP - 0.6) * CHARS));
              pieces.forEach((piece, i) => {
                const pw = piece.replace(/<[^>]+>/g, "").length / CHARS;
                if (i === 0) frags.push({ sr, cell: `${cellHead(l)}<div class="idesc">${piece}</div>`, l, w: baseW + pw });
                else frags.push({ sr: "", cell: `<div class="ig">${esc(cleanDesc(l.description))} <i>(contd.)</i></div><div class="idesc">${piece}</div>`, l: null, w: 0.3 + pw });
              });
            }
          }
          const pagesOfFrags: Frag[][] = [];
          let cur: Frag[] = [], used = 0;
          for (const f of frags) {
            if (cur.length && used + f.w > CAP) { pagesOfFrags.push(cur); cur = []; used = 0; }
            cur.push(f); used += f.w;
          }
          if (cur.length) pagesOfFrags.push(cur);

          const sub = Number(q.subtotal) || 0, disc = Number(q.discount_amount) || 0;
          const taxAmt = Number(q.tax_amount) || 0, grand = Number(q.grand_total) || 0;
          const comps = (Array.isArray(tax?.components) ? tax!.components as { name: string; pct: number }[] : []);
          const totalsRows = (span: number) => `<tr class="tot"><td colspan="${span}" class="tr">Net Total</td><td class="tr">${money(sub, cur2, dec)}</td></tr>
            ${disc ? `<tr><td colspan="${span}" class="tr">Discount ${Number(q.discount_pct)}%</td><td class="tr">− ${money(disc, cur2, dec)}</td></tr>
            <tr><td colspan="${span}" class="tr">Discounted Total</td><td class="tr">${money(sub - disc, cur2, dec)}</td></tr>` : ""}
            ${comps.length > 1
              ? comps.map((c) => `<tr><td colspan="${span}" class="tr">${esc(c.name)} ${c.pct}%</td><td class="tr">${money((sub - disc) * c.pct / 100, cur2, dec)}</td></tr>`).join("")
              : `<tr><td colspan="${span}" class="tr">${esc(tax?.name || "GST 18%")}</td><td class="tr">${money(taxAmt, cur2, dec)}</td></tr>`}
            <tr class="grand"><td colspan="${span}" class="tr"><b>Grand Total</b></td><td class="tr"><b>${money(grand, cur2, dec)}</b></td></tr>
            <tr><td colspan="${span + 1}" class="words">${esc(`${cur2 === "INR" ? "Rupees" : cur2 === "USD" ? "US Dollars" : "Euros"} ${cur2 === "INR" ? wordsIndian(Math.floor(grand)) : wordsWestern(Math.floor(grand))} Only`)}</td></tr>`;

          const COLS_FULL = '<colgroup><col class="c-sr"/><col/><col class="c-rate"/><col class="c-qty"/><col class="c-amt"/></colgroup>';
          const COLS_TECH = '<colgroup><col class="c-sr"/><col/></colgroup>';
          const fragRowFull = (f: Frag) => `<tr>
            <td class="tc">${f.sr}</td><td class="icell">${f.cell}</td>
            <td class="tr">${f.l ? money(f.l.unit_price, cur2, dec) : ""}</td><td class="tc">${f.l ? Number(f.l.quantity) : ""}</td>
            <td class="tr">${f.l ? money(f.l.line_total, cur2, dec) : ""}</td></tr>`;
          const fragRowTech = (f: Frag) => `<tr><td class="tc">${f.sr}</td><td class="icell">${f.cell}</td></tr>`;

          if (key === "items") {
            const chunks = pagesOfFrags.map((page, pi) => `${pi === 0 ? compactHead : ""}<h2 class="sect">Schedule of Items &amp; Prices${pi ? " (contd.)" : ""}</h2>
              <table class="items">${COLS_FULL}<thead><tr><th>Sr No</th><th>Item</th><th class="tr">Rate</th><th>Qty</th><th class="tr">Amount</th></tr></thead>
              <tbody>${page.map(fragRowFull).join("")}
              ${pi === pagesOfFrags.length - 1 ? totalsRows(4) : ""}</tbody></table>`);
            secs.push({ key, title: "", chunks });
          } else {
            const chunks = pagesOfFrags.map((page, pi) => `${pi === 0 ? compactHead : ""}<h2 class="sect">Schedule of Items${pi ? " (contd.)" : ""}</h2>
              <table class="items">${COLS_TECH}<thead><tr><th>Sr No</th><th>Item</th></tr></thead>
              <tbody>${page.map(fragRowTech).join("")}</tbody></table>`);
            const slim = (l: Record<string, unknown>) => {
              const { code, group } = partsOf(l);
              return `<div class="ig">${esc([group, code].filter(Boolean).join(" :: "))}</div><div class="inm">${esc(cleanDesc(l.description))}</div>`;
            };
            const comPages: typeof numbered[] = [];
            for (let i = 0; i < numbered.length; i += 11) comPages.push(numbered.slice(i, i + 11));
            for (let pi = 0; pi < comPages.length; pi++) {
              chunks.push(`${pi === 0 ? compactHead : ""}<h2 class="sect">Commercial Offer${pi ? " (contd.)" : ""}</h2>
                <table class="items">${COLS_FULL}<thead><tr><th>Sr No</th><th>Item</th><th class="tr">Rate</th><th>Qty</th><th class="tr">Amount</th></tr></thead>
                <tbody>${comPages[pi].map(({ l, sr }) => `<tr>
                  <td class="tc">${sr}</td><td class="icell">${slim(l as unknown as Record<string, unknown>)}</td>
                  <td class="tr">${money(l.unit_price, cur2, dec)}</td><td class="tc">${Number(l.quantity)}</td>
                  <td class="tr">${money(l.line_total, cur2, dec)}</td></tr>`).join("")}
                ${pi === comPages.length - 1 ? totalsRows(4) : ""}</tbody></table>`);
            }
            secs.push({ key, title: "", chunks });
          }
        }
      } else if (key === "terms") {
        const html = fill(String(q.terms_text || "").trim());
        if (html) secs.push({ key, title: "Terms & Conditions", chunks: paginate(html) });
      } else if (key === "about") {
        const t = tplOf("about", q.about_template);
        const html = String(q.about_text || t?.content || "").trim();
        if (html) secs.push({ key, title: "", chunks: paginate(fill(html)) });
      } else if (key === "back") {
        const t = tplOf("back", q.back_template);
        secs.push({ key, title: "", chunks: [fill(String(q.back_text || t?.content || ""))], centered: true });
      }
    }

    // the first page after the cover always wears the head block
    const firstContent = secs.find((x) => x.key !== "cover");
    if (firstContent && firstContent.key !== "letter" && !firstContent.key.startsWith("items") && firstContent.chunks.length)
      firstContent.chunks[0] = headBlock + firstContent.chunks[0];
    const flat: { title: string; html: string; centered?: boolean }[] = [];
    for (const s of secs) for (const c of s.chunks) flat.push({ title: s.title, html: c, centered: s.centered });
    const total = flat.length || 1;

    const pages = flat.map((p, i) => `
      <div class="page">
        ${isFinal ? "" : '<div class="wm">DRAFT</div>'}
        <div class="hdr"><img src="${LOGO}" alt="Nandan GSE"/></div>
        <div class="body${p.centered ? " centered" : ""}">${p.title ? `<h2 class="sect">${esc(p.title)}</h2>` : ""}${p.html}</div>
        <div class="ftr">
          <span>Quotation No: ${esc(q.quote_no)} &nbsp;·&nbsp; Date: ${esc(dIN(q.quoted_on))}</span>
          <span class="fc">Private and Confidential</span>
          <span class="fr">Page ${i + 1} of ${total}</span>
        </div>
      </div>`).join("\n");

    const html = `<!doctype html><html><head><meta charset="utf-8"/>
<title>${esc(q.quote_no)} — Quotation</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: Georgia, 'Times New Roman', serif; background: #666; }
  .page { width: 210mm; height: 296mm; background: #fff; margin: 6mm auto; padding: 7mm 14mm 8mm;
          position: relative; display: flex; flex-direction: column; overflow: hidden;
          box-shadow: 0 2px 12px rgba(0,0,0,.35); }
  .hdr { border-bottom: 2px solid #1B3A5C; padding-bottom: 1.5mm; margin-bottom: 4mm; }
  .hdr img { height: 11mm; object-fit: contain; }
  .body { flex: 1; min-height: 0; font-size: 11.5pt; line-height: 1.55; color: #16232F; overflow: hidden; }
  .body.centered { display: flex; flex-direction: column; justify-content: center; text-align: center; }
  .body p { margin: 0 0 8pt; } .body h1 { font-size: 22pt; margin: 8pt 0; color: #1B3A5C; }
  .body h2 { font-size: 15pt; margin: 8pt 0; color: #1B3A5C; } .body ul, .body ol { margin: 0 0 8pt 18pt; }
  .body img { max-width: 100%; height: auto; max-height: 235mm; object-fit: contain; }
  .body table { border-collapse: collapse; margin: 6pt 0; max-width: 100%; }
  .body td, .body th { border: 1px solid #999; padding: 3pt 6pt; font-size: 10pt; }
  h2.sect { border-bottom: 1px solid #C9C6BD; padding-bottom: 2mm; margin-bottom: 5mm; }
  table.items { width: 100%; table-layout: fixed; }
  table.items col.c-sr { width: 12mm; } table.items col.c-rate { width: 32mm; }
  table.items col.c-qty { width: 13mm; } table.items col.c-amt { width: 36mm; }
  table.items td.tr, table.items th.tr { white-space: nowrap; font-size: 10pt; }
  table.items td { word-wrap: break-word; vertical-align: top; }
  table.items th { background: #EEF1F5; text-align: left; font-size: 9.5pt; }
  table.items .tr { text-align: right; } table.items .tc { text-align: center; }
  table.items tr.tot td { border-top: 2px solid #1B3A5C; }
  table.items tr.grand td { font-size: 12pt; background: #F5F7FA; }
  table.items td.words { font-style: italic; font-size: 10pt; }
  .icell .ig { font-size: 8.5pt; color: #555; }
  .icell .inm { font-weight: 700; font-size: 10.5pt; }
  .icell img.thumb { height: 16mm; max-width: 60mm; object-fit: contain; display: block; margin: 1mm 0; }
  .icell .idesc { font-size: 9pt; line-height: 1.4; margin-top: 1mm; }
  .icell .idesc table { margin: 2pt 0; } .icell .idesc td, .icell .idesc th { font-size: 8pt; padding: 2pt 4pt; }
  .icell .idesc img { max-height: 30mm; max-width: 100%; height: auto; }
  .ftr { flex-shrink: 0; margin-top: 2mm; border-top: 1px solid #1B3A5C;
         padding-top: 1.5mm; display: grid; grid-template-columns: auto 1fr auto; column-gap: 6mm;
         align-items: baseline; font-size: 8pt; color: #444; }
  .ftr span { white-space: nowrap; }
  .ftr .fc { text-align: center; } .ftr .fr { text-align: right; }
  .wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
        font-size: 90pt; font-weight: 800; color: rgba(180, 38, 30, .08); transform: rotate(-30deg);
        pointer-events: none; z-index: 0; letter-spacing: 18pt; }
  .body, .hdr, .ftr { position: relative; z-index: 1; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; box-shadow: none; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
  }
  @page { size: A4; margin: 0; }
</style></head>
<body>${pages}
${wantPrint ? "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),400));</script>" : ""}
</body></html>`;

    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        // embeddable by Genie's own Review Quote iframe — nobody else's
        "X-Frame-Options": "SAMEORIGIN",
        "Content-Security-Policy": "frame-ancestors 'self'",
      },
    });
  } catch (e) {
    return errJson(e);
  }
}
