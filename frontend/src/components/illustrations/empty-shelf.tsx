/**
 * Empty-state illustration — a shelf waiting for its first pieces (plan 11).
 */
export function EmptyShelf({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 150" className={className} aria-hidden="true" focusable="false">
      {/* Shelf */}
      <rect x="20" y="104" width="180" height="10" rx="5" fill="var(--color-brand-lavender)" stroke="var(--color-brand-ink)" strokeWidth="2" />
      <rect x="32" y="114" width="9" height="18" rx="3.5" fill="var(--color-brand-lavender)" stroke="var(--color-brand-ink)" strokeWidth="2" />
      <rect x="179" y="114" width="9" height="18" rx="3.5" fill="var(--color-brand-lavender)" stroke="var(--color-brand-ink)" strokeWidth="2" />

      {/* Yarn ball on the shelf */}
      <circle cx="64" cy="88" r="16" fill="var(--color-brand-rose)" stroke="var(--color-brand-ink)" strokeWidth="2" />
      <path d="M50 85 q11 -8 24 -2 M50 93 q11 -8 24 -2 M52 100 q10 -8 22 -3" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.5" opacity="0.4" strokeLinecap="round" />
      <path d="M79 92 q7 4 6 9 q-1 5 4 5.5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.8" strokeLinecap="round" />

      {/* Hanging price tag */}
      <path d="M143 114 q3 5 5 9" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <g transform="rotate(12 148 132)">
        <rect x="134" y="124" width="28" height="17" rx="4.5" fill="var(--color-brand-butter)" stroke="var(--color-brand-ink)" strokeWidth="2" />
        <circle cx="140" cy="132.5" r="2" fill="var(--color-brand-ink)" />
      </g>

      {/* Floating hearts + sparkles */}
      <path d="M96 58 c0 -5 4.5 -8.5 8 -5.5 3.5 -3 8 0.5 8 5.5 0 6.5 -8 12 -8 12 s-8 -5.5 -8 -12 z" fill="var(--color-brand-rose)" opacity="0.75" />
      <path d="M122 40 c0 -3.6 3.2 -6 5.8 -4 2.6 -2 5.8 0.4 5.8 4 0 4.7 -5.8 8.7 -5.8 8.7 s-5.8 -4 -5.8 -8.7 z" fill="var(--color-brand-lavender)" opacity="0.8" />
      <path d="M40 56 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 z" fill="var(--color-brand-butter)" />
      <path d="M178 52 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="var(--color-brand-sage)" />
    </svg>
  );
}
