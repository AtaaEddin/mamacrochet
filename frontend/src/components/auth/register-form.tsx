"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api, refreshCsrfToken } from "@/lib/api/client";
import { useApiErrorMessage } from "@/lib/api/errors";
import { postAuthPath } from "@/lib/auth";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { AuthShell } from "./auth-shell";

/** Release-1 password policy (ASP.NET Identity defaults, mirrored client-side). */
function passwordHints(password: string): string[] {
  const hints: string[] = [];
  if (password.length < 8) hints.push("min8");
  if (!/[A-Z]/.test(password)) hints.push("upper");
  if (!/[a-z]/.test(password)) hints.push("lower");
  if (!/[0-9]/.test(password)) hints.push("digit");
  if (!/[^A-Za-z0-9]/.test(password)) hints.push("symbol");
  return hints;
}

/**
 * Customer self-service registration (plan 03) — no email verification in
 * release 1: the account is active immediately and signed in on success.
 */
export function RegisterForm() {
  const t = useTranslations("Auth");
  const router = useRouter();
  const message = useApiErrorMessage();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const hints = useMemo(() => passwordHints(password), [password]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (name.trim().length < 2) {
      setError(t("invalidName"));
      return;
    }
    if (hints.length > 0) {
      setError(t("invalidPassword"));
      return;
    }
    if (confirm !== password) {
      setError(t("passwordMismatch"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.POST("/identity/register", {
        body: {
          name,
          email,
          phone: phone.trim() ? phone.trim() : null,
          country: country.trim() ? country.trim() : null,
          password,
        },
      });
      if (res.error || !res.data) {
        setError(message(res.error));
        return;
      }
      refreshCsrfToken();
      router.replace(postAuthPath(res.data, null));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title={t("registerTitle")} subtitle={t("registerBody")}>
      <form onSubmit={onSubmit} className="mt-5" noValidate>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="reg-name">{t("name")}</FieldLabel>
            <Input
              id="reg-name"
              name="name"
              autoComplete="name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="reg-email">{t("email")}</FieldLabel>
            <Input
              id="reg-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-5">
            <Field>
              <FieldLabel htmlFor="reg-phone">{t("phoneOptional")}</FieldLabel>
              <Input
                id="reg-phone"
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder="+90 5xx xxx xx xx"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="reg-country">{t("countryOptional")}</FieldLabel>
              <Input
                id="reg-country"
                name="country"
                autoComplete="country-name"
                placeholder={t("countryPlaceholder")}
                value={country}
                onChange={(e) => setCountry(e.currentTarget.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="reg-password">{t("password")}</FieldLabel>
            <Input
              id="reg-password"
              type="password"
              name="new-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
            />
            {/* Hints are a list: FieldDescription is a <p> and may not
                contain block-level HTML. */}
            <ul
              className="mt-2 list-disc ps-4 text-sm text-muted-foreground"
              aria-live="polite"
            >
              {hints.length === 0 ? (
                <li>{t("passwordOk")}</li>
              ) : (
                <>
                  <li>{t("passwordHint8")}</li>
                  {hints.includes("upper") ? <li>{t("passwordHintUpper")}</li> : null}
                  {hints.includes("lower") ? <li>{t("passwordHintLower")}</li> : null}
                  {hints.includes("digit") ? <li>{t("passwordHintDigit")}</li> : null}
                  {hints.includes("symbol") ? <li>{t("passwordHintSymbol")}</li> : null}
                </>
              )}
            </ul>
          </Field>
          <Field>
            <FieldLabel htmlFor="reg-confirm">{t("confirmPassword")}</FieldLabel>
            <Input
              id="reg-confirm"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.currentTarget.value)}
              aria-invalid={
                confirm.length > 0 && confirm !== password ? true : undefined
              }
            />
            <FieldError>{error ?? ""}</FieldError>
          </Field>
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? t("creating") : t("createAccountBtn")}
          </Button>
        </FieldGroup>
      </form>
      <div className="mt-5 border-t border-border/60 pt-4 text-center text-sm">
        <span className="text-muted-foreground">{t("haveAccount")}</span>{" "}
        <Link
          href="/login"
          className="font-bold text-primary underline-offset-4 hover:underline"
        >
          {t("signIn")}
        </Link>
      </div>
    </AuthShell>
  );
}
