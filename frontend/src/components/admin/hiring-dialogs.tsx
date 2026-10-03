"use client";

import { useEffect, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { fileSrc } from "@/lib/api/client";
import {
  AdminHiring,
  type HiringAccepted,
  type HiringApplicationDto as HiringApplication,
  type HiringApplicationDetailDto as HiringDetail,
} from "@/lib/api/generated-client";
import { useApiErrorMessage } from "@/lib/api/errors";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { YarnLoader } from "@/components/illustrations/yarn-loader";



const LANGUAGE_OPTIONS = ["en", "ar", "tr"] as const;

/** Detail dialog: full application + files + history; offers accept/decline
 *  while the application is still `new`. */
export function DetailDialog({
  app,
  onClosed,
  onAccept,
  onDecline,
}: {
  app: HiringApplication;
  onClosed: () => void;
  onAccept: (app: HiringApplication) => void;
  onDecline: (app: HiringApplication) => void;
}) {
  const t = useTranslations("AdminHiring");
  const formatter = useFormatter();
  const [detail, setDetail] = useState<HiringDetail | null>(null);
  const [loadError, setLoadError] = useState(false);
  const reqRef = useRef(0);

  // The dialog mounts only while open, so one initial fetch is enough;
  // `load` below serves the retry button.
  useEffect(() => {
    let alive = true;
    const req = ++reqRef.current;
    AdminHiring.get({ path: { id: app.id } })
      .then((res) => {
        if (!alive || req !== reqRef.current) return;
        if (res.data) setDetail(res.data);
        else setLoadError(true);
      })
      .catch(() => {
        if (alive && req === reqRef.current) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [app.id]);

  function load() {
    const req = ++reqRef.current;
    setLoadError(false);
    AdminHiring.get({ path: { id: app.id } })
      .then((res) => {
        if (req !== reqRef.current) return;
        if (res.data) setDetail(res.data);
      });
  }

  function eventLabel(kind: string): string {
    switch (kind) {
      case "submitted":
        return t("eventSubmitted");
      case "re_applied":
        return t("eventReapplied");
      case "accepted":
        return t("eventAccepted");
      case "declined":
        return t("eventDeclined");
      default:
        return kind;
    }
  }

  function formatDateTime(iso: string | null): string {
    if (!iso) return "—";
    try {
      return formatter.dateTime(new Date(iso), undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  const isNew = app.status === "new";
  const a = detail?.application ?? app;

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t("applicant")}: {a.name}
          </DialogTitle>
          <DialogDescription>{a.email}</DialogDescription>
        </DialogHeader>

        {loadError ? (
          <Alert variant="destructive">
            <AlertDescription>
              {t("loadError")}{" "}
              <button
                type="button"
                onClick={load}
                className="font-bold underline underline-offset-4 hover:no-underline"
              >
                {t("retry")}
              </button>
            </AlertDescription>
          </Alert>
        ) : !detail ? (
          <div className="flex justify-center py-8">
            <YarnLoader className="size-8" />
          </div>
        ) : (
          <div className="grid gap-5 text-sm">
            <section aria-label={t("contact")}>
              <dl className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">{t("email")}</dt>
                  <dd className="font-medium">{a.email}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("phone")}</dt>
                  <dd className="font-medium">{a.phone}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("country")}</dt>
                  <dd className="font-medium">{a.country}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("nationality")}</dt>
                  <dd className="font-medium">{a.nationality ?? "—"}</dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {a.languages.map((lang) => (
                  <Badge key={lang} variant="secondary">
                    {lang}
                  </Badge>
                ))}
              </div>
            </section>

            <section>
              <h3 className="mb-1 font-semibold">{t("previousWork")}</h3>
              <p className="whitespace-pre-line text-muted-foreground">
                {a.previousWork ?? "—"}
              </p>
            </section>

            <section>
              <h3 className="mb-1 font-semibold">{t("message")}</h3>
              <p className="whitespace-pre-line text-muted-foreground">
                {a.message ?? t("noMessage")}
              </p>
            </section>

            <section>
              <h3 className="mb-2 font-semibold">{t("filesLabel")}</h3>
              {a.files.length === 0 ? (
                <p className="text-muted-foreground">{t("noFiles")}</p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  {a.files.map((file) =>
                    file.fileName.toLowerCase().endsWith(".pdf") ? (
                      <a
                        key={file.id}
                        href={fileSrc(file.fileName)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/60 px-3 py-2 text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {file.originalName} — {t("pdfLink")}
                      </a>
                    ) : (
                      // Native <img>: user-uploaded files with dynamic
                      // cross-origin URLs (dev) / /api URLs (prod) — the
                      // optimizer stays out of the loop (self-hosted, plan 10).
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        key={file.id}
                        src={fileSrc(file.fileName)}
                        alt={`${t("imageAlt")}: ${file.originalName}`}
                        loading="lazy"
                        className="h-28 rounded-xl border border-border object-cover"
                      />
                    ),
                  )}
                </div>
              )}
            </section>

            <section>
              <h3 className="mb-2 font-semibold">{t("history")}</h3>
              <ol className="grid gap-2">
                {detail.events.map((event, index) => (
                  <li key={`${index}-${event.kind}`} className="text-sm">
                    <span className="font-medium">
                      {eventLabel(event.kind)}
                      {event.actorName ? (
                        <span className="font-normal text-muted-foreground">
                          {" "}
                          {t("by", { name: event.actorName })}
                        </span>
                      ) : null}
                    </span>{" "}
                    <span className="text-muted-foreground">
                      · {formatDateTime(event.at)}
                    </span>
                    {event.note ? (
                      <span className="block text-muted-foreground">
                        {t("decisionNote", { note: event.note })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>

            <DialogFooter className="gap-2 sm:justify-end">
              <DialogClose render={<Button variant="outline" />} type="button">
                {t("cancel")}
              </DialogClose>
              {isNew ? (
                <>
                  <Button variant="outline" onClick={() => onDecline(app)}>
                    {t("decline")}
                  </Button>
                  <Button onClick={() => onAccept(app)}>{t("acceptOpen")}</Button>
                </>
              ) : (
                <StatusBadge status={a.status} />
              )}
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("AdminHiring");
  switch (status) {
    case "new":
      return <Badge variant="secondary">{t("statusNew")}</Badge>;
    case "accepted":
      return <Badge variant="default">{t("statusAccepted")}</Badge>;
    case "declined":
      return <Badge variant="destructive">{t("statusDeclined")}</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

/** Accept dialog: prefills the applicant's data; creates the employee
 *  account and reports the one-time password upward. */
export function AcceptDialog({
  app,
  onClosed,
  onAccepted,
}: {
  app: HiringApplication;
  onClosed: () => void;
  onAccepted: (accepted: HiringAccepted) => void;
}) {
  const t = useTranslations("AdminHiring");
  const lt = useTranslations("Locale");
  const message = useApiErrorMessage();

  const [email, setEmail] = useState(app.email);
  const [displayName, setDisplayName] = useState(app.name);
  const [phone, setPhone] = useState(app.phone);
  const [country, setCountry] = useState(app.country);
  const [language, setLanguage] = useState<string>("en");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (
      email.trim().length < 3 ||
      !email.includes("@") ||
      displayName.trim().length < 2
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    const res = await AdminHiring.accept({
      path: { id: app.id },
      body: {
        email: email.trim(),
        displayName: displayName.trim(),
        phone: phone.trim() || null,
        country: country.trim() || null,
        language,
      },
    });
    setBusy(false);
    if (res.error) {
      setError(message(res.error));
      return;
    }
    if (res.data) onAccepted(res.data);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t("acceptTitle", { name: app.name })}
          </DialogTitle>
          <DialogDescription>{t("acceptBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field>
            <FieldLabel htmlFor="accept-email">{t("accountEmail")}</FieldLabel>
            <Input
              id="accept-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="accept-name">{t("accountName")}</FieldLabel>
            <Input
              id="accept-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.currentTarget.value)}
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="accept-phone">{t("accountPhone")}</FieldLabel>
              <Input
                id="accept-phone"
                value={phone}
                onChange={(e) => setPhone(e.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="accept-country">{t("accountCountry")}</FieldLabel>
              <Input
                id="accept-country"
                value={country}
                onChange={(e) => setCountry(e.currentTarget.value)}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="accept-language">{t("accountLanguage")}</FieldLabel>
            <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
              <SelectTrigger id="accept-language" aria-label={t("accountLanguage")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {LANGUAGE_OPTIONS.map((l) => (
                    <SelectItem key={l} value={l}>
                      {lt(l)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>{t("acceptBody")}</FieldDescription>
          </Field>
          <FieldError>{error ?? ""}</FieldError>
          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose render={<Button variant="outline" />} type="button">
              {t("cancel")}
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? t("accepting") : t("accept")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Decline dialog: closes the application with an optional private note. */
export function DeclineDialog({
  app,
  onClosed,
  onDeclined,
}: {
  app: HiringApplication;
  onClosed: () => void;
  onDeclined: (appId: string) => void;
}) {
  const t = useTranslations("AdminHiring");
  const message = useApiErrorMessage();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await AdminHiring.decline({
      path: { id: app.id },
      body: { note: note.trim() || null },
    });
    setBusy(false);
    if (res.error) {
      setError(message(res.error));
      return;
    }
    onDeclined(app.id);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">
            {t("declineTitle", { name: app.name })}
          </DialogTitle>
          <DialogDescription>{t("declineBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4" noValidate>
          <Field>
            <FieldLabel htmlFor="decline-note">{t("note")}</FieldLabel>
            <Textarea
              id="decline-note"
              rows={3}
              placeholder={t("notePlaceholder")}
              value={note}
              onChange={(e) => setNote(e.currentTarget.value)}
            />
          </Field>
          <FieldError>{error ?? ""}</FieldError>
          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose render={<Button variant="outline" />} type="button">
              {t("cancel")}
            </DialogClose>
            <Button type="submit" variant="destructive" disabled={busy}>
              {busy ? t("declining") : t("decline")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
