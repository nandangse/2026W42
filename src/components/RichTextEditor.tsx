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
        (n === "border" && el.tagName === "TABLE");
      if (!keep) el.removeAttribute(attr.name);
    }
    if (el.tagName === "A") { el.setAttribute("target", "_blank"); el.setAttribute("rel", "noreferrer"); }
  };
  for (const child of [...root.children]) walk(child);
  return root.innerHTML;
}

/** Does a stored string carry the new HTML dress? */
export const looksHtml = (s: string) => /^\s*</.test(s || "");

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
export function RichContent({ text, legacy }: { text: string; legacy: (s: string) => React.ReactNode }) {
  if (looksHtml(text)) {
    return <div className="rich-html" style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: sanitizeRich(text) }} />;
  }
  return <>{legacy(text)}</>;
}

const COLORS = ["#16232F", "#B3261E", "#E8600A", "#0D7A3F", "#1B3A5C", "#7C3AED"];

export default function RichTextEditor({ initial, onSave, onCancel, busy, minHeight = 220, placeholder }: {
  initial: string; onSave: (html: string) => void; onCancel: () => void; busy?: boolean; minHeight?: number; placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = looksHtml(initial) ? sanitizeRich(initial) : legacyToHtml(initial);
  }, [initial]);

  const cmd = (c: string, v?: string) => { ref.current?.focus(); document.execCommand(c, false, v); };
  const TB = ({ label, title, onClick, strong, style }: { label: React.ReactNode; title: string; onClick: () => void; strong?: boolean; style?: React.CSSProperties }) => (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={title}
      className="rounded border px-2 py-0.5 text-xs" style={{ borderColor: "#E2E0DA", background: "#fff", fontWeight: strong ? 800 : 500, ...style }}>{label}</button>
  );

  const insertTable = () => {
    const cell = '<td style=""> </td>';
    cmd("insertHTML", `<table border="1"><tbody>${`<tr>${cell.repeat(3)}</tr>`.repeat(2)}</tbody></table><br>`);
  };
  const insertPicture = () => {
    const u = window.prompt("Picture URL (https://…, or an attachment link from this record):", "https://");
    if (u && /^(https?:|\/)/i.test(u)) cmd("insertImage", u);
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
          <span className="flex gap-1 items-center rounded border px-1.5 py-1" style={{ borderColor: "#E2E0DA", background: "#fff" }}>
            {COLORS.map((c) => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()}
                onClick={() => { cmd("foreColor", c); setColorOpen(false); }}
                style={{ width: 16, height: 16, borderRadius: 4, background: c, border: "1px solid #E2E0DA" }} aria-label={c} />
            ))}
          </span>
        )}
        <TB label="🔗 Link" title="Turn the selection into a link" onClick={() => { const u = window.prompt("Link to:", "https://"); if (u) cmd("createLink", u); }} />
        <TB label="🖼 Picture" title="Insert a picture by URL" onClick={insertPicture} />
        <TB label="⊞ Table" title="Insert a 2×3 table" onClick={insertTable} />
      </div>
      <div ref={ref} contentEditable suppressContentEditableWarning
        data-placeholder={placeholder || ""}
        className="w-full rounded border p-3 text-sm rich-html"
        style={{ borderColor: "#E8600A", lineHeight: 1.6, minHeight, maxHeight: "calc(100vh - 360px)", overflowY: "auto", outline: "none", background: "#fff" }} />
      <div className="flex gap-2 mt-1.5">
        <button onClick={() => onSave(sanitizeRich(ref.current?.innerHTML || ""))} disabled={!!busy}
          className="rounded px-3 py-1 text-xs font-bold text-white" style={{ background: "#0D7A3F" }}>
          {busy ? "Saving…" : "✓ Save"}
        </button>
        <button onClick={onCancel} className="rounded px-3 py-1 text-xs font-bold" style={{ background: "#EFEDE7", color: "#5A6672" }}>Cancel</button>
      </div>
      {/* the table/img dress, once for every rich box on the page */}
      <style jsx global>{`
        .rich-html table { border-collapse: collapse; margin: 6px 0; }
        .rich-html td, .rich-html th { border: 1px solid #C9C6BD; padding: 4px 8px; min-width: 40px; }
        .rich-html img { max-width: 100%; max-height: 420px; border-radius: 6px; display: block; margin: 6px 0; }
        .rich-html ul { list-style: disc; padding-left: 22px; }
        .rich-html ol { list-style: decimal; padding-left: 22px; }
        .rich-html a { color: #2C5B82; text-decoration: underline; }
        .rich-html blockquote { border-left: 3px solid #E2E0DA; margin: 4px 0; padding-left: 10px; color: #5A6672; }
      `}</style>
    </div>
  );
}
