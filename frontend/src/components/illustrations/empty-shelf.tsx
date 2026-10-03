/**
 * Empty state — Hanadi behind a nearly-empty shelf (coming soon / no items).
 * Hanadi herself is a static brand image (owner 2026-10-03); the props
 * stay theme-aware.
 */
export function EmptyShelf({ className }: { className?: string }) {
  const ink = "var(--color-brand-ink)";
  return (
    <svg viewBox="0 0 220 140" className={className} aria-hidden="true" focusable="false">
      {/* Hanadi (behind the shelf) */}
      <g transform="translate(58 12) scale(1.02)">
        <image href="/brand/hanadi-bust.svg" width="96" height="96" />
      </g>

      {/* shelf */}
      <rect x="30" y="104" width="160" height="10" rx="5" fill="var(--color-brand-terracotta)" stroke={ink} strokeWidth="2" />
      <rect x="42" y="114" width="9" height="18" rx="3.5" fill="var(--color-brand-terracotta)" stroke={ink} strokeWidth="2" />
      <rect x="169" y="114" width="9" height="18" rx="3.5" fill="var(--color-brand-terracotta)" stroke={ink} strokeWidth="2" />

      {/* a single waiting heart + sparkles */}
      <path
        d="M 186 84 c0 -5 4.5 -8.5 8 -5.5 3.5 -3 8 0.5 8 5.5 0 6.5 -8 12 -8 12 s-8 -5.5 -8 -12 z"
        fill="var(--color-brand-pomegranate)"
        opacity="0.8"
      />
      <path d="M 22 52 l 2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 z" fill="var(--color-brand-gold)" />
      <path d="M 198 26 l 2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="var(--color-brand-teal)" opacity="0.85" />
      <circle cx="150" cy="30" r="3" fill="var(--color-brand-olive)" opacity="0.8" />
    </svg>
  );
}
