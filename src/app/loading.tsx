export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--paper)" }}>
      <div className="flex items-center gap-3 text-sm font-semibold" style={{ color: "var(--dim)" }}>
        <span className="animate-spin rounded-full" style={{ width: 22, height: 22, border: "3px solid #D9D6CD", borderTopColor: "var(--accent)", display: "inline-block" }} />
        Genie is opening…
      </div>
    </div>
  );
}
