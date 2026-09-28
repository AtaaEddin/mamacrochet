import { HanadiFace } from "@/components/illustrations/hanadi-pieces";

/**
 * Logo / avatar mark — Hanadi's face on a warm gold tile (64×64 box).
 */
export function HanadiMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="60" height="60" rx="18" fill="var(--color-brand-hanadi-tile)" />
      <HanadiFace />
    </svg>
  );
}
