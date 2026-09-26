import { cn } from "@/lib/utils";

/**
 * Yarn loader — a gentle rotating arc (respects prefers-reduced-motion).
 */
export function YarnLoader({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-8", className)} aria-hidden="true" focusable="false">
      <circle
        cx="20"
        cy="20"
        r="13"
        fill="none"
        stroke="var(--color-brand-rose)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="40 42"
        className="origin-center animate-spin motion-reduce:animate-none"
      />
      <circle cx="20" cy="20" r="4" fill="var(--color-brand-lavender)" />
    </svg>
  );
}
