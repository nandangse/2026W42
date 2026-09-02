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
  landscape?: boolean;
}

export async function pressPdf(html: string, opts: PressOptions = {}): Promise<Buffer> {
  const chromium = (await import("@sparticuz/chromium")).default;
  const puppeteer = await import("puppeteer-core");
  const executablePath = process.env.CHROME_PATH || await chromium.executablePath();
  const browser = await puppeteer.launch({ args: chromium.args, executablePath, headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    await new Promise((z) => setTimeout(z, 800));
    const pdf = await page.pdf({
      format: "A4", printBackground: true, preferCSSPageSize: true,
      ...(opts.footerHtml
        ? {
            displayHeaderFooter: true,
            headerTemplate: "<span></span>",
            footerTemplate: opts.footerHtml,
            // A footer needs room to stand in; zero margins would print it
            // underneath the last row.
            margin: { top: 0, bottom: "12mm", left: 0, right: 0 },
          }
        : { margin: { top: 0, bottom: 0, left: 0, right: 0 } }),
    });
    return Buffer.from(pdf);
  } finally { await browser.close(); }
}
