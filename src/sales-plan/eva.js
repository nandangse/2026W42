/* ================= EVA BRIEF — builder & refresh schedule =================
   Pure module: no DOM, no Supabase. Imported by
     · src/app.js            (browser — render, manual refresh)
     · api/cron/refresh-eva  (server — nightly scheduled refresh)
   Keep it dependency-free so both runtimes can use it unchanged. */

const EVA_FREQ = [
  { key: 'week',    label: 'Week'    },
  { key: 'month',   label: 'Month'   },
  { key: 'quarter', label: 'Quarter' },
  { key: 'year',    label: 'Year'    }
];
const DEFAULT_FREQ = 'month';

const freqLabel = f => (EVA_FREQ.find(x => x.key === f) || EVA_FREQ[1]).label;

/** When is a brief with this stamp next due? Calendar-accurate, not 30-day maths. */
function nextDueAt(eva) {
  if (!eva || !eva.at) return null;
  const d = new Date(eva.at);
  if (isNaN(d)) return null;
  const n = new Date(d.getTime());
  switch (eva.freq || DEFAULT_FREQ) {
    case 'week':    n.setDate(n.getDate() + 7);      break;
    case 'quarter': n.setMonth(n.getMonth() + 3);    break;
    case 'year':    n.setFullYear(n.getFullYear() + 1); break;
    default:        n.setMonth(n.getMonth() + 1);    break; // month
  }
  return n;
}

function isDue(eva, now = new Date()) {
  const n = nextDueAt(eva);
  return !!n && now >= n;
}

/* ---------- tiny DOM-free helpers ---------- */
const evEsc = s => (s == null ? '' : '' + s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const evMd = t => evEsc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
const stripHtml = h => (h || '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(p|div|li|ul|ol|h\d)>/gi, '\n')
  .replace(/<li[^>]*>/gi, '- ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/\n{3,}/g, '\n\n').trim();

const evStage = (n, stages) => {
  const s = (stages || []).find(x => x.n == n);
  return s ? s.n + '. ' + s.name : '—';
};

/**
 * Build the brief for one company.
 * ctx = { industry, people, todos, products, stages, research? }
 * Returns { html, text, gaps } — html is the panel body, text is the copy-out version.
 */
function buildEva(c, ctx) {
  const ind = ctx.industry || null;
  const ppl = ctx.people || [];
  const prods = ctx.products || [];
  const stages = ctx.stages || [];
  const open = (ctx.todos || []).filter(t => t.status !== 'done');
  const research = ctx.research || (c.eva && c.eva.research) || null;

  const gaps = [];
  if (!c.offer) gaps.push('What we can do for them');
  if (!(c.locations || []).length) gaps.push('Locations');
  if (!ppl.length) gaps.push('Contact people (MAN)');
  if (!prods.length) gaps.push('Products / opportunity');
  if (!(c.comments || []).length) gaps.push('Team comments');

  const html = `
    <div class="evasec"><b>1 · Executive summary</b><br>
      ${evEsc(c.name)} is a <b>${evEsc(c.type || 'Prospect')}</b> in <b>${evEsc(c.industry || '—')}</b>${ind && ind.sector ? ` (${evEsc(ind.sector)} sector, ${evEsc(ind.priority)} priority for Nandan)` : ''}, currently at <b>${evStage(c.stage, stages)}</b>.
      Presence: ${(c.locations || []).map(evEsc).join(', ') || 'not recorded'}. Owned by ${(c.owners || []).map(evEsc).join(', ') || '—'}.</div>
    <div class="evasec"><b>2 · What we can do for them</b><div class="rt-view">${c.offer || '<i>Not filled in yet</i>'}</div></div>
    <div class="evasec"><b>3 · Industry intelligence</b><br>
      ${ind ? `Prospects in ERP: <b>${ind.prospects || 0}</b>${ind.goal ? ` · Goal: <b>${evEsc(ind.goal)}</b>` : ''}
      ${ind.strategy ? `<div class="hint" style="margin-top:4px">${evMd(ind.strategy)}</div>` : ''}
      ${ind.potentials ? `<div style="margin-top:4px"><u>Potentials:</u> ${evMd(ind.potentials)}</div>` : ''}
      ${ind.projects ? `<div style="margin-top:4px"><u>Past projects:</u> ${evMd(ind.projects)}</div>` : ''}` : 'No industry data.'}</div>
    <div class="evasec"><b>4 · People intelligence</b><br>
      ${ppl.length ? ppl.map(p => `${evEsc(p.name)}${p.designation ? ` — ${evEsc(p.designation)}` : ''}${p.location ? ` (${evEsc(p.location)})` : ''}${p.linkedin ? ` <a class="lnk" href="${evEsc(p.linkedin)}" target="_blank">in↗</a>` : ''}`).join('<br>') : 'No contacts recorded yet.'}</div>
    <div class="evasec"><b>5 · Products & opportunity</b><br>
      ${prods.length ? prods.map(p => `${evEsc(p.name)}${p.goal ? ` (${evEsc(p.goal)})` : ''}`).join(' · ') : 'No products linked yet.'}
      ${c.productNotes ? `<div class="hint" style="margin-top:4px">${evEsc(c.productNotes)}</div>` : ''}</div>
    <div class="evasec"><b>6 · Next actions</b><br>
      ${open.length ? open.map(t => `⬜ ${evEsc(t.text)}${t.owner ? ` — ${evEsc(t.owner)}` : ''}${t.due ? ` (due ${evEsc(t.due)})` : ''}`).join('<br>') : 'No open to-dos — set the next dated action.'}</div>
    ${research ? `<div class="evasec"><b>7 · External intelligence</b><br>${evMd(research)}</div>` : ''}
    ${gaps.length ? `<div class="evasec gap"><b>⚠ Data gaps</b><br>${gaps.map(evEsc).join(' · ')}</div>` : ''}`;

  const text = `EVA BRIEF — ${c.name}
1 EXECUTIVE SUMMARY
${c.name} · ${c.type} · ${c.industry || '—'}${ind && ind.sector ? ` (${ind.sector}, ${ind.priority} priority)` : ''} · ${evStage(c.stage, stages)}
Locations: ${(c.locations || []).join(', ') || '—'} · Owners: ${(c.owners || []).join(', ') || '—'}
2 WHAT WE CAN DO
${stripHtml(c.offer) || 'Not filled in yet'}
3 INDUSTRY INTELLIGENCE
Prospects in ERP: ${(ind && ind.prospects) || 0}${ind && ind.goal ? ` · Goal: ${ind.goal}` : ''}
${(ind && ind.strategy) || ''}
${ind && ind.potentials ? 'Potentials: ' + ind.potentials : ''}
${ind && ind.projects ? 'Past projects: ' + ind.projects : ''}
4 PEOPLE
${ppl.map(p => `${p.name}${p.designation ? ' — ' + p.designation : ''}${p.location ? ' (' + p.location + ')' : ''}${p.linkedin ? ' ' + p.linkedin : ''}`).join('\n') || 'None recorded'}
5 PRODUCTS & OPPORTUNITY
${prods.map(p => p.name).join(', ') || 'None linked'}
${c.productNotes || ''}
6 NEXT ACTIONS
${open.map(t => `- ${t.text}${t.owner ? ' — ' + t.owner : ''}${t.due ? ' (due ' + t.due + ')' : ''}`).join('\n') || 'None open'}${research ? `\n7 EXTERNAL INTELLIGENCE\n${research}` : ''}`;

  return { html, text, gaps };
}

/**
 * Produce the stored brief object. Keeps the existing cadence and any external
 * research already attached; only the generated content and stamp change.
 */
function makeEva(c, ctx, now = new Date()) {
  const built = buildEva(c, ctx);
  const prev = c.eva || {};
  return {
    at: now.toISOString(),
    freq: prev.freq || DEFAULT_FREQ,
    html: built.html,
    text: built.text,
    research: prev.research || null
  };
}
