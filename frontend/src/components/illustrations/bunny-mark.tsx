/**
 * mamacrochet logo mark — a soft bunny face (plan 11 mascot).
 * Decorative: sized via className, colored via brand tokens.
 */
export function BunnyMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      {/* Ears */}
      <g transform="rotate(-14 24 16)">
        <ellipse cx="24" cy="16" rx="7" ry="13" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
        <ellipse cx="24" cy="17" rx="3.4" ry="8" fill="var(--color-brand-rose)" opacity="0.75" />
      </g>
      <g transform="rotate(14 40 16)">
        <ellipse cx="40" cy="16" rx="7" ry="13" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
        <ellipse cx="40" cy="17" rx="3.4" ry="8" fill="var(--color-brand-rose)" opacity="0.75" />
      </g>
      {/* Head */}
      <circle cx="32" cy="40" r="20" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
      {/* Tuft */}
      <path d="M32 20 q1.5 -4 5 -3.5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2" strokeLinecap="round" />
      {/* Eyes */}
      <circle cx="25" cy="39" r="2.2" fill="var(--color-brand-ink)" />
      <circle cx="39" cy="39" r="2.2" fill="var(--color-brand-ink)" />
      {/* Cheeks */}
      <ellipse cx="19" cy="45" rx="3.6" ry="2.3" fill="var(--color-brand-rose)" opacity="0.6" />
      <ellipse cx="45" cy="45" rx="3.6" ry="2.3" fill="var(--color-brand-rose)" opacity="0.6" />
      {/* Nose + mouth */}
      <path d="M32 42.6 l1.9 2.2 h-3.8 z" fill="var(--color-brand-ink)" strokeLinejoin="round" />
      <path d="M32 44.8 q-1.5 2.5 -4 1.5 M32 44.8 q1.5 2.5 4 1.5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
