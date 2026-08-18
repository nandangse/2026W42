# The review deck

Seven slides built from live Genie data. Everything on them is queried, not typed.

    node scratchpad/deck/monthly.mjs      # refresh delivered-by-month  -> deck.json
    node scratchpad/deck/stuck.mjs        # refresh the stalled list    -> deck.json
    node scratchpad/deck/build-pdf.js     # deck.json -> deck.html
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \
      --no-pdf-header-footer --print-to-pdf=Nandan-GSE-FY2026-27-Review.pdf \
      file://$PWD/scratchpad/deck/deck.html

`build.js` makes the .pptx instead, from the same `deck.json`.

## Two things that cost time to learn

**A job number is the LAST FOUR of `jobs.id`** -- the id carries a financial-year
prefix (`2023242114` is job 2114 of FY2023-24). `jobNo()` in `src/lib/schedule.ts`.

**Throughput is `tpv` OR `tp`, never both, never a percentage of value.** Use the
rule in `throughputOf()` (`src/lib/delivered.ts`). Getting this wrong reads as
crores when it is rupees, and the totals silently stop tying to the app.

Sanity check after any refresh: the monthly figures must sum to what slide 2's
Delivered box already says -- 61 jobs, 17.18 Cr sales, 8.68 Cr throughput.

## QA

There is no LibreOffice, no pdftoppm and no Python 3.10 on this machine, so the
deck is checked by splitting `deck.html` back into `s1.html`..`s7.html` and
screenshotting each with headless Chrome at 1280x720 -- the same 16:9 and the
same 96dpi width the PDF prints at. Look at all seven before presenting.
