/**
 * A ball of yarn with a trailing thread — small brand accent (plan 11).
 */
export function YarnBall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true" focusable="false">
      <circle cx="21" cy="22" r="16" fill="var(--color-brand-rose)" stroke="var(--color-brand-ink)" strokeWidth="2.2" />
      <path d="M7 19 q11 -8 24 -2 M7 27 q11 -8 24 -2 M9 34 q10 -8 22 -3" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.6" opacity="0.4" strokeLinecap="round" />
      <path d="M15 7.5 q-7 11 0 23" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.6" opacity="0.4" strokeLinecap="round" />
      <path d="M36 27 q8 4 6.5 10 q-1.5 5.5 4 6.5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
