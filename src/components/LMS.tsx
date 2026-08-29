"use client";
// Learning — the LMS.
//
// The section exists for one sentence: SO THAT SOMEBODY'S TOTAL LEARNING CAN
// BE DOCUMENTED IN THEIR IDP. Everything here is arranged around that.
//
//   A tick is not learning. A lesson cannot be completed without fifty words
//   in the person's own words, and it is those words — not the tick — the IDP
//   is made of.
//
//   Planned time is not time. Only completed lessons add to a total. Letting
//   intentions accumulate is how a training record ends up flattering everyone
//   in it.
//
//   Training taken elsewhere still counts. A course, a seminar, a site visit —
//   added by hand, and it lands in the same total.
//
// The library is small and shared, so it comes down in one payload and every
// view of it is computed in memory.
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import LmsText from "./LmsText";
import LmsVideo from "./LmsVideo";
import {
  MIN_LEARNING_WORDS, STATUS_META, STATUS_ORDER, wordCount, learningShortfall,
  meetsLearningFloor, totalsOf, hhmm, parseVideo, pdfEmbed,
  type Book, type Section, type Lesson, type Progress, type Extra, type Plan, type LessonStatus,
} from "@/lib/lms";
import { today, fmtFull } from "@/lib/schedule";

const C = {
  ink: "#16232F", body: "#22303C", sub: "#5A6672", mute: "#8A94A0", faint: "#B8B5AC",
  line: "#E2E0DA", panel: "#F4F2EC", accent: "#E8600A", navy: "#1B3A5C",
  green: "#0D7A3F", amber: "#D97706", red: "#B3261E", violet: "#7C3AED",
};

const TABS = [
  { key: "goals", label: "Learning Goals", icon: "🎯" },
  { key: "mine", label: "My Learning", icon: "🧾" },
  { key: "team", label: "My Team", icon: "👥" },
  { key: "library", label: "Library", icon: "✍️" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

interface Payload {
  installed: boolean;
  me: { id: string; name: string; isAdmin: boolean };
  person: string;
  books: Book[];
  sections: Section[];
  lessons: Lesson[];
  progress: Progress[];
  extras: Extra[];
  plan: Plan | null;
  team: { id: string; depth: number; name: string; designation: string | null }[];
  canAuthor: boolean;
}

export default function LMS() {
  const [d, setD] = useState<Payload | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "not_installed" | "error">("loading");
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<TabKey>("goals");
  const [openBook, setOpenBook] = useState<string | null>(null);
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r: Payload = await api.get("/api/lms");
      if (!r.installed) { setState("not_installed"); return; }
      setD(r);
      setState("ok");
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      if (/lms_|not installed|does not exist|schema cache/i.test(m)) setState("not_installed");
      else { setErr(m); setState("error"); }
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const post = useCallback(async (body: Record<string, unknown>) => {
    await api.post("/api/lms", body);
    await load();
  }, [load]);

  if (state === "loading") return <div className="p-8 text-sm" style={{ color: C.mute }}>Opening the library…</div>;
  if (state === "not_installed") return <NotInstalled />;
  if (state === "error") return <div className="p-8 text-sm" style={{ color: C.red }}>{err}</div>;
  if (!d) return null;

  const lessonById = new Map(d.lessons.map((l) => [l.id, l]));
  const progressBy = new Map(d.progress.map((p) => [p.lesson_id, p]));
  const totals = totalsOf(d.progress, lessonById, d.extras);
  const book = openBook ? d.books.find((b) => b.id === openBook) ?? null : null;
  const lesson = openLesson ? lessonById.get(openLesson) ?? null : null;

  const ctx: Ctx = { d, lessonById, progressBy, totals, post, openLesson: setOpenLesson, openBook: setOpenBook, reload: load };

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <div>
          <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.4 }}>LEARNING</div>
          <div className="text-lg font-bold" style={{ color: C.ink, lineHeight: 1.2 }}>
            What you are building into yourself
          </div>
        </div>
        <div className="flex-1" style={{ minWidth: 20 }} />
        <Totals totals={totals} />
      </div>

      <div className="flex gap-1 rounded p-1 mb-1 overflow-x-auto" style={{ background: "#fff", border: `1px solid ${C.line}` }}>
        {TABS.filter((t) => t.key !== "library" || d.canAuthor).filter((t) => t.key !== "team" || d.team.length > 0).map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); setOpenBook(null); }}
            className="px-3 py-1.5 rounded text-xs font-bold whitespace-nowrap flex-shrink-0"
            style={tab === t.key ? { background: C.body, color: "#fff" } : { color: C.sub }}>
            <span style={{ marginRight: 5 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
      <div className="text-xs mb-3" style={{ color: C.mute }}>
        {tab === "goals" && "Your learning plan, and the fifteen books it is drawn from."}
        {tab === "mine" && "Everything on your name — planned, under way, finished — plus training you took elsewhere."}
        {tab === "team" && "What the people below you have been learning."}
        {tab === "library" && "Write the lessons. A lesson is authored once and can sit in as many books as it belongs in."}
      </div>

      {tab === "goals" && (book
        ? <BookView ctx={ctx} book={book} onBack={() => setOpenBook(null)} />
        : <GoalsTab ctx={ctx} />)}
      {tab === "mine" && <MineTab ctx={ctx} />}
      {tab === "team" && <TeamTab ctx={ctx} />}
      {tab === "library" && d.canAuthor && <LibraryTab ctx={ctx} onEdit={setEditing} />}

      {lesson && <LessonDrawer ctx={ctx} lesson={lesson} onClose={() => setOpenLesson(null)} />}
      {editing && d.canAuthor && <LessonEditor ctx={ctx} id={editing.id} onClose={() => setEditing(null)} />}
    </div>
  );
}

interface Ctx {
  d: Payload;
  lessonById: Map<string, Lesson>;
  progressBy: Map<string, Progress>;
  totals: ReturnType<typeof totalsOf>;
  post: (body: Record<string, unknown>) => Promise<void>;
  openLesson: (id: string | null) => void;
  openBook: (id: string | null) => void;
  reload: () => Promise<void>;
}

// ===========================================================================
function Totals({ totals }: { totals: ReturnType<typeof totalsOf> }) {
  return (
    <div className="flex gap-2 flex-wrap">
      <Pill label="Completed" value={String(totals.completed)} color={C.green} />
      <Pill label="In progress" value={String(totals.inProgress)} color={C.amber} />
      <Pill label="Planned" value={String(totals.planned)} color={C.sub} />
      <Pill label="Time learned" value={hhmm(totals.totalMinutes)} color={C.accent}
        note={totals.extraMinutes ? `incl. ${hhmm(totals.extraMinutes)} outside Genie` : undefined} />
    </div>
  );
}

function Pill({ label, value, color, note }: { label: string; value: string; color: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-white px-2.5 py-1" style={{ borderColor: C.line, borderTop: `3px solid ${color}` }} title={note}>
      <div style={{ fontSize: 10, color: C.mute, letterSpacing: 0.6, textTransform: "uppercase" }}>{label}</div>
      <div className="tnum font-bold" style={{ fontSize: 17, color, lineHeight: 1.2 }}>{value}</div>
    </div>
  );
}

function StatusChip({ status }: { status: LessonStatus }) {
  const m = STATUS_META[status];
  return (
    <span className="text-xs font-bold rounded px-1.5 py-0.5" style={{ background: m.bg, color: m.color }}>{m.label}</span>
  );
}

// ===========================================================================
// Tab 1 — Learning Goals: the plan, then the shelves
// ===========================================================================
function GoalsTab({ ctx }: { ctx: Ctx }) {
  const { d } = ctx;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const generate = async () => {
    setBusy(true); setMsg("");
    try {
      const r = await api.post("/api/lms/plan", {});
      await ctx.reload();
      setMsg(
        `Plan written${r.planned ? ` · ${r.planned} lesson${r.planned === 1 ? "" : "s"} added to your plan` : ""}` +
        (r.dropped > 0 ? ` · ${r.dropped} suggestion${r.dropped === 1 ? "" : "s"} discarded for naming a lesson that does not exist` : ""),
      );
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const countFor = (bookId: string) => d.lessons.filter((l) => l.shelves.some((s) => s.book_id === bookId)).length;
  const doneFor = (bookId: string) =>
    d.lessons.filter((l) => l.shelves.some((s) => s.book_id === bookId) && ctx.progressBy.get(l.id)?.status === "completed").length;

  return (
    <>
      {/* ---- the learning plan ---- */}
      <div className="rounded-lg border bg-white p-3 mb-3" style={{ borderColor: C.line, borderLeft: `5px solid ${C.violet}` }}>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-xs font-bold tracking-widest" style={{ color: C.violet }}>✨ MY LEARNING PLAN</span>
          {d.plan?.generated_at && (
            <span className="text-xs" style={{ color: C.faint }}>
              written {fmtFull(String(d.plan.generated_at))}
            </span>
          )}
          <div className="flex-1" style={{ minWidth: 10 }} />
          <button onClick={generate} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5"
            style={{ background: C.violet, color: "#fff", opacity: busy ? 0.5 : 1 }}>
            {busy ? "Reading your record…" : d.plan?.plan ? "↻ Write it again" : "Write my plan"}
          </button>
        </div>

        {d.plan?.plan ? (
          <>
            <LmsText text={d.plan.plan} />
            {d.plan.rationale && (
              <details className="mt-1">
                <summary className="text-xs font-bold cursor-pointer" style={{ color: C.sub }}>Why these lessons</summary>
                <div className="mt-1"><LmsText text={d.plan.rationale} small /></div>
              </details>
            )}
          </>
        ) : (
          <div className="text-xs" style={{ color: C.sub, lineHeight: 1.55 }}>
            Genie reads your role, your department, your key result areas and what you have already finished, then writes
            what you should be building towards — and puts the lessons it recommends onto your plan. It can only choose
            from lessons that actually exist in the library.
          </div>
        )}
        {msg && (
          <div className="text-xs mt-1.5 font-semibold" style={{ color: msg.includes("written") ? C.green : C.red, lineHeight: 1.5 }}>{msg}</div>
        )}
      </div>

      {/* ---- the shelves ---- */}
      <div className="text-xs font-bold mb-1.5" style={{ color: C.mute, letterSpacing: 1.1 }}>THE BOOKS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(226px, 1fr))", gap: 8 }}>
        {d.books.map((b) => {
          const total = countFor(b.id);
          const done = doneFor(b.id);
          const pct = total ? (done / total) * 100 : 0;
          return (
            <button key={b.id} onClick={() => ctx.openBook(b.id)}
              className="rounded-lg border bg-white p-3 text-left"
              style={{ borderColor: C.line, borderTop: `3px solid ${b.color}`, cursor: "pointer" }}>
              <div className="flex items-baseline gap-2">
                <span className="font-bold rounded px-1" style={{ background: b.color + "1A", color: b.color, fontSize: 11, letterSpacing: 0.5 }}>
                  {b.icon || b.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="font-bold text-sm" style={{ color: C.ink, lineHeight: 1.25 }}>{b.name}</span>
              </div>
              {b.blurb && <div className="text-xs mt-1" style={{ color: C.sub, lineHeight: 1.45 }}>{b.blurb}</div>}
              <div className="mt-2" style={{ height: 5, background: "#EFEDE7", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: `${pct}%`, height: 5, background: b.color }} />
              </div>
              <div className="text-xs mt-1" style={{ color: total ? C.faint : C.amber }}>
                {total === 0 ? "No lessons yet" : `${done} of ${total} done`}
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

// ===========================================================================
// A book: its sections, and the lessons in each
// ===========================================================================
function BookView({ ctx, book, onBack }: { ctx: Ctx; book: Book; onBack: () => void }) {
  const { d } = ctx;
  const sections = d.sections.filter((s) => s.book_id === book.id).sort((a, b) => a.sort_order - b.sort_order);
  const inBook = d.lessons
    .map((l) => ({ l, shelf: l.shelves.find((s) => s.book_id === book.id) }))
    .filter((x) => x.shelf)
    .sort((a, b) => (a.shelf!.sort_order - b.shelf!.sort_order) || a.l.title.localeCompare(b.l.title));

  const loose = inBook.filter((x) => !x.shelf!.section_id);
  const [newSection, setNewSection] = useState("");

  const planAll = async () => {
    const ids = inBook.map((x) => x.l.id).filter((id) => !ctx.progressBy.has(id));
    if (!ids.length) return;
    await ctx.post({ action: "progress.plan", lesson_ids: ids, planned_by: "self" });
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <button onClick={onBack} className="text-xs font-bold rounded px-2.5 py-1"
          style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>← All books</button>
        <span className="font-bold rounded px-1.5 py-0.5" style={{ background: book.color + "1A", color: book.color, fontSize: 12 }}>
          {book.icon || book.name.slice(0, 2).toUpperCase()}
        </span>
        <span className="font-bold text-base" style={{ color: C.ink }}>{book.name}</span>
        <span className="text-xs" style={{ color: C.faint }}>{inBook.length} lesson{inBook.length === 1 ? "" : "s"}</span>
        <div className="flex-1" style={{ minWidth: 10 }} />
        {inBook.some((x) => !ctx.progressBy.has(x.l.id)) && (
          <button onClick={planAll} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
            + Plan the whole book
          </button>
        )}
      </div>

      {inBook.length === 0 && (
        <div className="rounded-lg border bg-white p-8 text-center text-sm" style={{ borderColor: C.line, color: C.mute }}>
          Nothing has been written into this book yet.
          {d.canAuthor && <> Add lessons from the <b>Library</b> tab and shelve them here.</>}
        </div>
      )}

      {sections.map((sec) => {
        const rows = inBook.filter((x) => x.shelf!.section_id === sec.id);
        return (
          <div key={sec.id} className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>{sec.name.toUpperCase()}</span>
              <span className="text-xs" style={{ color: C.faint }}>{rows.length}</span>
              {d.canAuthor && (
                <button
                  onClick={() => { if (window.confirm(`Delete the section "${sec.name}"?\n\nIts lessons stay in the book — they simply fall loose.`)) ctx.post({ action: "section.delete", id: sec.id }); }}
                  className="text-xs" style={{ color: C.faint }} title="Delete this section">✕</button>
              )}
            </div>
            <LessonRows ctx={ctx} rows={rows} book={book} />
          </div>
        );
      })}

      {loose.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-bold mb-1" style={{ color: C.mute, letterSpacing: 1.1 }}>
            {sections.length ? "NOT IN A SECTION" : "LESSONS"}
          </div>
          <LessonRows ctx={ctx} rows={loose} book={book} />
        </div>
      )}

      {d.canAuthor && (
        <div className="flex items-center gap-2 mt-2">
          <input value={newSection} onChange={(e) => setNewSection(e.target.value)} placeholder="New section name"
            className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line, width: 220 }} />
          <button
            onClick={async () => {
              if (!newSection.trim()) return;
              await ctx.post({ action: "section.save", book_id: book.id, name: newSection, sort_order: sections.length * 10 });
              setNewSection("");
            }}
            className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.body, color: "#fff" }}>
            + Section
          </button>
        </div>
      )}
    </>
  );
}

function LessonRows({ ctx, rows, book }: { ctx: Ctx; rows: { l: Lesson; shelf?: { section_id: string | null } }[]; book: Book }) {
  const sections = ctx.d.sections.filter((s) => s.book_id === book.id);
  if (!rows.length)
    return <div className="rounded-lg border bg-white px-3 py-3 text-xs" style={{ borderColor: C.line, color: C.faint }}>Nothing here yet.</div>;
  return (
    <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
      {rows.map(({ l }, i) => {
        const p = ctx.progressBy.get(l.id);
        const video = parseVideo(l.video_url);
        return (
          <div key={l.id} className="flex items-center gap-2 px-3 py-2 flex-wrap"
            style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <button onClick={() => ctx.openLesson(l.id)} className="font-semibold text-sm text-left"
              style={{ color: C.navy, flex: "1 1 220px", minWidth: 180 }}>
              {l.title}
            </button>
            <span className="text-xs" style={{ color: C.faint, width: 54, textAlign: "right" }}>{l.minutes ? `${l.minutes} m` : "—"}</span>
            {video.kind === "youtube" || video.kind === "drive" ? <span title="Has a video">🎬</span> : <span style={{ width: 16 }} />}
            {l.pdf_url ? <span title="Has a PDF">📄</span> : <span style={{ width: 16 }} />}
            {p ? <StatusChip status={p.status} /> : (
              <button onClick={() => ctx.post({ action: "progress.plan", lesson_ids: [l.id], planned_by: "self" })}
                className="text-xs font-bold rounded px-2 py-0.5"
                style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                + Plan
              </button>
            )}
            {ctx.d.canAuthor && sections.length > 0 && (
              <select
                value={rows.find((r) => r.l.id === l.id)?.shelf?.section_id || ""}
                onChange={(e) => ctx.post({ action: "lesson.move", lesson_id: l.id, book_id: book.id, section_id: e.target.value || null })}
                className="text-xs border rounded px-1 py-0.5 bg-white" style={{ borderColor: C.line, color: C.sub }}
                title="Move this lesson to another section of this book">
                <option value="">— no section —</option>
                {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// The lesson itself
// ===========================================================================
function LessonDrawer({ ctx, lesson, onClose }: { ctx: Ctx; lesson: Lesson; onClose: () => void }) {
  const existing = ctx.progressBy.get(lesson.id);
  const [status, setStatus] = useState<LessonStatus>(existing?.status || "in_progress");
  const [learning, setLearning] = useState(existing?.learning || "");
  const [minutes, setMinutes] = useState(String(existing?.minutes || lesson.minutes || ""));
  const [completedOn, setCompletedOn] = useState(existing?.completed_on || today());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const words = wordCount(learning);
  const short = learningShortfall(learning);
  const canComplete = meetsLearningFloor(learning);
  const video = parseVideo(lesson.video_url);
  const pdf = pdfEmbed(lesson.pdf_url);
  const books = lesson.shelves
    .map((s) => ctx.d.books.find((b) => b.id === s.book_id))
    .filter(Boolean) as Book[];

  const save = async (as: LessonStatus) => {
    if (as === "completed" && !canComplete) {
      setMsg(short || `At least ${MIN_LEARNING_WORDS} words, please.`);
      return;
    }
    setBusy(true); setMsg("");
    try {
      await ctx.post({
        action: "progress.save",
        lesson_id: lesson.id,
        status: as,
        learning,
        minutes: Number(minutes) || 0,
        completed_on: as === "completed" ? completedOn : null,
      });
      setStatus(as);
      setMsg(as === "completed" ? "Completed ✓ — it is on your record and in your IDP total." : "Saved ✓");
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.45)", zIndex: 60, display: "flex", justifyContent: "flex-end" }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(760px, 100%)", background: "#F1EFE9", height: "100%", overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)" }}>
        <div className="px-4 py-3 flex items-start gap-3" style={{ background: C.ink, position: "sticky", top: 0, zIndex: 2 }}>
          <div style={{ flex: 1 }}>
            <div className="text-xs font-bold" style={{ color: "#8FA1B3", letterSpacing: 1.2 }}>LESSON</div>
            <div className="font-bold text-white" style={{ fontSize: 17, lineHeight: 1.25 }}>{lesson.title}</div>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {books.map((b) => (
                <span key={b.id} className="text-xs font-bold rounded px-1.5" style={{ background: b.color, color: "#fff" }}>{b.name}</span>
              ))}
              {lesson.minutes > 0 && <span className="text-xs rounded px-1.5" style={{ background: "#22303C", color: "#8FA1B3" }}>{lesson.minutes} min</span>}
            </div>
          </div>
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }} title="Close">✕</button>
        </div>

        <div className="p-4">
          {lesson.description && (
            <div className="rounded-lg bg-white border p-3 mb-3" style={{ borderColor: C.line }}>
              <div className="text-xs font-bold mb-1" style={{ color: C.mute, letterSpacing: 1.1 }}>WHAT THIS IS FOR</div>
              <LmsText text={lesson.description} small />
            </div>
          )}

          {video.embed && <div className="mb-3"><LmsVideo video={video} /></div>}

          {lesson.content && (
            <div className="rounded-lg bg-white border p-3 mb-3" style={{ borderColor: C.line }}>
              <LmsText text={lesson.content} />
            </div>
          )}

          {pdf && (
            <div className="rounded-lg bg-white border mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
              <div className="px-3 py-1.5 text-xs font-bold flex items-center gap-2" style={{ background: C.panel, color: C.sub }}>
                📄 DOCUMENT
                <a href={lesson.pdf_url!} target="_blank" rel="noreferrer" className="ml-auto font-bold underline" style={{ color: C.navy }}>
                  open in a new tab
                </a>
              </div>
              <iframe src={pdf} style={{ width: "100%", height: 520, border: "none", display: "block" }} />
            </div>
          )}

          {/* ---- the fifty words ---- */}
          <div className="rounded-lg bg-white border p-3" style={{ borderColor: C.line, borderLeft: `5px solid ${C.green}` }}>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-bold tracking-widest" style={{ color: C.green }}>WHAT I LEARNED</span>
              {existing && <StatusChip status={existing.status} />}
              <div className="flex-1" style={{ minWidth: 10 }} />
              <span className="text-xs tnum font-bold" style={{ color: canComplete ? C.green : C.amber }}>
                {words} / {MIN_LEARNING_WORDS} words
              </span>
            </div>
            <div className="text-xs mb-1.5" style={{ color: C.sub, lineHeight: 1.5 }}>
              In your own words — what you took from this, and what you will do differently. This is what goes into your
              IDP, so it is worth more than the tick beside it.
            </div>
            <textarea
              value={learning}
              onChange={(e) => setLearning(e.target.value)}
              rows={7}
              placeholder="What did this lesson actually tell you, and where will you use it?"
              className="w-full text-sm border rounded p-2"
              style={{ borderColor: canComplete ? C.green : C.line, lineHeight: 1.55, resize: "vertical" }}
            />
            <div className="mt-1" style={{ height: 5, background: "#EFEDE7", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ width: `${Math.min(100, (words / MIN_LEARNING_WORDS) * 100)}%`, height: 5, background: canComplete ? C.green : C.amber }} />
            </div>

            <div className="flex items-end gap-2 flex-wrap mt-2">
              <div>
                <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Minutes it took</div>
                <input value={minutes} onChange={(e) => setMinutes(e.target.value)} inputMode="numeric"
                  className="text-xs border rounded px-2 py-1.5 tnum text-right" style={{ borderColor: C.line, width: 80 }} />
              </div>
              {status === "completed" && (
                <div>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Completed on</div>
                  <input type="date" value={completedOn} onChange={(e) => setCompletedOn(e.target.value)}
                    className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
                </div>
              )}
              <div className="flex-1" style={{ minWidth: 10 }} />
              <button onClick={() => save("in_progress")} disabled={busy}
                className="text-xs font-bold rounded px-3 py-1.5" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                Save and keep going
              </button>
              <button onClick={() => save("completed")} disabled={busy || !canComplete}
                title={canComplete ? "Mark this lesson complete" : short || ""}
                className="text-xs font-bold rounded px-3 py-1.5"
                style={{ background: canComplete ? C.green : "#DCE3DC", color: canComplete ? "#fff" : C.faint, cursor: canComplete ? "pointer" : "not-allowed" }}>
                {busy ? "Saving…" : "✔ Mark complete"}
              </button>
            </div>
            {!canComplete && short && (
              <div className="text-xs mt-1.5" style={{ color: C.amber }}>{short}</div>
            )}
            {msg && (
              <div className="text-xs mt-1.5 font-semibold" style={{ color: msg.includes("✓") ? C.green : C.red, lineHeight: 1.5 }}>{msg}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 2 — My Learning
// ===========================================================================
function MineTab({ ctx }: { ctx: Ctx }) {
  const { d, totals } = ctx;
  const [showExtra, setShowExtra] = useState(false);

  const rows = d.progress
    .map((p) => ({ p, l: ctx.lessonById.get(p.lesson_id) }))
    .filter((x) => x.l) as { p: Progress; l: Lesson }[];

  return (
    <>
      <div className="flex gap-2 flex-wrap mb-3">
        <Stat label="Lessons completed" value={String(totals.completed)} note="each with fifty words behind it" color={C.green} />
        <Stat label="Time on lessons" value={hhmm(totals.minutes)} note="completed lessons only — planned time is not time" color={C.accent} />
        <Stat label="Training elsewhere" value={hhmm(totals.extraMinutes)} note={`${totals.extraCount} added by hand`} color={C.navy} />
        <Stat label="Words written" value={totals.words.toLocaleString("en-IN")} note="the raw material of your IDP" color={C.violet} />
      </div>

      {STATUS_ORDER.map((st) => {
        // the queue's own order: assigned trainings wear the low numbers and
        // stand at the top; self-planned lessons (default 1000) follow
        const list = rows.filter((x) => x.p.status === st)
          .sort((a, b) => ((a.p.sort_order ?? 1000) - (b.p.sort_order ?? 1000)) || a.l.title.localeCompare(b.l.title));
        if (!list.length) return null;
        return (
          <div key={st} className="mb-3">
            <div className="text-xs font-bold mb-1" style={{ color: C.mute, letterSpacing: 1.1 }}>
              {STATUS_META[st].label.toUpperCase()} · {list.length}
            </div>
            <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
              {list.map(({ p, l }, i) => (
                <div key={l.id} className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
                  <button onClick={() => ctx.openLesson(l.id)} className="font-semibold text-sm text-left" style={{ color: C.navy, flex: "1 1 220px", minWidth: 180 }}>
                    {l.title}
                  </button>
                  {p.planned_by === "Genie" && <span className="text-xs rounded px-1.5" style={{ background: "#F3EEFB", color: C.violet }}>✨ Genie</span>}
                  <span className="text-xs tnum" style={{ color: C.faint, width: 60, textAlign: "right" }}>
                    {hhmm(p.minutes || l.minutes)}
                  </span>
                  {p.completed_on && <span className="text-xs tnum" style={{ color: C.green }}>{fmtFull(p.completed_on)}</span>}
                  {p.status === "completed" && (
                    <span className="text-xs" style={{ color: C.faint }} title={p.learning}>{wordCount(p.learning)} words</span>
                  )}
                  {p.status !== "completed" && (
                    <button onClick={() => ctx.post({ action: "progress.remove", lesson_id: l.id })}
                      className="text-xs" style={{ color: C.faint }} title="Take this off my plan">✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {rows.length === 0 && (
        <div className="rounded-lg border bg-white p-8 text-center text-sm mb-3" style={{ borderColor: C.line, color: C.mute }}>
          Nothing on your plan yet. Ask Genie to write your learning plan on the <b>Learning Goals</b> tab, or open a book
          and add lessons yourself.
        </div>
      )}

      {/* ---- training taken elsewhere ---- */}
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>TRAINING TAKEN ELSEWHERE · {d.extras.length}</span>
        <div className="flex-1" />
        <button onClick={() => setShowExtra(!showExtra)} className="text-xs font-bold rounded px-2.5 py-1"
          style={showExtra ? { background: C.body, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
          {showExtra ? "Close" : "+ Add training"}
        </button>
      </div>
      {showExtra && <ExtraForm ctx={ctx} onDone={() => setShowExtra(false)} />}
      {d.extras.length > 0 && (
        <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
          {d.extras.map((x, i) => (
            <div key={x.id} className="px-3 py-2" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm" style={{ color: C.ink, flex: "1 1 200px" }}>{x.title}</span>
                {x.provider && <span className="text-xs" style={{ color: C.sub }}>{x.provider}</span>}
                {x.on_date && <span className="text-xs tnum" style={{ color: C.faint }}>{fmtFull(x.on_date)}</span>}
                <span className="text-xs tnum font-bold" style={{ color: C.accent }}>{hhmm(x.minutes)}</span>
                <button onClick={() => { if (window.confirm(`Remove "${x.title}" from your record?`)) ctx.post({ action: "extra.delete", id: x.id }); }}
                  className="text-xs" style={{ color: C.faint }}>✕</button>
              </div>
              {x.learning && <div className="text-xs mt-0.5" style={{ color: C.sub, lineHeight: 1.5 }}>{x.learning}</div>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ExtraForm({ ctx, onDone }: { ctx: Ctx; onDone: () => void }) {
  const [f, setF] = useState({ title: "", provider: "", on_date: today(), minutes: "", learning: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const submit = async () => {
    if (!f.title.trim()) { setMsg("What was the training called?"); return; }
    setBusy(true); setMsg("");
    try {
      await ctx.post({ action: "extra.add", ...f, minutes: Number(f.minutes) || 0 });
      onDone();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border bg-white p-3 mb-2" style={{ borderColor: C.line }}>
      <div className="text-xs mb-2" style={{ color: C.sub, lineHeight: 1.5 }}>
        A course, a seminar, a site visit, a certification — anything you learned from that Genie did not hand you. It
        counts towards the same total.
      </div>
      <div className="flex gap-2 flex-wrap items-end">
        <div style={{ flex: "2 1 220px" }}>
          <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>What was it</div>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Who ran it</div>
          <input value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })} className="w-full text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
        </div>
        <div>
          <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>When</div>
          <input type="date" value={f.on_date} onChange={(e) => setF({ ...f, on_date: e.target.value })} className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
        </div>
        <div>
          <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Minutes</div>
          <input value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} inputMode="numeric"
            className="text-xs border rounded px-2 py-1.5 tnum text-right" style={{ borderColor: C.line, width: 80 }} />
        </div>
      </div>
      <div className="mt-2">
        <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>What you took from it</div>
        <textarea value={f.learning} onChange={(e) => setF({ ...f, learning: e.target.value })} rows={3}
          className="w-full text-xs border rounded p-2" style={{ borderColor: C.line, lineHeight: 1.55, resize: "vertical" }} />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button onClick={submit} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff", opacity: busy ? 0.5 : 1 }}>
          {busy ? "Adding…" : "Add to my record"}
        </button>
        {msg && <span className="text-xs font-semibold" style={{ color: C.red }}>{msg}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div className="rounded-lg border bg-white p-3" style={{ borderColor: C.line, flex: "1 1 0", minWidth: 180 }}>
      <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1, textTransform: "uppercase" }}>{label}</div>
      <div className="tnum font-bold" style={{ fontSize: 24, color, lineHeight: 1.2 }}>{value}</div>
      <div className="text-xs" style={{ color: C.faint, lineHeight: 1.4 }}>{note}</div>
    </div>
  );
}

// ===========================================================================
// Tab 3 — My Team
// ===========================================================================
function TeamTab({ ctx }: { ctx: Ctx }) {
  const [who, setWho] = useState<string>("");
  const [rec, setRec] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (id: string) => {
    setWho(id);
    setRec(null);
    if (!id) return;
    setBusy(true);
    try { setRec(await api.get(`/api/lms?person=${encodeURIComponent(id)}`)); }
    catch { /* the manager view is a read; a failure says nothing rather than shouting */ }
    finally { setBusy(false); }
  };

  const t = rec ? totalsOf(rec.progress, new Map(rec.lessons.map((l) => [l.id, l])), rec.extras) : null;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <span className="text-xs font-bold" style={{ color: C.mute }}>WHOSE RECORD</span>
        <select value={who} onChange={(e) => pick(e.target.value)}
          className="text-xs border rounded px-2 py-1 bg-white font-bold" style={{ borderColor: C.line, color: C.body }}>
          <option value="">Pick someone below you…</option>
          {ctx.d.team.map((m) => (
            <option key={m.id} value={m.id}>{"— ".repeat(m.depth - 1)}{m.name}{m.designation ? ` · ${m.designation}` : ""}</option>
          ))}
        </select>
        {busy && <span className="text-xs" style={{ color: C.mute }}>reading…</span>}
      </div>

      {!who && (
        <div className="rounded-lg border bg-white p-8 text-center text-sm" style={{ borderColor: C.line, color: C.mute }}>
          Pick anyone below you to see what they have been learning — everyone in your line, not just your direct reports.
        </div>
      )}

      {rec && t && (
        <>
          <div className="flex gap-2 flex-wrap mb-3">
            <Stat label="Completed" value={String(t.completed)} note="lessons finished with fifty words" color={C.green} />
            <Stat label="In progress" value={String(t.inProgress)} note="started, not finished" color={C.amber} />
            <Stat label="Planned" value={String(t.planned)} note="on their plan, not started" color={C.sub} />
            <Stat label="Total time" value={hhmm(t.totalMinutes)} note={t.lastCompleted ? `last on ${fmtFull(t.lastCompleted)}` : "nothing finished yet"} color={C.accent} />
          </div>

          {rec.plan?.plan && (
            <div className="rounded-lg border bg-white p-3 mb-3" style={{ borderColor: C.line, borderLeft: `5px solid ${C.violet}` }}>
              <div className="text-xs font-bold tracking-widest mb-1" style={{ color: C.violet }}>THEIR LEARNING PLAN</div>
              <LmsText text={rec.plan.plan} small />
            </div>
          )}

          <div className="text-xs font-bold mb-1" style={{ color: C.mute, letterSpacing: 1.1 }}>WHAT THEY WROTE</div>
          {rec.progress.filter((p) => p.status === "completed").length === 0 ? (
            <div className="rounded-lg border bg-white p-6 text-center text-sm" style={{ borderColor: C.line, color: C.mute }}>
              Nothing finished yet.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {rec.progress.filter((p) => p.status === "completed").map((p) => {
                const l = rec.lessons.find((x) => x.id === p.lesson_id);
                return (
                  <div key={p.lesson_id} className="rounded-lg border bg-white p-3" style={{ borderColor: C.line }}>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-bold text-sm" style={{ color: C.ink }}>{l?.title || p.lesson_id}</span>
                      {p.completed_on && <span className="text-xs tnum" style={{ color: C.green }}>{fmtFull(p.completed_on)}</span>}
                      <span className="text-xs" style={{ color: C.faint }}>{wordCount(p.learning)} words · {hhmm(p.minutes || l?.minutes || 0)}</span>
                    </div>
                    <div className="text-xs mt-1" style={{ color: C.sub, lineHeight: 1.55 }}>{p.learning}</div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}

// ===========================================================================
// Tab 4 — Library (admins)
// ===========================================================================
function LibraryTab({ ctx, onEdit }: { ctx: Ctx; onEdit: (t: { id?: string }) => void }) {
  const { d } = ctx;
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = d.lessons.filter((l) => !needle || l.title.toLowerCase().includes(needle));
  const unshelved = d.lessons.filter((l) => l.shelves.length === 0).length;

  return (
    <>
      <BooksPanel ctx={ctx} />

      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search lessons"
          className="text-xs border rounded px-2 py-1.5" style={{ borderColor: C.line, minWidth: 240 }} />
        <span className="text-xs" style={{ color: C.faint }}>{list.length} of {d.lessons.length}</span>
        <div className="flex-1" />
        <button onClick={() => onEdit({})} className="text-xs font-bold rounded px-3 py-1.5" style={{ background: C.accent, color: "#fff" }}>
          + New lesson
        </button>
      </div>

      {unshelved > 0 && (
        <div className="rounded-lg p-2.5 mb-3 text-xs" style={{ background: "#FFF7E6", border: "1px solid #F0D9A8", color: "#8A5A00", lineHeight: 1.5 }}>
          {unshelved} lesson{unshelved === 1 ? " is" : "s are"} not in any book, so nobody can find {unshelved === 1 ? "it" : "them"} from
          Learning Goals. Open {unshelved === 1 ? "it" : "each"} and tick at least one book.
        </div>
      )}

      <div className="rounded-lg border bg-white" style={{ borderColor: C.line, overflow: "hidden" }}>
        {list.map((l, i) => (
          <div key={l.id} className="flex items-center gap-2 px-3 py-2 flex-wrap" style={{ borderTop: i === 0 ? "none" : `1px solid ${C.line}` }}>
            <button onClick={() => onEdit({ id: l.id })} className="font-semibold text-sm text-left" style={{ color: C.navy, flex: "1 1 220px", minWidth: 180 }}>
              {l.title}
            </button>
            <div className="flex gap-1 flex-wrap" style={{ flex: "1 1 200px" }}>
              {l.shelves.map((s) => {
                const b = d.books.find((x) => x.id === s.book_id);
                return b ? <span key={s.book_id} className="text-xs rounded px-1.5" style={{ background: b.color + "1A", color: b.color }}>{b.name}</span> : null;
              })}
              {l.shelves.length === 0 && <span className="text-xs" style={{ color: C.amber }}>not in any book</span>}
            </div>
            <span className="text-xs tnum" style={{ color: C.faint, width: 50, textAlign: "right" }}>{l.minutes ? `${l.minutes} m` : "—"}</span>
            <button onClick={() => ctx.openLesson(l.id)} className="text-xs font-bold" style={{ color: C.sub }} title="See it as a learner does">👁</button>
          </div>
        ))}
        {list.length === 0 && (
          <div className="px-3 py-8 text-center text-sm" style={{ color: C.mute }}>
            {d.lessons.length === 0 ? "No lessons written yet. This is where they start." : "Nothing matches that search."}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The shelves themselves — add a sixteenth book, or rename one of the fifteen.
 *
 * Collapsed by default: the books are set up once and the lessons are the
 * daily work, so this must not sit above the lesson list shouting for
 * attention every time somebody opens the Library.
 *
 * A book is never deleted, only made inactive. Lessons are shelved against its
 * id, and deleting the shelf a lesson stands on loses where it belonged.
 */
function BooksPanel({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Partial<Book> & { isNew?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const blank = { isNew: true, name: "", icon: "", color: "#1B3A5C", blurb: "", sort_order: (ctx.d.books.length + 1) * 10 };

  const save = async () => {
    if (!edit?.name?.trim()) { setMsg("A book needs a name"); return; }
    setBusy(true); setMsg("");
    try {
      await ctx.post({
        action: "book.save",
        // no id on a new book — the server slugs the name. Renaming an existing
        // one keeps its id, so nothing shelved under it is orphaned.
        id: edit.isNew ? undefined : edit.id,
        name: edit.name, icon: edit.icon, color: edit.color, blurb: edit.blurb,
        sort_order: edit.sort_order, active: true,
      });
      setEdit(null);
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-lg border bg-white mb-3" style={{ borderColor: C.line, overflow: "hidden" }}>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-3 py-2 text-left" style={{ background: C.panel }}>
        <span className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 1.1 }}>THE BOOKS · {ctx.d.books.length}</span>
        <span className="text-xs" style={{ color: C.faint }}>add a book, rename one, change its colour or order</span>
        <div className="flex-1" />
        <span style={{ color: C.sub }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="p-3">
          <div className="flex gap-1.5 flex-wrap mb-2">
            {ctx.d.books.map((b) => (
              <button key={b.id} onClick={() => setEdit({ ...b })} className="text-xs font-bold rounded px-2 py-1"
                style={{ background: b.color + "1A", color: b.color, border: `1px solid ${b.color}33` }}
                title={`Edit "${b.name}"`}>
                {b.icon ? `${b.icon} ` : ""}{b.name}
              </button>
            ))}
            <button onClick={() => setEdit(blank)} className="text-xs font-bold rounded px-2 py-1"
              style={{ background: C.accent, color: "#fff" }}>
              + New book
            </button>
          </div>

          {edit && (
            <div className="rounded-lg border p-3" style={{ borderColor: C.line, background: "#FBFAF7" }}>
              <div className="text-xs font-bold mb-2" style={{ color: C.mute, letterSpacing: 1 }}>
                {edit.isNew ? "NEW BOOK" : `EDITING · ${edit.name}`}
              </div>
              <div className="flex gap-2 flex-wrap items-end">
                <div style={{ flex: "2 1 200px" }}>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Name</div>
                  <input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Badge</div>
                  <input value={edit.icon || ""} onChange={(e) => setEdit({ ...edit, icon: e.target.value.slice(0, 2).toUpperCase() })}
                    maxLength={2} placeholder="KZ"
                    className="text-sm border rounded px-2 py-1.5 text-center font-bold" style={{ borderColor: C.line, width: 62 }}
                    title="Two letters, shown on the shelf" />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Colour</div>
                  <input type="color" value={edit.color || "#1B3A5C"} onChange={(e) => setEdit({ ...edit, color: e.target.value })}
                    className="border rounded" style={{ borderColor: C.line, width: 48, height: 32, padding: 2 }} />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>Order</div>
                  <input value={String(edit.sort_order ?? 0)} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) || 0 })}
                    inputMode="numeric" className="text-sm border rounded px-2 py-1.5 tnum text-right" style={{ borderColor: C.line, width: 70 }} />
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xs font-semibold mb-0.5" style={{ color: C.mute }}>One line about it</div>
                <input value={edit.blurb || ""} onChange={(e) => setEdit({ ...edit, blurb: e.target.value })}
                  className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }}
                  placeholder="Shown under the name on the shelf" />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <button onClick={save} disabled={busy} className="text-xs font-bold rounded px-3 py-1.5"
                  style={{ background: C.accent, color: "#fff", opacity: busy ? 0.5 : 1 }}>
                  {busy ? "Saving…" : edit.isNew ? "Create book" : "Save changes"}
                </button>
                <button onClick={() => { setEdit(null); setMsg(""); }} className="text-xs font-bold rounded px-3 py-1.5"
                  style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                  Cancel
                </button>
                {msg && <span className="text-xs font-semibold" style={{ color: C.red }}>{msg}</span>}
                {!edit.isNew && (
                  <span className="text-xs" style={{ color: C.faint }}>
                    Renaming is safe — lessons stay shelved where they are.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LessonEditor({ ctx, id, onClose }: { ctx: Ctx; id?: string; onClose: () => void }) {
  const existing = id ? ctx.lessonById.get(id) : null;
  const [f, setF] = useState({
    title: existing?.title || "",
    description: existing?.description || "",
    content: existing?.content || "",
    video_url: existing?.video_url || "",
    pdf_url: existing?.pdf_url || "",
    minutes: String(existing?.minutes || ""),
  });
  const [shelves, setShelves] = useState<{ book_id: string; section_id: string | null }[]>(
    existing?.shelves.map((s) => ({ book_id: s.book_id, section_id: s.section_id })) || [],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const toggleBook = (bookId: string) =>
    setShelves((p) => (p.some((s) => s.book_id === bookId) ? p.filter((s) => s.book_id !== bookId) : [...p, { book_id: bookId, section_id: null }]));

  const video = parseVideo(f.video_url);

  const save = async () => {
    if (!f.title.trim()) { setMsg("A lesson needs a title"); return; }
    setBusy(true); setMsg("");
    try {
      await ctx.post({ action: "lesson.save", id, ...f, minutes: Number(f.minutes) || 0, shelves });
      onClose();
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(22,35,47,0.45)", zIndex: 60, display: "flex", justifyContent: "flex-end" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: "min(720px, 100%)", background: "#fff", height: "100%", overflowY: "auto", boxShadow: "-8px 0 24px rgba(0,0,0,0.18)" }}>
        <div className="px-4 py-3 flex items-center gap-3" style={{ background: C.ink, position: "sticky", top: 0, zIndex: 2 }}>
          <div className="font-bold text-white" style={{ fontSize: 15 }}>{id ? "Edit lesson" : "New lesson"}</div>
          <div className="flex-1" />
          <button onClick={onClose} className="font-bold" style={{ color: "#8FA1B3", fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <Field label="Title">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
          </Field>

          <Field label="Description" hint="What this lesson is for, in a line or two. Markdown works.">
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={3}
              className="w-full text-sm border rounded p-2" style={{ borderColor: C.line, resize: "vertical" }} />
          </Field>

          <Field label="Content" hint="The lesson body. Markdown: # heading, - bullet, **bold**, [link](url).">
            <textarea value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} rows={10}
              className="w-full text-sm border rounded p-2" style={{ borderColor: C.line, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 12 }} />
          </Field>

          <Field label="Video link" hint="YouTube or a Google Drive share link. YouTube plays with only play, pause, forward and the clock.">
            <input value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…"
              className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
            {f.video_url && (
              <div className="text-xs mt-1" style={{ color: video.embed ? C.green : C.red }}>
                {video.embed ? `Recognised as ${video.kind === "youtube" ? "a YouTube video" : video.kind === "drive" ? "a Drive file" : "a video file"} ✓` : "Not a link Genie can embed — it will show as a plain link."}
              </div>
            )}
          </Field>

          <Field label="PDF link" hint="A Drive share link or any direct PDF URL. It is embedded in the lesson.">
            <input value={f.pdf_url} onChange={(e) => setF({ ...f, pdf_url: e.target.value })}
              className="w-full text-sm border rounded px-2 py-1.5" style={{ borderColor: C.line }} />
          </Field>

          <Field label="Minutes" hint="Roughly how long it should take.">
            <input value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} inputMode="numeric"
              className="text-sm border rounded px-2 py-1.5 tnum text-right" style={{ borderColor: C.line, width: 90 }} />
          </Field>

          <Field label="Books" hint="A lesson can live in as many books as it belongs in — it is stored once, so editing it here changes it everywhere.">
            <div className="flex gap-1.5 flex-wrap">
              {ctx.d.books.map((b) => {
                const on = shelves.some((s) => s.book_id === b.id);
                return (
                  <button key={b.id} onClick={() => toggleBook(b.id)} className="text-xs font-bold rounded px-2 py-1"
                    style={on ? { background: b.color, color: "#fff" } : { background: "#fff", border: `1px solid ${C.line}`, color: C.sub }}>
                    {b.name}
                  </button>
                );
              })}
            </div>
            {shelves.length === 0 && (
              <div className="text-xs mt-1" style={{ color: C.amber }}>
                Not in any book yet — nobody will find it from Learning Goals until it is.
              </div>
            )}
          </Field>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={busy} className="text-sm font-bold rounded px-4 py-2" style={{ background: C.accent, color: "#fff", opacity: busy ? 0.5 : 1 }}>
              {busy ? "Saving…" : "Save lesson"}
            </button>
            {id && (
              <button
                onClick={() => { if (window.confirm("Retire this lesson?\n\nIt disappears from the books. Nobody's completion or what they wrote is lost.")) { ctx.post({ action: "lesson.retire", id }); onClose(); } }}
                className="text-sm font-bold rounded px-3 py-2" style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.red }}>
                Retire
              </button>
            )}
            {msg && <span className="text-xs font-semibold" style={{ color: C.red }}>{msg}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-bold" style={{ color: C.mute, letterSpacing: 0.8 }}>{label.toUpperCase()}</div>
      {hint && <div className="text-xs mb-1" style={{ color: C.faint, lineHeight: 1.45 }}>{hint}</div>}
      {children}
    </div>
  );
}

// ===========================================================================
function NotInstalled() {
  return (
    <div className="p-8" style={{ maxWidth: 640 }}>
      <div className="text-lg font-bold mb-2" style={{ color: C.ink }}>Learning isn&apos;t installed yet</div>
      <p className="text-sm mb-3" style={{ color: C.sub, lineHeight: 1.6 }}>
        Run <code style={{ background: C.panel, padding: "1px 5px", borderRadius: 3 }}>supabase/migrations/0027_lms.sql</code>{" "}
        in the Supabase SQL editor, then reload this page.
      </p>
      <p className="text-xs" style={{ color: C.mute, lineHeight: 1.6 }}>
        It creates the books, lessons, sections and everybody&apos;s learning record, and seeds the fifteen books. Purely
        additive — nothing already running depends on it.
      </p>
    </div>
  );
}
