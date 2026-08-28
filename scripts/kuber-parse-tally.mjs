/**
 * kuber-parse-tally.mjs — turn the two Tally XML exports into Kuber's tables
 * (Dr Raghu, 28 Aug 2026: "this data should be used for management decisions").
 *
 *   node scripts/kuber-parse-tally.mjs --masters "<Master.xml>" --transactions "<Transactions.xml>" --dry
 *   node scripts/kuber-parse-tally.mjs --masters ... --transactions ... --push
 *
 * --dry prints what was read and writes a JSON summary next to this script.
 * --push REPLACES kuber_ledger / kuber_voucher / kuber_voucher_line /
 *   kuber_bill in Supabase with this export's truth (each run is a fresh
 *   snapshot of Tally — the books are Tally's, Kuber only reads them).
 *
 * What it extracts:
 *   Masters      → ledgers: name, parent group, opening/closing balance,
 *                  bill-wise opening bills (name, date, amount, credit period).
 *   Transactions → vouchers: date, type, number, party, narration;
 *                  every ledger line: ledger, amount;
 *                  every bill allocation: bill name, type (New/Agst Ref),
 *                  amount, credit period.
 *   Bills        → outstanding per bill = opening + New Refs + Agst Refs
 *                  (Tally's own signs); non-zero survives as an open bill with
 *                  a due date (bill date + credit period). Tally convention:
 *                  debit balances are NEGATIVE in the XML, so outstanding < 0
 *                  reads "they owe us" (receivable), > 0 "we owe them".
 *
 * The files are UTF-16LE; they are streamed, never loaded whole.
 */
import { createReadStream, readFileSync, writeFileSync } from "fs";
import { createInterface } from "readline";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const get = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const MASTERS = get("--masters"), TRANS = get("--transactions");
const PUSH = args.includes("--push"), DRY = !PUSH;
if (!MASTERS && !TRANS) { console.log("Pass --masters and/or --transactions."); process.exit(1); }

const unesc = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const num = (s) => { const v = parseFloat(String(s).replace(/,/g, "")); return Number.isFinite(v) ? v : 0; };
const tallyDate = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null);
const creditDays = (s) => { const m = String(s || "").match(/(\d+)/); return m ? Number(m[1]) : null; };
const addDays = (iso, d) => { const t = new Date(iso + "T00:00:00Z"); t.setUTCDate(t.getUTCDate() + d); return t.toISOString().slice(0, 10); };

async function eachLine(file, fn) {
  const rl = createInterface({ input: createReadStream(file, { encoding: "utf16le" }), crlfDelay: Infinity });
  for await (let line of rl) fn(line.replace(/^﻿/, "").trim());
}
const tagText = (line, tag) => {
  const m = line.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`));
  return m ? unesc(m[1]) : null;
};
const attr = (line, name) => {
  const m = line.match(new RegExp(`${name}="([^"]*)"`));
  return m ? unesc(m[1]) : null;
};

// ---------------- masters ----------------
const ledgers = [];           // {id,name,parent,opening,closing}
const openingBills = [];      // {ledger,bill,date,amount,credit_days}
const groups = [];            // {name,parent} — the tree that classifies
if (MASTERS) {
  let led = null, inBill = false, bill = null, depthBill = 0, grp = null;
  await eachLine(MASTERS, (line) => {
    if (line.startsWith("<GROUP ")) { grp = { name: attr(line, "NAME") || "", parent: "" }; return; }
    if (grp) {
      if (line.startsWith("</GROUP>")) { if (grp.name) groups.push(grp); grp = null; return; }
      const gp = tagText(line, "PARENT"); if (gp !== null) grp.parent = gp;
      return;
    }
    if (line.startsWith("<LEDGER ")) {
      led = { id: randomUUID(), name: attr(line, "NAME") || "", parent: "", opening: 0, closing: 0 };
      return;
    }
    if (!led) return;
    if (line.startsWith("</LEDGER>")) { ledgers.push(led); led = null; inBill = false; return; }
    if (line.startsWith("<BILLALLOCATIONS.LIST>")) {
      if (line.includes("</BILLALLOCATIONS.LIST>")) return; // empty, one line
      inBill = true; bill = { ledger: led.name, bill: "", date: null, amount: 0, credit_days: null }; return;
    }
    if (line.startsWith("</BILLALLOCATIONS.LIST>")) {
      if (bill && bill.bill) openingBills.push(bill);
      inBill = false; bill = null; return;
    }
    if (inBill && bill) {
      const n = tagText(line, "NAME"); if (n !== null) bill.bill = n;
      const d = tagText(line, "BILLDATE"); if (d !== null) bill.date = tallyDate(d);
      const ob = tagText(line, "OPENINGBALANCE"); if (ob !== null) bill.amount = num(ob);
      const cp = tagText(line, "BILLCREDITPERIOD"); if (cp !== null) bill.credit_days = creditDays(cp);
      return;
    }
    const p = tagText(line, "PARENT"); if (p !== null) { led.parent = p; return; }
    const ob = tagText(line, "OPENINGBALANCE"); if (ob !== null) { led.opening = num(ob); return; }
    const cb = tagText(line, "CLOSINGBALANCE"); if (cb !== null) { led.closing = num(cb); return; }
  });
  console.log(`masters: ${groups.length} groups, ${ledgers.length} ledgers, ${openingBills.length} opening bills`);
}

// ---------------- transactions ----------------
const vouchers = [];   // {id,date,vtype,vno,party,narration}
const lines = [];      // {id,voucher_id,ledger,amount}
const allocs = [];     // {voucher_id,ledger,bill,billtype,amount,credit_days,date}
if (TRANS) {
  // A voucher's money lines hide at three depths: ALLLEDGERENTRIES /
  // LEDGERENTRIES on the voucher, and ACCOUNTINGALLOCATIONS inside an
  // inventory entry (that is where GST Sales books its sales ledger). A scope
  // STACK keeps them straight, and any OTHER nested .LIST (bank allocations,
  // cost categories…) raises otherDepth so its NAME/AMOUNT lines cannot
  // pollute the entry they sit inside.
  const LEDGER_SETS = new Set(["ALLLEDGERENTRIES", "LEDGERENTRIES", "ACCOUNTINGALLOCATIONS"]);
  let v = null, inAlloc = false, alloc = null, otherDepth = 0;
  const stack = [];
  const listTag = (line) => {
    const m = line.match(/^<(\/?)([A-Z.]+)\.LIST[ >]/);
    if (!m) return null;
    // Tally writes an EMPTY list as "<X.LIST>   </X.LIST>" on one line —
    // treat it as nothing at all, or the depth count never comes back.
    if (m[1] !== "/" && line.includes(`</${m[2]}.LIST>`)) return { selfClosed: true, name: m[2] };
    return { close: m[1] === "/", name: m[2] };
  };
  await eachLine(TRANS, (line) => {
    if (line.startsWith("<VOUCHER ")) {
      v = { id: randomUUID(), date: null, vtype: attr(line, "VCHTYPE") || "", vno: "", party: "", narration: "" };
      return;
    }
    if (!v) return;
    if (line.startsWith("</VOUCHER>")) { vouchers.push(v); v = null; stack.length = 0; inAlloc = false; otherDepth = 0; return; }

    if (inAlloc && alloc) {
      if (line.startsWith("</BILLALLOCATIONS.LIST>")) {
        if (alloc.bill) allocs.push(alloc);
        inAlloc = false; alloc = null; return;
      }
      const n = tagText(line, "NAME"); if (n !== null) alloc.bill = n;
      const bt = tagText(line, "BILLTYPE"); if (bt !== null) alloc.billtype = bt;
      const am = tagText(line, "AMOUNT"); if (am !== null) alloc.amount = num(am);
      const cp = tagText(line, "BILLCREDITPERIOD"); if (cp !== null) alloc.credit_days = creditDays(cp);
      return;
    }

    const lt = listTag(line);
    if (lt) {
      if (lt.selfClosed) return; // empty list on one line — nothing to track
      if (lt.name === "BILLALLOCATIONS" && !lt.close && stack.length) {
        inAlloc = true;
        alloc = { voucher_id: v.id, ledger: stack[stack.length - 1].ledger, bill: "", billtype: "", amount: 0, credit_days: null, date: v.date };
        return;
      }
      if (LEDGER_SETS.has(lt.name)) {
        if (lt.close) {
          const e = stack.pop();
          if (e && e.ledger) lines.push(e);
        } else {
          stack.push({ id: randomUUID(), voucher_id: v.id, ledger: "", amount: 0 });
        }
        return;
      }
      // some other nested list — its contents are not this entry's
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
  });
  console.log(`transactions: ${vouchers.length} vouchers, ${lines.length} ledger lines, ${allocs.length} bill allocations`);
}

// ---------------- open bills ----------------
// key = ledger || bill; outstanding = opening + every allocation, Tally's own
// signs. New Ref carries the bill's date + credit period for the due date.
const bills = new Map();
const touch = (ledger, bill) => {
  const k = ledger + "||" + bill;
  if (!bills.has(k)) bills.set(k, { ledger, bill, outstanding: 0, bill_date: null, credit_days: null });
  return bills.get(k);
};
for (const b of openingBills) {
  const r = touch(b.ledger, b.bill);
  r.outstanding += b.amount;
  if (b.date) r.bill_date = b.date;
  if (b.credit_days != null) r.credit_days = b.credit_days;
}
const vDate = new Map(vouchers.map((x) => [x.id, x.date]));
for (const a of allocs) {
  const r = touch(a.ledger, a.bill);
  r.outstanding += a.amount;
  if (/new ref/i.test(a.billtype)) {
    r.bill_date = vDate.get(a.voucher_id) || r.bill_date;
    if (a.credit_days != null) r.credit_days = a.credit_days;
  }
}
const groupOf = new Map(ledgers.map((l) => [l.name, l.parent]));
// The tree decides who is a party: receivable only under Sundry Debtors,
// payable only under Sundry Creditors. Amounts stay SIGNED — positive is
// owed in the party's own direction, negative is an unadjusted entry.
const parentOf = new Map(groups.map((g) => [g.name, g.parent]));
const chainHas = (g, word) => { const seen = new Set(); while (g && !seen.has(g)) { if (g.toLowerCase().includes(word)) return true; seen.add(g); g = parentOf.get(g) || ""; } return false; };
const classOf = (led) => {
  const p = groupOf.get(led) || "";
  if (chainHas(p, "sundry debtor")) return "receivable";
  if (chainHas(p, "sundry creditor")) return "payable";
  return null;
};
const open = [...bills.values()]
  .filter((b) => Math.abs(b.outstanding) > 0.5)
  .flatMap((b) => {
    const kind = classOf(b.ledger);
    if (!kind) return [];
    return [{
      id: randomUUID(),
      party: b.ledger,
      party_group: groupOf.get(b.ledger) || null,
      bill: b.bill,
      bill_date: b.bill_date,
      due_date: b.bill_date && b.credit_days != null ? addDays(b.bill_date, b.credit_days) : b.bill_date,
      kind,
      amount: kind === "receivable" ? -b.outstanding : b.outstanding,
    }];
  });
const rec = open.filter((b) => b.kind === "receivable").reduce((s, b) => s + b.amount, 0);
const pay = open.filter((b) => b.kind === "payable").reduce((s, b) => s + b.amount, 0);
console.log(`open bills: ${open.length}  receivable NET ₹${(rec / 1e7).toFixed(2)} Cr  payable NET ₹${(pay / 1e7).toFixed(2)} Cr`);

if (DRY) {
  const out = join(repo, "scripts", "tally-parse-summary.json");
  const sample = (arr, n = 5) => arr.slice(0, n);
  writeFileSync(out, JSON.stringify({
    ledgers: ledgers.length, openingBills: openingBills.length,
    vouchers: vouchers.length, lines: lines.length, allocs: allocs.length,
    openBills: open.length, receivableCr: +(rec / 1e7).toFixed(2), payableCr: +(pay / 1e7).toFixed(2),
    sampleLedgers: sample(ledgers), sampleBills: sample(open, 10),
    topReceivables: open.filter((b) => b.kind === "receivable").sort((a, b) => b.amount - a.amount).slice(0, 10),
    topPayables: open.filter((b) => b.kind === "payable").sort((a, b) => b.amount - a.amount).slice(0, 10),
  }, null, 2));
  console.log("dry run — summary at", out);
  process.exit(0);
}

// ---------------- push ----------------
const env = Object.fromEntries(readFileSync(join(repo, ".env.local"), "utf8")
  .split("\n").filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const URL0 = env.NEXT_PUBLIC_SUPABASE_URL, KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, "content-type": "application/json", prefer: "return=minimal" };

async function wipe(table) {
  const r = await fetch(`${URL0}/rest/v1/${table}?id=not.is.null`, { method: "DELETE", headers: H });
  if (!r.ok) throw new Error(`wipe ${table}: ${r.status} ${await r.text()}`);
}
async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 500) {
    const r = await fetch(`${URL0}/rest/v1/${table}`, { method: "POST", headers: H, body: JSON.stringify(rows.slice(i, i + 500)) });
    if (!r.ok) throw new Error(`insert ${table} @${i}: ${r.status} ${await r.text()}`);
    process.stdout.write(`\r${table}: ${Math.min(i + 500, rows.length)}/${rows.length}   `);
  }
  console.log();
}

const stamp = new Date().toISOString();
if (MASTERS) {
  await wipe("kuber_ledger");
  await insert("kuber_ledger", ledgers.map((l) => ({ id: l.id, name: l.name, parent: l.parent, opening: l.opening, closing: l.closing, loaded_at: stamp })));
  const rg = await fetch(`${URL0}/rest/v1/kuber_group?name=not.is.null`, { method: "DELETE", headers: H });
  if (rg.ok) await insert("kuber_group", groups);
}
if (TRANS) {
  await wipe("kuber_voucher_line"); await wipe("kuber_voucher");
  await insert("kuber_voucher", vouchers.map((x) => ({ id: x.id, date: x.date, vtype: x.vtype, vno: x.vno, party: x.party, narration: x.narration, loaded_at: stamp })));
  await insert("kuber_voucher_line", lines.map((x) => ({ id: x.id, voucher_id: x.voucher_id, ledger: x.ledger, amount: x.amount })));
}
await wipe("kuber_bill");
await insert("kuber_bill", open.map((b) => ({ ...b, loaded_at: stamp })));
console.log("pushed. Kuber reads fresh books.");
