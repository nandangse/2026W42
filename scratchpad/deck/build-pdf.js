// The same seven slides as the PPTX, as one 16:9 PDF.
//
// Written as HTML and printed by headless Chrome rather than converted from
// the .pptx — LibreOffice is not on this machine, and a conversion nobody can
// open to check is worse than a render that can be read back page by page.
const fs = require("fs");
const D = JSON.parse(fs.readFileSync("deck.json", "utf8"));

const P = { ink:"#16232F", slate:"#22303C", sub:"#5A6672", mute:"#8A94A0", faint:"#B8B5AC",
            line:"#E2E0DA", panel:"#F4F2EC", accent:"#E8600A", navy:"#1B3A5C",
            green:"#0D7A3F", amber:"#D97706", red:"#B3261E", gold:"#F5B32B" };
const cr = (v) => "₹" + Number(v).toFixed(2) + " Cr";
const MON = (k) => { const [y,m]=k.split("-"); return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m-1]+" "+y.slice(2); };
const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c)=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
const dd = (s) => (s ? s.slice(8)+"-"+s.slice(5,7) : "—");

/** A grouped bar chart, drawn as inline SVG so it prints as vector. */
function bars(rows, max) {
  const W=760, H=430, L=44, R=14, T=26, B=46;
  const bw=(W-L-R)/rows.length, y=(v)=>H-B-((H-T-B)*v)/max;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${[0,.25,.5,.75,1].map(f=>`<line x1="${L}" y1="${y(max*f)}" x2="${W-R}" y2="${y(max*f)}" stroke="${P.line}"/>
      <text x="${L-6}" y="${y(max*f)+3}" text-anchor="end" font-size="9" fill="${P.faint}">${(max*f).toFixed(0)}</text>`).join("")}
    ${rows.map((r,i)=>{
      const x=L+i*bw, w=bw*0.30;
      return `<rect x="${x+bw*0.14}" y="${y(r.v)}" width="${w}" height="${H-B-y(r.v)}" fill="${P.accent}" rx="2"/>
        <rect x="${x+bw*0.50}" y="${y(r.t)}" width="${w}" height="${H-B-y(r.t)}" fill="${P.green}" rx="2"/>
        <text x="${x+bw*0.29}" y="${y(r.v)-5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.accent}">${r.v.toFixed(2)}</text>
        <text x="${x+bw*0.65}" y="${y(r.t)-5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.green}">${r.t.toFixed(2)}</text>
        <text x="${x+bw/2}" y="${H-B+16}" text-anchor="middle" font-size="12" fill="${P.sub}">${MON(r.k)}</text>
        <text x="${x+bw/2}" y="${H-B+31}" text-anchor="middle" font-size="11" fill="${P.faint}">${r.n} jobs</text>`;
    }).join("")}
    <text x="${L}" y="14" font-size="10" fill="${P.accent}" font-weight="700">■ Sales ₹ Cr</text>
    <text x="${L+95}" y="14" font-size="10" fill="${P.green}" font-weight="700">■ Throughput ₹ Cr</text>
  </svg>`;
}

/**
 * What went out each month, against what has to go out from here.
 *
 * The dashed line is the required rate, not a target line drawn for effect:
 * every bar sitting under it is the gap, month by month. The current month is
 * marked partial — a month that is 18 days old must never read as a bad month.
 */
function doneChart(rows, req, partialK) {
  const W=1160, H=206, L=40, R=150, T=16, B=38;
  const max = Math.max(req, ...rows.map(r=>r.v)) * 1.16;
  const bw=(W-L-R)/rows.length, y=(v)=>H-B-((H-T-B)*v)/max;
  const ry = y(req);
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">
    ${rows.map((r,i)=>{
      const x=L+i*bw, w=bw*0.26, part=r.k===partialK;
      return `<rect x="${x+bw*0.16}" y="${y(r.v)}" width="${w}" height="${H-B-y(r.v)}" fill="${P.accent}" rx="2" ${part?'opacity="0.55"':''}/>
        <rect x="${x+bw*0.48}" y="${y(r.t)}" width="${w}" height="${H-B-y(r.t)}" fill="${P.green}" rx="2" ${part?'opacity="0.55"':''}/>
        <text x="${x+bw*0.29}" y="${y(r.v)-5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.accent}">${r.v.toFixed(2)}</text>
        <text x="${x+bw*0.61}" y="${y(r.t)-5}" text-anchor="middle" font-size="11" font-weight="700" fill="${P.green}">${r.t.toFixed(2)}</text>
        <text x="${x+bw/2}" y="${H-B+16}" text-anchor="middle" font-size="11.5" fill="${P.sub}">${MON(r.k)}${part?" *":""}</text>
        <text x="${x+bw/2}" y="${H-B+30}" text-anchor="middle" font-size="10" fill="${P.faint}">${r.n} jobs</text>`;
    }).join("")}
    <line x1="${L}" y1="${H-B}" x2="${W-R}" y2="${H-B}" stroke="${P.line}"/>
    <line x1="${L}" y1="${ry}" x2="${W-R+8}" y2="${ry}" stroke="${P.red}" stroke-width="1.6" stroke-dasharray="7 5"/>
    <text x="${W-R+14}" y="${ry-4}" font-size="11" font-weight="700" fill="${P.red}">Required from here</text>
    <text x="${W-R+14}" y="${ry+12}" font-size="11" fill="${P.red}">&#8377;${req.toFixed(2)} Cr every month</text>
    <text x="${L}" y="12" font-size="10" fill="${P.accent}" font-weight="700">&#9632; Sales &#8377; Cr</text>
    <text x="${L+95}" y="12" font-size="10" fill="${P.green}" font-weight="700">&#9632; Throughput &#8377; Cr</text>
  </svg>`;
}

/** Horizontal bars for the family split. */
function hbars(fams) {
  const max = Math.max(...fams.map(f=>f.t));
  return fams.map(f=>`<div class="hb">
      <span class="hbn">${esc(f.f)}</span>
      <span class="hbt"><span style="width:${(f.t/max*100).toFixed(1)}%"></span></span>
      <span class="hbj">${f.n}</span><span class="hbv">${f.t.toFixed(2)}</span>
    </div>`).join("");
}

const slides = [];

/* 1 */ slides.push(`<section class="dark">
  <div class="kick gold">NANDAN GSE · ${D.fy}</div>
  <h1>The year, as the book stands today</h1>
  <p class="lede">Day ${D.day} of ${D.total}. Everything delivered so far, plus every job on the board, comes to just over half the year's target.</p>
  <div class="cards">
    ${[["Sales — anticipated",D.anticipated.sales,D.target.sales,P.gold],["Throughput — anticipated",D.anticipated.tp,D.target.tp,"#7BC67E"]]
      .map(([l,v,t,c])=>{const p=Math.round(v/t*100);return `<div class="card" style="border-color:${c}">
        <div class="cl">${l.toUpperCase()}</div>
        <div class="cv" style="color:${c}">${cr(v)}</div>
        <div class="cs">of ${cr(t)} target</div>
        <div class="bar"><span style="width:${p}%;background:${c}"></span></div>
        <div class="cp" style="color:${c}">${p}% of target</div></div>`;}).join("")}
  </div>
  <div class="agenda">
    <div class="ag"><b>The book runs out in November.</b> 105 jobs, all of them dated between August and November — nothing after.</div>
    <div class="ag"><b>${cr(D.stuck.tp)} is kitted and not moving.</b> Material bought, sitting on the floor, nothing earned against it.</div>
    <div class="ag"><b>${D.escJobs} of 105 jobs are escalated</b> — and it is the same cause on job after job.</div>
  </div>
  <div class="foot">delivered since 1 April&nbsp; +&nbsp; every job still on the board</div>
</section>`);

/* 2 */ slides.push(`<section>
  ${hd("Since 1 April","What has actually gone out of the door",P.accent)}
  <div class="stats">
    ${st("Delivered",cr(D.delivered.sales),`${D.delivered.n} jobs · ${cr(D.delivered.tp)} throughput`,P.accent)}
    ${st("Pace says by today",cr(D.paceBy),`${D.day} of ${D.total} days elapsed`,P.sub)}
    ${st("Behind by",cr(D.behind),`running at ${D.pacePct}% of the pace needed`,P.red)}
  </div>
  <div class="band">
    <div class="bl">REQUIRED RUN RATE FOR THE REST OF THE YEAR</div>
    <div class="bt"><b style="color:${P.gold}">${cr(D.required.sales)}</b> per month in sales, with a throughput of <b style="color:#7BC67E">${cr(D.required.tp)}</b> per month</div>
    <div class="bn">across the ${D.left} days that remain</div>
  </div>
  <div class="donewrap">${doneChart(D.done, D.required.sales, D.done[D.done.length-1].k)}</div>
  <p class="close">No month this year has reached the rate now required; the best of them, April, came to ${cr(D.done[0].v)}. <span class="fn">* ${MON(D.done[D.done.length-1].k)} is ${+D.asOf.slice(0,2)} days old, not a full month.</span></p>
</section>`);

/* 3 */ slides.push(`<section>
  ${hd("The order book","Everything on the board runs out in November",P.red)}
  <div class="split">
    <div class="chart">${bars(D.months, 14)}</div>
    <div class="side">
      <div class="box"><div class="bxl">ON THE BOARD</div>
        <div class="bxv" style="color:${P.navy}">${D.book.n} jobs</div>
        <div class="bxs">${cr(D.book.sales)} · ${cr(D.book.tp)} throughput</div>
        <div class="bxi">all of it dated Aug–Nov</div></div>
      <div class="box red"><div class="bxl" style="color:${P.red}">DEC ONWARDS</div>
        <div class="bxv" style="color:${P.red}">Nothing</div>
        <div class="bxs" style="color:#8A3D2E">Not one job on the book carries a delivery date after November.</div></div>
    </div>
  </div>
  <p class="close b">This is not a delivery problem. Even built perfectly and on time, the current book cannot reach the target — the shortfall is orders, not output.</p>
</section>`);

/* 4 */ slides.push(`<section>
  ${hd("The book by product","What the 105 jobs actually are",P.navy)}
  <div class="hbwrap"><div class="hb hbhead"><span class="hbn"></span><span class="hbt bare"></span><span class="hbj">Jobs</span><span class="hbv">&#8377; Cr TP</span></div>${hbars(D.fams)}</div>
  <p class="close">Ordered by throughput — what the company actually earns on a job, rather than what it invoices. The top ${D.famTop} of ${D.famCount} families carry four-fifths of it. ${D.fams.length} are shown; the ${D.famCount-D.fams.length} left off come to ${D.famRest.n} jobs and ${cr(D.famRest.t)} between them.</p>
</section>`);

/* 5 */ slides.push(`<section>
  ${hd("Kitting against production","Where the money is sitting on the floor",P.amber)}
  <div class="two">
    <div class="half" style="background:#E6F4EA;border-color:${P.green}">
      <div class="hl" style="color:${P.green}">READY TO FINISH — ${D.ready.n} JOBS</div>
      <div class="hv" style="color:${P.green}">${cr(D.ready.tp)}</div>
      <div class="hs">60%+ kitted and 60%+ built</div>
      <p>Bought, made, nearly out. This is the throughput closest to being earned — and the smaller of the two piles.</p></div>
    <div class="half" style="background:#FFF7E6;border-color:${P.amber}">
      <div class="hl" style="color:${P.amber}">KITTED, NOT MOVING — ${D.stuck.n} JOBS</div>
      <div class="hv" style="color:${P.amber}">${cr(D.stuck.tp)}</div>
      <div class="hs">60%+ kitted, under 40% built</div>
      <p>The material is bought and sitting on the floor. Nothing is being earned against it, and it is worth three times the ready pile.</p></div>
  </div>
  <div class="panel"><div class="pl">THE BIGGEST STALLED JOBS</div>
    ${D.stuck.jobs.slice(0,10).map(j=>`<div class="pr"><b>${j.id}</b> ${esc(j.tag)} <span class="dim">· kit ${j.kit}% / built ${j.pct}% ·</span> <b style="color:${P.amber}">${j.tp.toFixed(2)} Cr</b></div>`).join("")}
    ${(()=>{const rest=D.stuck.jobs.slice(10);if(!rest.length)return"";const t=rest.reduce((a,j)=>a+j.tp,0);
      return `<div class="pr dim" style="margin-top:5px">and ${rest.length} more, ${t.toFixed(2)} Cr between them</div>`;})()}
  </div>
</section>`);

/* 6 */ slides.push(`<section>
  ${hd("The near side of the line",`The ${D.ready.n} jobs closest to going out`,P.green)}
  <table class="t"><thead><tr><th>Job</th><th>What it is</th><th class="c">Kit</th><th class="c">Built</th><th class="c">₹ Cr</th><th class="c">Due</th><th class="c">Open tasks</th></tr></thead><tbody>
  ${D.ready.jobs.map(j=>`<tr><td class="jn">${j.id}</td><td>${esc(j.tag)}</td><td class="c">${j.kit}%</td><td class="c">${j.pct}%</td>
    <td class="c" style="color:${P.green};font-weight:700">${j.tp.toFixed(2)}</td><td class="c">${dd(j.tdd)}</td>
    <td class="c" style="${j.tasks?`color:${P.red};font-weight:700`:`color:${P.faint}`}">${j.tasks||"—"}</td></tr>`).join("")}
  </tbody></table>
  <div class="pl" style="margin-top:10px">WHAT IS STILL OPEN ON THEM</div>
  ${D.readyTasks.slice(0,8).map(t=>`<div class="pr tight"><b>${t.job}</b> · ${esc(t.cat)} · ${esc(t.who)} · due ${dd(t.due)}${t.esc?` · <b style="color:${P.red}">ESCALATED ${t.esc}</b>`:""} — ${esc(t.title)}</div>`).join("")}
  <p class="close b tightc">${D.readyTasks.length} open tasks stand between these ${D.ready.n} jobs and the door${(()=>{const c={};for(const t of D.readyTasks)c[t.job]=(c[t.job]||0)+1;const[j,n]=Object.entries(c).sort((a,b)=>b[1]-a[1])[0]||[];return n>1?` \u2014 ${n} of them on job ${j} alone`:"";})()}.</p>
</section>`);

/* 7 */ slides.push(`<section class="dark">
  <div class="kick gold">WHAT IS BEING ESCALATED</div>
  <h1 class="sm">The same problem, on job after job</h1>
  <div class="kpis">
    ${[[D.escJobs,"of 105 jobs carry a project escalation",P.gold],[D.escTasks,"open tasks are escalated","#FF8A80"],[D.escLevels.L3||0,"of those sit at L3 — Management","#FF8A80"]]
      .map(([n,l,c])=>`<div class="kpi"><div class="kn" style="color:${c}">${n}</div><div class="kl">${l}</div></div>`).join("")}
  </div>
  <div class="pl light">THE OLDEST ESCALATED TASKS</div>
  ${D.escTop.slice(0,6).map(t=>`<div class="pr light tight"><b>${t.job}</b> · ${t.lvl} · ${esc(t.who)} · due ${dd(t.due)} — ${esc(t.title)}</div>`).join("")}
  <div class="pl light">AND WHAT THE JOBS THEMSELVES SAY</div>
  ${D.escQuotes.slice(0,3).map(q=>`<div class="quote"><b>${q.id}</b> <span class="qv">${q.tp.toFixed(2)} Cr</span> — “${esc(q.text)}”</div>`).join("")}
  <div class="callout">Read the escalation text and it is the same theme on job after job: drawings not signed off, design not released, components not frozen. The constraint is upstream of the shop floor.</div>
</section>`);

function hd(kick, title, colour) {
  return `<div class="kick" style="color:${colour}">${kick.toUpperCase()}</div>
    <h2>${title}</h2><div class="asof">Genie · as at ${D.asOf}</div>`;
}
function st(label, value, note, colour) {
  return `<div class="stat"><div class="sl">${label.toUpperCase()}</div>
    <div class="sv" style="color:${colour}">${value}</div><div class="sn">${note}</div></div>`;
}

fs.writeFileSync("deck.html", `<!doctype html><html><head><meta charset="utf-8"><title>Nandan GSE · ${D.fy}</title><style>
@page { size: 13.333in 7.5in; margin: 0; }
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{margin:0;font-family:Calibri,"Helvetica Neue",Arial,sans-serif;color:${P.ink}}
section{width:13.333in;height:7.5in;padding:.52in .6in;page-break-after:always;position:relative;overflow:hidden;background:#fff}
section:last-child{page-break-after:auto}
section.dark{background:${P.ink};color:#fff}
.kick{font-size:12pt;font-weight:700;letter-spacing:2.2px;margin-bottom:6px}
.gold{color:${P.gold}}
h1{font-family:Cambria,Georgia,serif;font-size:38pt;margin:0 0 10px;line-height:1.1}
h1.sm{font-size:31pt}
h2{font-family:Cambria,Georgia,serif;font-size:27pt;margin:0 0 16px;line-height:1.15}
.asof{position:absolute;top:.55in;right:.6in;font-size:9.5pt;color:${P.faint}}
.lede{font-size:14pt;color:#9FB0C0;margin:0 0 24px;max-width:9.6in;line-height:1.45}
.cards{display:flex;gap:.42in}.card{flex:1;background:#22303C;border:1.5px solid;border-radius:8px;padding:18px 22px}
.cl{font-size:10.5pt;font-weight:700;letter-spacing:1.4px;color:#8FA1B3}
.cv{font-family:Cambria,Georgia,serif;font-size:44pt;font-weight:700;line-height:1.15;margin:2px 0}
.cs{font-size:12pt;color:#8FA1B3;margin-bottom:12px}
.bar{height:11px;background:#33414F;border-radius:3px;overflow:hidden}.bar span{display:block;height:11px}
.cp{font-size:11.5pt;font-weight:700;margin-top:6px}
.agenda{margin-top:.34in;display:flex;flex-direction:column;gap:11px;max-width:11.6in}
.ag{font-size:13pt;color:#9FB0C0;line-height:1.4;padding-left:16px;border-left:2px solid #33414F}
.ag b{color:#fff}
.foot{position:absolute;bottom:.5in;left:.6in;font-size:10.5pt;font-style:italic;color:#6B7C8C}
.stats{display:flex;gap:.3in;margin-bottom:.26in}
.stat{flex:1;background:${P.panel};border:1px solid ${P.line};border-radius:8px;padding:14px 18px}
.sl{font-size:9.5pt;font-weight:700;letter-spacing:1.1px;color:${P.mute}}
.sv{font-family:Cambria,Georgia,serif;font-size:31pt;font-weight:700;line-height:1.2}
.sn{font-size:10pt;color:${P.sub}}
.band{background:${P.ink};border-radius:8px;padding:16px 22px;color:#fff}
.bl{font-size:10pt;font-weight:700;letter-spacing:1.4px;color:#8FA1B3}
.bt{font-size:14pt;color:#9FB0C0;margin:6px 0 2px;line-height:1.45}
.bt b{font-family:Cambria,Georgia,serif;font-size:25pt}
.bn{font-size:10pt;font-style:italic;color:#6B7C8C}
.close{font-size:13.5pt;color:${P.sub};line-height:1.5;margin:.24in 0 0;max-width:12.1in}
.close.b{color:${P.ink};font-weight:700}
.split{display:flex;gap:.34in;align-items:flex-start}.chart{flex:1.9}.side{flex:1;display:flex;flex-direction:column;gap:.2in}
.box{background:${P.panel};border:1px solid ${P.line};border-radius:8px;padding:14px 18px}
.box.red{background:#FBEDEA;border-color:${P.red}}
.bxl{font-size:9.5pt;font-weight:700;letter-spacing:1.1px;color:${P.mute}}
.bxv{font-family:Cambria,Georgia,serif;font-size:26pt;font-weight:700;line-height:1.2}
.bxs{font-size:11.5pt;color:${P.sub};line-height:1.4}
.bxi{font-size:10.5pt;font-style:italic;color:${P.faint};margin-top:4px}
.hbwrap{display:flex;flex-direction:column;gap:9px}
.hb{display:flex;align-items:center;gap:12px;font-size:12pt}
.hbn{width:2.9in;color:${P.slate}}
.hbt{flex:1;height:17px;background:#EFEDE7;border-radius:3px;overflow:hidden}
.hbt span{display:block;height:17px;background:${P.navy}}
.hbj{width:.5in;text-align:right;color:${P.sub}}
.hbv{width:.75in;text-align:right;font-weight:700;color:${P.navy}}
.hbhead{font-size:9.5pt;letter-spacing:.06em;text-transform:uppercase;color:${P.sub};margin-bottom:-2px}
.hbhead .hbv,.hbhead .hbj{font-weight:700;color:${P.sub}}
.hbt.bare{background:none}
.donewrap{margin-top:.10in}
.close .fn{color:${P.faint};font-style:italic;font-size:.86em}
.two{display:flex;gap:.34in;margin-bottom:.22in}
.half{flex:1;border:1.5px solid;border-radius:8px;padding:16px 20px}
.hl{font-size:11pt;font-weight:700;letter-spacing:1.3px}
.hv{font-family:Cambria,Georgia,serif;font-size:36pt;font-weight:700;line-height:1.15}
.hs{font-size:13pt;font-weight:700;color:${P.slate};margin-bottom:6px}
.half p{font-size:12pt;color:${P.sub};line-height:1.45;margin:0}
.panel{background:${P.panel};border:1px solid ${P.line};border-radius:8px;padding:12px 18px}
.pl{font-size:9.5pt;font-weight:700;letter-spacing:1.2px;color:${P.mute};margin-bottom:5px}
.pl.light{color:#8FA1B3;margin-top:14px}
.pr{font-size:11.5pt;color:${P.slate};line-height:1.62}
.pr.tight{font-size:10.5pt;line-height:1.5}
.close.tightc{margin-top:.12in;font-size:12.5pt}
.pr.light{color:#CFDAE4}
.dim{color:${P.faint}}
.t{width:100%;border-collapse:collapse;font-size:10.5pt}
.t th{background:${P.ink};color:#fff;text-align:left;padding:5px 9px;font-weight:700}
.t th.c,.t td.c{text-align:center}
.t td{padding:3px 9px;border-bottom:1px solid ${P.line};color:${P.slate}}
.t .jn{font-weight:700;color:${P.navy}}
.kpis{display:flex;gap:.34in;margin:.2in 0 .12in}
.kpi{flex:1;background:#22303C;border:1px solid #33414F;border-radius:8px;padding:14px 18px}
.kn{font-family:Cambria,Georgia,serif;font-size:38pt;font-weight:700;line-height:1.1}
.kl{font-size:11.5pt;color:#8FA1B3;line-height:1.35}
.quote{font-size:11.5pt;color:#AFC0CE;line-height:1.5;margin-bottom:3px}
.quote b{color:#fff}.qv{color:${P.gold}}
.callout{position:absolute;left:.6in;right:.6in;bottom:.5in;background:#3A2318;border:1px solid ${P.accent};border-radius:8px;padding:13px 20px;font-size:13pt;font-weight:700;color:#FFD9C2;line-height:1.45}
</style></head><body>${slides.join("")}</body></html>`);
console.log("deck.html written");
