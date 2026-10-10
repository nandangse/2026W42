import { createClient } from "@supabase/supabase-js"; import Anthropic from "@anthropic-ai/sdk"; import fs from "fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^"|"$/g,"")];}));
const s = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession:false } });
const ai = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
const MODEL = "claude-opus-5"; const BY = "Genie, from the IMS Master Register (10 Oct 2026)";
const all = async (t, sel, q) => { let out=[]; for (let f=0;;f+=1000){ let r=s.from(t).select(sel).range(f,f+999); if(q) r=q(r); const {data,error}=await r; if(error) throw new Error(t+": "+error.message); out=out.concat(data||[]); if(!data||data.length<1000) break;} return out; };
const standards = (await all("ims_standard","id,name,sys")).filter(x=>!/AWS|EN 1090/.test(x.name));
const clauses = await all("ims_standard_clause","id,standard_id,clause_no,title,parent_clause,sort_order");
const notes = await all("ims_clause_evidence_note","clause_id,requirement,evidence,compliance,links");
const docs = await all("ims_document","id,ref_no,doc_no,title,doc_type,department,status,external_url,doc_kind");
const certs = await all("ims_certificate","title,certificate_no,issuing_body,expiry_date,external_url");
const regs = await all("ims_register_definition","name,description");
const short = (n) => /AS ?9100/i.test(n) ? "AS 9100D" : (n.match(/(\d{4,5})/)||[])[1] ? "ISO " + n.match(/(\d{4,5})/)[1] : n;
const stdName = Object.fromEntries(standards.map(x=>[String(x.id), x.name]));
const hasKids = new Set(clauses.map(c=>`${c.standard_id}:${c.parent_clause}`));
const leaf = clauses.filter(c => standards.some(x=>String(x.id)===String(c.standard_id)) && !hasKids.has(`${c.standard_id}:${c.clause_no}`));
const groups = new Map(); for (const c of leaf) { const k=String(c.clause_no); if(!groups.has(k)) groups.set(k,[]); groups.get(k).push(c); }
const key = (no) => no.split(".").map(x=>/^\d+$/.test(x)?x.padStart(3,"0"):x).join(".");
const ONLY = new Set(["4.2","4.3","5.3","7.2","7.5.1","7.5.3","9.1.1","10.1","10.2"]); const order = [...groups.keys()].filter(k=>ONLY.has(k)).sort((a,b)=>key(a).localeCompare(key(b)));
const catalogue = docs.map(d=>`${d.ref_no||d.doc_no} | ${d.title} | ${d.doc_type} | ${d.department||"-"} | ${d.status}`).join("\n");
const certText = certs.map(c=>`${c.title} ${c.certificate_no||""} (${c.issuing_body||"-"}, till ${c.expiry_date||"-"})`).join("; ");
const regText = regs.map(r=>r.name).join("; ");
const byRef = new Map(docs.map(d=>[String(d.ref_no||d.doc_no).trim().toLowerCase(), d]));
const SYSTEM = `You are the Management Representative's drafting hand at Nandan GSE Pvt. Ltd., Navi Mumbai — an Indian maker of aircraft ground support equipment and material-handling machines (Hi-Lifts, scissor lifts, goods lifts, tail lifts, truck loaders, hangar doors, cylinders), two works (Turbhe and Khalapur), certified to ISO 9001:2015, ISO 14001:2015, ISO 45001:2018, AS 9100D (Rev D), EN 1090-2 (EXC3), MSME ZED Gold and SAMAR; ISO 27001:2022 and ISO 50001 in process. The IMS manual is NGSE/IMS/01; procedures NGSE/IMSP/SYS/01; the ERP is ERPNext at nandanerp.in; Genie is the in-house system that holds the registers.
You write, for one clause number shared by several standards, the evidence statement an external auditor reads for EACH standard's own clause. Cite ONLY documents from the catalogue given (by their number and exact title), the certificates and the registers named; never invent a document, a record or a number. Phrase each against that standard's angle (quality, environmental, OH&S, information security, aerospace). Plain English, no marketing, no second person.
For each clause id return: "requirement" — the clause's requirement in Nandan's words, one or two sentences; "evidence" — three to six sentences on how it is met at Nandan, then a line "Evidence:" followed by bullets "• <number> — <title>" for every catalogue document, certificate or register that genuinely evidences it (prefer approved documents; include formats and checklists that record the practice), then a line "Gaps:" with bullets naming what the catalogue does not show, or "Gaps: none found in the catalogue"; "compliance" — one of "Fully compliant" (clear documented evidence and records), "WIP" (documents exist but partial, draft or in review), "Pending" (nothing in the catalogue), "Risk" (a finding waiting to happen — the clause is central and the catalogue shows no record); "docs" — the list of catalogue numbers cited. A heading-level clause gets the same treatment, summarising its children. Answer by calling the write_evidence tool once, with one entry per clause id.`;
const log = (m) => { fs.appendFileSync("ims-evidence.log", new Date().toISOString().slice(11,19)+" "+m+"\n"); };
let done = 0, written = 0, mapped = 0, failed = 0;
async function one(no) {
  const cs = groups.get(no);
  const items = cs.map(c => { const n = notes.find(x=>String(x.clause_id)===String(c.id)); return { id:String(c.id), standard: stdName[String(c.standard_id)], short: short(stdName[String(c.standard_id)]), clause:`${c.clause_no} ${c.title}`, requirement: n?.requirement||"", evidence: n?.evidence||"", links: n?.links||[] }; });
  const user = `CLAUSE NUMBER ${no}. THE CLAUSES TO WRITE FOR:\n${items.map(i=>`- id ${i.id} · ${i.standard} · ${i.clause}${i.requirement?`\n  requirement as noted: ${i.requirement}`:""}${i.evidence?`\n  evidence as written today (keep its facts): ${i.evidence.replace(/\s+/g," ").slice(0,900)}`:""}${i.links.length?`\n  links on the note: ${i.links.map(l=>l.title||l.url).join("; ")}`:""}`).join("\n")}\n\nTHE DOCUMENT CATALOGUE (number | title | type | department | status):\n${catalogue}\n\nCERTIFICATES HELD: ${certText}\n\nREGISTERS IN GENIE: ${regText}`;
  for (let attempt=1; attempt<=2; attempt++) {
    try {
      /* STRUCTURED OUTPUT: the answer comes back as a tool call with a schema, so a line
         break inside a statement can never break the JSON (4.1 and 4.2 both did, 10 Oct) */
      const r = await ai.messages.create({ model: MODEL, max_tokens: 16000, system: SYSTEM, messages: [{ role:"user", content: user }],
        tools: [{ name: "write_evidence", description: "Return the evidence for every clause id given.", input_schema: { type: "object", properties: { clauses: { type: "array", items: { type: "object", properties: { id: { type: "string" }, requirement: { type: "string" }, evidence: { type: "string" }, compliance: { type: "string", enum: ["Fully compliant","WIP","Pending","Risk"] }, docs: { type: "array", items: { type: "string" } } }, required: ["id","requirement","evidence","compliance","docs"] } } }, required: ["clauses"] } }],
        tool_choice: { type: "tool", name: "write_evidence" } });
      const call = r.content.find(c=>c.type==="tool_use"); if (!call) throw new Error("no tool call in the answer");
      const map = Object.fromEntries((call.input.clauses||[]).map(c=>[String(c.id), c]));
      for (const it of items) {
        const o = map[it.id]; if (!o || !o.evidence) continue;
        const refs = (Array.isArray(o.docs)?o.docs:[]).map(x=>String(x).trim().toLowerCase());
        const cited = refs.map(rf=>byRef.get(rf)).filter(Boolean);
        const links = [...it.links];
        for (const d of cited) if (d.external_url && !links.some(l=>l.url===d.external_url)) links.push({ title: `${d.ref_no||d.doc_no} — ${d.title}`.slice(0,120), url: d.external_url });
        const compliance = ["Fully compliant","WIP","Pending","Risk"].includes(o.compliance) ? o.compliance : "WIP";
        const { error } = await s.from("ims_clause_evidence_note").upsert({ clause_id: it.id, requirement: String(o.requirement||it.requirement||""), evidence: String(o.evidence), compliance, links, ai_draft: String(o.evidence), ai_drafted_at: new Date().toISOString(), updated_by: BY, updated_at: new Date().toISOString() }, { onConflict: "clause_id" });
        if (error) { log("note ERR "+it.id+" "+error.message); continue; }
        written++;
        for (const d of cited) { const { error: e2 } = await s.from("ims_document_clause_map").upsert({ document_id: d.id, clause_id: it.id }, { onConflict: "document_id,clause_id", ignoreDuplicates: true }); if (!e2) mapped++; }
      }
      log(`${no} ok · ${items.length} clause(s) · in ${r.usage?.input_tokens} out ${r.usage?.output_tokens}`); return;
    } catch (e) { log(`${no} attempt ${attempt} failed: ${String(e.message||e).slice(0,200)}`); if (attempt===2) failed++; }
  }
}
log(`start: ${standards.length} standards, ${leaf.length} clauses, ${order.length} clause numbers, ${docs.length} documents`);
const queue = [...order]; const workers = Array.from({length:3}, async () => { while (queue.length) { const no = queue.shift(); await one(no); done++; } });
await Promise.all(workers);
false && await s.from("feature_request").insert({ title: "IMS — every clause of the five standards evidenced from the Master Register", body: "<p>\"take all content from this and put into the IMS section from the master register. It should be so filled up that an auditor should be amazed!\" (Dr Raghu, 10 Oct 2026.) Genie wrote the evidence statement, requirement, compliance mark and document links for every clause of ISO 9001, 14001, 45001, 27001 and AS 9100D from the 290 documents, 9 certificates and 8 registers already imported from the register.</p>", want: "must", status: "done", note: "Run on 10 Oct 2026 against Genie 6.4.0.11.", by: "raghu@nandan.co.in" }).then(({error})=>{ if(error) log("feature_request: "+error.message); });
log(`DONE · groups ${done} · notes written ${written} · document↔clause links ${mapped} · failed ${failed}`);
console.log("DONE", { done, written, mapped, failed });
