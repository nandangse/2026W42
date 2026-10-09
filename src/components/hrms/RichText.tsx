"use client";
/**
 * The rich-text editor, for the fields that are asked to be rich text.
 *
 * Plain text stays the default everywhere else (Dr Raghu's rule). This is for
 * the places where structure carries meaning — a job description with three
 * bullets is a different document from the same words in a paragraph.
 *
 * NO EDITOR LIBRARY. TipTap, Quill or Slate would each add several hundred
 * kilobytes to every page of HRIS for a toolbar of six buttons, and would put
 * a dependency in the way of a field somebody has to be able to fix in five
 * years. contentEditable with execCommand is deprecated in the specification
 * and implemented by every browser this company uses; when it is genuinely
 * withdrawn, this file is the only thing that changes.
 *
 * WHAT COMES OUT IS HTML, so it is cleaned twice: here, on the way out of the
 * editor, and again on the server before it is stored. The people who can
 * reach HRIS are trusted; the rule that stored markup is scrubbed before it is
 * rendered is not about them.
 */
import { useEffect, useRef, useState } from "react";
import { safeHtml } from "@/lib/safe-html";

const C = { line: "var(--line)", dim: "var(--dim)", faint: "var(--muted)" };

/** Strip anything that could execute. One sanitiser for the whole app now (src/lib/safe-html.ts). */
export const cleanHtml = (html: string): string => safeHtml(html);

/** True when the markup carries nothing a person would call content. */
export const isEmptyHtml = (html: string) =>
  !String(html || "").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

const BUTTONS: [string, string, string][] = [
  ["bold", "B", "Bold"],
  ["italic", "I", "Italic"],
  ["underline", "U", "Underline"],
  ["insertUnorderedList", "•", "Bullet list"],
  ["insertOrderedList", "1.", "Numbered list"],
];

export default function RichText({
  value,
  onSave,
  rows = 4,
  placeholder,
}: {
  value: string;
  /** Fired when focus leaves and the markup actually changed. */
  onSave: (html: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const startRef = useRef(value);

  // Only write into the node when the value arrives from OUTSIDE. Setting
  // innerHTML while somebody is typing throws the caret to the start, which
  // is the classic way these editors are made unusable.
  useEffect(() => {
    if (ref.current && !focused && ref.current.innerHTML !== (value || "")) {
      ref.current.innerHTML = value || "";
    }
  }, [value, focused]);

  const cmd = (c: string) => {
    ref.current?.focus();
    // eslint-disable-next-line deprecation/deprecation
    document.execCommand(c, false);
  };

  const link = () => {
    const url = window.prompt("Link to what? (leave empty to remove the link)");
    ref.current?.focus();
    // eslint-disable-next-line deprecation/deprecation
    if (url === null) return;
    // eslint-disable-next-line deprecation/deprecation
    if (!url.trim()) document.execCommand("unlink", false);
    // eslint-disable-next-line deprecation/deprecation
    else document.execCommand("createLink", false, url.trim());
  };

  const commit = () => {
    setFocused(false);
    const html = cleanHtml(ref.current?.innerHTML || "");
    const out = isEmptyHtml(html) ? "" : html;
    if (out !== (startRef.current || "")) {
      startRef.current = out;
      onSave(out);
    }
  };

  return (
    <div className="rounded" style={{ border: `1px solid ${focused ? "var(--accent)" : C.line}`, background: "#fff" }}>
      <div className="flex items-center gap-0.5 px-1 py-1" style={{ borderBottom: `1px solid ${C.line}`, background: "#F8F7F3" }}>
        {BUTTONS.map(([c, label, title]) => (
          <button key={c} type="button" title={title}
            // mousedown, not click: click would take the selection away first
            onMouseDown={(e) => { e.preventDefault(); cmd(c); }}
            className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ color: C.dim, minWidth: 22 }}>
            {label}
          </button>
        ))}
        <button type="button" title="Link" onMouseDown={(e) => { e.preventDefault(); link(); }}
          className="rounded px-1.5 py-0.5 text-xs font-bold" style={{ color: C.dim }}>🔗</button>
        <button type="button" title="Remove formatting"
          onMouseDown={(e) => { e.preventDefault(); cmd("removeFormat"); }}
          className="rounded px-1.5 py-0.5 text-xs" style={{ color: C.faint }}>✕ format</button>
        <span className="ml-auto pr-1" style={{ fontSize: 10, color: C.faint }}>
          {focused ? "saves when you click away" : "rich text"}
        </span>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => { setFocused(true); startRef.current = cleanHtml(ref.current?.innerHTML || ""); }}
        onBlur={commit}
        data-placeholder={placeholder || ""}
        className="hrms-rte text-xs px-2 py-1.5"
        style={{ minHeight: rows * 18 + 12, outline: "none", lineHeight: 1.6 }}
      />
    </div>
  );
}

/** Read-only rendering of what the editor produced. */
export function RichTextView({ html }: { html: string | null }) {
  if (!html || isEmptyHtml(html)) return <span style={{ color: "#C9C6BD" }}>—</span>;
  return (
    <div className="hrms-rte text-xs" style={{ lineHeight: 1.6 }}
      dangerouslySetInnerHTML={{ __html: cleanHtml(html) }} />
  );
}
