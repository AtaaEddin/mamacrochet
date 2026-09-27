import { MamaBust } from "@/components/illustrations/mama-pieces";

/**
 * 404 illustration — Mama next to a page tangled in yarn (brand v2).
 */
export function LostScene({ className }: { className?: string }) {
  const ink = "var(--color-brand-ink)";
  return (
    <svg viewBox="0 0 240 140" className={className} aria-hidden="true" focusable="false">
      {/* Mama */}
      <g transform="translate(10 16)">
        <MamaBust />
      </g>

      {/* tangled page */}
      <g transform="rotate(6 166 80)">
        <rect x="128" y="34" width="76" height="92" rx="8" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="2.2" />
        <g stroke={ink} strokeWidth="2" opacity="0.35" strokeLinecap="round">
          <path d="M 140 52 h 40" />
          <path d="M 140 64 h 52" />
          <path d="M 140 76 h 34" />
          <path d="M 140 88 h 48" />
        </g>
      </g>

      {/* trailing thread */}
      <path
        d="M 176 98 C 158 72 150 94 138 76 C 130 62 124 72 112 64"
        fill="none"
        stroke="var(--color-brand-pomegranate)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />

      {/* yarn ball */}
      <circle cx="196" cy="102" r="20" fill="var(--color-brand-pomegranate)" stroke={ink} strokeWidth="2.4" />
      <g fill="none" stroke="var(--color-brand-mama-scarf-deep)" strokeWidth="1.6" opacity="0.6" strokeLinecap="round">
        <path d="M 178 96 q 18 8 36 -2" />
        <path d="M 180 108 q 16 6 32 -6" />
        <path d="M 186 88 q 14 10 24 16" />
      </g>

      {/* sparkles */}
      <path d="M 124 22 l 2.6 6.4 6.4 2.6 -6.4 2.6 -2.6 6.4 -2.6 -6.4 -6.4 -2.6 6.4 -2.6 z" fill="var(--color-brand-gold)" />
      <path d="M 222 52 l 2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="var(--color-brand-teal)" opacity="0.85" />
    </svg>
  );
}
