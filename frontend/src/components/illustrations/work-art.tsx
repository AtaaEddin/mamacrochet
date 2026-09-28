import type { WorkArtKind } from "@/lib/sample-works";

/**
 * Sample-work illustrations (brand v2) — flat, hand-drawn style, brand
 * tokens only. Placeholder until real product photos ship with plan 04.
 */
export function WorkArt({ kind, className }: { kind: WorkArtKind; className?: string }) {
  const ink = "var(--color-brand-ink)";
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      {kind === "sunflowerTote" && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* handles */}
          <path d="M 32 40 C 32 26 44 26 44 40" fill="none" stroke={ink} strokeWidth="2.4" />
          <path d="M 52 40 C 52 26 64 26 64 40" fill="none" stroke={ink} strokeWidth="2.4" />
          {/* bag */}
          <rect x="22" y="38" width="52" height="44" rx="10" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="2.2" />
          {/* stem + leaf */}
          <path d="M 48 78 L 48 60" stroke="var(--color-brand-olive)" strokeWidth="3" fill="none" />
          <path d="M 48 70 q -10 -2 -12 -10 q 10 0 12 10 z" fill="var(--color-brand-olive)" stroke={ink} strokeWidth="1.6" />
          {/* petals */}
          {[
            [57, 52],
            [54.4, 58.4],
            [48, 61],
            [41.6, 58.4],
            [39, 52],
            [41.6, 45.6],
            [48, 43],
            [54.4, 45.6],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill="var(--color-brand-gold)" stroke={ink} strokeWidth="1.5" />
          ))}
          {/* center */}
          <circle cx="48" cy="52" r="5.5" fill="var(--color-brand-terracotta)" stroke={ink} strokeWidth="1.8" />
        </g>
      )}
      {kind === "pumpkin" && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* stem */}
          <path
            d="M 48 38 q -1.5 -8 6 -10.5 q 4 -1.2 3 3 q -6 1.2 -5 7.5 z"
            fill="var(--color-brand-olive)"
            stroke={ink}
            strokeWidth="1.8"
          />
          {/* body */}
          <ellipse cx="48" cy="60" rx="26" ry="22" fill="var(--color-brand-terracotta)" stroke={ink} strokeWidth="2.2" />
          {/* ridges */}
          <path d="M 48 39 C 40 46 40 74 48 81" fill="none" stroke={ink} strokeWidth="1.6" opacity="0.35" />
          <path d="M 48 39 C 56 46 56 74 48 81" fill="none" stroke={ink} strokeWidth="1.6" opacity="0.35" />
          {/* face */}
          <path d="M 36.8 58 q 2.6 2.6 5.2 0" fill="none" stroke={ink} strokeWidth="2.2" />
          <path d="M 54 58 q 2.6 2.6 5.2 0" fill="none" stroke={ink} strokeWidth="2.2" />
          <circle cx="34" cy="64.5" r="3" fill="var(--color-brand-hanadi-blush)" opacity="0.7" />
          <circle cx="62" cy="64.5" r="3" fill="var(--color-brand-hanadi-blush)" opacity="0.7" />
          <path d="M 43 65.5 q 5 4 10 0" fill="none" stroke={ink} strokeWidth="2.2" />
        </g>
      )}
      {kind === "owlBag" && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* handle */}
          <path d="M 36 30 C 36 20 60 20 60 30" fill="none" stroke={ink} strokeWidth="2.4" />
          {/* ear tufts */}
          <path d="M 30 40 L 26 27 L 39 33 Z" fill="var(--color-brand-teal)" stroke={ink} strokeWidth="2" />
          <path d="M 66 40 L 70 27 L 57 33 Z" fill="var(--color-brand-teal)" stroke={ink} strokeWidth="2" />
          {/* body */}
          <ellipse cx="48" cy="59" rx="24" ry="26" fill="var(--color-brand-teal)" stroke={ink} strokeWidth="2.2" />
          {/* belly */}
          <ellipse cx="48" cy="66" rx="14" ry="13.5" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="1.8" />
          {/* eyes */}
          <circle cx="40" cy="51" r="7" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="1.8" />
          <circle cx="56" cy="51" r="7" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="1.8" />
          <circle cx="41" cy="52" r="3" fill={ink} />
          <circle cx="55" cy="52" r="3" fill={ink} />
          {/* beak */}
          <path d="M 44.5 58 L 51.5 58 L 48 63.5 Z" fill="var(--color-brand-gold)" stroke={ink} strokeWidth="1.6" />
          {/* wings */}
          <path d="M 27 60 q -4.5 8 2 14.5 q 4.5 3.5 8 1.5" fill="none" stroke={ink} strokeWidth="1.8" opacity="0.7" />
          <path d="M 69 60 q 4.5 8 -2 14.5 q -4.5 3.5 -8 1.5" fill="none" stroke={ink} strokeWidth="1.8" opacity="0.7" />
        </g>
      )}
      {kind === "strawberry" && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* clip */}
          <rect x="30" y="24" width="36" height="8" rx="4" fill="var(--color-brand-gold)" stroke={ink} strokeWidth="2" />
          {/* berry */}
          <path
            d="M 48 84
               C 30 74 26 58 30 48
               C 33 40 42 38 48 44
               C 54 38 63 40 66 48
               C 70 58 66 74 48 84 Z"
            fill="var(--color-brand-pomegranate)"
            stroke={ink}
            strokeWidth="2.2"
          />
          {/* leaf crown */}
          <path
            d="M 48 46
               C 40 38 32 38 28 32
               C 36 30 44 34 48 40
               C 52 34 60 30 68 32
               C 64 38 56 38 48 46 Z"
            fill="var(--color-brand-olive)"
            stroke={ink}
            strokeWidth="1.8"
          />
          {/* seeds */}
          {[
            [40, 55],
            [56, 55],
            [48, 62],
            [41, 69],
            [55, 69],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.5" fill="var(--color-brand-gold)" />
          ))}
        </g>
      )}
      {kind === "bird" && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* branch */}
          <path d="M 24 78 q 24 8 48 0" fill="none" stroke="var(--color-brand-olive)" strokeWidth="3" />
          <path d="M 56 76 q 4 -6 10 -7" fill="none" stroke="var(--color-brand-olive)" strokeWidth="2" />
          {/* tail */}
          <path d="M 31 57 L 21 62 L 31 64 Z" fill="var(--color-brand-gold)" stroke={ink} strokeWidth="1.8" />
          {/* body */}
          <circle cx="48" cy="54" r="17" fill="var(--color-brand-gold)" stroke={ink} strokeWidth="2.2" />
          {/* belly */}
          <circle cx="44.5" cy="58" r="9.5" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="1.6" />
          {/* wing */}
          <path d="M 37 50 q -8 4 -6 12 q 6 4.5 12 0.5 q 1.5 -8 -6 -12.5 z" fill="var(--color-brand-teal)" stroke={ink} strokeWidth="1.8" />
          {/* eye + beak */}
          <circle cx="53" cy="48.5" r="2.6" fill={ink} />
          <path d="M 65 52.5 L 73 55.5 L 65 58.5 Z" fill="var(--color-brand-terracotta)" stroke={ink} strokeWidth="1.6" />
          {/* feet */}
          <path d="M 44 70.5 L 44 77.5" stroke={ink} strokeWidth="2" />
          <path d="M 50 70.5 L 50 77.5" stroke={ink} strokeWidth="2" />
        </g>
      )}
      {kind === "teacup" && (
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* steam */}
          <path d="M 40 34 q 3 -5 0 -10" fill="none" stroke={ink} strokeWidth="1.8" opacity="0.4" />
          <path d="M 52 34 q -3 -5 0 -10" fill="none" stroke={ink} strokeWidth="1.8" opacity="0.4" />
          {/* saucer */}
          <ellipse cx="48" cy="76" rx="26" ry="7" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="2.2" />
          {/* handle */}
          <path d="M 68 52 C 78 52 78 64 66 64" fill="none" stroke={ink} strokeWidth="2.2" />
          {/* cup */}
          <path d="M 28 48 L 33 69 Q 48 74 63 69 L 68 48 Z" fill="var(--color-brand-cream)" stroke={ink} strokeWidth="2.2" />
          {/* rim */}
          <ellipse cx="48" cy="48" rx="20" ry="5.5" fill="var(--color-card)" stroke={ink} strokeWidth="2" />
          {/* Iznik tulip motif */}
          <path d="M 48 67 L 48 59" stroke="var(--color-brand-teal)" strokeWidth="2" fill="none" />
          <path
            d="M 48 59
               C 44.5 57.5 44 53 46 51
               C 47 52.5 48 52.5 48 51
               C 48 52.5 49 52.5 50 51
               C 52 53 51.5 57.5 48 59 Z"
            fill="var(--color-brand-pomegranate)"
            stroke={ink}
            strokeWidth="1.3"
          />
          <path d="M 48 64 C 44 64 41 62 40 59 C 44 59.5 47 61 48 63 Z" fill="var(--color-brand-teal)" />
        </g>
      )}
    </svg>
  );
}
