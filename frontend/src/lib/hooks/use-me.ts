"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import type { User } from "@/lib/auth";

export type MeState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "failed" }
  | { status: "me"; me: User };

/**
 * Current-user gate for the order surfaces (plan 05). Like
 * `account-view`'s useMe, but no redirects — the calling surface decides
 * (sign-in card vs staff login vs 403 card). 401/410 = not signed in
 * (410: deactivated/deleted → treated as signed out).
 */
export function useMe(): MeState & { retry: () => void } {
  const [state, setState] = useState<MeState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api.GET("/identity/me")
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          const status = res.response.status;
          if (status === 401 || status === 410) {
            setState({ status: "anon" });
            return;
          }
          setState({ status: "failed" });
          return;
        }
        if (res.data) setState({ status: "me", me: res.data });
      })
      .catch(() => {
        if (!alive) return;
        setState({ status: "failed" });
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  const retry = useCallback(() => setTick((n) => n + 1), []);
  return { ...state, retry };
}
