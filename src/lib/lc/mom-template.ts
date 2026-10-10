/**
 * THE STANDARD MINUTES OF MEETING (Dr Raghu, 10 Oct 2026: "this then can
 * become the standard MoM in system!!! Also put in template. It will come
 * from template.")
 *
 * The default below is what a new set of minutes opens on until Dr Raghu
 * edits the template (lc_setting 'mom_template'); Genie's formatter writes
 * into the same headings, so minutes typed and minutes formatted read alike.
 */
export const MOM_TEMPLATE = [
  "<h3>Decisions</h3>",
  "<ol><li>&nbsp;</li></ol>",
  "<h3>Action points</h3>",
  '<table border="1"><tbody><tr><th>#</th><th>Action</th><th>Who</th><th>By when</th><th>Status</th></tr><tr><td>1</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>Open</td></tr><tr><td>2</td><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>Open</td></tr></tbody></table>',
  "<h3>Discussion</h3>",
  "<p>&nbsp;</p>",
  "<h3>Open questions</h3>",
  "<ul><li>&nbsp;</li></ul>",
  "<h3>Next meeting</h3>",
  "<p>Date, place, what each one brings.</p>",
].join("");

/** The headings Genie keeps to when it formats — read from the template so an edited template still leads. */
export function templateHeadings(html: string): string[] {
  const out: string[] = [];
  const re = /<h[1-4][^>]*>([^<]+)<\/h[1-4]>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html || ""))) out.push(m[1].replace(/&nbsp;/g, " ").trim());
  return out.length ? out : ["Decisions", "Action points", "Discussion", "Open questions", "Next meeting"];
}
