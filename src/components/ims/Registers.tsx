"use client";

import { useState } from "react";
import {
  Area, Btn, Chip, Empty, Label, Modal, Note, Screen, Select, TableBox, Td, Text, Th,
  fmtD, post, statusColour, useLoad, BORDER, INK, MUTED,
} from "./ui";
import { SYS, isAdmin, isHead, type Boot, type Row } from "./types";

/**
 * The register engine, wearing whichever register you opened.
 *
 * The table below is not written for the Risk Register or the HIRA. It is
 * written for the `columns` array, and it renders whatever that array says.
 * Adding the PPE Issue register, the work permits or the hazardous-waste
 * manifest is filling in a form, not a deploy — which is the whole reason the
 * design insisted on one engine rather than fourteen screens.
 */
type Column = {
  key: string; label: string; type: string; options?: string[]; required?: boolean;
  product?: string[]; level_of?: string;
};
const TYPES = ["text", "short", "number", "date", "select", "bool", "user", "file", "link"];

const lead = (v: unknown): number | null => {
  const m = String(v ?? "").match(/^\s*(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};
const band = (n: number) => (n <= 4 ? "Low" : n <= 9 ? "Medium" : n <= 15 ? "High" : "Extreme");
/** Inherent risk = impact x probability, the aspect score = Q x I x O x C x D, the level bands — worked out as you type; the server does the same. */
function derive(cols: Column[], data: Record<string, unknown>) {
  const d = { ...data };
  for (const c of cols) if (c.product?.length) {
    const parts = c.product.map((k) => lead(d[k]));
    d[c.key] = parts.every((n) => n !== null) ? parts.reduce((a, n) => a * (n as number), 1) : null;
  }
  for (const c of cols) if (c.level_of) { const n = lead(d[c.level_of]); d[c.key] = n === null ? null : band(n); }
  return d;
}
const LEVEL_COLOUR: Record<string, string> = { Low: "#1A7F4E", Medium: "#B7791F", High: "#C2410C", Extreme: "var(--red)" };

export default function Registers({ boot }: { boot: Boot }) {
  const [slug, setSlug] = useState<string | null>(null);
  const [list, busy, reloadList] = useLoad<{ installed: boolean; rows: Row[]; canDefine: boolean }>("/api/ims/register");

  if (slug) return <RegisterView slug={slug} boot={boot} onBack={() => { setSlug(null); reloadList(); }} />;

  return (
    <Screen
      title="Registers"
      blurb="One engine, many registers. The MR defines the columns; the engine does the rest — so a new register is data, not a deploy."
      action={isAdmin(boot.role) ? <DefineButton onDone={reloadList} /> : undefined}
    >
      {list && !list.installed && <Note kind="warn">Run the IMS migrations first.</Note>}
      {busy ? <Empty>Reading…</Empty> : (list?.rows ?? []).length === 0 ? <Empty>No registers defined.</Empty> : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {(list?.rows ?? []).map((r) => (
            <button key={r.id} onClick={() => setSlug(String(r.slug))}
              className="text-left bg-white rounded-lg border p-3" style={{ borderColor: BORDER }}>
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm font-bold" style={{ color: INK }}>{String(r.name)}</div>
                {r.sys ? <Chip text={String(r.sys)} colour="#1B2D6B" /> : null}
              </div>
              <div className="text-xs mt-1" style={{ color: MUTED, lineHeight: 1.5 }}>{String(r.description || "")}</div>
              {r.is_system ? <div className="text-xs mt-1.5 font-bold" style={{ color: MUTED }}>System register — editable, not deletable</div> : null}
            </button>
          ))}
        </div>
      )}
    </Screen>
  );
}

// ------------------------------------------------------------- one register

function RegisterView({ slug, boot, onBack }: { slug: string; boot: Boot; onBack: () => void }) {
  const [d, busy, reload, err] = useLoad<{ installed: boolean; definition: Row; entries: Row[]; canDefine: boolean }>(
    `/api/ims/register?slug=${encodeURIComponent(slug)}`,
  );
  const [edit, setEdit] = useState<Record<string, unknown> | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [defining, setDefining] = useState(false);
  const [q, setQ] = useState("");
  const [pick, setPick] = useState("");

  const def = d?.definition;
  const cols = ((def?.columns as Column[]) ?? []);
  const all = d?.entries ?? [];
  // The first select column (Scope on the HIRA, Assessment on the aspects) is
  // the natural filter; the search box reads every value.
  const pickCol = cols.find((c) => c.type === "select");
  const needle = q.trim().toLowerCase();
  const entries = all.filter((e) => {
    const data = (e.data as Record<string, unknown>) ?? {};
    if (pick && pickCol && String(data[pickCol.key] ?? "") !== pick) return false;
    if (!needle) return true;
    return Object.values(data).some((v) => String(v ?? "").toLowerCase().includes(needle));
  });

  const draw = (c: Column, v: unknown) => {
    if (v === null || v === undefined || v === "") return <span style={{ color: MUTED }}>—</span>;
    if (c.level_of) return <Chip text={String(v)} colour={LEVEL_COLOUR[String(v)] ?? "#6B7280"} />;
    if (c.type === "link") return <a href={String(v)} target="_blank" rel="noreferrer" className="font-bold hover:underline" style={{ color: "#1B2D6B" }} onClick={(e) => e.stopPropagation()}>open ↗</a>;
    if (c.type === "bool") return <Chip text={v ? "Yes" : "No"} colour={v ? "#1A7F4E" : "#6B7280"} />;
    if (c.type === "date") return fmtD(v);
    if (c.type === "user") return boot.people.find((p) => p.id === v)?.full_name ?? String(v);
    return String(v);
  };

  const save = async () => {
    if (!edit || !def) return;
    const r = await post("/api/ims/register", {
      action: editId ? "entry_update" : "entry_add",
      register_id: def.id, id: editId,
      data: edit.data, status: edit.status, owner_id: edit.owner_id || null, review_date: edit.review_date || null,
    });
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    setEdit(null); reload();
  };

  const remove = async () => {
    if (!editId || !def) return;
    const r = await post("/api/ims/register", { action: "entry_delete", register_id: def.id, id: editId });
    if (!r.ok) { setMsg(r.error || "Could not delete."); return; }
    setEdit(null); reload();
  };

  const open = (e?: Row) => {
    setMsg("");
    setEditId(e?.id ?? null);
    setEdit({
      data: e ? { ...(e.data as Record<string, unknown>) } : {},
      status: e ? String(e.status ?? "open") : "open",
      owner_id: e ? String(e.owner_id ?? "") : "",
      review_date: e ? String(e.review_date ?? "").slice(0, 10) : "",
    });
  };

  if (busy || !def)
    return <Screen title="Register"><Btn onClick={onBack}>← All registers</Btn><div className="mt-3"><Empty>{err || "Reading…"}</Empty></div></Screen>;

  return (
    <Screen
      title={String(def.name)}
      blurb={String(def.description || "")}
      action={
        <>
          <Btn onClick={onBack}>← All registers</Btn>
          {isAdmin(boot.role) && <Btn onClick={() => setDefining(true)}>Columns</Btn>}
          <Btn kind="primary" onClick={() => open()}>+ Entry</Btn>
        </>
      }
    >
      {msg && <Note kind="error">{msg}</Note>}
      {all.length > 0 && (
        <div className="flex gap-2 items-center flex-wrap mb-2">
          {pickCol && <div style={{ minWidth: 220 }}><Select value={pick} onChange={setPick} blank={`All — ${pickCol.label}`} options={pickCol.options ?? []} /></div>}
          <div style={{ minWidth: 220 }}><Text value={q} onChange={setQ} placeholder="Search this register" /></div>
          <div className="text-xs font-bold" style={{ color: MUTED }}>{entries.length} of {all.length}</div>
        </div>
      )}
      {all.length === 0 ? <Empty>Nothing recorded in this register yet.</Empty> : entries.length === 0 ? <Empty>Nothing matches.</Empty> : (
        <TableBox min={Math.max(560, 140 * cols.length)}>
          <thead>
            <tr>
              {cols.map((c) => (<Th key={c.key}>{c.label}</Th>))}
              <Th>Status</Th><Th>Owner</Th><Th>Review</Th><Th />
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => {
              const data = (e.data as Record<string, unknown>) ?? {};
              return (
                <tr key={e.id}>
                  {cols.map((c) => (<Td key={c.key} wrap={c.type === "text"}>{draw(c, data[c.key])}</Td>))}
                  <Td><Chip text={String(e.status ?? "open")} colour={statusColour(String(e.status ?? ""))} /></Td>
                  <Td>{boot.people.find((p) => p.id === e.owner_id)?.full_name ?? "—"}</Td>
                  <Td>{fmtD(e.review_date)}</Td>
                  <Td><button onClick={() => open(e)} className="font-bold" style={{ color: INK }}>Edit</button></Td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}

      {edit && (
        <Modal onClose={() => setEdit(null)} title={editId ? "Edit entry" : `Add to ${String(def.name)}`} width={720}>
          {msg && <Note kind="error">{msg}</Note>}
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            {cols.map((c) => {
              const data = edit.data as Record<string, unknown>;
              const set = (v: unknown) => setEdit({ ...edit, data: derive(cols, { ...data, [c.key]: v }) });
              const val = data[c.key];
              const computed = !!(c.product?.length || c.level_of);
              return (
                <div key={c.key} style={{ gridColumn: c.type === "text" ? "1/-1" : undefined }}>
                  <Label>{c.label}{c.required ? " *" : ""}{computed ? " (worked out)" : ""}</Label>
                  {computed ? <div className="text-sm font-bold py-1.5" style={{ color: INK }}>{c.level_of && val ? <Chip text={String(val)} colour={LEVEL_COLOUR[String(val)] ?? "#6B7280"} /> : String(val ?? "—")}</div>
                    : c.type === "select" ? <Select value={String(val ?? "")} onChange={set} options={c.options ?? []} />
                    : c.type === "user" ? <Select value={String(val ?? "")} onChange={set} options={boot.people.map((p) => ({ value: p.id, label: p.full_name }))} />
                    : c.type === "bool" ? <Select value={val === true ? "true" : val === false ? "false" : ""} onChange={(v) => set(v === "true")} options={[{ value: "true", label: "Yes" }, { value: "false", label: "No" }]} />
                    : c.type === "date" ? <Text type="date" value={String(val ?? "").slice(0, 10)} onChange={set} />
                    : c.type === "number" ? <Text type="number" value={String(val ?? "")} onChange={set} />
                    : c.type === "text" ? <Area rows={2} value={String(val ?? "")} onChange={set} />
                    : <Text value={String(val ?? "")} onChange={set} />}
                </div>
              );
            })}
            <div>
              <Label>Status</Label>
              <Select value={String(edit.status ?? "open")} onChange={(v) => setEdit({ ...edit, status: v })} blank="Open"
                options={["open", "in_progress", "closed"]} />
            </div>
            <div>
              <Label>Owner</Label>
              <Select value={String(edit.owner_id ?? "")} onChange={(v) => setEdit({ ...edit, owner_id: v })}
                options={boot.people.map((p) => ({ value: p.id, label: p.full_name }))} />
            </div>
            <div>
              <Label>Review date</Label>
              <Text type="date" value={String(edit.review_date ?? "")} onChange={(v) => setEdit({ ...edit, review_date: v })} />
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            <Btn kind="primary" onClick={save}>{editId ? "Save" : "Add"}</Btn>
            <Btn onClick={() => setEdit(null)}>Cancel</Btn>
            {editId && isHead(boot.role) && <Btn kind="danger" onClick={remove}>Delete</Btn>}
          </div>
        </Modal>
      )}

      {defining && (
        <ColumnBuilder
          definition={def}
          onClose={() => setDefining(false)}
          onSaved={() => { setDefining(false); reload(); }}
        />
      )}
    </Screen>
  );
}

// --------------------------------------------------------- the column builder

function ColumnBuilder({ definition, onClose, onSaved }: {
  definition: Row; onClose: () => void; onSaved: () => void;
}) {
  const [name, setName] = useState(String(definition.name ?? ""));
  const [sys, setSys] = useState(String(definition.sys ?? ""));
  const [description, setDescription] = useState(String(definition.description ?? ""));
  const [cols, setCols] = useState<Column[]>(((definition.columns as Column[]) ?? []).map((c) => ({ ...c })));
  const [msg, setMsg] = useState("");

  const set = (i: number, patch: Partial<Column>) =>
    setCols(cols.map((c, j) => (i === j ? { ...c, ...patch } : c)));

  const save = async () => {
    const r = await post("/api/ims/register", {
      action: "define_update", id: definition.id,
      row: { name, sys, description, columns: cols },
    });
    if (!r.ok) { setMsg(r.error || "Could not save."); return; }
    onSaved();
  };

  return (
    <Modal onClose={onClose} title={`Columns — ${String(definition.name)}`} width={780}>
      {msg && <Note kind="error">{msg}</Note>}
      {definition.is_system ? (
        <Note>This is a system register. Its columns can be changed, but it cannot be deleted — an auditor asking for it must never be told somebody removed it.</Note>
      ) : null}
      <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div><Label>Name</Label><Text value={name} onChange={setName} /></div>
        <div><Label>System</Label><Select value={sys} onChange={setSys} options={SYS} /></div>
        <div style={{ gridColumn: "1/-1" }}><Label>Description</Label><Area rows={2} value={description} onChange={setDescription} /></div>
      </div>

      {cols.map((c, i) => (
        <div key={i} className="rounded border p-2 mb-2" style={{ borderColor: BORDER }}>
          <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <div><Label>Key</Label><Text value={c.key} onChange={(v) => set(i, { key: v.toLowerCase().replace(/[^a-z0-9_]/g, "_") })} /></div>
            <div><Label>Label</Label><Text value={c.label} onChange={(v) => set(i, { label: v })} /></div>
            <div><Label>Type</Label><Select value={c.type} onChange={(v) => set(i, { type: v })} blank="text" options={TYPES} /></div>
            {c.product?.length ? <div className="text-xs" style={{ color: MUTED, gridColumn: "1/-1" }}>Worked out: {c.product.join(" x ")}</div> : null}
            {c.level_of ? <div className="text-xs" style={{ color: MUTED, gridColumn: "1/-1" }}>Worked out: band of {c.level_of} (1-4 Low, 5-9 Medium, 10-15 High, 16+ Extreme)</div> : null}
            {c.type === "select" && (
              <div style={{ gridColumn: "1/-1" }}>
                <Label>Options (comma separated)</Label>
                <Text value={(c.options ?? []).join(", ")} onChange={(v) => set(i, { options: v.split(",").map((x) => x.trim()).filter(Boolean) })} />
              </div>
            )}
          </div>
          <div className="flex gap-3 items-center mt-2">
            <label className="text-xs font-bold flex items-center gap-1.5" style={{ color: MUTED }}>
              <input type="checkbox" checked={!!c.required} onChange={(e) => set(i, { required: e.target.checked })} />
              Required
            </label>
            <button onClick={() => setCols(cols.filter((_, j) => j !== i))} className="text-xs font-bold" style={{ color: "var(--red)" }}>
              Remove column
            </button>
          </div>
        </div>
      ))}

      <div className="flex gap-2 mt-3 flex-wrap">
        <Btn onClick={() => setCols([...cols, { key: `col_${cols.length + 1}`, label: "New column", type: "text" }])}>+ Column</Btn>
        <Btn kind="primary" onClick={save}>Save</Btn>
        <Btn onClick={onClose}>Cancel</Btn>
      </div>
      <Note>Renaming a column&apos;s <b>key</b> orphans what is already stored under the old key. Change the label freely; change the key only on an empty register.</Note>
    </Modal>
  );
}

// ------------------------------------------------------------ a new register

function DefineButton({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sys, setSys] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState("");

  const create = async () => {
    const r = await post("/api/ims/register", {
      action: "define_add",
      row: { name, sys, description, columns: [{ key: "item", label: "Item", type: "text", required: true }] },
    });
    if (!r.ok) { setMsg(r.error || "Could not create."); return; }
    setOpen(false); setName(""); setSys(""); setDescription(""); onDone();
  };

  return (
    <>
      <Btn kind="primary" onClick={() => { setOpen(true); setMsg(""); }}>+ New register</Btn>
      {open && (
        <Modal onClose={() => setOpen(false)} title="New register">
          {msg && <Note kind="error">{msg}</Note>}
          <Note>It starts with one column. Add the rest with <b>Columns</b> once it is open — PPE issue, work permits, mock drills, hazardous waste, the statutory equipment tests: all of them are this same form.</Note>
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <div style={{ gridColumn: "1/-1" }}><Label>Name</Label><Text value={name} onChange={setName} placeholder="PPE Issue Register" /></div>
            <div><Label>System</Label><Select value={sys} onChange={setSys} options={SYS} /></div>
            <div style={{ gridColumn: "1/-1" }}><Label>Description</Label><Area rows={2} value={description} onChange={setDescription} /></div>
          </div>
          <div className="flex gap-2 mt-4"><Btn kind="primary" onClick={create}>Create</Btn><Btn onClick={() => setOpen(false)}>Cancel</Btn></div>
        </Modal>
      )}
    </>
  );
}
