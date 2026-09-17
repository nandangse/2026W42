"use client";
/**
 * Tools → Add Visiting Card — the screen is the ledger of scans, ADD NEW is
 * the lightbox: front and back tiles (a tap opens the camera), the verbatim
 * transcript under them, and four buttons that say exactly how far to go —
 * Save (scan on file) · Save and Add to CRM · …and Add Another · Cancel.
 *
 * PersonCardPanel at the foot of this file is the contact's own Visiting
 * Card tab: the images that made the record, plus Enrich from Apollo —
 * which SHOWS what Apollo claims and writes only what the human ticks,
 * because enrichment is a claim by an outside service, not a fact.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { swallow } from "@/lib/swallow";
import { NAVY, NAVY_SOFT, INK, MUTED, BORDER, ORANGE, GREEN } from "./palette";

interface Read {
  person_name: string | null; salutation: string | null; designation: string | null;
  company: string | null; phones: string[]; emails: string[];
  website: string | null; address: string | null; city: string | null; notes: string | null;
  transcript: string | null;
}
interface CardRow {
  id: string; front_url: string | null; back_url: string | null;
  transcript: string | null; status: string; person_id: string | null; added_at: string;
  extracted: Read | null;
}

const EMPTY_FORM = { person_name: "", salutation: "", designation: "", company: "", company_id: "", email: "", phone: "", website: "" };

/**
 * A phone photographs a card at 4000px and 8MB; the model's ceiling is 5MB
 * and nothing on a card needs that many pixels. Shrunk HERE, in the browser
 * — the upload gets fast on mobile data, HEIC becomes plain JPEG, and the
 * reader never sees an image it must refuse. Falls back to the original if
 * the canvas cannot cope.
 */
export async function shrinkImage(file: File, maxEdge = 1600, alreadyFramed = false): Promise<{ blob: Blob; name: string }> {
  try {
    const bmp = await createImageBitmap(file);
    /* A shot taken inside the guide is already the card. Guessing at its
       edges a second time can only make it worse. */
    const cropped = alreadyFramed ? null : autoCropCard(bmp);
    const src = cropped ?? bmp;
    const sw = cropped ? cropped.width : bmp.width;
    const sh = cropped ? cropped.height : bmp.height;
    /**
     * A SHOT TAKEN IN THE GUIDE IS ALREADY FINISHED. Re-encoding it here put
     * a second generation of JPEG loss on top of the first, on the exact
     * picture a machine has to read six-point type out of -- and shrank
     * nothing, because it was already under the limit. It is handed back
     * untouched.
     */
    if (alreadyFramed && !cropped && Math.max(sw, sh) <= maxEdge) {
      return { blob: file, name: file.name };
    }
    const scale = Math.min(1, maxEdge / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(sw * scale); canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, name: file.name };
    ctx.drawImage(src as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    return blob ? { blob, name: file.name.replace(/\.[^.]+$/, "") + ".jpg" } : { blob: file, name: file.name };
  } catch {
    return { blob: file, name: file.name };
  }
}

/**
 * Find the card in the frame and cut to it, landscape.
 *
 * No library — a heuristic that earns its keep on the common shot (a card
 * on a desk, roughly straight): the border of the photo is sampled as "the
 * background", every pixel is scored by how far it sits from that colour,
 * and the tight run of rows and columns where the difference lives is the
 * card. If the run is implausible — the whole frame, or a sliver — the
 * photo is left alone rather than mis-cropped; and a portrait result is
 * rotated 90° so the card always lies the way a card is read.
 */
function autoCropCard(bmp: ImageBitmap): HTMLCanvasElement | null {
  try {
    const W = 320;
    const scale = W / bmp.width;
    const H = Math.max(1, Math.round(bmp.height * scale));
    const work = document.createElement("canvas");
    work.width = W; work.height = H;
    const wctx = work.getContext("2d", { willReadFrequently: true });
    if (!wctx) return null;
    wctx.drawImage(bmp, 0, 0, W, H);
    const { data } = wctx.getImageData(0, 0, W, H);

    // the frame's border is the background
    const border: number[][] = [];
    const pad = Math.max(2, Math.round(Math.min(W, H) * 0.04));
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (x > pad && x < W - pad && y > pad && y < H - pad) continue;
      const i = (y * W + x) * 4;
      border.push([data[i], data[i + 1], data[i + 2]]);
    }
    const med = (k: number) => border.map((b) => b[k]).sort((a, b) => a - b)[Math.floor(border.length / 2)];
    const bg = [med(0), med(1), med(2)];

    // where the not-background lives, by row and by column
    const TH = 46;
    const colHits = new Array(W).fill(0);
    const rowHits = new Array(H).fill(0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const d = Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]);
      if (d > TH) { colHits[x]++; rowHits[y]++; }
    }
    const span = (hits: number[], total: number, need: number) => {
      let lo = -1, hi = -1;
      for (let i = 0; i < hits.length; i++) if (hits[i] > total * need) { if (lo < 0) lo = i; hi = i; }
      return lo < 0 ? null : [lo, hi] as const;
    };
    const xs = span(colHits, H, 0.12);
    const ys = span(rowHits, W, 0.12);
    if (!xs || !ys) return null;

    // implausible finds are not finds
    const fw = (xs[1] - xs[0]) / W, fh = (ys[1] - ys[0]) / H;
    if (fw > 0.96 && fh > 0.96) return null;      // the whole frame — nothing to crop
    if (fw < 0.25 || fh < 0.12) return null;       // a sliver — probably noise

    const margin = 0.02;
    const sx = Math.max(0, (xs[0] / W - margin)) * bmp.width;
    const sy = Math.max(0, (ys[0] / H - margin)) * bmp.height;
    const sw = Math.min(1, (xs[1] - xs[0]) / W + 2 * margin) * bmp.width;
    const sh = Math.min(1, (ys[1] - ys[0]) / H + 2 * margin) * bmp.height;

    const portrait = sh > sw;
    const out = document.createElement("canvas");
    out.width = portrait ? sh : sw;
    out.height = portrait ? sw : sh;
    const octx = out.getContext("2d");
    if (!octx) return null;
    if (portrait) {
      // a card is read lying down — rotate the upright shot 90°
      octx.translate(out.width, 0);
      octx.rotate(Math.PI / 2);
    }
    octx.drawImage(bmp, sx, sy, sw, sh, 0, 0, sw, sh);
    return out;
  } catch {
    return null;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   THE CAMERA, WITH A RECTANGLE TO PUT THE CARD IN

   Dr Raghu, 15 Sep 2026: "can it show a rectangle in the portrait camera as
   well as the landscape camera so that only that much is taken in. will be
   much cleaner."

   Until now a tap opened the PHONE'S OWN camera app, which is somebody
   else's screen — nothing can be drawn on it — and it handed back the whole
   frame: the card, the desk, the cup, a hand. Genie then guessed where the
   card was by sampling the border colour, which works on a plain desk and
   not on a patterned one.

   A guide removes the guess. The card is framed by the person holding the
   phone, who can see it, and ONLY THE INSIDE OF THE RECTANGLE IS KEPT — the
   crop is taken from the sensor's own pixels, not from the preview, so
   nothing is lost to the screen being smaller than the camera.

   IT WORKS HELD EITHER WAY, which was the actual request. The guide is
   computed from the live preview's shape every frame: held upright it lies
   across the middle, held sideways it fills nearly the whole screen. The
   card gets the most pixels the sensor can give it in both.

   A card standing upright is a real thing too, so ⟳ flips the guide — and a
   portrait capture is rotated to landscape on the way out, because the rest
   of this file has always held that a card is read lying down.

   FALLING BACK IS NOT AN ERROR. No camera, a refused permission, or a page
   not on https: the file picker opens instead and says why in one line. */

/** 89 × 51 mm is the common Indian card; 3.5 × 2 in the American one. */
const CARD_RATIO = 1.7;

function CardCamera({ side, onShot, onClose, onFallback }: {
  side: "front" | "back"; onShot: (f: File) => void; onClose: () => void; onFallback: (why: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [upright, setUpright] = useState(false);          // the CARD's shape, not the phone's
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [err, setErr] = useState("");
  /* How long the camera has been opening, so a wait can say so instead of
     showing a black rectangle that means nothing. */
  const [waited, setWaited] = useState(0);
  /* What the camera is really giving, so a poor picture has a visible cause
     rather than being a thing that just happens sometimes. */
  const [sensor, setSensor] = useState({ w: 0, h: 0 });
  /**
   * WHY THE CALLBACK IS HELD IN A REF.
   *
   * It arrives as an inline arrow from the lightbox, so it is a NEW FUNCTION
   * on every render of the parent. With it in the effect's dependencies the
   * effect tore itself down and asked for the camera again on every one of
   * those renders — and each teardown cancels the permission request that
   * was still on screen waiting to be answered. The result is a camera that
   * is always opening and never opens.
   *
   * The ref keeps the latest callback without the effect depending on its
   * identity, so the camera is asked for ONCE.
   */
  const fallbackRef = useRef(onFallback);

  /* The guide, in the preview's own coordinates. */
  const ratio = upright ? 1 / CARD_RATIO : CARD_RATIO;
  const guide = (() => {
    if (!box.w || !box.h) return null;
    let w = box.w * 0.92, h = w / ratio;
    if (h > box.h * 0.82) { h = box.h * 0.82; w = h * ratio; }
    return { x: (box.w - w) / 2, y: (box.h - h) / 2, w, h };
  })();
  /* How many real pixels the card will be, which is the number that decides
     whether a machine can read it — not the megapixels on the box. */
  const cardPx = (() => {
    const v = videoRef.current;
    if (!v?.videoWidth || !guide || !box.w) return 0;
    const sc = Math.max(box.w / v.videoWidth, box.h / v.videoHeight);
    return (upright ? guide.h : guide.w) / sc;
  })();

  useEffect(() => { fallbackRef.current = onFallback; });

  useEffect(() => {
    let dead = false;
    const t0 = Date.now();
    const tick = window.setInterval(() => { if (!dead) setWaited(Math.round((Date.now() - t0) / 1000)); }, 1000);
    (async () => {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        fallbackRef.current("This browser will not open a camera here — choose a photo instead."); return;
      }
      const ask = (video: MediaTrackConstraints | boolean) => navigator.mediaDevices.getUserMedia({ video, audio: false });
      let st: MediaStream | null = null;
      try {
        st = await ask({ facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1440 } });
      } catch (e) {
        const m = e instanceof Error ? `${e.name} ${e.message}` : String(e);
        /* Refused is refused — asking again only asks again. Anything else
           may be the size being impossible on this phone, so try a plain
           camera before giving up on it. */
        if (/NotAllowed|denied|Permission/i.test(m)) {
          fallbackRef.current("The camera was not allowed — choose a photo instead."); return;
        }
        try { st = await ask(true); }
        catch (e2) {
          const m2 = e2 instanceof Error ? `${e2.name}: ${e2.message}` : String(e2);
          fallbackRef.current(`The camera would not open (${m2}) — choose a photo instead.`); return;
        }
      }
      if (dead || !st) { st?.getTracks().forEach((t) => t.stop()); return; }
      /**
       * TAKE WHAT THE CAMERA ACTUALLY HAS.
       *
       * ideal: 1920 is a wish, not an instruction, and an Android phone
       * commonly answers it with 1280x720 -- from which the guide rectangle
       * is a crop of maybe two thirds, so a business card arrives about 800
       * pixels wide and six-point type is a smudge. The capabilities say
       * what the sensor will really give; ask for that.
       */
      try {
        const track = st.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as { width?: { max?: number }; height?: { max?: number } } | undefined;
        const now = track?.getSettings?.().width || 0;
        if (caps?.width?.max && caps.width.max > now) {
          await track.applyConstraints({ width: { ideal: caps.width.max }, height: { ideal: caps.height?.max } });
        }
      } catch { /* the phone keeps whatever it first offered */ }
      streamRef.current = st;
      const v = videoRef.current;
      if (!v) { fallbackRef.current("The camera opened but there was nowhere to show it — choose a photo instead."); return; }
      v.srcObject = st;
      /* Ready means there are real pixels. A phone that hands over a stream
         and then never produces a frame must not offer a shutter. */
      const live = () => { if (dead) return; setReady(true); setSensor({ w: v.videoWidth, h: v.videoHeight }); };
      v.onloadedmetadata = live;
      await v.play().catch(() => { /* some phones autoplay only on metadata */ });
      if (v.readyState >= 2) live();
    })();
    return () => { dead = true; window.clearInterval(tick); streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  /* The preview's size decides the guide, so it is measured, not assumed. */
  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure); ro.observe(el);
    return () => ro.disconnect();
  }, [ready]);

  /**
   * Cut the guide out of the SENSOR, not out of the preview.
   *
   * The video is drawn object-fit: cover, so part of the frame is off-screen
   * and the rest is scaled. The same transform is undone here, which is why
   * the saved card has the camera's full resolution inside the rectangle
   * rather than the handful of pixels the phone screen was showing.
   */
  const shoot = async () => {
    const v = videoRef.current;
    if (!v || !guide || !v.videoWidth) return;
    setErr("");
    const scale = Math.max(box.w / v.videoWidth, box.h / v.videoHeight);
    const offX = (box.w - v.videoWidth * scale) / 2;
    const offY = (box.h - v.videoHeight * scale) / 2;
    const sx = Math.max(0, (guide.x - offX) / scale);
    const sy = Math.max(0, (guide.y - offY) / scale);
    const sw = Math.min(v.videoWidth - sx, guide.w / scale);
    const sh = Math.min(v.videoHeight - sy, guide.h / scale);
    /* Held as fractions of the frame, so the same rectangle can be cut out
       of a bigger picture of the same scene. */
    const nx = sx / v.videoWidth, ny = sy / v.videoHeight;
    const nw = sw / v.videoWidth, nh = sh / v.videoHeight;

    /**
     * THE STILL, NOT THE PREVIEW (Dr Raghu, 17 Sep 2026: "resolution is
     * poor").
     *
     * The preview stream is a video feed and is sized for showing on a
     * screen. The same camera's STILL is the full sensor -- ten or twelve
     * megapixels against the preview's one. takePhoto() asks for that, and
     * the card is cut out of it instead.
     *
     * ONLY WHEN IT IS THE SAME SCENE. A still is often framed more widely
     * than the preview, and a rectangle measured against one picture cuts
     * the wrong thing out of the other. So it is used only when the shapes
     * agree, and the preview frame is a perfectly good answer otherwise.
     */
    let src: CanvasImageSource = v;
    let W = v.videoWidth, H = v.videoHeight;
    setErr("");
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      const IC = (window as unknown as { ImageCapture?: new (t: MediaStreamTrack) => { takePhoto: () => Promise<Blob> } }).ImageCapture;
      if (track && IC) {
        const photo = await new IC(track).takePhoto();
        const bmp = await createImageBitmap(photo);
        const same = Math.abs(bmp.width / bmp.height - v.videoWidth / v.videoHeight) < 0.03;
        if (same && bmp.width > v.videoWidth) { src = bmp; W = bmp.width; H = bmp.height; }
        else bmp.close?.();
      }
    } catch { /* not every phone will take a still while previewing */ }

    const cx = nx * W, cy = ny * H, cw = nw * W, ch = nh * H;
    const out = document.createElement("canvas");
    /* A card is read lying down — an upright shot is turned on the way out. */
    out.width = Math.round(upright ? ch : cw);
    out.height = Math.round(upright ? cw : ch);
    const ctx = out.getContext("2d");
    if (!ctx) { setErr("This browser could not take the picture."); return; }
    if (upright) { ctx.translate(out.width, 0); ctx.rotate(Math.PI / 2); }
    ctx.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch);
    /* 0.95, and nothing re-encodes it after this. Six-point type does not
       survive being squeezed twice. */
    out.toBlob((b) => {
      if (!b) { setErr("This browser could not take the picture."); return; }
      onShot(new File([b], `card-${side}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.95);
  };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{ position: "fixed", inset: 0, zIndex: 90, background: "#000", display: "flex", flexDirection: "column" }}>
      <div className="flex items-center justify-between px-3 py-2" style={{ background: NAVY, flexShrink: 0 }}>
        <b className="text-white" style={{ fontSize: 14 }}>📷 {side === "front" ? "Front" : "Back"} of the card</b>
        <span className="flex items-center gap-2">
          <button onClick={() => setUpright((u) => !u)} className="px-2 py-1 rounded text-xs font-bold"
            style={{ background: "rgba(255,255,255,.14)", color: "#fff" }}
            title="Some cards stand upright. This turns the rectangle — the picture is still saved lying down.">
            ⟳ {upright ? "upright card" : "card lying down"}
          </button>
          <button onClick={onClose} className="px-2 py-1 rounded text-sm font-semibold" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
        </span>
      </div>

      <div ref={boxRef} style={{ position: "relative", flex: 1, minHeight: 0, overflow: "hidden", background: "#000" }}>
        <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        {guide && (
          <>
            {/* Everything outside the rectangle is dimmed, so the frame is
                obvious at a glance and in bright sun. */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none",
              background: "rgba(0,0,0,.55)",
              clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${guide.x}px ${guide.y}px, ${guide.x}px ${guide.y + guide.h}px, ${guide.x + guide.w}px ${guide.y + guide.h}px, ${guide.x + guide.w}px ${guide.y}px, ${guide.x}px ${guide.y}px)` }} />
            <div style={{ position: "absolute", left: guide.x, top: guide.y, width: guide.w, height: guide.h,
              border: "2px solid #fff", borderRadius: 10, boxShadow: "0 0 0 1px rgba(0,0,0,.45)", pointerEvents: "none" }}>
              {/* corner ticks — the thing the eye actually lines up on */}
              {([["top", "left"], ["top", "right"], ["bottom", "left"], ["bottom", "right"]] as const).map(([v, h]) => (
                <span key={v + h} style={{ position: "absolute", [v]: -2, [h]: -2, width: 26, height: 26,
                  [`border${v === "top" ? "Top" : "Bottom"}`]: `4px solid ${ORANGE}`,
                  [`border${h === "left" ? "Left" : "Right"}`]: `4px solid ${ORANGE}`,
                  [`border${v === "top" ? "TopLeftRadius" : "BottomLeftRadius"}`]: 0 } as React.CSSProperties} />
              ))}
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: guide.y + guide.h + 10, textAlign: "center",
              color: "#fff", fontSize: 12.5, textShadow: "0 1px 3px rgba(0,0,0,.9)", pointerEvents: "none" }}>
              Fill the rectangle with the card — only this is kept
            </div>
          </>
        )}
        {/* A WAIT THAT SAYS WHAT IT IS WAITING FOR. Eight seconds of a black
            rectangle reading "opening the camera" tells nobody that the
            phone is holding a permission question, or that this phone is
            simply not going to open one. */}
        {!ready && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, color: "#C8D2DC", fontSize: 13, textAlign: "center", padding: 24 }}>
            <div>opening the camera{waited > 2 ? ` — ${waited}s` : "…"}</div>
            {waited >= 6 && (
              <div style={{ fontSize: 12.5, lineHeight: 1.6, maxWidth: 320 }}>
                If your phone asked whether Genie may use the camera, <b style={{ color: "#fff" }}>tap Allow</b>.
                {waited >= 12 && <> If it asked nothing, this browser is not going to open one here — use <b style={{ color: "#fff" }}>choose a photo instead</b> below and take the picture with your own camera app.</>}
              </div>
            )}
          </div>
        )}
      </div>

      {err && <div className="px-3 py-1 text-xs font-semibold" style={{ background: "#3A1512", color: "#FFC9BE" }}>{err}</div>}
      <div className="flex items-center justify-center gap-4 py-3" style={{ background: "#111", flexShrink: 0 }}>
        <button onClick={() => onFallback("")} className="text-xs" style={{ color: "#8FA0B0" }}>choose a photo instead</button>
        <button onClick={shoot} disabled={!ready} title="Take the picture"
          style={{ width: 62, height: 62, borderRadius: "50%", background: ready ? "#fff" : "#555", border: `4px solid ${ORANGE}`, cursor: ready ? "pointer" : "default" }} />
        {/* WHAT THE CAMERA IS ACTUALLY GIVING. A blurred card should have a
            visible cause rather than being a thing that just happens. */}
        <span style={{ width: 120, fontSize: 10.5, color: cardPx < 900 ? "#FFC9BE" : "#8FA0B0", lineHeight: 1.35 }}>
          {ready && sensor.w
            ? <>{sensor.w}×{sensor.h}<br />card ≈ {Math.round(cardPx)}px wide{cardPx < 900 ? <><br /><b>move closer</b></> : null}</>
            : null}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   WHAT CARRIES FROM ONE CARD TO THE NEXT

   Dr Raghu, 15 Sep 2026: "I'll put two for all the cards I meet today, next
   cards will also be the same. The tick of whatsapp and email also follow
   the previous options."

   A show is forty cards in two days. Everything that is the same for all
   forty — the context sentence, the tags, whether a thank-you goes by mail
   or WhatsApp — should be typed once and then left alone. Anything that must
   be re-entered forty times will be entered wrongly by the tenth.

   It lives in this browser, not in the database: it is a convenience for the
   person holding the phone, not a fact about the company, and the next show
   will want different words. A browser that refuses storage (a private
   window, site data blocked) simply starts from the defaults.
   ══════════════════════════════════════════════════════════════════════ */
const STICKY = "genie.card.sticky.v1";
type Sticky = { context: string; tags: string[]; email: boolean; whatsapp: boolean; auto: boolean };
const STICKY_DEFAULT: Sticky = { context: "", tags: [], email: true, whatsapp: true, auto: true };

function readSticky(): Sticky {
  try {
    const raw = window.localStorage.getItem(STICKY);
    if (!raw) return STICKY_DEFAULT;
    const j = JSON.parse(raw) as Partial<Sticky>;
    return {
      context: typeof j.context === "string" ? j.context : "",
      tags: Array.isArray(j.tags) ? j.tags.map(String).slice(0, 12) : [],
      email: j.email !== false, whatsapp: j.whatsapp !== false, auto: j.auto !== false,
    };
  } catch { return STICKY_DEFAULT; }
}
function writeSticky(v: Sticky) {
  try { window.localStorage.setItem(STICKY, JSON.stringify(v)); } catch { /* storage refused — the session still works */ }
}

export default function VisitingCard({ onOpen }: { onOpen: (target: string, id: string) => void }) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [needs, setNeeds] = useState(false);
  const [box, setBox] = useState(false);

  const load = useCallback(() => {
    fetch("/api/crm/visiting-card").then(async (r) => {
      const j = await r.json();
      setCards(j.cards || []); setNeeds(!!j.needsMigration);
    }).catch(() => setCards([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ maxWidth: 980 }}>
      <div className="flex items-center gap-3 mb-1">
        <h2 className="font-bold" style={{ fontSize: 17, color: INK }}>🪪 Visiting Cards</h2>
        <button onClick={() => setBox(true)} className="rounded px-3 py-1.5 font-bold"
          style={{ background: ORANGE, color: "#fff", fontSize: 13 }}>+ Add new</button>
      </div>
      <p className="text-xs mb-3" style={{ color: MUTED, maxWidth: "72ch", lineHeight: 1.6 }}>
        Every card scanned, and what it became. The image is kept as the evidence the record was typed from.
      </p>
      {needs && <div className="text-xs rounded border p-2 mb-3" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>Run CRM migrations 0018 and 0019 — the card ledger has nowhere to live yet.</div>}

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
        {(cards || []).map((c) => (
          <div key={c.id} className="rounded border p-2" style={{ borderColor: BORDER, background: "#fff" }}>
            {c.front_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.front_url} alt="card" className="rounded w-full" style={{ height: 110, objectFit: "cover" }} />
              : <div className="rounded" style={{ height: 110, background: "#F2F4F8" }} />}
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className="rounded px-1.5 font-bold" style={{ fontSize: 9.5, background: c.status === "added" ? "#E6F4EB" : NAVY_SOFT, color: c.status === "added" ? GREEN : NAVY }}>
                {c.status === "added" ? "IN CRM" : "SAVED"}
              </span>
              <span style={{ fontSize: 10, color: MUTED }}>{new Date(String(c.added_at)).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" })}</span>
              <span style={{ flex: 1 }} />
              {c.person_id && (
                <button onClick={() => onOpen("person", c.person_id!)} className="underline font-bold" style={{ fontSize: 10.5, color: NAVY }}>contact ↗</button>
              )}
            </div>
            <div style={{ fontSize: 11, color: INK, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {c.extracted?.person_name || c.transcript?.split("\n")[0] || "(unread)"}
            </div>
          </div>
        ))}
        {cards !== null && !cards.length && !needs && (
          <div className="text-sm" style={{ color: MUTED }}>No cards yet — press Add new.</div>
        )}
      </div>

      {box && <CardLightbox onClose={() => setBox(false)} onChanged={load} onOpen={onOpen} />}
    </div>
  );
}

/* ══════════ the lightbox ══════════ */
/* Exported so People I Met can scan a card without leaving the form it is
   already standing in — the same lightbox, not a second one that drifts. */
export function CardLightbox({ onClose, onChanged, onOpen }: {
  onClose: () => void; onChanged: () => void; onOpen: (t: string, id: string) => void;
}) {
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [paths, setPaths] = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [read, setRead] = useState<Read | null>(null);
  const [transcript, setTranscript] = useState("");
  const [matches, setMatches] = useState<{ id: string; name: string }[]>([]);
  const [f, setF] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  /** The courtesy: a thank-you at 6 AM tomorrow, on the ticked channels. */
  const [thanks, setThanks] = useState<{ email: boolean; whatsapp: boolean; auto: boolean }>({ email: true, whatsapp: true, auto: true });
  /** Typed once at a show and carried to every card after it. */
  const [cam, setCam] = useState<"front" | "back" | null>(null);
  const [camErr, setCamErr] = useState("");
  const [context, setContext] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState("");
  /* Read on the first render only — after that the person is editing them. */
  useEffect(() => {
    const st = readSticky();
    setContext(st.context); setTags(st.tags);
    setThanks({ email: st.email, whatsapp: st.whatsapp, auto: st.auto });
  }, []);
  /* Remembered as they are changed, so a crash mid-show costs nothing. */
  useEffect(() => { writeSticky({ context, tags, email: thanks.email, whatsapp: thanks.whatsapp, auto: thanks.auto }); }, [context, tags, thanks]);
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,+$/, "");
    if (!t) return;
    setTags((xs) => (xs.some((x) => x.toLowerCase() === t.toLowerCase()) ? xs : [...xs, t].slice(0, 12)));
    setTagDraft("");
  };
  const [tpl, setTpl] = useState<{ email: string; wa: string }>({ email: "", wa: "" });
  const [tplOptions, setTplOptions] = useState<{ email: string[]; wa: string[] }>({ email: [], wa: [] });
  useEffect(() => {
    fetch("/api/crm/outbound?bootstrap=1").then(async (r) => {
      const j = await r.json();
      const pickDefault = (list: string[]) => list.find((n) => /card thank you/i.test(n)) || "";
      setTplOptions({ email: j.emailTemplates || [], wa: j.waTemplates || [] });
      setTpl({ email: pickDefault(j.emailTemplates || []), wa: pickDefault(j.waTemplates || []) });
    }).catch(() => {});
  }, []);

  const upload = async (side: "front" | "back", file: File | null, framed = false) => {
    if (!file) return;
    setPreviews((p) => ({ ...p, [side]: URL.createObjectURL(file) }));
    setBusy(side); setErr("");
    try {
      /**
       * 2200, NOT 1600. A visiting card is read by a machine, off six-point
       * type, and every pixel thrown away here is a character it has to
       * guess at. The picture is a crop of one card, not a photograph of a
       * room -- at this size it is a few hundred kilobytes, which is nothing
       * against the cost of a misread mobile number.
       */
      const small = await shrinkImage(file, 2200, framed);
      const fd = new FormData();
      fd.append("file", small.blob, small.name); fd.append("side", side);
      const r = await fetch("/api/crm/visiting-card", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(String(j.error || r.status));
      setPaths((p) => ({ ...p, [side]: String(j.path) }));
      if (side === "front") {
        const rd = (j.read || null) as Read | null;
        setRead(rd); setMatches(j.matches || []);
        if (rd) {
          setTranscript(rd.transcript || "");
          setF({
            person_name: rd.person_name || "", salutation: rd.salutation || "",
            designation: rd.designation || "", company: rd.company || "", company_id: "",
            email: rd.emails?.[0] || "", phone: rd.phones?.[0] || "", website: rd.website || "",
          });
          setNote("Read from the card — check every field, especially the digits.");
        } else setNote(`Stored, but nothing could be read${j.why ? ` — ${j.why}` : ""}. Type it in.`);
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const saveOnly = async (): Promise<string | null> => {
    const r = await fetch("/api/crm/visiting-card", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save", path: paths.front, back_path: paths.back, transcript, extracted: read, context }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j.card_id ?? null;
  };
  const addToCrm = async (cardId: string | null) => {
    const r = await fetch("/api/crm/visiting-card", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "create", ...f, path: paths.front, back_path: paths.back, transcript, extracted: read, card_id: cardId, context, tags }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(j.error || r.status));
    return j as { person_id: string | null; company_id: string | null };
  };

  const reset = () => {
    setPreviews({ front: null, back: null }); setPaths({ front: null, back: null });
    setRead(null); setTranscript(""); setMatches([]); setF({ ...EMPTY_FORM }); setNote(""); setErr("");
    /* context, tags and the two ticks are deliberately NOT cleared — the next
       card at the same show wants exactly the same ones. */
    if (frontRef.current) frontRef.current.value = "";
    if (backRef.current) backRef.current.value = "";
  };

  const go = async (mode: "save" | "crm" | "crm_more") => {
    if (!paths.front) { setErr("Photograph the front first."); return; }
    if (mode !== "save" && !f.person_name.trim()) { setErr("The contact needs a name to go into the CRM."); return; }
    setBusy(mode); setErr("");
    try {
      if (mode === "save") { await saveOnly(); onChanged(); onClose(); return; }
      const cardId = await saveOnly();
      const made = await addToCrm(cardId);
      // queue the thank-you for 6 AM — the forgetting is what dies here
      const channels = [thanks.email && f.email.trim() ? "email" : null, thanks.whatsapp && f.phone.trim() ? "whatsapp" : null].filter(Boolean);
      if (made.person_id && channels.length) {
        await fetch("/api/crm/outbound", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: "add", person_id: made.person_id, company_id: made.company_id, card_id: cardId,
            channels, auto: thanks.auto,
            email_template: tpl.email, wa_template: tpl.wa,
            to_email: f.email.trim(), to_phone: f.phone.trim(),
          }),
        }).catch(() => {});
      }
      onChanged();
      if (mode === "crm") {
        if (made.person_id) onOpen("person", made.person_id);
        onClose();
      } else {
        setNote("Added to CRM ✓ — next card");
        reset();
      }
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const Tile = ({ side }: { side: "front" | "back" }) => {
    const ref = side === "front" ? frontRef : backRef;
    const img = previews[side];
    return (
      <button onClick={() => { setCamErr(""); setCam(side); }} className="rounded border relative"
        title={`${side === "front" ? "Front" : "Back"} — tap to photograph or choose an image`}
        style={{ borderColor: paths[side] ? GREEN : BORDER, borderStyle: img ? "solid" : "dashed", height: 150, background: "#F8F9FC", overflow: "hidden" }}>
        {img
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={img} alt={side} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          : <span style={{ fontSize: 12.5, color: MUTED, fontWeight: 700 }}>📷 {side === "front" ? "FRONT" : "BACK"}</span>}
        {busy === side && <span style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.7)", fontSize: 12, fontWeight: 700, color: NAVY }}>reading…</span>}
        {/* Still here: the camera falls back to it, and a card already
            photographed or e-mailed is chosen from the gallery. */}
        <input ref={ref} type="file" accept="image/*" hidden
          onChange={(e) => upload(side, e.target.files?.[0] ?? null)} />
      </button>
    );
  };

  const I = (k: keyof typeof f, label: string) => (
    <label className="block mb-1.5" style={{ fontSize: 11, color: MUTED }}>
      {label}
      <input value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))}
        className="w-full rounded border px-2 py-1 block" style={{ borderColor: BORDER, fontSize: 13, color: INK }} />
    </label>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(22,35,47,.5)", display: "flex", alignItems: "stretch", justifyContent: "center", padding: "10px 16px" }}>
      <div onClick={(e) => e.stopPropagation()} className="rounded" style={{ background: "#fff", width: "min(760px,100%)", height: "calc(100vh - 20px)", display: "flex", flexDirection: "column", minHeight: 0, boxShadow: "0 12px 40px rgba(27,45,107,.35)" }}>
        {cam && (
          <CardCamera side={cam}
            onShot={(file) => { setCam(null); upload(cam, file, true); }}
            onClose={() => setCam(null)}
            onFallback={(why) => { setCam(null); setCamErr(why); (cam === "front" ? frontRef : backRef).current?.click(); }} />
        )}
        <div className="flex items-center justify-between px-4 py-3" style={{ background: NAVY, borderRadius: "6px 6px 0 0", flexShrink: 0 }}>
          <b className="text-white" style={{ fontSize: 15 }}>🪪 Add Visiting Card</b>
          <button onClick={onClose} className="px-2 py-1 rounded text-sm font-semibold" style={{ background: "rgba(255,255,255,.12)", color: "#C8D2DC" }}>✕</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <Tile side="front" /><Tile side="back" />
          </div>

          {note && <div className="text-xs font-semibold mb-2" style={{ color: note.includes("✓") ? GREEN : "#8A5B00" }}>{note}</div>}
          {err && <div className="text-xs font-semibold mb-2" style={{ color: "#B3261E" }}>{err}</div>}

          <div style={{ fontSize: 10.5, letterSpacing: ".04em", fontWeight: 800, color: MUTED, marginBottom: 3 }}>TRANSCRIBED TEXT</div>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={5}
            placeholder="Everything printed on the card, line by line — filled by the reader, correctable by you."
            className="w-full rounded border px-2 py-1.5 mb-3" style={{ borderColor: BORDER, fontSize: 12.5, lineHeight: 1.55, fontFamily: "ui-monospace, monospace" }} />

          <div className="grid gap-x-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            {I("person_name", "Name")}{I("designation", "Designation")}
            {I("company", "Company")}{I("email", "Email")}
            {I("phone", "Phone")}{I("website", "Website")}
          </div>
          {matches.length > 0 && !f.company_id && (
            <div className="text-xs rounded border p-2 mt-1" style={{ borderColor: "#F5D9A8", background: "#FFF7E6", color: "#8A5B00" }}>
              Existing compan{matches.length === 1 ? "y" : "ies"} with a similar name — pick to attach there instead of duplicating:{" "}
              {matches.map((m) => (
                <button key={m.id} onClick={() => setF((x) => ({ ...x, company_id: m.id, company: m.name }))} className="underline mr-2 font-bold" style={{ color: NAVY }}>{m.name}</button>
              ))}
            </div>
          )}
          {f.company_id && <div className="text-xs mt-1" style={{ color: GREEN }}>✓ attaching to the existing company</div>}
          {camErr && <div className="text-xs mt-1" style={{ color: "#8A5B00" }}>{camErr}</div>}

          {/* ── CONTEXT AND TAGS — typed once, carried to the next card ──
              What is printed on a card is the easy half. Where you met them
              and what was said is the half that decides whether the record is
              worth anything in six months, and it is never on the card. */}
          <div className="rounded border p-2 mt-2" style={{ borderColor: BORDER, background: "#FAFBFD" }}>
            <label className="block" style={{ fontSize: 11, color: MUTED }}>
              Context — where you met them, what was said, what you promised
              <textarea value={context} onChange={(e) => setContext(e.target.value)} rows={2}
                placeholder="Met at the Nandan stand, Hall 3. Wants a quote for two belt loaders before Diwali."
                className="w-full rounded border px-2 py-1 block mt-0.5"
                style={{ borderColor: BORDER, fontSize: 13, color: INK, resize: "vertical" }} />
            </label>
            <div className="mt-1.5">
              <div style={{ fontSize: 11, color: MUTED }}>Tags</div>
              <div className="flex flex-wrap items-center gap-1 mt-0.5">
                {tags.map((t) => (
                  <span key={t} className="rounded px-1.5 py-0.5 flex items-center gap-1"
                    style={{ background: NAVY_SOFT, color: NAVY, fontSize: 12, fontWeight: 600 }}>
                    {t}
                    <button onClick={() => setTags((xs) => xs.filter((x) => x !== t))} title="Remove this tag"
                      style={{ color: MUTED, fontWeight: 700, lineHeight: 1 }}>×</button>
                  </span>
                ))}
                <input value={tagDraft}
                  onChange={(e) => { const v = e.target.value; if (v.includes(",")) v.split(",").forEach(addTag); else setTagDraft(v); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === "Tab") { if (tagDraft.trim()) { e.preventDefault(); addTag(tagDraft); } } }}
                  onBlur={() => addTag(tagDraft)}
                  placeholder={tags.length ? "another tag…" : "GSE Expo 2026, Met"}
                  className="rounded border px-2 py-0.5"
                  style={{ borderColor: BORDER, fontSize: 12.5, color: INK, minWidth: 130, flex: "0 1 180px" }} />
              </div>
              <div style={{ fontSize: 10.5, color: MUTED, marginTop: 3 }}>
                Enter or a comma adds one. <b>These stay for the next card</b> — set them once at the show and keep scanning.
              </div>
            </div>
          </div>
          {(read?.phones?.length || 0) > 1 && (
            <div className="text-xs mt-1" style={{ color: MUTED }}>
              Other numbers: {read!.phones.slice(1).map((p) => (
                <button key={p} onClick={() => setF((x) => ({ ...x, phone: p }))} className="underline mr-2" style={{ color: NAVY }}>{p}</button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 pt-2 flex gap-x-4 gap-y-1 items-center flex-wrap" style={{ borderTop: `1px solid ${BORDER}`, flexShrink: 0, fontSize: 12 }}>
          <b style={{ color: MUTED, fontSize: 10.5, letterSpacing: ".04em" }}>THANK-YOU AT 6 AM:</b>
          <label className="flex items-center gap-1" style={{ color: f.email.trim() ? INK : "#C9CDD6" }}>
            <input type="checkbox" checked={thanks.email} disabled={!f.email.trim()}
              onChange={(e) => setThanks((t) => ({ ...t, email: e.target.checked }))} /> ✉ Email
          </label>
          {thanks.email && f.email.trim() && (
            <>
              <select value={tpl.email} onChange={(e) => setTpl((t) => ({ ...t, email: e.target.value }))}
                className="rounded border px-1 py-0.5" style={{ borderColor: BORDER, fontSize: 11 }}>
                <option value="">built-in words</option>
                {tplOptions.email.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <label className="flex items-center gap-1" style={{ color: INK }} title="Off = it waits in the Email Queue for your hand">
                <input type="checkbox" checked={thanks.auto} onChange={(e) => setThanks((t) => ({ ...t, auto: e.target.checked }))} />
                auto-send 6 AM
              </label>
            </>
          )}
          <label className="flex items-center gap-1" style={{ color: f.phone.trim() ? INK : "#C9CDD6" }}>
            <input type="checkbox" checked={thanks.whatsapp} disabled={!f.phone.trim()}
              onChange={(e) => setThanks((t) => ({ ...t, whatsapp: e.target.checked }))} /> 🟢 WhatsApp
          </label>
          {thanks.whatsapp && f.phone.trim() && (
            <select value={tpl.wa} onChange={(e) => setTpl((t) => ({ ...t, wa: e.target.value }))}
              className="rounded border px-1 py-0.5" style={{ borderColor: BORDER, fontSize: 11 }}>
              <option value="">built-in words</option>
              {tplOptions.wa.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <span style={{ fontSize: 10.5, color: MUTED }}>mail sends itself at 6 · WhatsApp waits in its queue, written</span>
        </div>
        <div className="flex gap-2 flex-wrap px-4 py-3" style={{ flexShrink: 0 }}>
          <button onClick={() => go("save")} disabled={busy !== null}
            className="rounded px-3 py-2 font-bold" style={{ background: NAVY_SOFT, color: NAVY, fontSize: 13 }}
            title="Keep the scan on file — no CRM records yet">
            Save
          </button>
          <button onClick={() => go("crm")} disabled={busy !== null}
            className="rounded px-3 py-2 font-bold" style={{ background: GREEN, color: "#fff", fontSize: 13 }}>
            Save and Add to CRM
          </button>
          <button onClick={() => go("crm_more")} disabled={busy !== null}
            className="rounded px-3 py-2 font-bold" style={{ background: ORANGE, color: "#fff", fontSize: 13 }}>
            Save, Add to CRM &amp; Add Another
          </button>
          <span style={{ flex: 1 }} />
          <button onClick={onClose} className="rounded px-3 py-2 font-bold" style={{ color: MUTED, fontSize: 13 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/* ══════════ the contact's own tab ══════════ */
export function PersonCardPanel({ personId, personRow, onSaved }: {
  personId: string; personRow: Record<string, unknown>; onSaved: () => void;
}) {
  const [cards, setCards] = useState<CardRow[] | null>(null);
  const [sug, setSug] = useState<Record<string, string | null> | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`/api/crm/visiting-card?person_id=${encodeURIComponent(personId)}`)
      .then(async (r) => setCards(((await r.json()).cards || []) as CardRow[]))
      .catch(() => setCards([]));
    // arrived from the blue strip's "Enrich with Apollo" — the confirm (and
    // the credits warning) already happened there, so the lookup runs itself
    try {
      if (window.sessionStorage.getItem("crm.apollo.auto") === personId) {
        window.sessionStorage.removeItem("crm.apollo.auto");
        void lookup();
      }
    } catch (e) { swallow("crm/VisitingCard", e); /* fine */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId]);

  const lookup = async () => {
    setBusy("lookup"); setMsg("");
    try {
      const r = await fetch("/api/crm/enrich", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lookup", person_id: personId }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      if (!j.found) { setMsg("Apollo has no match for this contact."); setSug(null); }
      else {
        setSug(j.suggestion);
        const t: Record<string, boolean> = {};
        for (const k of ["job_title", "department", "primary_email", "primary_phone"])
          t[k] = !!j.suggestion[k] && !String(personRow[k] ?? "").trim();
        // a masked name ("Ti***i") wants its reveal ticked by default
        t.name = !!j.suggestion.name && String(personRow.first_name ?? "").includes("*");
        setTicked(t);
      }
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const apply = async () => {
    setBusy("apply"); setMsg("");
    try {
      const fields: Record<string, string> = {};
      for (const [k, on] of Object.entries(ticked)) if (on && sug?.[k]) fields[k] = String(sug[k]);
      const r = await fetch("/api/crm/enrich", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "apply", person_id: personId, fields }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(String(j.error || r.status));
      setMsg(`Applied ${j.applied.length} field${j.applied.length === 1 ? "" : "s"} ✓`);
      onSaved();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    setBusy(null);
  };

  const APPLYABLE = ["name", "job_title", "department", "primary_email", "primary_phone"];
  const LABEL: Record<string, string> = {
    job_title: "Designation", department: "Department", primary_email: "Email", primary_phone: "Phone",
    linkedin: "LinkedIn", city: "Location", company: "Company (per Apollo)", seniority: "Seniority", name: "Name (per Apollo)",
  };

  return (
    <div className="p-4">
      <div style={{ fontSize: 11, letterSpacing: ".04em", fontWeight: 800, color: MUTED, marginBottom: 6 }}>VISITING CARD</div>
      {cards === null ? <div className="text-xs" style={{ color: MUTED }}>loading…</div>
        : !cards.length ? <div className="text-xs mb-3" style={{ color: MUTED }}>No card on file for this contact — Tools → Add Visiting Card files one.</div>
        : (
          <div className="flex gap-2 flex-wrap mb-3">
            {cards.map((c) => (
              <div key={c.id} className="flex gap-2">
                {c.front_url && /* eslint-disable-next-line @next/next/no-img-element */
                  <a href={c.front_url} target="_blank" rel="noopener noreferrer"><img src={c.front_url} alt="front" className="rounded border" style={{ borderColor: BORDER, height: 130 }} /></a>}
                {c.back_url && /* eslint-disable-next-line @next/next/no-img-element */
                  <a href={c.back_url} target="_blank" rel="noopener noreferrer"><img src={c.back_url} alt="back" className="rounded border" style={{ borderColor: BORDER, height: 130 }} /></a>}
              </div>
            ))}
          </div>
        )}

      <div style={{ fontSize: 11, letterSpacing: ".04em", fontWeight: 800, color: MUTED, margin: "10px 0 6px" }}>ENRICH FROM APOLLO.IO</div>
      <button onClick={lookup} disabled={busy !== null} className="rounded px-3 py-1.5 font-bold" style={{ background: NAVY, color: "#fff", fontSize: 12.5 }}>
        {busy === "lookup" ? "Asking Apollo…" : "Look this contact up"}
      </button>
      {msg && <span className="text-xs font-semibold ml-2" style={{ color: msg.includes("✓") ? GREEN : "#8A5B00" }}>{msg}</span>}

      {sug && (
        <div className="rounded border p-3 mt-2" style={{ borderColor: BORDER, maxWidth: 560 }}>
          <div className="text-xs mb-2" style={{ color: MUTED }}>
            What Apollo claims — tick what should be written. A claim by an outside service goes through the same hands as a visiting card.
          </div>
          {Object.entries(LABEL).map(([k, label]) => {
            const v = sug[k];
            if (!v) return null;
            const applyable = APPLYABLE.includes(k);
            return (
              <div key={k} className="flex items-center gap-2 py-0.5" style={{ fontSize: 12.5 }}>
                {applyable
                  ? <input type="checkbox" checked={!!ticked[k]} onChange={(e) => setTicked((t) => ({ ...t, [k]: e.target.checked }))} />
                  : <span style={{ width: 13 }} />}
                <span style={{ width: 130, color: MUTED }}>{label}</span>
                {k === "linkedin"
                  ? <a href={String(v)} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: NAVY }}>{String(v)}</a>
                  : <b style={{ color: INK }}>{String(v)}</b>}
                {applyable && String(personRow[k === "name" ? "first_name" : k] ?? "").trim() && (
                  <span style={{ fontSize: 10.5, color: MUTED }}>(now: {String(personRow[k === "name" ? "first_name" : k])})</span>
                )}
              </div>
            );
          })}
          <button onClick={apply} disabled={busy !== null || !Object.values(ticked).some(Boolean)}
            className="rounded px-3 py-1.5 font-bold mt-2" style={{ background: GREEN, color: "#fff", fontSize: 12.5 }}>
            {busy === "apply" ? "Writing…" : "Apply the ticked fields"}
          </button>
        </div>
      )}
    </div>
  );
}
