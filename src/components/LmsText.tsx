"use client";
// Lesson bodies are written as Markdown and rendered to REACT ELEMENTS — never
// through dangerouslySetInnerHTML.
//
// That is the whole reason this file exists rather than a library. Lessons are
// authored by interns and read by the entire company, so a body is untrusted
// text on the way to every screen in the works. Building elements means a
// <script> or an onerror= in a lesson is a paragraph that happens to contain
// angle brackets, and can never be anything else.
//
// Links get the same treatment: only http, https and mailto survive, so a
// javascript: URL in a lesson is printed rather than followed.
import React from "react";

const C = { ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", line: "#E2E0DA", panel: "#F4F2EC", navy: "#1B3A5C" };

const safeHref = (raw: string): string | null => {
  const u = raw.trim();
  return /^(https?:|mailto:)/i.test(u) ? u : null;
};

/** **bold**, *italic*, `code`, [text](url) — inline, in that precedence. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const key = `${keyBase}-i${i++}`;
    if (tok.startsWith("**")) out.push(<b key={key}>{tok.slice(2, -2)}</b>);
    else if (tok.startsWith("`")) out.push(
      <code key={key} style={{ background: C.panel, padding: "1px 4px", borderRadius: 3, fontSize: "0.92em" }}>{tok.slice(1, -1)}</code>,
    );
    else if (tok.startsWith("[")) {
      const cut = tok.indexOf("](");
      const label = tok.slice(1, cut);
      const href = safeHref(tok.slice(cut + 2, -1));
      out.push(
        href
          ? <a key={key} href={href} target="_blank" rel="noreferrer noopener" style={{ color: C.navy, textDecoration: "underline" }}>{label}</a>
          // a link we will not follow is shown as what it said, so nothing
          // silently disappears from a lesson
          : <span key={key}>{label}</span>,
      );
    } else out.push(<i key={key}>{tok.slice(1, -1)}</i>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Headings, bullets, numbers, quotes and paragraphs. Enough for a lesson. */
export default function LmsText({ text, small }: { text: string; small?: boolean }) {
  const src = String(text || "").replace(/\r\n/g, "\n");
  if (!src.trim()) return null;

  const blocks: React.ReactNode[] = [];
  const lines = src.split("\n");
  const fs = small ? 12 : 14;
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) { i++; continue; }

    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      blocks.push(
        <div key={key++} style={{
          fontWeight: 700, color: C.ink, marginTop: key === 1 ? 0 : 10, marginBottom: 3,
          fontSize: level === 1 ? fs + 4 : level === 2 ? fs + 2 : fs,
        }}>
          {inline(h[2], `h${key}`)}
        </div>,
      );
      i++;
      continue;
    }

    if (/^\s*[-*•]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*•]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*•]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} style={{ margin: "4px 0 8px", paddingLeft: 20, listStyle: "disc", color: C.body, fontSize: fs, lineHeight: 1.6 }}>
          {items.map((t, n) => <li key={n} style={{ marginBottom: 2 }}>{inline(t, `u${key}-${n}`)}</li>)}
        </ul>,
      );
      continue;
    }

    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push(
        <ol key={key++} style={{ margin: "4px 0 8px", paddingLeft: 22, listStyle: "decimal", color: C.body, fontSize: fs, lineHeight: 1.6 }}>
          {items.map((t, n) => <li key={n} style={{ marginBottom: 2 }}>{inline(t, `o${key}-${n}`)}</li>)}
        </ol>,
      );
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { quote.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
      blocks.push(
        <blockquote key={key++} style={{ margin: "6px 0", padding: "6px 10px", borderLeft: `3px solid ${C.line}`, background: C.panel, color: C.sub, fontSize: fs, lineHeight: 1.6 }}>
          {quote.join(" ")}
        </blockquote>,
      );
      continue;
    }

    // a paragraph runs to the next blank line
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|\s*[-*•]\s|\s*\d+[.)]\s|\s*>)/.test(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} style={{ margin: "0 0 8px", color: C.body, fontSize: fs, lineHeight: 1.65 }}>
        {inline(para.join(" "), `p${key}`)}
      </p>,
    );
  }

  return <div>{blocks}</div>;
}
