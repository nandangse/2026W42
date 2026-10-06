"use client";
import { useEffect, useState } from "react";
import { api, btn, Card, dmy, Err, H1, input, Loading, P, pill, PrintButton, statusPill, Table, useGet, type Boot, type Col } from "./shared";

/**
 * RFQs — what Nandan wants quoted (Dr Raghu, 6 Oct 2026). The supplier sees
 * each RFQ sent to it: every item, the description, the quantity and unit
 * wanted, the specification; and quotes a rate, the quantity it can supply,
 * the lead time and its own remarks, line by line. Save as it goes; submit
 * when done; revise and submit again until Nandan closes the RFQ.
 */
interface Rfq { id: string; rfq_no: string; title: string; status: string; due_on: string | null; sent_at: string | null; items: number; invited: { org_slug: string; org_name: string; status: string; quoted_at: string | null }[] }
interface Line { id: string; idx: number; item_code: string; item_name: string; description: string; addon: string; qty: number; uom: string; specs: string; required_by: string | null }
interface Quote { rfq_item_id: string; org_slug: string; rate: number | null; qty_offered: number | null; lead_days: number | null; remark: string }

export default function Rfqs({ boot, arg, go }: { boot: Boot; arg: string | null; go: (t: string, a?: string | null) => void }) {
  const slug = boot.scope.slug;
  const list = useGet<{ rfqs: Rfq[]; installed?: boolean }>(`/api/portal/rfq?slug=${encodeURIComponent(slug)}`);
  if (arg) return <One boot={boot} id={arg} back={() => { go("rfqs"); list.reload(); }} />;
  const mine = (r: Rfq) => r.invited.find((i) => i.org_slug === slug);
  const cols: Col<Rfq>[] = [
    { key: "no", label: "RFQ", get: (r) => <b>{r.rfq_no}</b>, sort: (r) => r.rfq_no },
    { key: "t", label: "For", get: (r) => r.title || "—", sort: (r) => r.title },
    { key: "i", label: "Items", get: (r) => r.items, sort: (r) => r.items, num: true },
    { key: "s", label: "Sent", get: (r) => dmy(r.sent_at), sort: (r) => r.sent_at || "" },
    { key: "d", label: "Quote by", get: (r) => dmy(r.due_on), sort: (r) => r.due_on || "" },
    { key: "st", label: "Your quote", get: (r) => (boot.org ? statusPill(mine(r)?.status === "quoted" ? "Quoted" : mine(r)?.status === "declined" ? "Declined" : r.status === "closed" ? "Closed" : "Open") : <span style={{ fontSize: 12 }}>{r.invited.map((i) => `${i.org_name}: ${i.status}`).join(" · ")}</span>) },
  ];
  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <H1 sub={boot.org ? `What Nandan GSE has asked ${boot.org.name} to quote for. Open one to quote line by line.` : "Every RFQ that has gone out, and who has quoted."}>RFQs</H1><PrintButton />
      </div>
      {list.error && <Err e={list.error} />}
      <Card>{list.loading ? <Loading /> : <Table cols={cols} rows={list.data?.rfqs || []} rowKey={(r) => r.id} onRow={(r) => go("rfqs", r.id)} empty="No RFQs yet." />}</Card>
    </div>
  );
}

function One({ boot, id, back }: { boot: Boot; id: string; back: () => void }) {
  const slug = boot.scope.slug;
  const r = useGet<{ rfq: Rfq & { note: string }; invitation: { status: string; remark: string } | null; items: Line[]; quotes: Quote[]; canQuote: boolean }>(`/api/portal/rfq?slug=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`);
  const [draft, setDraft] = useState<Record<string, { rate: string; qty_offered: string; lead_days: string; remark: string }>>({});
  const [remark, setRemark] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!r.data) return;
    const d: typeof draft = {};
    for (const l of r.data.items) {
      const q = r.data.quotes.find((x) => x.rfq_item_id === l.id && (!boot.org || x.org_slug === slug));
      d[l.id] = { rate: q?.rate != null ? String(q.rate) : "", qty_offered: q?.qty_offered != null ? String(q.qty_offered) : String(l.qty), lead_days: q?.lead_days != null ? String(q.lead_days) : "", remark: q?.remark || "" };
    }
    setDraft(d); setRemark(r.data.invitation?.remark || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.data]);
  if (r.error) return <Err e={r.error} />;
  if (!r.data) return <Loading />;
  const { rfq, items, canQuote, invitation } = r.data;
  const save = async (submit: boolean) => {
    setBusy(true); setMsg(null);
    try {
      await api("/api/portal/rfq", { action: "quote", slug, id, submit, remark, lines: items.map((l) => ({ rfq_item_id: l.id, ...draft[l.id] })) });
      setMsg(submit ? "Quote submitted — thank you." : "Saved. Submit when every line is done."); r.reload();
    } catch (e) { setMsg(String((e as Error).message || e)); }
    setBusy(false);
  };
  const decline = async () => {
    if (!confirm("Decline this RFQ? Nandan will see that you are not quoting.")) return;
    try { await api("/api/portal/rfq", { action: "decline", slug, id, remark }); r.reload(); } catch (e) { setMsg(String((e as Error).message || e)); }
  };
  const total = items.reduce((a, l) => a + (Number(draft[l.id]?.rate) || 0) * (Number(draft[l.id]?.qty_offered) || 0), 0);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <H1 sub={`${rfq.title || ""}${rfq.due_on ? ` · quote by ${dmy(rfq.due_on)}` : ""}`}>{rfq.rfq_no}</H1>
        <div style={{ display: "flex", gap: 8 }} className="no-print">
          {invitation && <span style={pill(invitation.status === "quoted" ? P.green : invitation.status === "declined" ? P.red : P.amber, invitation.status === "viewed" || invitation.status === "invited" ? P.ink : "#fff")}>{invitation.status}</span>}
          <button onClick={back} style={btn("ghost")}>← All RFQs</button><PrintButton />
        </div>
      </div>
      {rfq.note && <Card><div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{rfq.note}</div></Card>}
      {items.map((l) => {
        const d = draft[l.id] || { rate: "", qty_offered: "", lead_days: "", remark: "" };
        const set = (k: keyof typeof d, v: string) => setDraft((x) => ({ ...x, [l.id]: { ...d, [k]: v } }));
        return (
          <Card key={l.id} title={<span>{l.idx}. {l.item_name} <span style={{ color: P.muted, fontWeight: 400, fontSize: 12 }}>· {l.item_code}</span></span>}
            right={<span style={{ fontSize: 14, color: P.navy, fontWeight: 700 }}>{l.qty} {l.uom}{l.required_by ? <span style={{ color: P.muted, fontWeight: 400, fontSize: 12 }}> · by {dmy(l.required_by)}</span> : null}</span>}>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{l.description}</div>
            {l.addon && <div style={{ fontSize: 13, marginTop: 6, padding: "6px 10px", background: "#FFF8E6", borderRadius: 8 }}><b>Also: </b>{l.addon}</div>}
            {l.specs && <div style={{ fontSize: 13, marginTop: 6 }}><b>Specification: </b>{l.specs}</div>}
            {(canQuote || r.data!.quotes.length > 0) && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${P.line}` }}>
                <label style={{ fontSize: 12, color: P.dim }}>Rate per {l.uom || "unit"} (₹, before tax)<input style={input} inputMode="decimal" disabled={!canQuote} value={d.rate} onChange={(e) => set("rate", e.target.value)} /></label>
                <label style={{ fontSize: 12, color: P.dim }}>Quantity you can supply<input style={input} inputMode="decimal" disabled={!canQuote} value={d.qty_offered} onChange={(e) => set("qty_offered", e.target.value)} /></label>
                <label style={{ fontSize: 12, color: P.dim }}>Delivery in (days)<input style={input} inputMode="numeric" disabled={!canQuote} value={d.lead_days} onChange={(e) => set("lead_days", e.target.value)} /></label>
                <label style={{ fontSize: 12, color: P.dim, gridColumn: "1 / -1" }}>Your remarks — make, specification offered, any deviation<input style={input} disabled={!canQuote} value={d.remark} onChange={(e) => set("remark", e.target.value)} /></label>
              </div>
            )}
          </Card>
        );
      })}
      {canQuote && (
        <Card>
          <div style={{ display: "grid", gap: 10 }}>
            <label style={{ fontSize: 12, color: P.dim }}>A word on the whole quote — taxes, freight, payment terms, validity<textarea style={{ ...input, minHeight: 60 }} value={remark} onChange={(e) => setRemark(e.target.value)} /></label>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button onClick={() => save(false)} disabled={busy} style={btn("ghost")}>Save</button>
              <button onClick={() => save(true)} disabled={busy} style={btn("primary")}>{invitation?.status === "quoted" ? "Submit again" : "Submit quote"}</button>
              <button onClick={decline} style={btn("ghost", { color: P.red })}>Decline</button>
              <span style={{ flex: 1 }} />
              {total > 0 && <span style={{ fontSize: 13, color: P.dim }}>Quote value <b style={{ color: P.navy }}>₹{Math.round(total).toLocaleString("en-IN")}</b> before tax</span>}
            </div>
            {msg && <div style={{ fontSize: 13, color: /submitted|Saved/.test(msg) ? P.green : P.red }}>{msg}</div>}
          </div>
        </Card>
      )}
    </div>
  );
}
