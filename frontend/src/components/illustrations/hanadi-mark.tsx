import { MamaFace } from "@/components/illustrations/mama-pieces";

/**
 * Logo / avatar mark — Mama's face on a warm gold tile (64×64 box).
 */
export function MamaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect x="2" y="2" width="60" height="60" rx="18" fill="var(--color-brand-mama-tile)" />
      <MamaFace />
    </svg>
  );
}
