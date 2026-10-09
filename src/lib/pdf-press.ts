/**
 * THE PDF PRESS (30 Aug 2026) — serverless Chromium turns the quote
 * document's HTML into a real PDF. One place, used by the download and the
 * submission both, so the client never fights the browser's print dialog
 * (which sliced 13 pages into 63 and mangled every footer).
 */
export interface PressOptions {
  /**
   * A footer on every page — page numbers, most usefully (Dr Raghu, 2 Sep
   * 2026: "Put page numbers"). Chromium will only draw one when
   * displayHeaderFooter is on, and it ignores the page's own CSS for it, so
   * it has to come through here rather than out of the document.
   */
  footerHtml?: string;
  /** A header on every page — the quotation carries the logo there (7 Oct 2026). */
  headerHtml?: string;
  /** Room for the header and footer; defaults 0 and 12mm. */
  marginTop?: string;
  marginBottom?: string;
  landscape?: boolean;
}

/**
 * MANY PAGES, ONE BROWSER (Dr Raghu, 7 Sep 2026: "emailing is stopped ...
 * says failed to fetch").
 *
 * pressPdf launches Chromium, renders one page and closes it again. Pressing
 * eight payslips therefore meant eight cold starts inside a single request —
 * far and away the most expensive part — and the function was killed before
 * it finished. Six slips went out and the browser reported "Failed to fetch",
 * which is what a request that never returns looks like from the outside.
 *
 * The launch is the cost, so it is paid once and the pages are rendered on
 * the same browser. A page that fails does not take the rest down with it:
 * its slot comes back null and the caller reports that one as failed.
 */
export async function pressPdfMany(htmls: string[], opts: PressOptions = {}): Promise<(Buffer | null)[]> {
  if (!htmls.length) return [];
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const executablePath = process.env.CHROME_PATH || await chromium.executablePath();
  const browser = await puppeteer.launch({ args: chromium.args, executablePath, headless: true });
  const out: (Buffer | null)[] = [];
  try {
    for (const html of htmls) {
      let page;
      try {
        page = await browser.newPage();
        await page.setJavaScriptEnabled(false); /* the HTML is ours to lay out, never to run (audit S15) */
        await page.setContent(html, { waitUntil: "load", timeout: 30000 });
        await new Promise((z) => setTimeout(z, 250));
        out.push(Buffer.from(await page.pdf(pdfOptions(opts))));
      } catch { out.push(null); }
      finally { try { await page?.close(); } catch { /* the browser is closing anyway */ } }
    }
  } finally { await browser.close(); }
  return out;
}

/** The page settings, shared by the one-off and the batch. */
function pdfOptions(opts: PressOptions) {
  return {
    format: "A4" as const, printBackground: true, preferCSSPageSize: true,
    ...(opts.footerHtml || opts.headerHtml
      ? {
          displayHeaderFooter: true,
          headerTemplate: opts.headerHtml || "<span></span>",
          footerTemplate: opts.footerHtml || "<span></span>",
          // A header or footer needs room to stand in; zero margins would
          // print it underneath the content.
          margin: { top: opts.marginTop || 0, bottom: opts.marginBottom || "12mm", left: 0, right: 0 },
        }
      : { margin: { top: 0, bottom: 0, left: 0, right: 0 } }),
  };
}

export async function pressPdf(html: string, opts: PressOptions = {}): Promise<Buffer> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const executablePath = process.env.CHROME_PATH || await chromium.executablePath();
  const browser = await puppeteer.launch({ args: chromium.args, executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false); /* the HTML is ours to lay out, never to run (audit S15) */
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    await new Promise((z) => setTimeout(z, 800));
    const pdf = await page.pdf({
      format: "A4", printBackground: true, preferCSSPageSize: true,
      ...(opts.footerHtml || opts.headerHtml
        ? {
            displayHeaderFooter: true,
            headerTemplate: opts.headerHtml || "<span></span>",
            footerTemplate: opts.footerHtml || "<span></span>",
            // A header or footer needs room to stand in; zero margins would
            // print it underneath the content.
            margin: { top: opts.marginTop || 0, bottom: opts.marginBottom || "12mm", left: 0, right: 0 },
          }
        : { margin: { top: 0, bottom: 0, left: 0, right: 0 } }),
    });
    return Buffer.from(pdf);
  } finally { await browser.close(); }
}
