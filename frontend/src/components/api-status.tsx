"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { YarnLoader } from "@/components/illustrations/yarn-loader";
import { Health, type ApiHealth } from "@/lib/api/generated-client";

type HealthDto = ApiHealth;

type State = { health: HealthDto | null; error: boolean };

/**
 * Small API status pill for the footer (dev signal from plan 02, brand-styled).
 * First consumer of the generated OpenAPI client — the rest of the data
 * fetching (plans 03/04/05) uses the same `api` client.
 */
export function ApiStatus() {
  const t = useTranslations("Health");
  const [state, setState] = useState<State>({ health: null, error: false });

  useEffect(() => {
    let cancelled = false;
    Health.health()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (data) setState({ health: data, error: false });
        else if (error) setState({ health: null, error: true });
      })
      .catch(() => {
        if (!cancelled) setState({ health: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { health, error } = state;
  const online = health?.status === "ok";

  return (
    <span
      role="status"
      className="flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"
    >
      {health ? (
        <span
          className={`size-2 rounded-full ${online ? "bg-brand-olive" : "bg-destructive"}`}
          aria-hidden="true"
        />
      ) : error ? (
        <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
      ) : (
        <YarnLoader className="size-4" />
      )}
      {health
        ? online
          ? t("online")
          : t("offline")
        : error
          ? t("offline")
          : t("checking")}
    </span>
  );
}
