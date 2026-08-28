/**
 * The Tally XML parser that runs IN THE BROWSER (Dr Raghu, 28 Aug 2026: the
 * file bypasses Vercel and Supabase — the browser reads it and sends only
 * rows). Same state machine as scripts/kuber-parse-tally.mjs, proven against
 * the real 407 MB Master.xml and 94 MB Transactions.xml; the one-line-empty-
 * list trap and the nested ACCOUNTINGALLOCATIONS are both handled.
 *
 * Streams the File in chunks, decodes UTF-16LE, and hands rows out in
 * batches with a progress fraction the screen can wear.
 */

const unesc = (s: string) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const num = (s: string) => { const v = parseFloat(String(s).replace(/,/g, "")); return Number.isFinite(v) ? v : 0; };
const tallyDate = (s: string) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const creditDays = (s: string) => { const m = String(s || "").match(/(\d+)/); return m ? Number(m[1]) : null; };
const tagText = (line: string, tag: string) => {
  const m = line.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? unesc(m[1]) : null;
};
const attr = (line: string, name: string) => {
  const m = line.match(new RegExp(`${name}="([^"]*)"`));
  return m ? unesc(m[1]) : null;
};
const uuid = () => crypto.randomUUID();

export type Row = Record<string, unknown>;
export type BatchSink = (table: string, rows: Row[]) => Promise<void>;

/** Stream a UTF-16LE file line by line with byte progress. */
async function eachLine(file: File, onLine: (l: string) => void, onProgress: (frac: number) => void) {
  const reader = file.stream().getReader();
  const dec = new TextDecoder("utf-16le");
  let read = 0, left = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    read += value.byteLength;
    const text = left + dec.decode(value, { stream: true });
    const parts = text.split("\n");
    left = parts.pop() ?? "";
    for (const p of parts) onLine(p.replace(/^﻿/, "").trim());
    onProgress(read / file.size);
  }
  if (left.trim()) onLine(left.trim());
  onProgress(1);
}

/** A batcher that flushes 500 rows at a time and drains fully at the end. */
function batcher(sink: BatchSink) {
  const buf = new Map<string, Row[]>();
  let chain = Promise.resolve();
  const push = (table: string, row: Row) => {
    const rows = buf.get(table) ?? [];
    rows.push(row);
    buf.set(table, rows);
    if (rows.length >= 500) {
      const send = rows.splice(0, rows.length);
      chain = chain.then(() => sink(table, send));
    }
  };
  const drain = async () => {
    await chain;
    for (const [table, rows] of buf) if (rows.length) await sink(table, rows.splice(0, rows.length));
  };
  return { push, drain };
}

export async function parseMastersInBrowser(file: File, sink: BatchSink, onProgress: (frac: number) => void) {
  const stamp = new Date().toISOString();
  const b = batcher(sink);
  let led: { id: string; name: string; parent: string; opening: number; closing: number } | null = null;
  let inBill = false;
  let bill: Row | null = null;
  let ledgers = 0, bills = 0;
  await eachLine(file, (line) => {
    if (line.startsWith("<LEDGER ")) {
      led = { id: uuid(), name: attr(line, "NAME") || "", parent: "", opening: 0, closing: 0 };
      return;
    }
    if (!led) return;
    if (line.startsWith("</LEDGER>")) {
      b.push("kuber_ledger", { ...led, loaded_at: stamp });
      ledgers++; led = null; inBill = false;
      return;
    }
    if (line.startsWith("<BILLALLOCATIONS.LIST>")) {
      if (line.includes("</BILLALLOCATIONS.LIST>")) return; // empty, one line
      inBill = true;
      bill = { ledger: led.name, bill: "", bill_date: null, amount: 0, credit_days: null };
      return;
    }
    if (line.startsWith("</BILLALLOCATIONS.LIST>")) {
      if (bill && bill.bill) { b.push("kuber_opening_bill", bill); bills++; }
      inBill = false; bill = null;
      return;
    }
    if (inBill && bill) {
      const n = tagText(line, "NAME"); if (n !== null) bill.bill = n;
      const d = tagText(line, "BILLDATE"); if (d !== null) bill.bill_date = tallyDate(d);
      const ob = tagText(line, "OPENINGBALANCE"); if (ob !== null) bill.amount = num(ob);
      const cp = tagText(line, "BILLCREDITPERIOD"); if (cp !== null) bill.credit_days = creditDays(cp);
      return;
    }
    const p = tagText(line, "PARENT"); if (p !== null) { led.parent = p; return; }
    const ob = tagText(line, "OPENINGBALANCE"); if (ob !== null) { led.opening = num(ob); return; }
    const cb = tagText(line, "CLOSINGBALANCE"); if (cb !== null) { led.closing = num(cb); return; }
  }, onProgress);
  await b.drain();
  return { ledgers, bills };
}

export async function parseTransactionsInBrowser(file: File, sink: BatchSink, onProgress: (frac: number) => void) {
  const stamp = new Date().toISOString();
  const b = batcher(sink);
  const LEDGER_SETS = new Set(["ALLLEDGERENTRIES", "LEDGERENTRIES", "ACCOUNTINGALLOCATIONS"]);
  let v: { id: string; date: string | null; vtype: string; vno: string; party: string; narration: string } | null = null;
  let inAlloc = false, otherDepth = 0;
  let alloc: Row | null = null;
  const stack: { id: string; voucher_id: string; ledger: string; amount: number }[] = [];
  let vouchers = 0, lines = 0, allocs = 0;
  const listTag = (line: string) => {
    const m = line.match(/^<(\/?)([A-Z.]+)\.LIST[ >]/);
    if (!m) return null;
    if (m[1] !== "/" && line.includes(`</${m[2]}.LIST>`)) return { selfClosed: true as const, close: false, name: m[2] };
    return { selfClosed: false as const, close: m[1] === "/", name: m[2] };
  };
  await eachLine(file, (line) => {
    if (line.startsWith("<VOUCHER ")) {
      v = { id: uuid(), date: null, vtype: attr(line, "VCHTYPE") || "", vno: "", party: "", narration: "" };
      return;
    }
    if (!v) return;
    if (line.startsWith("</VOUCHER>")) {
      b.push("kuber_voucher", { ...v, loaded_at: stamp });
      vouchers++; v = null; stack.length = 0; inAlloc = false; otherDepth = 0;
      return;
    }
    if (inAlloc && alloc) {
      if (line.startsWith("</BILLALLOCATIONS.LIST>")) {
        if (alloc.bill) { b.push("kuber_bill_alloc", alloc); allocs++; }
        inAlloc = false; alloc = null;
        return;
      }
      const n = tagText(line, "NAME"); if (n !== null) alloc.bill = n;
      const bt = tagText(line, "BILLTYPE"); if (bt !== null) alloc.billtype = bt;
      const am = tagText(line, "AMOUNT"); if (am !== null) alloc.amount = num(am);
      const cp = tagText(line, "BILLCREDITPERIOD"); if (cp !== null) alloc.credit_days = creditDays(cp);
      return;
    }
    const lt = listTag(line);
    if (lt) {
      if (lt.selfClosed) return;
      if (lt.name === "BILLALLOCATIONS" && !lt.close && stack.length) {
        inAlloc = true;
        alloc = { voucher_id: v.id, ledger: stack[stack.length - 1].ledger, bill: "", billtype: "", amount: 0, credit_days: null, date: v.date };
        return;
      }
      if (LEDGER_SETS.has(lt.name)) {
        if (lt.close) {
          const e = stack.pop();
          if (e && e.ledger) { b.push("kuber_voucher_line", e as unknown as Row); lines++; }
        } else {
          stack.push({ id: uuid(), voucher_id: v.id, ledger: "", amount: 0 });
        }
        return;
      }
      if (stack.length) otherDepth += lt.close ? -1 : 1;
      if (otherDepth < 0) otherDepth = 0;
      return;
    }
    if (stack.length && otherDepth === 0) {
      const e = stack[stack.length - 1];
      const ln = tagText(line, "LEDGERNAME"); if (ln !== null) { e.ledger = ln; return; }
      const am = tagText(line, "AMOUNT"); if (am !== null) { e.amount = num(am); return; }
      return;
    }
    if (stack.length) return;
    const d = tagText(line, "DATE"); if (d !== null && !v.date) { v.date = tallyDate(d); return; }
    const pn = tagText(line, "PARTYLEDGERNAME"); if (pn !== null) { v.party = pn; return; }
    const vn = tagText(line, "VOUCHERNUMBER"); if (vn !== null) { v.vno = vn; return; }
    const na = tagText(line, "NARRATION"); if (na !== null) { v.narration = na.slice(0, 500); return; }
  }, onProgress);
  await b.drain();
  return { vouchers, lines, allocs };
}
