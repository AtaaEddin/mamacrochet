"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api, refreshCsrfToken } from "@/lib/api/client";
import { useApiErrorMessage } from "@/lib/api/errors";
import { isStaff, postAuthPath } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { AuthShell } from "./auth-shell";

function nextFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("next");
}

/**
 * Customer login (staff prop → the /staff/login door). Cookie auth: on
 * success the API sets `mm.auth`; the client refetches its antiforgery
 * token (principal changed) and routes: temp password → forced change,
 * staff → chat, customer → account (or `?next=` from the confirmation gate).
 */
export function LoginForm({ staff = false }: { staff?: boolean }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const message = useApiErrorMessage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const title = staff ? t("staffTitle") : t("loginTitle");
  const subtitle = staff ? t("staffBody") : t("loginBody");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.POST("/identity/login", {
        body: { email, password, staff: staff ? true : null },
      });
      if (res.error || !res.data) {
        setError(message(res.error));
        return;
      }
      refreshCsrfToken();
      const user = res.data;
      // Staff are bounced to the staff door only when they picked the
      // customer door; a customer door visit with a staff account is fine.
      if (!staff && isStaff(user)) {
        router.replace("/chat");
        return;
      }
      router.replace(postAuthPath(user, nextFromUrl()));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <form onSubmit={onSubmit} className="mt-5" noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="login-email">{t("email")}</FieldLabel>
            <Input
              id="login-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="login-password">{t("password")}</FieldLabel>
            <Input
              id="login-password"
              type="password"
              name={staff ? "staff-password" : "password"}
              autoComplete={staff ? "current-password" : "current-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              aria-invalid={error ? true : undefined}
            />
            <FieldError>{error ?? ""}</FieldError>
          </Field>
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? t("signingIn") : t("signIn")}
          </Button>
        </FieldGroup>
      </form>
      <div className="mt-5 border-t border-border/60 pt-4 text-center text-sm">
        {staff ? (
          <>
            <span className="text-muted-foreground">{t("customerHere")}</span>{" "}
            <Link href="/login" className="font-bold text-primary underline-offset-4 hover:underline">
              {t("loginCustomer")}
            </Link>
          </>
        ) : (
          <>
            <span className="text-muted-foreground">{t("noAccount")}</span>{" "}
            <Link href="/register" className="font-bold text-primary underline-offset-4 hover:underline">
              {t("createAccount")}
            </Link>
            <div className="mt-2">
              <Link href="/staff/login" className="font-bold text-primary underline-offset-4 hover:underline">
                {t("staffDoor")}
              </Link>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}
