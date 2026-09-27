/**
 * Soft confetti moment — hearts, sparkles and dots for brief success states
 * (plan 11: "brief delightful success moments").
 */
export function ConfettiHearts({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 120" className={className} aria-hidden="true" focusable="false">
      {/* Center heart */}
      <path
        d="M80 96 c-16 -11 -26 -22 -26 -36 c0 -11 9 -18 18 -15 c6 2 8 6 8 9 c0 -3 2 -7 8 -9 c9 -3 18 4 18 15 c0 14 -10 25 -26 36 z"
        fill="var(--color-brand-pomegranate)"
        stroke="var(--color-brand-ink)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* Small hearts */}
      <path d="M28 40 c0 -6.5 5.5 -11 10 -7 4.5 -4 10 0.5 10 7 c0 8 -10 15 -10 15 s-10 -7 -10 -15 z" fill="var(--color-brand-teal)" opacity="0.85" />
      <path d="M118 34 c0 -5 4.5 -8.5 8 -5.5 3.5 -3 8 0.5 8 5.5 0 6.5 -8 12 -8 12 s-8 -5.5 -8 -12 z" fill="var(--color-brand-gold)" />
      {/* Dots */}
      <circle cx="22" cy="74" r="3.5" fill="var(--color-brand-olive)" />
      <circle cx="140" cy="70" r="4" fill="var(--color-brand-pomegranate)" opacity="0.7" />
      <circle cx="58" cy="18" r="3" fill="var(--color-brand-gold)" />
      <circle cx="102" cy="14" r="2.6" fill="var(--color-brand-teal)" />
      <circle cx="132" cy="98" r="3" fill="var(--color-brand-olive)" opacity="0.8" />
      {/* Sparkles */}
      <path d="M44 26 l3 7.5 7.5 3 -7.5 3 -3 7.5 -3 -7.5 -7.5 -3 7.5 -3 z" fill="var(--color-brand-gold)" opacity="0.9" />
      <path d="M124 52 l2.4 6 6 2.4 -6 2.4 -2.4 6 -2.4 -6 -6 -2.4 6 -2.4 z" fill="var(--color-brand-pomegranate)" opacity="0.8" />
    </svg>
  );
}
