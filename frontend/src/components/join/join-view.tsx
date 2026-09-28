"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { submitHiringApplication } from "@/lib/api/client";
import { useApiErrorMessage } from "@/lib/api/errors";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { ConfettiHearts } from "@/components/illustrations/confetti-hearts";
import { MamaMark } from "@/components/illustrations/mama-mark";

/** Client-side mirror of the server limits (the API re-checks everything). */
const MAX_FILES = 3;
const MAX_BYTES = 10 * 1024 * 1024;

/** Soft client-side shape check — the server is the source of truth. */
function isAllowedFile(file: File): boolean {
  const okType =
    file.type === "image/jpeg" ||
    file.type === "image/png" ||
    file.type === "image/webp" ||
    file.type === "application/pdf";
  const okName = /\.(jpe?g|png|webp|pdf)$/i.test(file.name);
  // The file picker usually sets `type`; when it doesn't, trust the
  // extension and let the server's magic-byte check make the final call.
  return file.type === "" ? okName : okType || okName;
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Public application form (plan 09): name / phone / email / country /
 * nationality / languages / previous work (+ up to 3 proof files) / message.
 * Warm brand voice, mobile-first, success state with the confetti moment.
 */
export function JoinView() {
  const t = useTranslations("Join");
  const message = useApiErrorMessage();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [nationality, setNationality] = useState("");
  const [languages, setLanguages] = useState("");
  const [previousWork, setPreviousWork] = useState("");
  const [msg, setMsg] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    setFileError(null);
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        setFileError(t("filesTooMany"));
        break;
      }
      if (file.size > MAX_BYTES) {
        setFileError(t("fileTooBig"));
        continue;
      }
      if (!isAllowedFile(file)) {
        setFileError(t("fileBadType"));
        continue;
      }
      next.push(file);
    }
    setFiles(next);
    // Reset the input so the same file can be re-selected after a removal.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
    setFileError(null);
  }

  function languageError(): string | null {
    const langs = languages
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (langs.length < 1 || langs.length > 6) return t("errorLanguage");
    if (langs.some((l) => l.length < 2 || l.length > 32)) return t("errorLanguage");
    return null;
  }

  function validate(): string | null {
    if (
      name.trim().length < 2 ||
      email.trim().length < 3 ||
      !email.includes("@") ||
      phone.trim().length < 3 ||
      country.trim().length < 2 ||
      previousWork.trim().length < 3
    ) {
      return t("errorRequired");
    }
    return languageError();
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    const res = await submitHiringApplication({
      name,
      email,
      phone,
      country,
      nationality,
      languages,
      previousWork,
      message: msg,
      files,
    });
    setBusy(false);
    if (!res.ok) {
      setError(message(res.error));
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
        <div className="rounded-3xl border border-border/70 bg-card p-8 text-center shadow-sm sm:p-10">
          <ConfettiHearts className="mx-auto size-40" />
          <h1 className="font-display mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {t("successTitle")}
          </h1>
          <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
            {t("successBody")}
          </p>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "default", size: "lg" }), "mt-6")}
          >
            {t("backHome")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <header className="text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
          <MamaMark className="size-9" />
        </div>
        <h1 className="font-display mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground sm:text-base">
          {t("pitch")}
        </p>
      </header>

      <div className="mt-8 rounded-3xl border border-border/70 bg-card p-5 shadow-sm sm:p-8">
        <form onSubmit={onSubmit} className="grid gap-5" noValidate>
          <Field>
            <FieldLabel htmlFor="join-name">{t("name")}</FieldLabel>
            <Input
              id="join-name"
              name="name"
              autoComplete="name"
              placeholder={t("namePlaceholder")}
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="join-email">{t("email")}</FieldLabel>
              <Input
                id="join-email"
                type="email"
                name="email"
                autoComplete="email"
                placeholder={t("emailPlaceholder")}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="join-phone">{t("phone")}</FieldLabel>
              <Input
                id="join-phone"
                type="tel"
                name="phone"
                autoComplete="tel"
                placeholder={t("phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="join-country">{t("country")}</FieldLabel>
              <Input
                id="join-country"
                name="country"
                autoComplete="country-name"
                placeholder={t("countryPlaceholder")}
                value={country}
                onChange={(e) => setCountry(e.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="join-nationality">{t("nationality")}</FieldLabel>
              <Input
                id="join-nationality"
                name="nationality"
                autoComplete="off"
                placeholder={t("nationalityPlaceholder")}
                value={nationality}
                onChange={(e) => setNationality(e.currentTarget.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="join-languages">{t("languages")}</FieldLabel>
            <Input
              id="join-languages"
              name="languages"
              autoComplete="off"
              placeholder={t("languagesPlaceholder")}
              value={languages}
              onChange={(e) => setLanguages(e.currentTarget.value)}
            />
            <FieldDescription>{t("languagesHint")}</FieldDescription>
            <FieldError>{languageError() ?? ""}</FieldError>
          </Field>
          <Field>
            <FieldLabel htmlFor="join-previous-work">{t("previousWork")}</FieldLabel>
            <Textarea
              id="join-previous-work"
              name="previousWork"
              rows={4}
              placeholder={t("previousWorkPlaceholder")}
              value={previousWork}
              onChange={(e) => setPreviousWork(e.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="join-message">{t("message")}</FieldLabel>
            <Textarea
              id="join-message"
              name="message"
              rows={3}
              placeholder={t("messagePlaceholder")}
              value={msg}
              onChange={(e) => setMsg(e.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel>{t("filesLabel")}</FieldLabel>
            <div className="rounded-xl border border-dashed border-border bg-background/50 p-4">
              <input
                ref={fileInputRef}
                id="join-files"
                name="files"
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                className="sr-only"
                onChange={(e) => addFiles(e.currentTarget.files)}
                aria-describedby="join-files-hint"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                {t("chooseFiles")}
              </Button>
              <p id="join-files-hint" className="mt-2 text-sm text-muted-foreground">
                {t("filesHint")}
              </p>
              {files.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium">{file.name}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatSize(file.size)}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => removeFile(index)}
                        >
                          {t("removeFile", { name: file.name })}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            <FieldError>{fileError ?? ""}</FieldError>
          </Field>
          <FieldError>{error ?? ""}</FieldError>
          <Button type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? t("submitting") : t("submit")}
          </Button>
          <p className="text-center text-xs text-muted-foreground/70">
            {t("formBody")}
          </p>
        </form>
      </div>
    </div>
  );
}
