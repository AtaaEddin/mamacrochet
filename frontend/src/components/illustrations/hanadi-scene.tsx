import { HanadiBust } from "@/components/illustrations/hanadi-pieces";

/**
 * Hanadi bust scene (96×96 box) — used in empty states, 404, larger moments.
 */
export function HanadiScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <HanadiBust />
    </svg>
  );
}
