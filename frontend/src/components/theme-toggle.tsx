"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

type ThemeValue = "light" | "system" | "dark";

const OPTIONS: { value: ThemeValue; icon: typeof Sun }[] = [
  { value: "light", icon: Sun },
  { value: "system", icon: Monitor },
  { value: "dark", icon: Moon },
];

/**
 * True only after this component has hydrated on the client.
 *
 * `useSyncExternalStore` renders `getServerSnapshot` on the server AND on the
 * first client render, then switches to `getSnapshot` — the lint-clean form
 * of the mounted flag (no setState in an effect).
 */
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

/**
 * Segmented light/system/dark toggle (next-themes, plan 08).
 *
 * Hydration-safe: the persisted theme cannot be known on the server, so no
 * option is marked active until the component mounts (next-themes README →
 * "Avoid Hydration Mismatch"). Until then the pill keeps its layout (all
 * options muted) → no CLS and no server/client mismatch.
 */
export function ThemeToggle() {
  const t = useTranslations("Theme");
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  // `theme` is the stored choice ("system" | "light" | "dark"); the old
  // `resolvedTheme` source is always light/dark and could never highlight the
  // System segment (e.g. a user who explicitly picked System on a light OS).
  const current: ThemeValue | null = mounted
    ? theme === "light" || theme === "dark"
      ? theme
      : "system"
    : null;

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="flex items-center gap-1 rounded-full bg-muted p-1"
    >
      {OPTIONS.map(({ value, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={t(value)}
          title={t(value)}
          aria-pressed={current === value}
          onClick={() => setTheme(value)}
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors",
            current === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
