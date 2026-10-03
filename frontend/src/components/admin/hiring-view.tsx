"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import {
  AdminHiring,
  Identity,
  type HiringAccepted,
  type HiringApplicationDto as HiringApplication,
  type HiringPage,
} from "@/lib/api/generated-client";
import type { User } from "@/lib/auth";
import { postAuthPath } from "@/lib/auth";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { YarnLoader } from "@/components/illustrations/yarn-loader";
import {
  AcceptDialog,
  DeclineDialog,
  DetailDialog,
  StatusBadge,
} from "./hiring-dialogs";
import { TempPasswordDialog } from "./user-dialogs";



type StatusFilter = "all" | "new" | "accepted" | "declined";

type Gate =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "forbidden"; me: User | null }
  | { status: "ready"; me: User };

const PAGE_SIZE = 20;

async function loadApplications(
  filter: StatusFilter,
  page: number,
): Promise<HiringPage | null> {
  return AdminHiring.list({
    query: {
        status: filter === "all" ? undefined : filter,
        page,
        pageSize: PAGE_SIZE,
      },
    })
    .then((res) => res.data ?? null)
    .catch(() => null);
}

/**
 * Admin hiring queue (plan 09): list + status filter + pagination, review
 * (details, files, history), accept (creates the employee account +
 * one-time password) or decline (optional note). Gate: `admin` only.
 */
export function HiringView() {
  const t = useTranslations("AdminHiring");
  const router = useRouter();
  const formatter = useFormatter();

  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [list, setList] = useState<HiringPage | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [page, setPage] = useState(1);

  const [detailApp, setDetailApp] = useState<HiringApplication | null>(null);
  const [acceptApp, setAcceptApp] = useState<HiringApplication | null>(null);
  const [declineApp, setDeclineApp] = useState<HiringApplication | null>(null);
  const [tempPassword, setTempPassword] = useState<{
    name: string;
    value: string;
  } | null>(null);

  // Every list fetch goes through fetchList — triggered only from event
  // handlers and promise callbacks; stale responses are dropped via reqRef.
  const reqRef = useRef(0);
  const fetchList = useCallback(
    async (f: StatusFilter, p: number) => {
      const req = ++reqRef.current;
      const data = await loadApplications(f, p);
      if (req !== reqRef.current) return;
      if (data) {
        setList(data);
        setListError(null);
      } else {
        setListError(t("loadError"));
      }
    },
    [t],
  );

  useEffect(() => {
    let alive = true;
    Identity.me.get()
      .then((res) => {
        if (!alive) return;
        if (res.error) {
          setGate({ status: "anon" });
          router.replace("/login");
          return;
        }
        const user = res.data;
        if (!user) return;
        if (!user.roles.includes("admin")) {
          setGate({ status: "forbidden", me: user });
          return;
        }
        setGate({ status: "ready", me: user });
        void fetchList("all", 1);
      })
      .catch(() => {
        if (alive) setGate({ status: "forbidden", me: null });
      });
    return () => {
      alive = false;
    };
  }, [router, fetchList]);

  function formatDateTime(iso: string): string {
    try {
      return formatter.dateTime(new Date(iso), undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return iso;
    }
  }

  function changeFilter(next: StatusFilter) {
    if (next === filter) return;
    setFilter(next);
    setPage(1);
    void fetchList(next, 1);
  }

  function changePage(next: number) {
    if (next === page) return;
    setPage(next);
    void fetchList(filter, next);
  }

  function onAccepted(accepted: HiringAccepted) {
    setAcceptApp(null);
    setDetailApp(null);
    setTempPassword({
      name: accepted.user.displayName,
      value: accepted.temporaryPassword,
    });
    void fetchList(filter, page);
  }

  function onDeclined(appId: string) {
    setDeclineApp(null);
    setDetailApp((current) =>
      current && current.id === appId ? null : current,
    );
    void fetchList(filter, page);
  }

  const total = Number(list?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages = useMemo(
    () => Array.from({ length: Math.min(pageCount, 10) }, (_, i) => i + 1),
    [pageCount],
  );

  if (gate.status === "loading" || gate.status === "anon") {
    return (
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center px-4 py-16 sm:px-6">
        <YarnLoader className="size-10" />
      </div>
    );
  }

  if (gate.status === "forbidden") {
    const backHref = gate.me ? postAuthPath(gate.me, null) : null;
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert variant="destructive">
          <AlertTitle>{t("forbiddenTitle")}</AlertTitle>
          <AlertDescription>
            {gate.me ? t("forbiddenBody") : t("loadError")}
          </AlertDescription>
        </Alert>
        {backHref ? (
          <Button className="mt-3" onClick={() => router.replace(backHref)}>
            {t("backHome")}
          </Button>
        ) : null}
      </div>
    );
  }

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: t("filterAll") },
    { key: "new", label: t("filterNew") },
    { key: "accepted", label: t("filterAccepted") },
    { key: "declined", label: t("filterDeclined") },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle", { count: total })}
        </p>
      </header>

      <div
        className="mt-4 flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("title")}
      >
        {filters.map((f) => (
          <Button
            key={f.key}
            type="button"
            variant={filter === f.key ? "default" : "outline"}
            size="sm"
            onClick={() => changeFilter(f.key)}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {listError ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>{t("loadError")}</AlertTitle>
          <AlertDescription>
            <button
              type="button"
              onClick={() => void fetchList(filter, page)}
              className="font-bold underline underline-offset-4 hover:no-underline"
            >
              {t("retry")}
            </button>
          </AlertDescription>
        </Alert>
      ) : null}

      {list ? (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("applicant")}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t("languages")}
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  <span className="sr-only">{t("files")}</span>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("applied")}
                </TableHead>
                <TableHead aria-label={t("actions")}>
                  <span className="sr-only">{t("actions")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.items.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {filter === "all" ? t("empty") : t("noResults")}
                  </TableCell>
                </TableRow>
              ) : (
                list.items.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="truncate font-bold">{app.name}</div>
                        <div className="truncate text-sm text-muted-foreground">
                          {app.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-40 truncate md:table-cell text-muted-foreground">
                      {app.languages.join(", ")}
                    </TableCell>
                    <TableCell className="hidden text-center sm:table-cell">
                      {app.files.length > 0 ? (
                        <span className="tabular-nums text-muted-foreground">
                          {app.files.length}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {formatDateTime(app.appliedAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        <StatusBadge status={app.status} />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDetailApp(app)}
                        >
                          {t("view")}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : null}

      {total > PAGE_SIZE ? (
        <nav
          className="mt-4 flex items-center justify-center gap-2"
          aria-label={t("pagination")}
        >
          <Button
            variant="outline"
            size="sm"
            onClick={() => changePage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            {t("prev")}
          </Button>
          {pages.map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              onClick={() => changePage(p)}
            >
              {p}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => changePage(Math.min(pageCount, page + 1))}
            disabled={page >= pageCount}
          >
            {t("next")}
          </Button>
        </nav>
      ) : null}

      {/* Dialogs mount only while open (keyed), so no state reset needed. */}
      {detailApp ? (
        <DetailDialog
          key={detailApp.id}
          app={detailApp}
          onClosed={() => setDetailApp(null)}
          onAccept={(app) => {
            // Swap, don't stack: base-ui 1.8 leaves the lower dialog's
            // portal (with its inert overlay) in the DOM when two open
            // controlled dialogs unmount in the same tick. One dialog at a
            // time — the same proven pattern as users-view (plan 03).
            setDetailApp(null);
            setAcceptApp(app);
          }}
          onDecline={(app) => {
            setDetailApp(null);
            setDeclineApp(app);
          }}
        />
      ) : null}
      {acceptApp ? (
        <AcceptDialog
          key={acceptApp.id}
          app={acceptApp}
          onClosed={() => setAcceptApp(null)}
          onAccepted={onAccepted}
        />
      ) : null}
      {declineApp ? (
        <DeclineDialog
          key={declineApp.id}
          app={declineApp}
          onClosed={() => setDeclineApp(null)}
          onDeclined={onDeclined}
        />
      ) : null}
      {tempPassword ? (
        <TempPasswordDialog
          key={tempPassword.name}
          userName={tempPassword.name}
          password={tempPassword.value}
          onClosed={() => setTempPassword(null)}
        />
      ) : null}
    </div>
  );
}
