/**
 * Hero mascot — mama's bunny with a ball of yarn (plan 11).
 * Decorative: sized via className, colored via brand tokens.
 */
export function MascotBunny({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 170" className={className} aria-hidden="true" focusable="false">
      {/* Ground shadow */}
      <ellipse cx="108" cy="152" rx="82" ry="8" fill="var(--color-brand-ink)" opacity="0.07" />

      {/* Yarn ball */}
      <circle cx="162" cy="118" r="26" fill="var(--color-brand-rose)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
      <path d="M138 110 q16 -10 38 -2 M138 122 q16 -10 38 -2 M142 134 q14 -9 32 -4" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.8" opacity="0.4" strokeLinecap="round" />
      <path d="M155 93 q-10 13 -1 28" fill="none" stroke="var(--color-brand-ink)" strokeWidth="1.8" opacity="0.4" strokeLinecap="round" />
      {/* Trailing thread */}
      <path d="M187 128 q14 6 12 14 q-2 7 8 9" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2.2" strokeLinecap="round" />

      {/* Bunny ears */}
      <g transform="rotate(-14 54 34)">
        <ellipse cx="54" cy="34" rx="14" ry="26" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
        <ellipse cx="54" cy="36" rx="7" ry="16" fill="var(--color-brand-rose)" opacity="0.7" />
      </g>
      <g transform="rotate(14 102 34)">
        <ellipse cx="102" cy="34" rx="14" ry="26" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
        <ellipse cx="102" cy="36" rx="7" ry="16" fill="var(--color-brand-rose)" opacity="0.7" />
      </g>
      {/* Bunny head */}
      <circle cx="78" cy="92" r="44" fill="var(--color-brand-cream)" stroke="var(--color-brand-ink)" strokeWidth="2.5" />
      {/* Tuft */}
      <path d="M78 48 q2 -8 10 -6.5" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2.2" strokeLinecap="round" />
      {/* Eyes */}
      <circle cx="62" cy="88" r="4.4" fill="var(--color-brand-ink)" />
      <circle cx="94" cy="88" r="4.4" fill="var(--color-brand-ink)" />
      {/* Cheeks */}
      <ellipse cx="46" cy="102" rx="7.5" ry="4.8" fill="var(--color-brand-rose)" opacity="0.55" />
      <ellipse cx="110" cy="102" rx="7.5" ry="4.8" fill="var(--color-brand-rose)" opacity="0.55" />
      {/* Nose + mouth */}
      <path d="M78 96 l3.8 4.4 h-7.6 z" fill="var(--color-brand-ink)" strokeLinejoin="round" />
      <path d="M78 100.4 q-3 5 -8 3 M78 100.4 q3 5 8 3" fill="none" stroke="var(--color-brand-ink)" strokeWidth="2.2" strokeLinecap="round" />

      {/* Ambient accents */}
      <path d="M150 44 c0 -5 4.5 -8.5 8 -5.5 3.5 -3 8 0.5 8 5.5 0 6.5 -8 12 -8 12 s-8 -5.5 -8 -12 z" fill="var(--color-brand-rose)" opacity="0.7" />
      <path d="M182 66 c0 -3.6 3.2 -6 5.8 -4 2.6 -2 5.8 0.4 5.8 4 0 4.7 -5.8 8.7 -5.8 8.7 s-5.8 -4 -5.8 -8.7 z" fill="var(--color-brand-lavender)" opacity="0.8" />
      <path d="M196 96 l2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 z" fill="var(--color-brand-butter)" />
    </svg>
  );
}
