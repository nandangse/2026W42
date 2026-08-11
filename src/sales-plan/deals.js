/* ================= DEALS — stages, money, scoring =================
   Pure module: no DOM, no Supabase. Imported by src/app.js and by
   api/deals/score.js, so the fallback score is identical on both sides. */

const SEGMENTS = ['MHE', 'DEF', 'AGSE', 'CM'];

/** Pipeline order. `base` is the starting win probability for the stage. */
const DEAL_STAGES = [
  { key: 'suspecting',  name: 'Suspecting',         base: 5 },
  { key: 'prospecting', name: 'Prospecting',        base: 12 },
  { key: 'opportunity', name: 'Opportunity',        base: 25, needs: 'oppNo' },
  { key: 'quotation',   name: 'Quotation Submitted', base: 40, needs: 'quoteNo' },
  { key: 'bucketB',     name: 'Bucket B',           base: 50 },
  { key: 'bucketA',     name: 'Bucket A',           base: 65 },
  { key: 'bucket0',     name: 'Bucket 0',           base: 80 },
  { key: 'won',         name: 'Order Received',     base: 100, needs: 'soNo', closed: true },
  { key: 'lost',        name: 'Lost Opportunity',   base: 0, closed: true }
];

const stageByKey = k => DEAL_STAGES.find(s => s.key === k) || DEAL_STAGES[0];
const dealStageName = k => stageByKey(k).name;

/* ---------- money (Indian format) ---------- */
function fmtMoney(n) {
  n = +n || 0;
  if (n >= 1e7) return '₹' + (n / 1e7).toFixed(n >= 1e8 ? 0 : 2) + ' Cr';
  if (n >= 1e5) return '₹' + (n / 1e5).toFixed(n >= 1e6 ? 0 : 1) + ' L';
  return '₹' + Math.round(n).toLocaleString('en-IN');
}
const fmtMoneyFull = n => '₹' + Math.round(+n || 0).toLocaleString('en-IN');

/* ---------- dates ---------- */
/** Month-end dates for the next `count` months, starting with NEXT month —
    the current month's tile is noise once you're planning ahead. */
function nextMonthEnds(count = 3, from = new Date()) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(from.getFullYear(), from.getMonth() + i + 2, 0);
    out.push(d);
  }
  return out;
}
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthLabel = d => d.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

function daysSince(isoish) {
  if (!isoish) return null;
  const t = new Date(isoish);
  if (isNaN(t)) return null;
  return Math.max(0, Math.round((Date.now() - t.getTime()) / 86400000));
}

/** When did this deal last actually move? */
function lastMovedAt(deal) {
  const h = deal.history || [];
  return h.length ? h[h.length - 1].at : deal.createdAt || null;
}

/**
 * Deterministic win probability — instant, offline, and the floor the AI score
 * is compared against. Stage sets the base; staleness, interaction count and a
 * slipped due date move it. Returns { chance, why }.
 */
function localChance(deal, now = new Date()) {
  const st = stageByKey(deal.stage);
  if (st.key === 'won') return { chance: 100, why: 'Order received.' };
  if (st.key === 'lost') return { chance: 0, why: 'Marked lost.' };

  let chance = st.base;
  const reasons = [`${st.name} baseline ${st.base}%`];

  // Interactions first — a worked deal is worth more than an untouched one.
  const ix = +deal.interactions || 0;
  if (ix > 0) {
    const bump = Math.min(12, ix * 2);
    chance += bump;
    reasons.push(`${ix} interaction${ix === 1 ? '' : 's'} (+${bump})`);
  } else {
    chance -= Math.min(5, Math.round(st.base * 0.3));
    reasons.push('no interactions logged');
  }

  // Silence decays the deal rather than flattening it: -1% of its value per week
  // past a fortnight, down to half.
  const stale = daysSince(lastMovedAt(deal));
  if (stale !== null && stale > 14) {
    const factor = Math.max(0.5, 1 - (stale - 14) / 180);
    if (factor < 1) {
      chance *= factor;
      reasons.push(`no movement for ${stale} days (−${Math.round((1 - factor) * 100)}%)`);
    }
  }

  if (deal.due) {
    const overdue = Math.round((now - new Date(deal.due)) / 86400000);
    if (overdue > 0) { chance *= 0.85; reasons.push(`due date passed ${overdue} days ago (−15%)`); }
  }

  chance = Math.max(1, Math.min(95, Math.round(chance)));
  return { chance, why: reasons.join(' · ') };
}

/** Weighted value — what the pipeline is actually worth at today's odds. */
const weighted = deal => Math.round((+deal.amount || 0) * ((deal.chance ?? localChance(deal).chance) / 100));

const isOpen = deal => !stageByKey(deal.stage).closed;
