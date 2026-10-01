/**
 * THE KINDLE MARK (Dr Raghu, 1 Oct 2026: "Right now, we don't have a logo.
 * Create one of your own as you deem fit.")
 *
 * A flame of three tongues, because the group's line is "Keeping the fire
 * alive" and because ten people around a table is a fire with many tongues.
 * The outer tongue is ember, the inner amber, the heart cream — a fire seen
 * from close. Drawn as an SVG so it is one file, any size, and replaceable
 * the day a designed mark exists.
 */
export function KindleFlame({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="kf-outer" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#b3331a" /><stop offset="1" stopColor="#f26b1d" />
        </linearGradient>
        <linearGradient id="kf-inner" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f26b1d" /><stop offset="1" stopColor="#f5b32b" />
        </linearGradient>
      </defs>
      <path d="M32 3c3 9 11 13 14 22 3 8 1 15-3 20 1-6-2-11-6-14 1 6-2 11-6 13-5 3-11 1-13-5-2-6 1-12 5-16-1 7 3 10 6 11-2-9 1-20 3-31z" fill="url(#kf-outer)" />
      <path d="M32 24c2 5 7 8 8 14 1 5-1 9-4 12 0-4-2-7-4-9 0 4-2 7-4 8-3 2-7 0-8-4-1-4 1-8 3-10 0 4 2 6 4 7-1-6 2-12 5-18z" fill="url(#kf-inner)" />
      <path d="M32 40c1 3 4 5 4 8 0 3-2 5-4 6-2-1-4-3-4-6 0-3 3-5 4-8z" fill="#fff2d6" />
      <path d="M12 58h40" stroke="#2a2420" strokeWidth="2.5" strokeLinecap="round" opacity=".55" />
    </svg>
  );
}

export default function KindleLogo({ size = 36, dark = false, slogan = true }: { size?: number; dark?: boolean; slogan?: boolean }) {
  const ink = dark ? "#fff7ea" : "#2a2420";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, lineHeight: 1 }}>
      <KindleFlame size={size} />
      <div>
        <div style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontWeight: 700, fontSize: size * 0.62, letterSpacing: 0.5, color: ink }}>
          Kindle
        </div>
        {slogan && <div style={{ fontSize: Math.max(10, size * 0.28), color: dark ? "#f5b32b" : "#b3331a", marginTop: 3, letterSpacing: 0.6, textTransform: "uppercase" }}>Keeping the fire alive</div>}
      </div>
    </div>
  );
}
