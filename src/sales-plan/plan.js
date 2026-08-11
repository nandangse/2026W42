/* ================= SALESPERSONS PLAN — financial year helpers =================
   Pure module: no DOM. Indian financial year, April → March. */

const FY_START_MONTH = 4; // April

const QUARTERS = [
  { key: 'q1', label: 'Q1', months: [4, 5, 6],    span: 'Apr–Jun' },
  { key: 'q2', label: 'Q2', months: [7, 8, 9],    span: 'Jul–Sep' },
  { key: 'q3', label: 'Q3', months: [10, 11, 12], span: 'Oct–Dec' },
  { key: 'q4', label: 'Q4', months: [1, 2, 3],    span: 'Jan–Mar' }
];

/** The three money metrics the plan is set against. Fixed order — the chart's
    categorical hues are assigned in this order and never cycled. */
const PLAN_METRICS = [
  { key: 'booking',     label: 'Booking',    color: '#2A46A8' },
  { key: 'billing',     label: 'Billing',    color: '#F04E23' },
  { key: 'collections', label: 'Collection', color: '#0B9B93' }
];

/** '2026-27' for any date in Apr 2026 – Mar 2027. */
function fyKeyOf(d = new Date()) {
  const y = d.getMonth() + 1 >= FY_START_MONTH ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}
const fyStartYear = fyKey => +fyKey.slice(0, 4);

/** The 12 month keys of a financial year, in order: ['2026-04' … '2027-03']. */
function fyMonths(fyKey) {
  const y = fyStartYear(fyKey);
  const out = [];
  for (let i = 0; i < 12; i++) {
    const m = ((FY_START_MONTH - 1 + i) % 12) + 1;
    const year = m >= FY_START_MONTH ? y : y + 1;
    out.push(`${year}-${String(m).padStart(2, '0')}`);
  }
  return out;
}
const monthShort = key => new Date(+key.slice(0, 4), +key.slice(5, 7) - 1, 1)
  .toLocaleDateString('en-IN', { month: 'short' });

const quarterOfMonthKey = key => QUARTERS.find(q => q.months.includes(+key.slice(5, 7)));

/** Month keys belonging to one quarter of a financial year. */
function quarterMonths(fyKey, qKey) {
  const q = QUARTERS.find(x => x.key === qKey);
  return fyMonths(fyKey).filter(mk => q.months.includes(+mk.slice(5, 7)));
}

const currentQuarter = (d = new Date()) => QUARTERS.find(q => q.months.includes(d.getMonth() + 1));

/** The current quarter and everything after it in the same financial year. */
function remainingQuarters(d = new Date()) {
  const i = QUARTERS.indexOf(currentQuarter(d));
  return QUARTERS.slice(i);
}

/** Month keys already elapsed in this financial year, including the current month. */
function elapsedMonths(fyKey, d = new Date()) {
  const now = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return fyMonths(fyKey).filter(mk => mk <= now);
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : null);
