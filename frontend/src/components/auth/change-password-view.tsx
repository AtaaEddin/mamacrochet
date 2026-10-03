"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useApiErrorMessage } from "@/lib/api/errors";
import { Identity } from "@/lib/api/generated-client";
import type { User } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { AuthShell } from "./auth-shell";

type MeState =
  | { status: "loading" }
  | { status: "me"; me: User }
  | { status: "failed" };

function useMe() {
  const [state, setState] = useState<MeState>({ status: "loading" });
  const [tick, setTick] = useState(0);
  const router = useRouter();
  useEffect(() => {
    let alive = true;
    Identity.me.get()
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          const status = res.response?.status;
          // 401 → not signed in. Transient failures (429/5xx/network)
          // must NOT bounce a signed-in user to /login — retry card instead.
          if (status === 401 || status === 410) {
            router.replace("/login");
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
  }, [router, tick]);
  return {
    me: state.status === "me" ? state.me : null,
    failed: state.status === "failed",
    retry: () => {
      setState({ status: "loading" });
      setTick((n) => n + 1);
    },
  };
}

/**
 * Password change (plan 03). This is the forced gate after an admin-set
 * temporary password (MustChangePassword): login routes here before anything
 * else, and the server keeps the flag until a successful change.
 */
export function ChangePasswordView() {
  const t = useTranslations("ChangePassword");
  const tAccount = useTranslations("Account");
  const { me, failed, retry } = useMe();
  const router = useRouter();
  const message = useApiErrorMessage();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const forced = me !== null && me.mustChangePassword;

  if (failed) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-4 py-16 sm:px-6">
        <p className="text-sm text-muted-foreground">
          {tAccount("loadFailed")}
        </p>
        <Button variant="outline" onClick={retry}>
          {tAccount("retry")}
        </Button>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (next !== confirm) {
      setError(t("mismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await Identity.me.passwordChange({
        body: { current, next },
      });
      if (res.error) {
        setError(message(res.error));
        return;
      }
      // The server re-issues the session cookie (security stamp rotation).
      router.replace("/account");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("title")} subtitle={forced ? undefined : t("subtitle")}>
      {forced ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>{t("forcedTitle")}</AlertTitle>
          <AlertDescription>{t("forcedBody")}</AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={onSubmit} className="mt-5" noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="cp-current">{t("current")}</FieldLabel>
            <Input
              id="cp-current"
              type="password"
              name="current-password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="cp-next">{t("next")}</FieldLabel>
            <Input
              id="cp-next"
              type="password"
              name="new-password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.currentTarget.value)}
              aria-invalid={error ? true : undefined}
            />
            <FieldDescription>{t("policy")}</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="cp-confirm">{t("confirm")}</FieldLabel>
            <Input
              id="cp-confirm"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              aria-invalid={error ? true : undefined}
            />
            <FieldError>{error ?? ""}</FieldError>
          </Field>
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? t("saving") : t("save")}
          </Button>
        </FieldGroup>
      </form>
    </AuthShell>
  );
}
