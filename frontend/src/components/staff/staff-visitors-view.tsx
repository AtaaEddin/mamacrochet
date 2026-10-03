"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Inbox, Plus, Search, UserRound } from "lucide-react";
import { api } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { isStaff, type User } from "@/lib/auth";
import * as chat from "@/lib/chat/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YarnLoader } from "@/components/illustrations/yarn-loader";

type UserDto = components["schemas"]["UserDto"];
type ThreadItem = chat.ChatThreadListItem;

type Gate =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "forbidden"; me: User }
  | { status: "ready"; me: User };

type Filter = "all" | "new" | "mine";

const FILTERS: { id: Filter; labelKey: "vFilterAll" | "vFilterNew" | "vFilterMine" }[] = [
  { id: "all", labelKey: "vFilterAll" },
  { id: "new", labelKey: "vFilterNew" },
  { id: "mine", labelKey: "vFilterMine" },
];

/**
 * Staff “Visitors” inbox (plan 06, D14): guest threads with previews —
 * claim an unclaimed conversation, assign it (admin), close it with a
 * reason, or open it in the shared chat surface. Polls every 15 s; the
 * open thread itself is realtime via SignalR.
 *
 * The “create order from thread” action lands with plan 05's OrderService
 * (deferred in plan 06, same release).
 */
export function StaffVisitorsView() {
  const t = useTranslations("Staff");
  const locale = useLocale();
  const router = useRouter();

  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<ThreadItem[] | null>(null);
  const [listError, setListError] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<Record<string, boolean>>({});
  const [closing, setClosing] = useState<string | null>(null);
  const [closeReason, setCloseReason] = useState("");
  const [employees, setEmployees] = useState<UserDto[]>([]);
  const reqRef = useRef(0);

  // “New conversation” (sub 02): pick an active customer → POST /chat/threads
  // with them → open the fresh thread in the shared chat surface.
  const [ncOpen, setNcOpen] = useState(false);
  const [ncQuery, setNcQuery] = useState("");
  const [ncResults, setNcResults] = useState<chat.StaffCustomer[] | null>(null);
  const [ncLoading, setNcLoading] = useState(false);
  const [ncError, setNcError] = useState(false);
  const [ncPicking, setNcPicking] = useState<string | null>(null);
  const [ncPickError, setNcPickError] = useState<string | null>(null);
  const ncReqRef = useRef(0);

  // Role gate (server still enforces every call).
  useEffect(() => {
    let cancelled = false;
    void api
      .GET("/identity/me")
      .then((res) => {
        if (cancelled) return;
        if (!res.error && res.data) {
          setGate(
            isStaff(res.data)
              ? { status: "ready", me: res.data }
              : { status: "forbidden", me: res.data },
          );
        } else {
          setGate({ status: "anon" });
        }
      })
      .catch(() => {
        if (!cancelled) setGate({ status: "anon" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const me = gate.status === "ready" ? gate.me : null;
  const isAdmin = me?.roles.includes("admin") ?? false;

  const load = useCallback(() => {
    const req = ++reqRef.current;
    void chat.fetchThreads({ kind: "visitor" }).then((r) => {
      if (req !== reqRef.current) return;
      if (r.ok) {
        setItems(r.data.threads);
        setListError(false);
      } else {
        setListError(true);
      }
    });
  }, []);

  useEffect(() => {
    if (me === null) return;
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [me, load]);

  // Admins get the employee roster for the assign dropdown.
  useEffect(() => {
    if (me === null || !isAdmin) return;
    let cancelled = false;
    void api
      .GET("/admin/users", { params: { query: { pageSize: 100 } } })
      .then((res) => {
        if (cancelled || res.error || !res.data) return;
        setEmployees(
          res.data.items.filter(
            (u) =>
              u.isActive &&
              (u.roles.includes("employee") || u.roles.includes("admin")),
          ),
        );
      })
      .catch(() => {
        // Non-fatal: the dropdown stays empty, claim still works.
      });
    return () => {
      cancelled = true;
    };
  }, [me, isAdmin]);

  const runCustomerSearch = useCallback((term: string) => {
    const req = ++ncReqRef.current;
    setNcLoading(true);
    setNcError(false);
    void chat.searchStaffCustomers(term).then((r) => {
      if (req !== ncReqRef.current) return;
      setNcLoading(false);
      if (r.ok) setNcResults(r.data.customers);
      else setNcError(true);
    });
  }, []);

  // Debounced search; also the initial browse (empty term = first page).
  useEffect(() => {
    if (!ncOpen) return;
    const timer = setTimeout(() => runCustomerSearch(ncQuery.trim()), 300);
    return () => clearTimeout(timer);
  }, [ncOpen, ncQuery, runCustomerSearch]);

  if (gate.status === "loading") {
    return (
      <div className="grid min-h-64 place-items-center">
        <YarnLoader className="size-8" />
      </div>
    );
  }

  if (gate.status === "anon" || gate.status === "forbidden") {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <Alert variant={gate.status === "forbidden" ? "destructive" : "default"}>
          <AlertTitle>{t("forbiddenTitle")}</AlertTitle>
          <AlertDescription>{t("vForbiddenBody")}</AlertDescription>
        </Alert>
        <div className="mt-3">
          <Button onClick={() => router.replace("/staff/login")}>
            {t("staffSignin")}
          </Button>
        </div>
      </div>
    );
  }

  const visible = (items ?? []).filter((it) => {
    if (filter === "new") return !it.assigneeName && !it.isClosed;
    if (filter === "mine") return it.assigneeName === gate.me.displayName;
    return true;
  });

  const fmtTime = (iso: string | null) => {
    if (!iso) return "";
    try {
      return new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    } catch {
      return "";
    }
  };

  const openThread = (id: string) => {
    router.push({ pathname: "/chat", query: { thread: id } });
  };

  const openNewConversation = () => {
    setNcQuery("");
    setNcResults(null);
    setNcError(false);
    setNcPickError(null);
    setNcOpen(true);
  };

  const pickCustomer = async (c: chat.StaffCustomer) => {
    setNcPicking(c.id);
    setNcPickError(null);
    const r = await chat.createThread({ customerId: c.id });
    setNcPicking(null);
    if (r.ok) {
      setNcOpen(false);
      openThread(r.data.id);
    } else {
      setNcPickError(r.error.message || t("ncPickFailed"));
    }
  };

  const fail = (id: string) => setActionError((m) => ({ ...m, [id]: true }));
  const okd = (id: string) => {
    setActionError((m) => ({ ...m, [id]: false }));
    load();
  };

  const claim = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    const r = await chat.claimThread(id);
    setBusy((b) => ({ ...b, [id]: false }));
    if (r.ok) okd(id);
    else fail(id);
  };

  const assign = async (id: string, employeeId: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    const r = await chat.assignThread(id, employeeId);
    setBusy((b) => ({ ...b, [id]: false }));
    if (r.ok) okd(id);
    else fail(id);
  };

  const confirmClose = async (id: string) => {
    setBusy((b) => ({ ...b, [id]: true }));
    const note = closeReason.trim();
    const r = await chat.closeThread(id, note.length > 0 ? note : null);
    setBusy((b) => ({ ...b, [id]: false }));
    setClosing(null);
    setCloseReason("");
    if (r.ok) okd(id);
    else fail(id);
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header>
        <h1 className="font-display text-2xl font-extrabold tracking-tight">
          {t("visitorsTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("visitorsSubtitle")}</p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label={t("visitorsSubtitle")}
        >
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              type="button"
              variant={filter === f.id ? "secondary" : "outline"}
              size="sm"
              className="rounded-full"
              onClick={() => setFilter(f.id)}
            >
              {t(f.labelKey)}
            </Button>
          ))}
        </div>
        <Button size="sm" className="ms-auto" onClick={openNewConversation}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newConversation")}
        </Button>
      </div>

      <Dialog
        open={ncOpen}
        onOpenChange={(open) => {
          if (!open) setNcOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("newConversationTitle")}</DialogTitle>
            <DialogDescription>{t("newConversationDesc")}</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={ncQuery}
              onChange={(e) => setNcQuery(e.target.value)}
              placeholder={t("newConversationSearch")}
              aria-label={t("newConversationSearch")}
              className="ps-9"
            />
          </div>
          {ncLoading && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <YarnLoader className="size-5" />
              {t("ncLoading")}
            </p>
          )}
          {!ncLoading && ncError && (
            <Alert variant="destructive">
              <AlertDescription>{t("ncError")}</AlertDescription>
              <div className="mt-2">
                <Button size="sm" variant="secondary" onClick={() => runCustomerSearch(ncQuery.trim())}>
                  {t("retry")}
                </Button>
              </div>
            </Alert>
          )}
          {!ncLoading && !ncError && ncResults !== null && ncResults.length === 0 && (
            <p className="py-3 text-center text-sm text-muted-foreground">
              {t("ncEmpty")}
            </p>
          )}
          {!ncLoading && !ncError && ncResults !== null && ncResults.length > 0 && (
            <ul className="-mx-1 max-h-80 overflow-y-auto">
              {ncResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={ncPicking !== null}
                    onClick={() => void pickCustomer(c)}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{c.displayName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[c.phone, c.email].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    {ncPicking === c.id ? (
                      <YarnLoader className="size-4 shrink-0" />
                    ) : (
                      <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {ncPickError !== null && (
            <p role="alert" className="text-xs font-semibold text-destructive">
              {ncPickError}
            </p>
          )}
        </DialogContent>
      </Dialog>

      <div className="mt-4 flex flex-col gap-3">
        {items === null && (
          <div className="grid place-items-center py-10">
            <YarnLoader className="size-7" />
          </div>
        )}

        {items !== null && listError && (
          <Alert variant="destructive">
            <AlertTitle>{t("vErrorTitle")}</AlertTitle>
            <AlertDescription>{t("vErrorBody")}</AlertDescription>
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={() => load()}>
                {t("retry")}
              </Button>
            </div>
          </Alert>
        )}

        {items !== null && !listError && visible.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Inbox className="size-10 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {t(
                filter === "new" ? "vEmptyNew" : filter === "mine" ? "vEmptyMine" : "vEmptyAll",
              )}
            </p>
          </div>
        )}

        {visible.map((it) => {
          const isBusy = busy[it.id] === true;
          const isMine = it.assigneeName === gate.me.displayName;
          return (
            <article
              key={it.id}
              className="rounded-3xl border border-border/70 bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openThread(it.id)}
                  className="min-w-0 flex-1 rounded-md text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold">
                      {it.subject ?? t("vNoSubject")}
                    </span>
                    {it.isClosed ? (
                      <Badge variant="secondary" className="shrink-0">
                        {t("vClosed")}
                      </Badge>
                    ) : it.assigneeName ? (
                      <Badge variant="outline" className="shrink-0 gap-1">
                        <UserRound className="size-3" aria-hidden="true" />
                        {it.assigneeName}
                        {isMine ? ` (${t("vYou")})` : ""}
                      </Badge>
                    ) : (
                      <Badge className="shrink-0">{t("vNew")}</Badge>
                    )}
                    {Number(it.unread) > 0 && !it.isClosed && (
                      <span className="inline-grid min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        {it.unread}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {it.preview?.text ?? t("vNoPreview")}
                  </span>
                </button>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {fmtTime(it.lastMessageAt)}
                </span>
              </div>

              {actionError[it.id] === true && (
                <p className="mt-2 text-xs font-semibold text-destructive">
                  {t("vActionFailed")}
                </p>
              )}

              {closing === it.id ? (
                <form
                  className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void confirmClose(it.id);
                  }}
                >
                  <Input
                    value={closeReason}
                    onChange={(e) => setCloseReason(e.target.value)}
                    placeholder={t("vClosePlaceholder")}
                    aria-label={t("vClosePrompt")}
                    maxLength={500}
                    className="h-9 sm:max-w-64"
                    autoFocus
                  />
                  <div className="flex shrink-0 gap-2">
                    <Button type="submit" size="sm" disabled={isBusy}>
                      {t("vConfirmClose")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => {
                        setClosing(null);
                        setCloseReason("");
                      }}
                    >
                      {t("cancel")}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={isBusy}
                    onClick={() => openThread(it.id)}
                  >
                    {t("vOpen")}
                  </Button>
                  {!it.isClosed && !it.assigneeName && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={isBusy}
                      onClick={() => void claim(it.id)}
                    >
                      {isBusy ? t("working") : t("vClaim")}
                    </Button>
                  )}
                  {!it.isClosed && isAdmin && (
                    <Select
                      value={
                        employees.find((e) => e.displayName === it.assigneeName)?.id
                      }
                      onValueChange={(empId) => {
                        if (empId) void assign(it.id, empId);
                      }}
                      disabled={isBusy}
                    >
                      <SelectTrigger className="h-8 w-40" aria-label={t("vAssign")}>
                        <SelectValue placeholder={t("vAssign")} />
                      </SelectTrigger>
                      <SelectContent>
                        {employees.map((e) => (
                          <SelectItem key={e.id} value={e.id}>
                            {e.displayName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!it.isClosed && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={isBusy}
                      onClick={() => {
                        setClosing(it.id);
                        setCloseReason("");
                      }}
                    >
                      {t("vClose")}
                    </Button>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
