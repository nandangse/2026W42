import Anthropic from "@anthropic-ai/sdk";
import { AI } from "@/lib/ai";

/**
 * AN INSTAFINANCIALS REPORT, READ OFF ITS PDF (Dr Raghu, 4 Sep 2026).
 *
 * The bought summary arrives as JSON and the IFS tab draws it. A report
 * downloaded earlier is the same information on paper. Rather than a second
 * screen for paper, the PDF is read into THE SAME SHAPE the tab already
 * draws -- master profile, seven years of financials, directors, ratings --
 * so nothing is built twice and a company looks the same whichever road its
 * summary came by. The row says which road (ifs_source).
 *
 * The CIN is found first by pattern, not by the model: 21 characters,
 * L or U, a fixed grammar. A model can misread a digit; a regex cannot.
 */
export const CIN_RE = /\b[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}\b/;

/**
 * NO PDF PARSER ON THE SERVER (4 Sep 2026). pdf-parse 2.x carries a native
 * binary that builds on this Mac and not on Vercel's Linux, and two deploys
 * in a row went nowhere with it in the bundle. The model reads the PDF
 * whole -- it is sent as a document, below -- so a text layer was only ever
 * a cross-check. The CIN keeps its guard another way: the model's reading
 * is accepted only if it has the exact 21-character grammar.
 */
async function pdfText(_buf: Buffer): Promise<string> { return ""; }

const SHAPE = `{
  "InstaSummary": {
    "CompanyMasterSummary": { "CompanyName": "", "CompanyCIN": "", "CompanyClass": "", "CompanyMcaStatus": "", "CompanyDateOfInc": "", "CompanyAuthCapital": 0, "CompanyPaidUpCapital": 0, "CompanyMcaIndustry": "", "CompanySubCategory": "", "CompanyFullAddress": "", "CompanyEmail": "", "CompanyLastAgmDate": "", "CompanyLastBsDate": "" },
    "FinancialsSummary": { "FinancialsYearWise": [ { "FinancialYear": "2023-24", "TotalIncome": 0, "TotalExpense": 0, "ProfitBeforeTax": 0, "ProfitAfterTax": 0, "NetWorth": 0 } ] },
    "DirectorSignatoryMasterSummary": { "DirectorCurrentMasterSummary": { "Director": [ { "DirectorName": "", "DirectorDesignation": "", "DirectorDin": "", "DirectorDateOfBirth": "", "DirectorEmail": "", "DirectorContactNo": "" } ] } },
    "CreditRatingDetail": { "CreditRating": [ { "RatingAgency": "", "RatingAssigned": "", "RatingInstrumentName": "", "RatingAssignedDate": "" } ] }
  }
}`;

export async function structureReport(buf: Buffer, companyName: string): Promise<{ json: Record<string, unknown>; cin: string | null; chars: number }> {
  const text = await pdfText(buf);
  const cinFromText = (text.match(CIN_RE) || [])[0] ?? null;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set — the report can be linked but not read.");
  const anthropic = new Anthropic({ apiKey: key });
  const msg = await anthropic.messages.create({
    model: AI.FRONT,
    max_tokens: 6000,
    system: `You turn an InstaFinancials "InstaSummary" report for an Indian company into ONE JSON object of exactly this shape — same keys, same nesting — and nothing else:\n${SHAPE}\n\nRules:\n- Money in RUPEES as plain numbers (the report may print lakhs or crores — convert; 1 lakh = 100000, 1 crore = 10000000). Unknown → 0 for numbers, "" for strings.\n- Dates as the report prints them.\n- One FinancialsYearWise entry per year the report shows, newest first. Every director listed as current. Every rating shown.\n- Copy names and numbers exactly; never invent a value the report does not carry.\n- Output the JSON object only — no prose, no code fence.`,
    messages: [{
      role: "user",
      content: [
        { type: "document", source: { type: "base64", media_type: "application/pdf", data: buf.toString("base64") } },
        { type: "text", text: `Company as Genie knows it: ${companyName}${cinFromText ? ` · CIN found on the report: ${cinFromText}` : ""}${text ? `\n\nExtracted text (for reference):\n${text.slice(0, 60000)}` : ""}` },
      ],
    }],
  });
  const raw = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n");
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("The report could not be read into a summary.");
  const json = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  const master = ((json.InstaSummary as Record<string, unknown> | undefined)?.CompanyMasterSummary ?? {}) as Record<string, unknown>;
  // The regex over the text layer outranks the model's reading. Without a
  // text layer the model's CIN is accepted only if it has the exact grammar.
  const modelCin = String(master.CompanyCIN || "").toUpperCase().replace(/\s+/g, "");
  const cin = cinFromText ?? (CIN_RE.test(modelCin) ? modelCin : null);
  if (cin) master.CompanyCIN = cin;
  return { json, cin, chars: text.length };
}

/** "InstaSummary Report of Ideaforge technology private limited_18-07-2021.pdf" → "ideaforge technology" */
export function normaliseName(s: string): string {
  return String(s || "")
    .toLowerCase()
    .replace(/\.pdf$/i, "")
    .replace(/^instasummary report of\s*/i, "")
    .replace(/[_\s-]\d{1,2}-\d{1,2}-\d{4}.*$/, "")
    .replace(/\b(private|pvt|limited|ltd|llp|company|co|india|technologies|technology|the)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
