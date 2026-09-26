/**
 * 404 illustration — a page tangled in the yarn, with mama's bunny (plan 11).
 */
export function LostScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 160" className={className} aria-hidden="true" focusable="false">
      {/* 404 */}
      <text
        x="70"
        y="66"
        textAnchor="middle"
        fontFamily="var(--font-baloo), var(--font-cairo), sans-serif"
        fontSize="52"
        fontWeight="800"
        fill="var(--color-brand-rose)"
        stroke="var(--color-brand-ink)"
        strokeWidth="1.2"
      >
        404
      </text>

      {/* Tangled thread */}
      <path
        d="M14 128 c10 -26 24 -26 30 0 c5 26 18 26 28 0 c10 -26 24 -26 34 0 c8 20 26 18 40 2"
        fill="none"
        stroke="var(--color-brand-ink)"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.45"
      />

      {/* Bunny peeking */}
      <g transform="translate(168 86) scale(0.85)">
        <g transform="rotate(-14 24 16)">
          <ellipse cx="24" cy="16" rx="7" ry="13" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
          <ellipse cx="24" cy="17" rx="3.4" ry="8" fill="var(--color-brand-rose)" opacity="0.75" />
        </g>
        <g transform="rotate(14 40 16)">
          <ellipse cx="40" cy="16" rx="7" ry="13" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
          <ellipse cx="40" cy="17" rx="3.4" ry="8" fill="var(--color-brand-rose)" opacity="0.75" />
        </g>
        <circle cx="32" cy="40" r="20" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
        <path d="M32 20 q1.5 -4 5 -3.5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="25" cy="39" r="2.2" fill="var(--color-brand-ink)" />
        <circle cx="39" cy="39" r="2.2" fill="var(--color-brand-ink)" />
        <ellipse cx="19" cy="45" rx="3.6" ry="2.3" fill="var(--color-brand-rose)" opacity="0.6" />
        <ellipse cx="45" cy="45" rx="3.6" ry="2.3" fill="var(--color-brand-rose)" opacity="0.6" />
        <path d="M32 42.6 l1.9 2.2 h-3.8 z" fill="var(--color-brand-ink)" strokeLinejoin="round" />
        <path d="M32 44.8 q-1.5 2.5 -4 1.5 M32 44.8 q1.5 2.5 4 1.5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.8" strokeLinecap="round" />
      </g>

      {/* Sparkles */}
      <path d="M196 60 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 z" fill="var(--color-brand-butter)" />
      <path d="M118 100 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="var(--color-brand-sage)" />
    </svg>
  );
}
