"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api/client";
import { useApiErrorMessage } from "@/lib/api/errors";
import type { User } from "@/lib/auth";
import { postAuthPath } from "@/lib/auth";
import type { UserPage } from "./user-dialogs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHead,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { YarnLoader } from "@/components/illustrations/yarn-loader";
import {
  DeleteUserDialog,
  EditUserDialog,
  CreateUserDialog,
  ResetPasswordDialog,
  TempPasswordDialog,
  type ResetResult,
} from "./user-dialogs";

const PAGE_SIZE = 20;

type Gate =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "forbidden"; me: User | null }
  | { status: "ready"; me: User };

function loadUsers(search: string, page: number): Promise<UserPage | null> {
  return api
    .GET("/admin/users", {
      query: {
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      },
    })
    .then((res) => res.data ?? null)
    .catch(() => null);
}

function RoleBadges({ user }: { user: User }) {
  const t = useTranslations("AdminUsers");
  return (
    <>
      <Badge variant="outline">{t("roleCustomer")}</Badge>
      {user.roles.includes("employee") ? (
        <Badge variant="secondary">{t("roleEmployee")}</Badge>
      ) : null}
      {user.roles.includes("admin") ? (
        <Badge variant="secondary">{t("roleAdmin")}</Badge>
      ) : null}
    </>
  );
}

function AvatarCell({ user }: { user: User }) {
  return (
    <Avatar className="size-9 rounded-full">
      <AvatarFallback>{user.displayName.slice(0, 1).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}



/**
 * Admin user management (plan 03): list + search + pagination, create with
 * one-time temp password, edit (roles / assignment / active), reset
 * password, soft delete. Only reachable for the `admin` role — anything
 * else (including signed-out) is gated here, not in the router.
 */
export function UsersView() {
  const t = useTranslations("AdminUsers");
  const router = useRouter();
  const message = useApiErrorMessage();

  const [gate, setGate] = useState<Gate>({ status: "loading" });
  const [list, setList] = useState<UserPage | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [employees, setEmployees] = useState<User[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [resetResult, setResetResult] = useState<ResetResult | null>(null);
  const [tempPassword, setTempPassword] = useState<{ name: string; value: string } | null>(
    null,
  );

  const me = gate.status === "ready" || gate.status === "forbidden" ? gate.me : null;
  const formatter = useFormatter();

  // Every list fetch goes through fetchList — triggered only from event
  // handlers and promise callbacks (never synchronously from an effect
  // body); stale responses are dropped via reqRef.
  const reqRef = useRef(0);
  const fetchList = useCallback(
    async (s: string, p: number) => {
      const req = ++reqRef.current;
      const data = await loadUsers(s, p);
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

  function formatDate(iso: string): string {
    try {
      return formatter.dateTime(
        new Date(iso),
        undefined,
        { day: "numeric", month: "short", year: "numeric" },
      );
    } catch {
      return iso;
    }
  }

  // 1. Who am I?
  useEffect(() => {
    let alive = true;
    api
      .GET("/identity/me")
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
        void fetchList("", 1);
      })
      .catch(() => {
        if (alive) setGate({ status: "forbidden", me: null });
      });
    return () => {
      alive = false;
    };
  }, [router, fetchList]);

  // 2. Staff candidates for the assignment dropdown.
  useEffect(() => {
    if (gate.status !== "ready") return;
    api
      .GET("/admin/users", {
        query: { search: undefined, page: 1, pageSize: 100 },
      })
      .then((res) => {
        if (res.data) {
          setEmployees(
            res.data.items.filter(
              (u) =>
                u.isActive &&
                (u.roles.includes("employee") || u.roles.includes("admin")),
            ),
          );
        }
      })
      .catch(() => {
        // Non-fatal: the dropdown just stays empty.
      });
  }, [gate.status]);

  // 3. Debounce the search box (the fetch runs inside the timeout callback).
  useEffect(() => {
    const handle = setTimeout(() => {
      const s = searchInput.trim();
      if (s === search) return;
      setSearch(s);
      setPage(1);
      void fetchList(s, 1);
    }, 300);
    return () => clearTimeout(handle);
  }, [searchInput, search, fetchList]);

  const total = Number(list?.total ?? 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pages = useMemo(
    () => Array.from({ length: Math.min(pageCount, 10) }, (_, i) => i + 1),
    [pageCount],
  );

  async function onCreated(result: { user: User; temporaryPassword: string }) {
    setCreateOpen(false);
    setTempPassword({ name: result.user.displayName, value: result.temporaryPassword });
    void fetchList(search, page);
  }

  async function resetPassword(user: User) {
    const res = await api.POST("/admin/users/{id}/password-reset", {
      params: { path: { id: user.id } },
    });
    if (res.error) {
      setListError(message(res.error));
      return;
    }
    if (res.data) {
      setResetResult({ user, temporaryPassword: res.data.temporaryPassword });
    }
  }

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

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle", { count: total })}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>{t("create")}</Button>
      </header>

      <div className="mt-4">
        <Input
          type="search"
          aria-label={t("search")}
          placeholder={t("searchPlaceholder")}
          value={searchInput}
          onChange={(e) => setSearchInput(e.currentTarget.value)}
        />
      </div>

      {listError ? (
        <Alert variant="destructive" className="mt-4">
          <AlertTitle>{t("loadError")}</AlertTitle>
          <AlertDescription>
            <button
              type="button"
              onClick={() => void fetchList(search, page)}
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
              <TableHead>{t("name")}</TableHead>
              <TableHead className="hidden sm:table-cell">{t("roles")}</TableHead>
              <TableHead className="hidden md:table-cell">{t("created")}</TableHead>
              <TableHead aria-label={t("actions")} className="w-10">
                <span className="sr-only">{t("actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  {search ? t("noResults") : t("empty")}
                </TableCell>
              </TableRow>
            ) : (
              list.items.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <AvatarCell user={user} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-bold">{user.displayName}</span>
                          {!user.isActive ? <Badge variant="destructive">{t("inactive")}</Badge> : null}
                        </div>
                        <div className="truncate text-sm text-muted-foreground">
                          {user.email}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      <RoleBadges user={user} />
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setEditUser(user)}
                      >
                        {t("edit")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => resetPassword(user)}
                      >
                        {t("resetPassword")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleteUser(user)}

                        disabled={user.id === me?.id}
                      >
                        {t("delete")}
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
        <nav className="mt-4 flex items-center justify-center gap-2" aria-label={t("pagination")}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const target = Math.max(1, page - 1);
              setPage(target);
              void fetchList(search, target);
            }}
            disabled={page <= 1}
          >
            {t("prev")}
          </Button>
          {pages.map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              onClick={() => {
                if (p === page) return;
                setPage(p);
                void fetchList(search, p);
              }}
            >
              {p}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const target = Math.min(pageCount, page + 1);
              setPage(target);
              void fetchList(search, target);
            }}
            disabled={page >= pageCount}
          >
            {t("next")}
          </Button>
        </nav>
      ) : null}

      {/* Dialogs mount only while open (keyed), so no state reset needed. */}
      {createOpen ? (
        <CreateUserDialog onClosed={() => setCreateOpen(false)} onCreated={onCreated} />
      ) : null}
      {editUser ? (
        <EditUserDialog
          key={editUser.id}
          user={editUser}
          employees={employees}
          meId={me?.id ?? ""}
          onClosed={() => setEditUser(null)}
          onSaved={() => void fetchList(search, page)}
        />
      ) : null}
      {deleteUser ? (
        <DeleteUserDialog
          key={deleteUser.id}
          user={deleteUser}
          meId={me?.id ?? ""}
          onClosed={() => setDeleteUser(null)}
          onDeleted={() => void fetchList(search, page)}
        />
      ) : null}
      {resetResult ? (
        <ResetPasswordDialog
          key={resetResult.user.id}
          result={resetResult}
          onClosed={() => setResetResult(null)}
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
