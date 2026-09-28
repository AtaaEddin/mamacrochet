/**
 * Hanadi — the hanadicrochet mascot (plan 20260926-2309, brand v2).
 *
 * A warm grandmother with a traditional headscarf that only wraps her hair —
 * face and neck fully visible (explicitly NOT a hijab; like the classic
 * European working-women's hair scarf of the early 1900s, worn by many
 * Turkish/Arabic grandmothers). Pomegranate scarf with turquoise flowers,
 * gold earrings.
 *
 * These are raw <g> pieces; wrap them in an <svg> via hanadi-mark / hanadi-scene.
 * All fills use brand tokens so art adapts to light/dark automatically.
 */

/** Small 5-petal flower (turquoise petals, gold center) for the scarf. */
export function HanadiFlower({
  cx,
  cy,
  s = 1,
}: {
  cx: number;
  cy: number;
  s?: number;
}) {
  const petals = [0, 72, 144, 216, 288].map((deg) => {
    const rad = (deg * Math.PI) / 180;
    return {
      x: cx + Math.cos(rad) * 2.1 * s,
      y: cy + Math.sin(rad) * 2.1 * s,
    };
  });
  return (
    <g>
      {petals.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.4 * s} fill="var(--color-brand-hanadi-scarf-flower)" />
      ))}
      <circle
        cx={cx}
        cy={cy}
        r={1.2 * s}
        fill="var(--color-brand-hanadi-gold)"
        stroke="var(--color-brand-ink)"
        strokeWidth={0.8}
      />
    </g>
  );
}

/** Hanadi's face + hair-wrap scarf, designed for a 64×64 box. */
export function HanadiFace() {
  const ink = "var(--color-brand-ink)";
  return (
    <g>
      {/* face */}
      <circle
        cx="32"
        cy="35"
        r="14.5"
        fill="var(--color-brand-hanadi-skin)"
        stroke={ink}
        strokeWidth="2"
      />
      {/* ears (scarf only covers the hair) */}
      <circle cx="17.5" cy="36" r="3" fill="var(--color-brand-hanadi-skin)" stroke={ink} strokeWidth="2" />
      <circle cx="46.5" cy="36" r="3" fill="var(--color-brand-hanadi-skin)" stroke={ink} strokeWidth="2" />
      {/* headscarf — wraps and binds the hair, nothing else */}
      <path
        d="M 16.5 35.5
           C 16.5 20.5 23 13.5 32 13.5
           C 41 13.5 47.5 20.5 47.5 35.5
           C 47.5 37.8 45.6 38.2 45 35.9
           C 44.2 25 39.8 19.5 32 19.5
           C 24.2 19.5 19.8 25 19 35.9
           C 18.4 38.2 16.5 37.8 16.5 35.5 Z"
        fill="var(--color-brand-hanadi-scarf)"
        stroke={ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* scarf seam */}
      <path
        d="M 19.8 33 C 21 25.5 25.5 22.2 32 22.2 C 38.5 22.2 43 25.5 44.2 33"
        fill="none"
        stroke="var(--color-brand-hanadi-scarf-deep)"
        strokeWidth="1.3"
        opacity="0.65"
      />
      {/* flowers on the scarf */}
      <HanadiFlower cx={24.5} cy={18.5} s={0.95} />
      <HanadiFlower cx={32} cy={16.4} s={1.05} />
      <HanadiFlower cx={39.5} cy={18.5} s={0.95} />
      {/* knot at the side of her head */}
      <circle
        cx="48.3"
        cy="30.5"
        r="3.8"
        fill="var(--color-brand-hanadi-scarf-deep)"
        stroke={ink}
        strokeWidth="1.8"
      />
      <path
        d="M 46.6 33.4
           C 45.4 38 46.4 41.8 49.8 43.2
           C 51.2 43.8 52.2 42.2 51.2 40.8
           C 49.4 38 49.6 35 50 33.2 Z"
        fill="var(--color-brand-hanadi-scarf-deep)"
        stroke={ink}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* gold earrings */}
      <circle cx="17.5" cy="41" r="1.7" fill="var(--color-brand-hanadi-gold)" stroke={ink} strokeWidth="1.2" />
      <circle cx="46.5" cy="41" r="1.7" fill="var(--color-brand-hanadi-gold)" stroke={ink} strokeWidth="1.2" />
      {/* blush */}
      <circle cx="23.5" cy="39.5" r="2.7" fill="var(--color-brand-hanadi-blush)" opacity="0.75" />
      <circle cx="40.5" cy="39.5" r="2.7" fill="var(--color-brand-hanadi-blush)" opacity="0.75" />
      {/* happy closed eyes */}
      <path d="M 25 35.5 q 2.5 2.8 5 0" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M 34 35.5 q 2.5 2.8 5 0" fill="none" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
      {/* nose */}
      <path d="M 32 38 q 1.5 1.9 -0.5 3" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
      {/* warm smile */}
      <path d="M 27 42.5 q 5 4.6 10 0" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
    </g>
  );
}

/** Hanadi bust (head + neck + dress shoulders), designed for a 96×96 box. */
export function HanadiBust() {
  const ink = "var(--color-brand-ink)";
  return (
    <g>
      {/* dress / shoulders (neck stays free — the scarf covers hair only) */}
      <path
        d="M 22 92 C 22 72 32 66 48 66 C 64 66 74 72 74 92 Z"
        fill="var(--color-brand-terracotta)"
        stroke={ink}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* neckline trim */}
      <path
        d="M 37 68 Q 48 76 59 68"
        fill="none"
        stroke={ink}
        strokeWidth="1.6"
        opacity="0.45"
      />
      {/* neck */}
      <path
        d="M 42.5 52 L 42.5 68 Q 48 73 53.5 68 L 53.5 52 Z"
        fill="var(--color-brand-hanadi-skin)"
        stroke={ink}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* head */}
      <circle
        cx="48"
        cy="38"
        r="21"
        fill="var(--color-brand-hanadi-skin)"
        stroke={ink}
        strokeWidth="2.2"
      />
      {/* ears */}
      <circle cx="27" cy="40" r="3.8" fill="var(--color-brand-hanadi-skin)" stroke={ink} strokeWidth="2" />
      <circle cx="69" cy="40" r="3.8" fill="var(--color-brand-hanadi-skin)" stroke={ink} strokeWidth="2" />
      {/* headscarf — wraps and binds the hair only */}
      <path
        d="M 27 41.5
           C 27 22.5 35 14 48 14
           C 61 14 69 22.5 69 41.5
           C 69 44.5 66.4 45.2 65.6 42.2
           C 64.5 28.5 58 22.5 48 22.5
           C 38 22.5 31.5 28.5 30.4 42.2
           C 29.6 45.2 27 44.5 27 41.5 Z"
        fill="var(--color-brand-hanadi-scarf)"
        stroke={ink}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* scarf seam */}
      <path
        d="M 31.2 39.5 C 32.6 29.5 37 25.5 48 25.5 C 59 25.5 63.4 29.5 64.8 39.5"
        fill="none"
        stroke="var(--color-brand-hanadi-scarf-deep)"
        strokeWidth="1.6"
        opacity="0.65"
      />
      {/* flowers on the scarf */}
      <HanadiFlower cx={38.5} cy={18.5} s={1.3} />
      <HanadiFlower cx={48} cy={17} s={1.4} />
      <HanadiFlower cx={57.5} cy={18.5} s={1.3} />
      {/* knot at the side of her head */}
      <circle cx="70.5" cy="34.5" r="5" fill="var(--color-brand-hanadi-scarf-deep)" stroke={ink} strokeWidth="2" />
      <path
        d="M 68 38.5
           C 66.5 45 68 50.5 73.5 53
           C 76 54 77.5 51.5 76 49
           C 72.8 44.5 73.2 40.5 73.6 38.3 Z"
        fill="var(--color-brand-hanadi-scarf-deep)"
        stroke={ink}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* gold earrings */}
      <circle cx="27" cy="46.5" r="2.1" fill="var(--color-brand-hanadi-gold)" stroke={ink} strokeWidth="1.4" />
      <circle cx="69" cy="46.5" r="2.1" fill="var(--color-brand-hanadi-gold)" stroke={ink} strokeWidth="1.4" />
      {/* blush */}
      <circle cx="36" cy="46.5" r="3.4" fill="var(--color-brand-hanadi-blush)" opacity="0.75" />
      <circle cx="60" cy="46.5" r="3.4" fill="var(--color-brand-hanadi-blush)" opacity="0.75" />
      {/* happy closed eyes */}
      <path d="M 39 41.5 q 3 3 6 0" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M 51 41.5 q 3 3 6 0" fill="none" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      {/* nose */}
      <path d="M 48 45 q 1.9 2.4 -0.7 3.7" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" />
      {/* warm smile */}
      <path d="M 41 51.5 q 7 6 14 0" fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" />
    </g>
  );
}
