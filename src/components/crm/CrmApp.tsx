"use client";

/**
 * NANDAN CRM — the shell.
 *
 * One screen that renders any doctype, because the doctype registry says what
 * the columns are and what the form needs. Dr Raghu's rule -- every doctype
 * can add records -- holds by construction: there is no per-doctype screen
 * that could be built without an Add button.
 *
 * It wears Genie's colours on purpose. Same company, same person using it,
 * one keystroke apart in the address bar; a second visual language would be
 * a cost with nothing bought.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { DOCTYPES, DOCTYPE_GROUPS, type Doctype, type Field } from "@/crm/doctypes";

const PAPER = "#F1EFE9";
const NAVY = "#16232F";
const INK = "#22303C";
const MUTED = "#8A94A0";
const BORDER = "#E2E0DA";
const ORANGE = "#E8600A";

type Row = Record<string, unknown>;
type Links = Record<string, { id: string; label: string }[]>;

export default function CrmApp({ email, displayName }: { email: string; displayName: string | null }) {
  const [slug, setSlug] = useState(DOCTYPES[0].name);
  const [rows, setRows] = useState<Row[]>([]);
  const [links, setLinks] = useState<Links>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const dt = useMemo(() => DOCTYPES.find((d) => d.name === slug) as Doctype, [slug]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const r = await fetch(`/api/crm/${slug}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not load");
      setRows(j.rows);
      setLinks(j.links || {});
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const listFields = dt.fields.filter((f) => f.inList);
  const filtered = q.trim()
    ? rows.filter((r) =>
        JSON.stringify(r).toLowerCase().includes(q.trim().toLowerCase()),
      )
    : rows;

  return (
    <div style={{ minHeight: "100vh", background: PAPER, color: INK }}>
      {/* ---------- header ---------- */}
      <header
        style={{ background: NAVY, position: "sticky", top: 0, zIndex: 40 }}
        className="px-4 py-2.5"
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-baseline gap-3">
            <div className="text-xs font-bold tracking-widest" style={{ color: ORANGE }}>
              NANDAN CRM
              <span
                style={{ background: ORANGE, color: "#fff", borderRadius: 3, padding: "1px 5px", marginLeft: 6 }}
              >
                V 0.1
              </span>
            </div>
            <h1 className="text-white font-bold" style={{ fontSize: 17, lineHeight: 1.2 }}>
              {dt.plural}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-xs font-semibold" style={{ color: "#9FB0C0" }}>
              ← Genie
            </a>
            <span className="text-xs" style={{ color: "#6B7C8C" }}>
              {displayName || email}
            </span>
          </div>
        </div>
      </header>

      <div className="flex" style={{ alignItems: "flex-start" }}>
        {/* ---------- doctype nav ---------- */}
        <nav
          className="p-2"
          style={{
            width: 190, flexShrink: 0, borderRight: `1px solid ${BORDER}`,
            background: "#fff", minHeight: "calc(100vh - 46px)", position: "sticky", top: 46,
          }}
        >
          {DOCTYPE_GROUPS.map((g) => {
            const items = DOCTYPES.filter((d) => d.group === g);
            if (!items.length) return null;
            return (
              <div key={g} className="mb-3">
                <div
                  className="text-xs font-bold px-2 mb-1"
                  style={{ color: MUTED, letterSpacing: 1.1 }}
                >
                  {g.toUpperCase()}
                </div>
                {items.map((d) => (
                  <button
                    key={d.name}
                    onClick={() => { setSlug(d.name); setAdding(false); setQ(""); }}
                    className="w-full text-left px-2 py-1.5 rounded text-sm font-semibold flex items-center gap-2"
                    style={
                      d.name === slug
                        ? { background: NAVY, color: "#fff" }
                        : { color: "#5A6672", background: "transparent" }
                    }
                  >
                    <span style={{ opacity: 0.7, fontSize: 11 }}>{d.icon}</span>
                    {d.plural}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>

        {/* ---------- the doctype ---------- */}
        <main className="p-4 flex-1" style={{ minWidth: 0 }}>
          {dt.blurb && (
            <p className="text-xs mb-3" style={{ color: "#5A6672", maxWidth: "80ch", lineHeight: 1.6 }}>
              {dt.blurb}
            </p>
          )}

          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              onClick={() => setAdding((v) => !v)}
              className="px-3 py-1.5 rounded text-sm font-semibold"
              style={{ background: adding ? "#5A6672" : ORANGE, color: "#fff" }}
            >
              {adding ? "Cancel" : `+ Add ${dt.label}`}
            </button>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${dt.plural.toLowerCase()}`}
              className="px-2 py-1.5 rounded text-sm border"
              style={{ borderColor: BORDER, minWidth: 210 }}
            />
            <span className="text-xs tnum" style={{ color: MUTED }}>
              {loading ? "loading…" : `${filtered.length}${filtered.length !== rows.length ? ` of ${rows.length}` : ""} record${filtered.length === 1 ? "" : "s"}`}
            </span>
          </div>

          {adding && (
            <AddRecord
              dt={dt}
              links={links}
              onDone={() => { setAdding(false); void load(); }}
            />
          )}

          {err && (
            <div
              className="rounded p-3 mb-3 text-sm"
              style={{ background: "#FBEAE8", color: "#8E2C20", border: "1px solid #F0C8C2", maxWidth: "80ch", lineHeight: 1.6 }}
            >
              {err}
            </div>
          )}

          {!err && !loading && filtered.length === 0 && (
            <div
              className="rounded p-6 text-center"
              style={{ background: "#fff", border: `1px dashed ${BORDER}`, color: MUTED }}
            >
              <div className="text-sm font-semibold mb-1">No {dt.plural.toLowerCase()} yet</div>
              <div className="text-xs">
                Press <b style={{ color: ORANGE }}>+ Add {dt.label}</b> to put the first one in.
              </div>
            </div>
          )}

          {filtered.length > 0 && (
            <div className="rounded border" style={{ borderColor: BORDER, background: "#fff", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 520 }}>
                <thead>
                  <tr>
                    {listFields.map((f) => (
                      <th
                        key={f.name}
                        style={{
                          textAlign: "left", padding: "8px 12px", fontSize: 11,
                          letterSpacing: 0.6, color: MUTED, borderBottom: `2px solid ${BORDER}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.label.toUpperCase()}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, i) => (
                    <tr key={String(r.id ?? i)}>
                      {listFields.map((f) => (
                        <td
                          key={f.name}
                          style={{
                            padding: "8px 12px", fontSize: 13, borderBottom: "1px solid #F0EEE8",
                            verticalAlign: "top",
                          }}
                        >
                          <Cell field={f} value={r[f.name]} links={links} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

/** Render one value the way its field type deserves. */
function Cell({ field, value, links }: { field: Field; value: unknown; links: Links }) {
  if (value === null || value === undefined || value === "")
    return <span style={{ color: "#C7CCD2" }}>—</span>;

  if (field.type === "bool")
    return value ? <span style={{ color: "#1E6B3E", fontWeight: 700 }}>Yes</span> : <span style={{ color: MUTED }}>No</span>;

  if (field.type === "link" && field.link) {
    const hit = (links[field.link] || []).find((o) => o.id === String(value));
    return <>{hit ? hit.label : <span style={{ color: MUTED }}>{String(value).slice(0, 8)}…</span>}</>;
  }

  if (field.type === "money")
    return <span className="tnum">₹ {Number(value).toLocaleString("en-IN")}</span>;

  if (field.type === "number") return <span className="tnum">{String(value)}</span>;

  return <>{String(value)}</>;
}

/** The add form. Built from the registry, so it can never miss a field. */
function AddRecord({ dt, links, onDone }: { dt: Doctype; links: Links; onDone: () => void }) {
  const initial = useMemo(() => {
    const o: Record<string, string | boolean> = {};
    for (const f of dt.fields) o[f.name] = (f.default as string | boolean) ?? (f.type === "bool" ? false : "");
    return o;
  }, [dt]);

  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => setForm(initial), [initial]);

  const set = (name: string, v: string | boolean) => setForm((f) => ({ ...f, [name]: v }));

  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch(`/api/crm/${dt.name}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not save");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border p-3 mb-3" style={{ borderColor: ORANGE, background: "#fff" }}>
      <div className="font-bold text-sm mb-2">New {dt.label.toLowerCase()}</div>
      <div
        className="grid gap-3 mb-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))" }}
      >
        {dt.fields.map((f) => (
          <label key={f.name} className="block">
            <div className="text-xs font-semibold mb-1" style={{ color: MUTED }}>
              {f.label}
              {f.required && <span style={{ color: ORANGE }}> *</span>}
            </div>

            {f.type === "bool" ? (
              <label className="flex items-center gap-2 text-sm" style={{ paddingTop: 4 }}>
                <input
                  type="checkbox"
                  checked={!!form[f.name]}
                  onChange={(e) => set(f.name, e.target.checked)}
                />
                <span style={{ color: "#5A6672" }}>{f.label}</span>
              </label>
            ) : f.type === "textarea" ? (
              <textarea
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                rows={3}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER }}
              />
            ) : f.type === "select" ? (
              <select
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER, background: "#fff" }}
              >
                <option value="">—</option>
                {(f.options || []).map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            ) : f.type === "link" ? (
              <select
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER, background: "#fff" }}
              >
                <option value="">—</option>
                {(links[f.link as string] || []).map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ) : (
              <input
                type={f.type === "date" ? "date" : f.type === "number" || f.type === "money" ? "number" : "text"}
                value={String(form[f.name] ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                className="w-full px-2 py-1.5 rounded text-sm border"
                style={{ borderColor: BORDER }}
              />
            )}

            {f.help && (
              <div className="text-xs mt-1" style={{ color: "#A6AEB6", lineHeight: 1.45 }}>{f.help}</div>
            )}
          </label>
        ))}
      </div>

      {err && (
        <div className="text-sm mb-2 rounded p-2" style={{ background: "#FBEAE8", color: "#8E2C20" }}>
          {err}
        </div>
      )}

      <button
        onClick={save}
        disabled={busy}
        className="px-4 py-1.5 rounded text-sm font-semibold"
        style={{ background: busy ? "#B9BEC4" : ORANGE, color: "#fff" }}
      >
        {busy ? "Saving…" : `Save ${dt.label.toLowerCase()}`}
      </button>
    </div>
  );
}
