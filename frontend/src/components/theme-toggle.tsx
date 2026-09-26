"use client";

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

export function ThemeToggle() {
  const t = useTranslations("Theme");
  const { resolvedTheme, setTheme } = useTheme();
  const current: ThemeValue =
    resolvedTheme === "dark" ? "dark" : resolvedTheme === "light" ? "light" : "system";

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
