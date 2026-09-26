"use client";

import { useEffect, useState } from "react";

type Health = { status: string; database: string };

type State = { health: Health | null; error: string | null };

const apiUrl = process.env.NEXT_PUBLIC_API_URL;

export function ApiHealth() {
  const [state, setState] = useState<State>({ health: null, error: null });

  useEffect(() => {
    if (!apiUrl) return;
    let cancelled = false;
    fetch(`${apiUrl}/health`)
      .then((res) => res.json() as Promise<Health>)
      .then((health) => {
        if (!cancelled) setState({ health, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ health: null, error: err instanceof Error ? err.message : String(err) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const error = !apiUrl ? "NEXT_PUBLIC_API_URL is not set" : state.error;

  return (
    <div className="rounded-xl border bg-card p-4 text-sm text-card-foreground">
      {state.health ? (
        <p>
          API: <span className="font-medium">{state.health.status}</span> · database:{" "}
          {state.health.database}
        </p>
      ) : error ? (
        <p>{error}</p>
      ) : (
        <p className="text-muted-foreground">Checking API…</p>
      )}
    </div>
  );
}
