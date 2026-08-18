# The review deck

Eight pages, built from live Genie data. Everything on them is queried, not
typed, so the deck cannot drift from the boards it summarises.

**The deck lives in the app now:** `Admin -> 📊 Report`. It is served by
`/api/deck` and built by two pure modules:

- `src/lib/deck-build.ts` — the arithmetic. Takes rows, returns a `Deck`.
- `src/lib/deck.ts` — the renderer. Takes a `Deck`, returns the page.

The route only fetches. That split is the point: it is what lets the deck be
checked here, without a server and without a session.

## Checking it

    sh scratchpad/deck/compile.sh     # emit the two modules as runnable ESM
    node scratchpad/deck/render.mjs   # -> deck.html, deck.json, s1..s8.html

`render.mjs` calls the SAME `buildDeck()` and `deckHtml()` the app calls, so
what is verified is what ships. It prints the figures that must tie:

    delivered  61 jobs, 17.18 Cr, 8.68 Cr throughput
      sums to  17.18 Cr / 8.68 Cr  <- must equal the line above

If those two lines disagree, the monthly split is wrong.

Then look at every page — there is no LibreOffice, no pdftoppm and no
Python 3.10 on this machine, so visual QA is headless Chrome at 1280x720,
the same 16:9 and the same 96dpi width the PDF prints at:

    cd scratchpad/deck
    CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    for i in 1 2 3 4 5 6 7 8; do "$CH" --headless --disable-gpu --hide-scrollbars \
      --window-size=1280,720 --screenshot="$PWD/slide-$i.png" "file://$PWD/s$i.html"; done
    "$CH" --headless --disable-gpu --no-pdf-header-footer \
      --print-to-pdf="$PWD/Nandan-GSE-FY2026-27-Review.pdf" "file://$PWD/deck.html"

The PDF must come out as 8 pages of `/MediaBox [0 0 960 540]`. Anything else
means a page overflowed and split.

## Four things that cost time to learn

**A job number is the LAST FOUR of `jobs.id`.** The id carries a financial-year
prefix — `2023242114` is job 2114 of FY2023-24. Use `jobNo()`
(`src/lib/schedule.ts`), or a slide ends up naming job "2025262541".

**Throughput is `tpv` OR `tp`, never a percentage of value.** Use
`throughputOf()` (`src/lib/delivered.ts`). Getting it wrong reads as crores
when it is rupees — it once made April's throughput 133,321 Cr.

**`tasks.esc` holds a full label, and holds "None".** It is
`"L2 — Production Head"`, not `"L2"`, and unescalated rows say `"None"` rather
than being null. Treating it as truthy turns 21 escalated tasks into 41. Use
`escOf()` (`src/lib/deck-build.ts`).

**Total in rupees, round once at the end.** Rounding each job to two decimals
and adding those up drifts by a lakh or two across twenty jobs, and a deck that
disagrees with the board by a lakh is a deck somebody has to reconcile.

## Why the PDF comes from the browser

There is no headless renderer on the server, and adding one to Vercel would
mean the page that is checked and the page that prints are two different
renderings. `Download PDF` opens `/api/deck?print=1`, which goes straight to
the browser's own print dialog at a 13.333in x 7.5in `@page`. What you saw is
what you get.

`build.js` still makes the older seven-page `.pptx` from `deck.json`. It has no
focus page and nothing here can render a `.pptx` to check it — that is why the
deck moved to HTML in the first place.
