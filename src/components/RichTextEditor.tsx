"use client";
/**
 * THE ONE RICH TEXT BOX (Dr Raghu, 30 Aug 2026: "make a common rich text box
 * across the whole of Genie — B I U, bullet, number, indent in/out, colour,
 * picture, table").
 *
 * ContentEditable, no libraries. New content is stored as SANITIZED HTML —
 * full fidelity for colour, tables, indents. Old content (the markdown-ish
 * the suite grew up on) still renders through whatever legacy renderer the
 * caller hands to <RichContent/>; the moment it is edited here it graduates
 * to HTML.
 *
 * Sanitizing is an allowlist, applied on save AND on render — tags outside
 * it are unwrapped, event handlers and scripts never survive, style keeps
 * only color. An editor this permissive without that discipline is an XSS
 * door; with it, it is a text box.
 */
import React, { useEffect, useRef, useState } from "react";
import { cleanDesc } from "@/lib/desc-clean";

const ALLOWED = new Set(["B", "STRONG", "I", "EM", "U", "S", "P", "DIV", "BR", "SPAN", "A", "UL", "OL", "LI",
  "TABLE", "TBODY", "THEAD", "TR", "TD", "TH", "IMG", "BLOCKQUOTE", "H1", "H2", "H3", "FONT"]);

/** Allowlist-sanitize a fragment of HTML. Safe to run twice. */
export function sanitizeRich(html: string): string {
  if (typeof window === "undefined") return html;
  const root = document.createElement("div");
  root.innerHTML = html;
  const walk = (el: Element) => {
    for (const child of [...el.children]) walk(child);
    if (!ALLOWED.has(el.tagName)) {
      el.replaceWith(...el.childNodes);
      return;
    }
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase();
      const keep =
        (n === "href" && el.tagName === "A" && /^(https?:|\/)/i.test(attr.value)) ||
        (n === "src" && el.tagName === "IMG" && /^(https?:|\/)/i.test(attr.value)) ||
        (n === "color" && el.tagName === "FONT") ||
        (n === "style" && /^\s*color\s*:[^;]+;?\s*$/i.test(attr.value)) ||
        (n === "style" && el.tagName === "IMG" && /^\s*width:\s*\d{1,3}%\s*;?\s*$/i.test(attr.value)) ||
        (n === "border" && el.tagName === "TABLE");
      if (!keep) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noreferrer"); }
  };
  for (const child of [...root.children]) walk(child);
  /* A HEADING THAT SWALLOWED THE PARAGRAPHS (7 Oct 2026): text pasted while
     the caret sat inside a heading becomes <h2><p>…</p><p>…</p></h2>, and
     every paragraph then wears the heading's size and weight. The first
     paragraph is the heading; the rest come out from under it. */
  for (const h of [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")]) {
    const paras = [...h.querySelectorAll(":scope > p, :scope > div")];
    if (!paras.length) continue;
    const first = paras.shift()!;
    const rest = paras;
    h.textContent = first.textContent?.trim() || h.textContent?.replace(/\s+/g, " ").trim() || "";
    let after: Element = h;
    for (const pEl of rest) { after.insertAdjacentElement("afterend", pEl); after = pEl; }
  }
  return root.innerHTML;
}

/** Does a stored string carry the HTML dress? A leading &nbsp; before the
 *  first tag fooled the old check (Dr Raghu, 30 Aug 2026: "garbled!") — now
 *  any real HTML tag in the text counts. */
export const looksHtml = (s: string) =>
  /^\s*(?:&[a-zA-Z#0-9]{1,8};|\s)*</.test(s || "") ||
  /<(b|strong|i|em|u|p|div|br|span|a|ul|ol|li|table|tbody|tr|td|th|img|h[1-6]|blockquote|font)[\s/>]/i.test(s || "");

/** The legacy markdown-ish, upgraded into editor HTML so old text edits cleanly. */
export function legacyToHtml(md: string): string {
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (x: string) => esc(x)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]*)\]\(([^()\s]+)\)/g, '<a href="$2">$1</a>');
  let html = "", inUl = false;
  for (const line of (md || "").split("\n")) {
    if (/^\s*-\s+/.test(line)) {
      if (!inUl) { html += "<ul>"; inUl = true; }
      html += "<li>" + inline(line.replace(/^\s*-\s+/, "")) + "</li>";
    } else {
      if (inUl) { html += "</ul>"; inUl = false; }
      html += inline(line) + "<br>";
    }
  }
  if (inUl) html += "</ul>";
  return html;
}

/** Rendered rich content: new HTML (sanitized) or the legacy renderer. */
export function RichContent({ text, legacy, thumbs }: { text: string; legacy: (s: string) => React.ReactNode; thumbs?: boolean }) {
  // in comments the image stands SMALL; a click opens it whole
  // (Dr Raghu, 30 Aug 2026)
  const expand = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === "IMG") window.open((t as HTMLImageElement).src, "_blank", "noopener");
  };
  // The ERP's "_place_holder;" never reaches a reader's eye (Dr Raghu,
  // 30 Aug 2026) — swept here, so every rich box in Genie is clean at once.
  const clean = cleanDesc(text);
  if (looksHtml(clean)) {
    return <div className={"rich-html" + (thumbs ? " rich-thumbs" : "")} style={{ lineHeight: 1.6 }}
      role="button" tabIndex={0} onClick={thumbs ? expand : undefined} dangerouslySetInnerHTML={{ __html: sanitizeRich(clean) }} />;
  }
  return <div className={thumbs ? "rich-thumbs" : undefined} role="button" tabIndex={0} onClick={thumbs ? expand : undefined}>{legacy(clean)}</div>;
}

const COLORS = ["var(--navy)", "var(--red)", "var(--accent)", "var(--green)", "var(--blue)", "#7C3AED"];

export default function RichTextEditor({ initial, onSave, onCancel, busy, minHeight = 220, placeholder, onUploadImage, live, onChangeHtml, variables }: {
  /** {{name}} placeholders this text may use — shown as a dropdown on the right of the toolbar */
  variables?: { key: string; what: string }[];
  initial: string; onSave?: (html: string) => void; onCancel?: () => void; busy?: boolean; minHeight?: number; placeholder?: string;
  /** Where a pasted or picked image goes — returns its URL. Without it,
   *  image paste is refused rather than bloating the record with base64. */
  onUploadImage?: (file: File) => Promise<string>;
  /** LIVE mode (30 Aug 2026): no Save/Cancel — every keystroke reports the
   *  HTML up through onChangeHtml. For rich fields inside a bigger form. */
  live?: boolean;
  onChangeHtml?: (html: string) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const mounted = useRef(false);
  // click a picture to select it; 🖼− / 🖼+ walk its width down and up
  // (Dr Raghu, 30 Aug 2026: "increase and decrease size")
  const selImg = useRef<HTMLImageElement | null>(null);
  const pickImg = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (selImg.current) selImg.current.style.outline = "";
    if (t.tagName === "IMG") {
      selImg.current = t as HTMLImageElement;
      selImg.current.style.outline = "3px solid #E8600A";
    } else selImg.current = null;
  };
  const SIZES = [25, 33, 50, 66, 75, 100];
  const resizeImg = (dir: -1 | 1) => {
    const img = selImg.current;
    if (!img) { window.alert("Click a picture first, then − or +."); return; }
    const cur = parseInt(img.style.width || "100", 10) || 100;
    const i = SIZES.reduce((best, v, k) => (Math.abs(v - cur) < Math.abs(SIZES[best] - cur) ? k : best), 0);
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, i + dir))];
    img.style.width = `${next}%`;
  };
  useEffect(() => {
    // live mode seeds ONCE — re-seeding on every reported change would
    // throw the caret to the start with each keystroke
    if (live && mounted.current) return;
    mounted.current = true;
    if (ref.current) ref.current.innerHTML = looksHtml(initial) ? sanitizeRich(initial) : legacyToHtml(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); };
  /* a <select> takes the focus, and with it the caret; keep the range and put it back */
  const savedRange = useRef<Range | null>(null);
  const saveSel = () => { const sel = window.getSelection(); if (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) savedRange.current = sel.getRangeAt(0).cloneRange(); };
  const restoreSel = () => {
    ref.current?.focus();
    const r = savedRange.current; if (!r) return;
    const sel = window.getSelection(); if (!sel) return;
    sel.removeAllRanges(); sel.addRange(r);
  };
  const TB = ({ label, title, onClick, strong, style }: { label: React.ReactNode; title: string; onClick: () => void; strong?: boolean; style?: React.CSSProperties }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className="rounded border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "#fff", fontWeight: strong ? 800 : 500, ...style }}>{label}</button>
  );

  const insertTable = () => {
    const cell = '<td style=""> </td>';
    cmd("insertHTML", `<table className="genie-table" border="1"><tbody>${`<tr>${cell.repeat(3)}</tr>`.repeat(2)}</tbody></table><br>`);
  };
  const fileInput = useRef<HTMLInputElement | null>(null);
  /* EVERY BOX TAKES A PASTED PICTURE (Dr Raghu, 7 Oct 2026: "a provision in
     all the rich text fields where I can paste an image … it can save it on
     the server as a public link"). A screen that has its own place for
     pictures (a record's attachments, a product's images) still uses it;
     every other box sends the picture to /api/rich-image and gets a public
     link back. Nothing is ever kept as a base64 blob in the text. */
  const uploadDefault = async (f: File): Promise<string> => {
    const fd = new FormData(); fd.append("file", f);
    const r = await fetch("/api/rich-image", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "The picture would not upload.");
    return String(j.url);
  };
  const uploadAndInsert = async (f: File) => {
    try { const url = await (onUploadImage ?? uploadDefault)(f); if (url) cmd("insertImage", url); }
    catch (e) { window.alert(e instanceof Error ? e.message : String(e)); }
  };
  const insertPicture = () => fileInput.current?.click();
  const insertPictureByUrl = () => {
    const u = window.prompt("Picture URL (https://…):", "https://");
    if (u && /^(https?:|\/)/i.test(u)) cmd("insertImage", u);
  };
  /* a picture dropped onto the box uploads the same way */
  const onDrop = (e: React.DragEvent) => {
    const f = [...(e.dataTransfer?.files || [])].find((x) => x.type.startsWith("image/"));
    if (f) { e.preventDefault(); void uploadAndInsert(f); }
  };
  // a PASTED image becomes an UPLOAD, never a base64 blob in the database
  const onPaste = (e: React.ClipboardEvent) => {
    const items = [...(e.clipboardData?.items || [])];
    const img = items.find((i) => i.kind === "file" && i.type.startsWith("image/"));
    if (img) {
      e.preventDefault();
      const f = img.getAsFile();
      if (f) void uploadAndInsert(f);
    }
  };

  return (
    <div>
      <div className="flex gap-1 mb-1 flex-wrap" style={{ position: "relative" }}>
        <TB label="B" title="Bold" strong onClick={() => cmd("bold")} />
        <TB label={<i>I</i>} title="Italic" onClick={() => cmd("italic")} />
        <TB label={<u>U</u>} title="Underline" onClick={() => cmd("underline")} />
        <span style={{ width: 4 }} />
        <TB label="• List" title="Bullet list" onClick={() => cmd("insertUnorderedList")} />
        <TB label="1. List" title="Numbered list" onClick={() => cmd("insertOrderedList")} />
        <TB label="⇥" title="Indent in" onClick={() => cmd("indent")} />
        <TB label="⇤" title="Indent out" onClick={() => cmd("outdent")} />
        <span style={{ width: 4 }} />
        <TB label={<span style={{ borderBottom: "3px solid #B3261E" }}>A</span>} title="Text colour" onClick={() => setColorOpen((v) => !v)} />
        {colorOpen && (
          <span className="flex gap-1 items-center rounded border px-1.5 py-1" style={{ borderColor: "var(--line)", background: "#fff" }}>
            {COLORS.map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { cmd("foreColor", c); setColorOpen(false); }}
                style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid #E2E0DA" }} aria-label={c} />
            ))}
          </span>
        )}
        <TB label="🔗 Link" title="Turn the selection into a link" onClick={() => { const u = window.prompt("Link to:", "https://"); if (u) cmd("createLink", u); }} />
        <TB label="🖼 Picture" title="Insert a picture from your computer — or just paste one into the text" onClick={insertPicture} />
        <TB label="🖼 URL" title="Insert a picture by its web address" onClick={insertPictureByUrl} />
        <TB label="⊞ Table" title="Insert a 2×3 table" onClick={insertTable} />
        <TB label="🖼−" title="Shrink the selected picture (click a picture first)" onClick={() => resizeImg(-1)} />
        <TB label="🖼+" title="Grow the selected picture" onClick={() => resizeImg(1)} />
        {/* THE VARIABLES, TO HAND (Dr Raghu, 7 Oct 2026: "show the variables in a
            convenient place so that it can be dropped down on the right side").
            Pick one and {{its_name}} lands where the caret is. */}
        {variables && variables.length > 0 && (
          <select className="ml-auto rounded border px-2 py-0.5 text-xs" style={{ borderColor: "var(--line)", background: "#fff", maxWidth: 260 }}
            value="" onMouseDown={() => { saveSel(); }} title="Insert a variable at the caret — it is filled in when the document is made"
            onChange={(e) => { const k = e.target.value; if (k) { restoreSel(); cmd("insertText", `{{${k}}}`); } e.target.value = ""; }}>
            <option value="">{"{{ variables }} …"}</option>
            {variables.map((v) => <option key={v.key} value={v.key}>{`{{${v.key}}}`} — {v.what}</option>)}
          </select>
        )}
      </div>
      <input ref={fileInput} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadAndInsert(f); e.target.value = ""; }} />
      {/* An editor is not a button. The 5.0.1.0 keyboard pass marked every
          clickable box role="button"; on a contentEditable that made Enter a
          press rather than a new line (Dr Raghu, 6 Sep 2026: "the enter is
          not working in the text box"). */}
      <div ref={ref} contentEditable suppressContentEditableWarning onPaste={onPaste} onDrop={onDrop} onClick={pickImg}
        onInput={live && onChangeHtml ? () => onChangeHtml(ref.current?.innerHTML || "") : undefined}
        data-placeholder={placeholder || ""}
        className="w-full rounded border p-3 text-sm rich-html"
        style={{ borderColor: "var(--accent)", lineHeight: 1.6, minHeight, maxHeight: "calc(100vh - 360px)", overflowY: "auto", outline: "none", background: "#fff" }} />
      {!live && (
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => { if (selImg.current) selImg.current.style.outline = ""; onSave?.(sanitizeRich(ref.current?.innerHTML || "")); }} disabled={!!busy}
          className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: "var(--green)" }}>
          {busy ? "Saving…" : "✓ Save"}
        </button>
        <button onClick={onCancel} className="rounded px-3 py-1 text-xs font-bold" style={{ background: "var(--line-soft)", color: "var(--dim)" }}>Cancel</button>
      </div>
      )}
      {/* the table/img dress, once for every rich box on the page */}
      <style jsx global>{`
        .rich-html table { border-collapse: collapse; margin: 6px 0; }
        .rich-html td, .rich-html th { border: 1px solid #C9C6BD; padding: 4px 8px; min-width: 40px; }
        .rich-html img { max-width: 100%; max-height: 420px; border-radius: 6px; display: block; margin: 6px 0; }
        .rich-html ul { list-style: disc; padding-left: 22px; }
        .rich-html ol { list-style: decimal; padding-left: 22px; }
        .rich-html a { color: #2C5B82; text-decoration: underline; }
        .rich-html blockquote { border-left: 3px solid #E2E0DA; margin: 4px 0; padding-left: 10px; color: #5A6672; }
        .rich-thumbs img { max-height: 120px !important; max-width: 220px !important; cursor: zoom-in; }
      `}</style>
    </div>
  );
}
