/**
 * THE PDF PRESS (30 Aug 2026) — serverless Chromium turns the quote
 * document's HTML into a real PDF. One place, used by the download and the
 * submission both, so the client never fights the browser's print dialog
 * (which sliced 13 pages into 63 and mangled every footer).
 */
export async function pressPdf(html: string): Promise<Buffer> {
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
      margin: { top: 0, bottom: 0, left: 0, right: 0 },
    });
    return Buffer.from(pdf);
  } finally { await browser.close(); }
}
