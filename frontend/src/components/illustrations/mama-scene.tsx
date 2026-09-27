import { MamaBust } from "@/components/illustrations/mama-pieces";

/**
 * Mama bust scene (96×96 box) — used in empty states, 404, larger moments.
 */
export function MamaScene({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden="true" focusable="false">
      <MamaBust />
    </svg>
  );
}
