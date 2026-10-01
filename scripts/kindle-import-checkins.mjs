/**
 * kindle-import-checkins.mjs — the Google Forms history into Kindle.
 *
 *   node scripts/kindle-import-checkins.mjs            # dry run: counts only
 *   node scripts/kindle-import-checkins.mjs --write    # write
 *
 * Two files in scratchpad/, one JSON object per line, keyed by the sheet's
 * column index (empty cells omitted):
 *   kindle-checkins-old.jsonl   — the "Checkin" tab, Nov 2022 to Sep 2025 (the first form)
 *   kindle-checkins-2025.jsonl  — the "CheckinNew" tab, Aug 2025 to date (the second form,
 *                                 one goal-column block per member)
 *
 * What it makes: kindle_checkin rows (source form2022 / form2025, the whole
 * row kept in raw), a 2025-26 and a 2026-27 goal set per member with the
 * goals the forms named, kindle_goal_update rows from every goal column,
 * kindle_learning from the learning column, kindle_issue from the sounding
 * board, and two inactive members (Kevin M. Shah, R Kannan) so their 2023
 * check-ins keep their names. Idempotent on (member, period, submitted_at).
 */
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const env = Object.fromEntries(readFileSync(join(repo, ".env.local"), "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const WRITE = process.argv.includes("--write");

const lines = (f) => existsSync(f) ? readFileSync(f, "utf8").split("\n").filter((l) => l.trim().startsWith("{")).map((l) => JSON.parse(l)) : [];
const OLD = lines(join(repo, "scratchpad/kindle-checkins-old.jsonl"));
const NEW = lines(join(repo, "scratchpad/kindle-checkins-2025.jsonl"));
console.log(`rows: old ${OLD.length}, new ${NEW.length}`);

/* ---- who is who: every e-mail the forms ever saw → the member's directory e-mail */
const ALIAS = {
  "nitpripl@gmail.com": "nirajt7011@gmail.com",
  "valay.lakdavala@gmail.com": "valay.lakdavala@neoniche.com",
  "valay.valay.lakdavala@gmail.com": "valay.lakdavala@neoniche.com",
  "jigar.shah@banyantreeadvisors.com": "tojigarshah@gmail.com",
  "shailesh.jain@ultragenius.club": "shailesh.jain@mirraw.com",
  "kevin@kevinent.com": "kevin@kevinent.com",
  "kannan.novacare@gmail.com": "kannan@novacaregroup.in",
};
const FORMER = [
  { email: "kevin@kevinent.com", name: "Kevin M. Shah", short_name: "Kevin", joined_on: "2022-11-01", left_on: "2023-06-30", sort_order: 900 },
  { email: "kannan@novacaregroup.in", name: "R Kannan", short_name: "Kannan", company: "Novacare", joined_on: "2022-11-01", left_on: "2023-12-31", sort_order: 910 },
];
const canon = (e) => { const x = String(e || "").trim().toLowerCase(); return ALIAS[x] || x; };

/* ---- the second form's goal blocks: column → member e-mail, goal position */
const BLOCKS = [
  ["amitgupta@cccpl.net", 5], ["anil@artis.in", 11], ["bharat@mahavirhomestore.com", 17], ["jaydev@aarviencon.com", 23],
  ["tojigarshah@gmail.com", 29], ["nirajt7011@gmail.com", 35], ["rlodha@gmail.com", 41], ["shailesh.jain@mirraw.com", 47],
  ["valay.lakdavala@neoniche.com", 53], ["raghu@nandan.co.in", 64],
];
const P3 = { 72: "anil@artis.in", 73: "raghu@nandan.co.in", 74: "jaydev@aarviencon.com", 75: "valay.lakdavala@neoniche.com", 76: "nirajt7011@gmail.com", 77: "tojigarshah@gmail.com", 78: "rlodha@gmail.com", 79: "shailesh.jain@mirraw.com", 82: "bharat@mahavirhomestore.com", 83: "amitgupta@cccpl.net" };

/* ---- goals, as the group wrote them (GOALS FOR KINDLE doc + the form's own headers) */
const GOALS_2627 = {
  "anil@artis.in": { p: ["90cr revenue with power category 75% and balance audio/IT", "Discontinuation of those product categories which give less than 1.5-2% of total revenue", "Reduce unsecured loan by 4cr"], s: ["Raise funds for Adhar - a home for special adults", "Learn saxophone with more practice", "Learn AI tools and implement its learning in the organization"], r: { failed_last: "90cr sales — achieved only 78cr. No new product categories were added.", start_doing: "Focus on new customer segments. Liquidation of excess inventory. Selling of Pune commercial space (extra property).", stop_doing: "Discontinuation of few product categories.", one_thing: "75% revenue from Power category", accountable_to: "None", support_needed: "Push, aggression, involvement, consistency" } },
  "raghu@nandan.co.in": { p: ["We will do booking of 120 cr and billing of 100 cr with PAT of 8 cr or 8%", "We will do export sales of 50% and reach 15 countries in the year and go deeper in each country", "We will do contract manufacturing for 3 companies and raise at least 20 cr from contract manufacturing"], s: ["Get my HbA1c down to 6.5 by 31st December by a combination of medicine, meditation, movement and alternative foods", "Learn swimming and swim more than 3 times a week", "Have a non-Nandan revenue of more than 30 lakhs in this year"], r: { failed_last: "120 cr booking — reached 60 cr booking only. We decided more sales will cause more stress.", start_doing: "Put 30% time on business development; spend 10 days a month travelling; do 60 zoom calls; work deeper on collaborations; put 10% time on marketing and brand building; build a strong team stemming attrition and adding stronger middle management; start outsourcing non-core activities; start delegating to the team in detail; start focusing on profitability; constant hiring and people development.", stop_doing: "Stop visiting the factory more than 3 times a week; stop giving decisions on operations myself; stop jumping at every shiny thing.", one_thing: "My sugar reading on fasting being 105", accountable_to: "Ashutosh", support_needed: "Will do 121 with each one once a quarter. I have been lagging on this." } },
  "jaydev@aarviencon.com": { p: ["Improve sales + margin", "Book debt to be reduced to 60 days", "Increase O&M and the international business"], s: ["To exercise, do yoga, play sports, or walk at least 5 times a week", "To go on a date with Ami at least once a month", "To read 5 pages per day x 5 times a week"], r: { failed_last: "Reading at least 10 pages per day. FAILED — personal lethargy.", start_doing: "Push manager; regular meetings with the team on the vision for increase in sales and PAT%; review book debts.", stop_doing: "Taking low-margin projects; stop or terminate projects with no brand recall and low margin.", one_thing: "Will update later", accountable_to: "Myself", support_needed: "Will report daily/weekly to one TG member." } },
  "valay.lakdavala@neoniche.com": { p: ["270 cr turnover", "Framework of PMO and MDO", "Mumbai, South and Delhi to set up foundation to be 100, 75, 100 cr SBUs in next 3 years"], s: ["82 kg", "Focus on freedom in 5 years", "Time with family"], r: { failed_last: "200 cr, Delhi, product to be profitable, focus on health and family.", start_doing: "Clear roles and responsibilities of the founders/directors; clear review system of 5.0 leaders; make 5.0 accountable; 60/40 time to BAU and strategy.", stop_doing: "Micromanagement.", one_thing: "", accountable_to: "", support_needed: "" } },
  "nirajt7011@gmail.com": { p: ["June 15 2026: launch the breads in retail stores in Mumbai under the new brand and packaging; from 20 stores add 15 a month, 100 stores pan-Mumbai by Dec 31 2026", "Get on-boarded with 1 Q-Comm platform by July 15 2026 and 2 by August 15 2026 for Mumbai", "By March 31 2027 cover all 150 retail stores in Mumbai with regular repeat orders and deliver to all dark stores of 2 Q-Comm companies"], s: ["Weight loss — 86 kg by May 30, 84 by June 30, 82 by July 31, 80 by August 30", "Start meditating 15 minutes a day from May 4 2026", "Read 1 book a month"], r: { failed_last: "Launching the breads, due to inappropriate branding and product.", start_doing: "Ensure production capability in-house or outsourced; a sales team for retail and support for Q-Comm; a marketing agency for 3-6 months then in-house; on-board an FMCG mentor by June 15; a feasibility report by end May.", stop_doing: "Start focusing on what I do best and delegate to Kevin and the team.", one_thing: "Get an investor for Clean&Crafted — for a mentor and someone to hold me accountable.", accountable_to: "A mentor and/or investor.", support_needed: "Be accountable at every meeting; resource and guidance; encouragement and inspiration." } },
  "tojigarshah@gmail.com": { p: ["Work towards 18% performance p.a. for clients for the next 5 years", "Do not forget goal no. 1", "Do not forget goal no. 2"], s: ["Weight loss to 95 kg by 31st March 2026", "Learn car driving — drive confidently in all environments", "BMI below 29 — for hiking and trekking"], r: { failed_last: "Weight loss goal, due to bad food habits and not being able to say no in a social environment.", start_doing: "Keep 2 hours daily for deep research on 1 company; meet 120 companies and ecosystem players.", stop_doing: "Not commit to any other work at company level — focus.", one_thing: "Weight loss and maintaining it", accountable_to: "Dietician — appointed in June.", support_needed: "" } },
  "rlodha@gmail.com": { p: ["Sales target for FY27 = 200 cr", "Induct son into the business and groom him to run manufacturing operations", "Study upstream adjacent product lines to expand — BLDC motor"], s: ["Maintain work-life balance in the face of growing work pressure; health and happiness over every other pull", "Get son settled in normal life back in India with his health and social life on track", "Finalise the building of the holiday home before 30th Nov 2026"], r: { failed_last: "All goals achieved! Factory set-up not yet done despite the positive viability report.", start_doing: "Engage with revitalised M&A advisors — ALCOR.", stop_doing: "Over-analysis and open-ended target dates for new project commitments.", one_thing: "Set up a new manufacturing venture and have my son run the best engineering set-up.", accountable_to: "Myself, with my son as a hard stop.", support_needed: "Keep me accountable and committed to my goals with a time clock!" } },
  "shailesh.jain@mirraw.com": { p: ["Export revenue of 150 crores", "NPS > 20", "Domestic gross revenue 18 crores"], s: ["Get rid of the minor leg pain", "Reduce weight to under 70 kg", "Meditation — thrice a week"], r: { failed_last: "120 crores of sales — we had no plan on how to hit that. Trump didn't help either.", start_doing: "Export revenue is already aligned; April 12.25 crores, May the same.", stop_doing: "We were not investing heavily in getting good people. We are changing that.", one_thing: "150 crores target", accountable_to: "", support_needed: "" } },
  "bharat@mahavirhomestore.com": { p: ["75 cr, EBITDA 12%, stock turns 12", "Amicable solution in the family matter", "Vision alignment with partners and team"], s: ["Lung capacity and joint pains need work", "Get Rekha out of depression", "Work towards getting Pallav settled"], r: { failed_last: "52 cr topline with 12% EBITDA — spreading self too thin.", start_doing: "Vision alignment exercise with partners and team; implement ERPNext; build WBR/MBR/QBR cadence; buying and margin visibility framework; JD/KRA/KPI framework.", stop_doing: "Micromanagement; haphazard review mechanism.", one_thing: "Achieving 75 cr topline", accountable_to: "Abhai. Kindle.", support_needed: "Keep me on my toes. Be like board members asking tough questions." } },
  "amitgupta@cccpl.net": { p: ["No increase in debt", "20% increase in business", "Better control"], s: ["Quality time to wife and kids", "Hobby and some sports", "To clear all debts by 2029 and increase asset-light business"], r: { failed_last: "", start_doing: "", stop_doing: "", one_thing: "", accountable_to: "", support_needed: "The goals as the check-in form carried them; no 2026-27 reflection sheet was filled." } },
};
/* the 2025-26 goals, from the June 2025 meeting tab (WIG 1 … Goal 5) */
const GOALS_2526 = {
  "nirajt7011@gmail.com": { p: ["Achieve a sale of Rs. 1 cr in 1923 Bakehouse", "1000 regular and repeat customers by March 31 2026", "Add one more vertical such as a spread"], s: ["Weigh 80 kg by Nov 30", "Upskilling — LinkedIn by May 31, Your Story by May 31, meditation daily"] },
  "tojigarshah@gmail.com": { p: ["Wealth Spectrum and Zoho work for better client experience by 31/12/2025", "Recruit Head of Client Service and Operations with 75 lakh CTC by 31/12/2025", "Licence for AIF and start AIF by 31/03/2026"], s: ["Weight loss to 92 kg by 31/03/2026", "Plan for EBC by Oct 26, 12 Jyotirlinga darshan by 31/03/2026, run a marathon, play cricket"] },
  "jaydev@aarviencon.com": { p: ["Sales target of Rs. 650 cr with 3% PAT", "Deploy more than 25 engineers in Qatar by September 2025", "Implement new payroll and contract management software by December 2025"], s: ["Walk / TT / yoga at least 5 times a week to reduce 5 kg by March 2026", "Read 10 pages of a book every day"] },
  "anil@artis.in": { p: ["Achieve 90 cr sales in Artis products from 77 cr", "Reduce total inventory by 4 cr and improve the bottom line by 1 cr", "Explore solar inverters and energy storage; add at least 150 new customers"], s: ["Dedication in learning the saxophone", "Settle daughter in a job; complete the redevelopment process"] },
  "amitgupta@cccpl.net": { p: ["No increase in debt", "20% increase in business", "Better control"], s: ["Quality time to wife and kids", "Hobby and some sports"] },
  "bharat@mahavirhomestore.com": { p: ["52 cr revenue, EBITDA 10%, 12 stock turns", "All SOPs streamlined; ERPNext after Diwali", "Family matter settled amicably"], s: ["Daughter and son married and settled by March 2026", "Lung capacity — exercise 3 days a week; mindfulness journaling nightly"] },
  "valay.lakdavala@neoniche.com": { p: ["200 cr of revenue, GP 30%", "Global, Govt, New Delhi become profitable", "1 day WFH a week compulsory"], s: ["80 kg; run a marathon", "Yoga 3 days a week, 15 minutes"] },
  "rlodha@gmail.com": { p: ["Finalise new factory viability with financial report by 31/7/2025", "Build team to run operations — factory manager / operations head by June 2025", "Sales target 160 cr for 2025-26"], s: ["Interactive 1-to-1 with daughter, minimum 4 hours a week", "Buy holiday home / land in Alibag before Oct 2025"] },
  "raghu@nandan.co.in": { p: ["120 cr sales booking with 10 cr PAT", "Debt to sales ratio under 20%", "Sales team of 8 to hunt aviation, exports, defence and MHE — 60% revenue non-Raghu"], s: ["HbA1c 6.5 and fasting sugar under 130", "Move into a 3.5 BHK house with a 10% down payment from own sources"] },
  "shailesh.jain@mirraw.com": { p: ["Export revenue 28 cr target (first quarter run)", "NPS 30", "Domestic 2.5 crores"], s: ["Weight 70 kg", "Meditation"] },
};

/* ---- helpers */
const parseTs = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(s || "")); return m ? new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +m[4] - 5, +m[5] - 30, +m[6])) : null; };
const period = (d) => { const x = new Date(d); const day = x.getUTCDate(); let y = x.getUTCFullYear(), m = x.getUTCMonth(); if (day > 10) { m += 1; if (m > 11) { m = 0; y += 1; } } return `${y}-${String(m + 1).padStart(2, "0")}-01`; };
const nz = (v) => { const s = String(v ?? "").trim(); return s && !/^(na|n\/a|n\.a\.?|none|nil|-|\.)$/i.test(s) ? s : null; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
const statusOf = (t) => { const s = String(t || "").toLowerCase(); if (/done|achieved|completed|complete\b|on target|on track|yes\b/.test(s)) return /done|achieved|completed/.test(s) ? "done" : "on_track"; if (/dropped|drop this|deferred|dferred|on hold|postponed|rescheduled|not applicable|n\/a/.test(s)) return "dropped"; if (/behind|lagging|far|not happening|not started|no progress|way off|missed|failed|not yet/.test(s)) return "behind"; return null; };

async function main() {
  const { data: members, error } = await db.from("kindle_member").select("id,email,name");
  if (error) throw error;
  const byEmail = new Map(members.map((m) => [m.email, m]));
  /* former members, so their rows keep a name */
  for (const f of FORMER) if (!byEmail.has(f.email)) {
    if (WRITE) { const { data, error: e } = await db.from("kindle_member").insert({ ...f, active: false, must_change: true }).select("id,email,name").single(); if (e) throw e; byEmail.set(data.email, data); }
    else byEmail.set(f.email, { id: `(new) ${f.email}`, email: f.email, name: f.name });
  }
  const { data: meetings } = await db.from("kindle_meeting").select("id,meeting_on,kind").eq("kind", "monthly");
  const meetingFor = (p) => meetings.find((m) => String(m.meeting_on).slice(0, 7) === p.slice(0, 7))?.id || null;

  /* goal sets + goals */
  const goalId = new Map(); // `${email}|${year}|${kind}|${seq}` → id
  async function ensureSet(email, year, def) {
    const m = byEmail.get(email); if (!m) return;
    let setId = null;
    if (WRITE) {
      const r = def.r || {};
      const { data, error: e } = await db.from("kindle_goal_set").upsert({ member_id: m.id, year_label: year, failed_last: r.failed_last || null, start_doing: r.start_doing || null, stop_doing: r.stop_doing || null, one_thing: r.one_thing || null, accountable_to: r.accountable_to || null, support_needed: r.support_needed || null }, { onConflict: "member_id,year_label" }).select("id").single();
      if (e) throw e; setId = data.id;
      const { data: existing } = await db.from("kindle_goal").select("id,kind,seq").eq("set_id", setId);
      for (const [kind, list] of [["professional", def.p], ["personal", def.s]]) for (let i = 0; i < list.length; i++) {
        const have = (existing || []).find((g) => g.kind === kind && g.seq === i + 1);
        if (have) { goalId.set(`${email}|${year}|${kind}|${i + 1}`, have.id); continue; }
        const { data: g, error: ge } = await db.from("kindle_goal").insert({ set_id: setId, member_id: m.id, kind, seq: i + 1, title: list[i] }).select("id").single();
        if (ge) throw ge; goalId.set(`${email}|${year}|${kind}|${i + 1}`, g.id);
      }
    } else { for (const [kind, list] of [["professional", def.p], ["personal", def.s]]) list.forEach((_, i) => goalId.set(`${email}|${year}|${kind}|${i + 1}`, "dry")); }
  }
  for (const [e, d] of Object.entries(GOALS_2526)) await ensureSet(e, "2025-26", d);
  for (const [e, d] of Object.entries(GOALS_2627)) await ensureSet(e, "2026-27", d);
  console.log(`goal ids known: ${goalId.size}`);

  let checkins = 0, updates = 0, learnings = 0, issues = 0, skipped = 0;
  async function putCheckin(row, memberEmail, src, fields, extra) {
    const m = byEmail.get(memberEmail); if (!m) { skipped++; console.log("  no member for", memberEmail); return null; }
    const ts = parseTs(row[0]); if (!ts) { skipped++; return null; }
    const p = period(ts);
    const rec = { member_id: m.id, period: p, meeting_id: meetingFor(p), submitted_at: ts.toISOString(), source: src, raw: row, ...fields };
    checkins++;
    if (!WRITE) return { id: "dry", m, p, ts };
    const { data, error: e } = await db.from("kindle_checkin").upsert(rec, { onConflict: "member_id,period,submitted_at" }).select("id").single();
    if (e) { console.log("  checkin error", e.message, memberEmail, row[0]); skipped++; return null; }
    /* learning + issue, idempotent by (member, date) */
    if (extra.learning) { learnings++; if (WRITE) { await db.from("kindle_learning").delete().eq("member_id", m.id).eq("noted_on", p.slice(0, 7) + "-" + String(ts.getUTCDate()).padStart(2, "0")).eq("checkin_id", data.id); await db.from("kindle_learning").insert({ member_id: m.id, noted_on: ts.toISOString().slice(0, 10), body: extra.learning, checkin_id: data.id }); } }
    if (extra.issue) { issues++; if (WRITE) { const { data: ex } = await db.from("kindle_issue").select("id").eq("member_id", m.id).eq("submitted_at", ts.toISOString()).maybeSingle(); if (!ex) await db.from("kindle_issue").insert({ member_id: m.id, submitted_at: ts.toISOString(), ...extra.issue }); } }
    return { id: data.id, m, p, ts };
  }
  async function putUpdate(ck, email, year, kind, seq, note) {
    const gid = goalId.get(`${email}|${year}|${kind}|${seq}`); const n = nz(note); if (!gid || !n || !ck) return;
    updates++;
    if (!WRITE) return;
    const { data: ex } = await db.from("kindle_goal_update").select("id").eq("goal_id", gid).eq("checkin_id", ck.id).maybeSingle();
    if (ex) return;
    await db.from("kindle_goal_update").insert({ goal_id: gid, member_id: ck.m.id, checkin_id: ck.id, period: ck.p, note: n, status: statusOf(n) });
  }

  /* ---- the first form */
  for (const r of OLD) {
    const email = canon(r[1]);
    const checklist = {}; for (let i = 9; i <= 16; i++) if (r[i]) checklist[i] = r[i];
    const one21 = [r[29] && r[29] !== "No One" ? `1-2-1 with ${r[29]}` : null, nz(r[30])].filter(Boolean).join(" — ") || null;
    const ck = await putCheckin(r, email, "form2022", {
      prof_rating: num(r[7]), pers_rating: num(r[8]), prof_notes: nz(r[3]), pers_notes: nz(r[4]), learning: nz(r[5]), challenge: nz(r[6]),
      sounding: nz(r[19]), one_to_one: one21, suggestions: nz(r[31]), new_goals: [nz(r[17]) ? `#1 annual goal: ${r[17]}` : null, nz(r[18]) ? `Year to date: ${r[18]}` : null].filter(Boolean).join("\n") || null,
    }, { learning: nz(r[5]), issue: nz(r[19]) && !/^(none|this month none|not this month|na|my presentation|in presentation\.\.|making presentation\.\.)$/i.test(r[19].trim()) ? { statement: r[19].trim(), efforts: nz(r[20]), why_important: nz(r[21]), accomplished: nz(r[22]), urgency: num(r[23]) } : null });
    for (let i = 0; i < 3; i++) await putUpdate(ck, email, "2025-26", "professional", i + 1, r[24 + i]);
    for (let i = 0; i < 2; i++) await putUpdate(ck, email, "2025-26", "personal", i + 1, r[27 + i]);
  }
  /* ---- the second form */
  for (const r of NEW) {
    const email = canon(r[1]);
    const blk = BLOCKS.find(([e]) => e === email);
    const base = blk ? blk[1] : null;
    const p3col = Object.entries(P3).find(([, e]) => e === email)?.[0];
    const updateNote = base != null ? nz(r[base + 5]) : null;
    const ck = await putCheckin(r, email, "form2025", {
      prof_rating: num(r[3]), pers_rating: num(r[4]), update_note: updateNote, sounding: nz(r[59]), one_to_one: nz(r[80]), suggestions: nz(r[71]), new_goals: nz(r[70]),
      prof_notes: updateNote, pers_notes: null, learning: null, challenge: null,
    }, { learning: null, issue: nz(r[59]) && !/^(na|n\/a|none|no major issue\.\.|in presentation\.\.|making presentation\.\.|my presentation i will give|nothing on top of head\.\.)$/i.test(r[59].trim()) ? { statement: r[59].trim(), efforts: nz(r[60]), why_important: nz(r[61]), accomplished: nz(r[62]), urgency: num(r[63]) } : null });
    if (base != null) {
      for (let i = 0; i < 3; i++) await putUpdate(ck, email, "2026-27", "professional", i + 1, r[base + i]);
      for (let i = 0; i < 2; i++) await putUpdate(ck, email, "2026-27", "personal", i + 1, r[base + 3 + i]);
    }
    if (p3col) await putUpdate(ck, email, "2026-27", "personal", 3, r[p3col]);
  }
  console.log(`${WRITE ? "WROTE" : "would write"}: check-ins ${checkins}, goal updates ${updates}, learnings ${learnings}, issues ${issues}, skipped ${skipped}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
