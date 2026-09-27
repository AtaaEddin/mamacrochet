"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { YarnLoader } from "@/components/illustrations/yarn-loader";

type Health = { status: string; database: string };

type State = { health: Health | null; error: boolean };

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

/**
 * Small API status pill for the footer (dev signal from plan 02, brand-styled).
 */
export function ApiStatus() {
  const t = useTranslations("Health");
  const [state, setState] = useState<State>({ health: null, error: false });

  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;
    fetch(`${apiUrl}/health`)
      .then((res) => res.json() as Promise<Health>)
      .then((health) => {
        if (!cancelled) setState({ health, error: false });
      })
      .catch(() => {
        if (!cancelled) setState({ health: null, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!apiUrl) return null;

  const online = state.health?.status === "ok";

  return (
    <span
      role="status"
      className="flex items-center gap-2 rounded-full border border-border/70 bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground"
    >
      {state.health ? (
        <span
          className={`size-2 rounded-full ${online ? "bg-brand-olive" : "bg-destructive"}`}
          aria-hidden="true"
        />
      ) : state.error ? (
        <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
      ) : (
        <YarnLoader className="size-4" />
      )}
      {state.health
        ? online
          ? t("online")
          : t("offline")
        : state.error
          ? t("offline")
          : t("checking")}
    </span>
  );
}
