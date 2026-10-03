"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { avatarSrc, uploadAvatar } from "@/lib/api/client";
import { Identity } from "@/lib/api/generated-client";
import type { User } from "@/lib/auth";
import { routing } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription, AlertAction } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/components/ui/toast";
import { YarnLoader } from "@/components/illustrations/yarn-loader";

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
          // 401 → not signed in (also: deactivated/deleted → signed out).
          // Transient failures (429/5xx/network) must NOT bounce a
          // signed-in user to /login — they surface as a retry card.
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
    state,
    retry: () => {
      setState({ status: "loading" });
      setTick((n) => n + 1);
    },
    updateMe: (user: User) => setState({ status: "me", me: user }),
  };
}

function RoleBadges({ user }: { user: User }) {
  const t = useTranslations("Account");
  return (
    <>
      <Badge variant="outline">{t("roles.customer")}</Badge>
      {user.roles.includes("employee") ? (
        <Badge variant="secondary">{t("roles.employee")}</Badge>
      ) : null}
      {user.roles.includes("admin") ? (
        <Badge variant="secondary">{t("roles.admin")}</Badge>
      ) : null}
    </>
  );
}

function AvatarCard({
  me,
  onUserUpdated,
}: {
  me: User;
  onUserUpdated: (user: User) => void;
}) {
  const t = useTranslations("Account");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const src = avatarSrc(me.avatarUrl);

  async function pickFile() {
    if (!fileRef.current || busy) return;
    const file = fileRef.current.files?.[0];
    if (!file) return;
    if (file.size > 1_048_576) {
      toast.add({ title: t("avatarTooBig"), type: "error" });
      return;
    }
    setBusy(true);
    const result = await uploadAvatar(file);
    setBusy(false);
    if (result.ok) {
      // Refresh the card in place (avatar + name + roles from the server).
      onUserUpdated(result.user);
      toast.add({ title: t("avatarSaved"), type: "success" });
    } else {
      toast.add({ title: t("avatarFailed"), type: "error" });
    }
  }

  return (
    <section
      data-slot="card"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5"
      aria-label={t("photoTitle")}
    >
      <div className="flex flex-wrap items-center gap-4">
        <Avatar className="size-20 shrink-0 rounded-full">
          {src ? (
            <AvatarImage src={src} alt="" className="rounded-full object-cover" />
          ) : null}
          <AvatarFallback>{me.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-bold">{me.displayName}</h2>
          <p className="truncate text-sm text-muted-foreground">{me.email}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <RoleBadges user={me} />
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={pickFile}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          {busy ? t("avatarUploading") : t("changePhoto")}
        </Button>
        <p className="text-xs text-muted-foreground">{t("avatarHint")}</p>
      </div>
    </section>
  );
}

function ProfileForm({
  me,
  onUserUpdated,
}: {
  me: User;
  onUserUpdated: (user: User) => void;
}) {
  const t = useTranslations("Account");
  const lt = useTranslations("Locale");
  const [displayName, setDisplayName] = useState(me.displayName);
  const [phone, setPhone] = useState(me.phone ?? "");
  const [country, setCountry] = useState(me.country ?? "");
  const [language, setLanguage] = useState(me.language);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await Identity.me.update({
      body: {
        displayName,
        phone: phone.trim() ? phone.trim() : null,
        country: country.trim() ? country.trim() : null,
        language,
      },
    });
    setBusy(false);
    if (res.error) {
      toast.add({ title: t("saveFailed"), type: "error" });
    } else if (res.data) {
      onUserUpdated(res.data);
      toast.add({ title: t("saved"), type: "success" });
    }
  }

  return (
    <section
      data-slot="card"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5"
      aria-label={t("profileTitle")}
    >
      <h2 className="font-display text-lg font-bold">{t("profileTitle")}</h2>
      <form onSubmit={save} className="mt-4">
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">{t("name")}</FieldLabel>
            <Input
              id="profile-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="profile-phone">{t("phone")}</FieldLabel>
              <Input
                id="profile-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="profile-country">{t("country")}</FieldLabel>
              <Input
                id="profile-country"
                value={country}
                onChange={(e) => setCountry(e.currentTarget.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="profile-language">{t("language")}</FieldLabel>
            <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
              <SelectTrigger id="profile-language" aria-label={t("language")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {routing.locales.map((l) => (
                    <SelectItem key={l} value={l}>
                      {lt(l)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? t("saving") : t("save")}
          </Button>
        </FieldGroup>
      </form>
    </section>
  );
}

function PasswordCard({ me }: { me: User }) {
  const t = useTranslations("Account");
  return (
    <section
      data-slot="card"
      className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5"
      aria-label={t("passwordTitle")}
    >
      <h2 className="font-display text-lg font-bold">{t("passwordTitle")}</h2>
      {me.mustChangePassword ? (
        <Alert variant="destructive" className="mt-3">
          <AlertTitle>{t("tempPasswordTitle")}</AlertTitle>
          <AlertDescription>{t("tempPasswordBody")}</AlertDescription>
          <AlertAction>
            <Link
              href="/change-password"
              className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-sm font-bold text-primary-foreground hover:bg-primary/80"
            >
              {t("changeNow")}
            </Link>
          </AlertAction>
        </Alert>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t("passwordBody")}</p>
      )}
      <div className="mt-4">
        <Link href="/change-password">
          <Button variant="outline" type="button">
            {t("changePassword")}
          </Button>
        </Link>
      </div>
    </section>
  );
}

function AssignedTo({ me }: { me: User }) {
  const t = useTranslations("Account");
  if (!me.assignedEmployeeName) return null;
  return (
    <p className="text-sm text-muted-foreground">
      {t("assignedTo")} <span className="font-bold text-foreground">{me.assignedEmployeeName}</span>
    </p>
  );
}

/**
 * Account page (plan 03): photo, profile (name/phone/country/language),
 * password area, sign out. Guests are redirected to /login on mount.
 */
export function AccountView() {
  const t = useTranslations("Account");
  const { state, retry, updateMe } = useMe();
  const router = useRouter();

  async function signOut() {
    await Identity.logout();
    router.replace("/");
  }

  if (state.status === "failed") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-3 px-4 py-16 sm:px-6">
        <p className="text-sm text-muted-foreground">{t("loadFailed")}</p>
        <Button variant="outline" onClick={retry}>
          {t("retry")}
        </Button>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="mx-auto flex w-full max-w-xl items-center justify-center px-4 py-16 sm:px-6">
        <YarnLoader className="size-10" />
      </div>
    );
  }

  const me = state.me;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 py-6 sm:gap-5 sm:py-8 sm:px-6">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          {t("greeting", { name: me.displayName })}
        </h1>
        <AssignedTo me={me} />
      </header>
      <AvatarCard me={me} onUserUpdated={updateMe} />
      <ProfileForm me={me} onUserUpdated={updateMe} />
      <PasswordCard me={me} />
      <div className="flex justify-end">
        <Button variant="outline" onClick={signOut}>
          {t("signOut")}
        </Button>
      </div>
    </div>
  );
}
