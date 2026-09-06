export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#F1EFE9" }}>
      <div className="flex items-center gap-3 text-sm font-semibold" style={{ color: "#5A6672" }}>
        <span className="animate-spin rounded-full" style={{ width: 22, height: 22, border: "3px solid #D9D6CD", borderTopColor: "#E8600A", display: "inline-block" }} />
        Genie is opening…
      </div>
    </div>
  );
}
