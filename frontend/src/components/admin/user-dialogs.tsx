"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/lib/api/client";
import { useApiErrorMessage } from "@/lib/api/errors";
import type { User } from "@/lib/auth";
import type { components } from "@/lib/api/schema";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldSet,
  FieldSeparator,
} from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";

export type UserCreated = components["schemas"]["UserCreated"];
export type UserPage = components["schemas"]["UserPage"];
export type ResetResult = { user: User; temporaryPassword: string };

/**
 * Dialogs are mounted only while open (the parent renders them
 * conditionally with a `key`), so state initializes on mount and there is
 * nothing to reset — closing unmounts.
 */

/**
 * One-time temporary password dialog — shown after create / reset. The API
 * only returns the plaintext once; if the admin closes this, the only path
 * forward is another reset (that is the design, plan 03).
 */
export function TempPasswordDialog({
  userName,
  password,
  onClosed,
}: {
  userName: string;
  password: string;
  onClosed: () => void;
}) {
  const t = useTranslations("AdminUsers");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      toast.add({ title: t("copied"), type: "success" });
    } catch {
      // Clipboard blocked (permissions) — the password stays visible above.
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("tempPasswordTitle")}</DialogTitle>
          <DialogDescription>
            {t("tempPasswordFor", { name: userName })}
            {t("tempPasswordOnce")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-sm">
            {password}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClosed}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Create user (plan 03). Customer role is implicit; employee/admin are
 * opt-in. The created account is inactive until the first login, so the
 * admin shares the returned temporary password instead of setting a final
 * one.
 */
export function CreateUserDialog({
  onClosed,
  onCreated,
}: {
  onClosed: () => void;
  onCreated: (result: UserCreated) => void;
}) {
  const t = useTranslations("AdminUsers");
  const lt = useTranslations("Locale");
  const message = useApiErrorMessage();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [language, setLanguage] = useState("en");
  const [employee, setEmployee] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const roles = ["customer"];
      if (employee) roles.push("employee");
      if (admin) roles.push("admin");
      const res = await api.POST("/admin/users", {
        body: {
          email,
          displayName,
          phone: phone.trim() ? phone.trim() : null,
          country: country.trim() ? country.trim() : null,
          language,
          roles,
        },
      });
      if (res.error) {
        setError(message(res.error));
        return;
      }
      if (res.data) onCreated(res.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createTitle")}</DialogTitle>
          <DialogDescription>{t("createBody")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="new-user-email">{t("email")}</FieldLabel>
              <Input
                id="new-user-email"
                type="email"
                autoComplete="off"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-name">{t("displayName")}</FieldLabel>
              <Input
                id="new-user-name"
                autoComplete="off"
                value={displayName}
                onChange={(e) => setDisplayName(e.currentTarget.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="new-user-phone">{t("phoneOptional")}</FieldLabel>
                <Input
                  id="new-user-phone"
                  type="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.currentTarget.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="new-user-country">{t("countryOptional")}</FieldLabel>
                <Input
                  id="new-user-country"
                  autoComplete="off"
                  value={country}
                  onChange={(e) => setCountry(e.currentTarget.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="new-user-language">{t("language")}</FieldLabel>
              <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
                <SelectTrigger id="new-user-language" aria-label={t("language")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(["en", "ar", "tr"] as const).map((l) => (
                      <SelectItem key={l} value={l}>
                        {lt(l)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FieldSet>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="new-user-employee">
                  <Checkbox
                    id="new-user-employee"
                    checked={employee}
                    onCheckedChange={(c) => setEmployee(c === true)}
                  />
                  {t("roleEmployee")}
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="new-user-admin">
                  <Checkbox
                    id="new-user-admin"
                    checked={admin}
                    onCheckedChange={(c) => setAdmin(c === true)}
                  />
                  {t("roleAdmin")}
                </FieldLabel>
              </Field>
              <FieldSeparator />
              <FieldDescription>{t("createRolesHint")}</FieldDescription>
              <FieldError>{error ?? ""}</FieldError>
            </FieldSet>
            <DialogFooter className="border-t pt-4">
              <Button type="submit" disabled={busy}>
                {busy ? t("creating") : t("create")}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Edit user (plan 03). Self-edit is limited to identity fields: the server
 * enforces `self_modification`, the UI mirrors it (disabled controls).
 * Mounted per user (keyed), so state initializes from the user on mount.
 */
export function EditUserDialog({
  user,
  employees,
  meId,
  onClosed,
  onSaved,
}: {
  user: User;
  employees: User[];
  meId: string;
  onClosed: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("AdminUsers");
  const lt = useTranslations("Locale");
  const message = useApiErrorMessage();

  const [displayName, setDisplayName] = useState(user.displayName);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [country, setCountry] = useState(user.country ?? "");
  const [language, setLanguage] = useState(user.language);
  const [employee, setEmployee] = useState(user.roles.includes("employee"));
  const [admin, setAdmin] = useState(user.roles.includes("admin"));
  const [assignedEmployeeId, setAssignedEmployeeId] = useState(
    user.assignedEmployeeId ?? "none",
  );
  const [isActive, setIsActive] = useState(user.isActive);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isSelf = user.id === meId;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const roles = ["customer"];
      if (employee) roles.push("employee");
      if (admin) roles.push("admin");
      const res = await api.PATCH("/admin/users/{id}", {
        params: { path: { id: user.id } },
        body: {
          displayName,
          phone: phone.trim() ? phone.trim() : null,
          country: country.trim() ? country.trim() : null,
          language,
          roles,
          assignedEmployeeId:
            assignedEmployeeId && assignedEmployeeId !== "none"
              ? assignedEmployeeId
              : null,
          isActive,
        },
      });
      if (res.error) {
        setError(message(res.error));
        return;
      }
      onSaved();
      onClosed();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editTitle", { name: user.displayName })}</DialogTitle>
          <DialogDescription>{user.email}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="edit-name">{t("displayName")}</FieldLabel>
              <Input
                id="edit-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.currentTarget.value)}
              />
            </Field>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="edit-phone">{t("phone")}</FieldLabel>
                <Input
                  id="edit-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.currentTarget.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-country">{t("country")}</FieldLabel>
                <Input
                  id="edit-country"
                  value={country}
                  onChange={(e) => setCountry(e.currentTarget.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="edit-language">{t("language")}</FieldLabel>
              <Select value={language} onValueChange={(v) => v && setLanguage(v)}>
                <SelectTrigger id="edit-language" aria-label={t("language")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {(["en", "ar", "tr"] as const).map((l) => (
                      <SelectItem key={l} value={l}>
                        {lt(l)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <FieldSet>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="edit-employee">
                  <Checkbox
                    id="edit-employee"
                    checked={employee}
                    onCheckedChange={(c) => setEmployee(c === true)}
                    disabled={isSelf}
                  />
                  {t("roleEmployee")}
                </FieldLabel>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="edit-admin">
                  <Checkbox
                    id="edit-admin"
                    checked={admin}
                    onCheckedChange={(c) => setAdmin(c === true)}
                    disabled={isSelf}
                  />
                  {t("roleAdmin")}
                </FieldLabel>
              </Field>
              <Field>
                <FieldLabel htmlFor="edit-assign">{t("assignedTo")}</FieldLabel>
                <Select
                  value={assignedEmployeeId}
                  onValueChange={(v) => setAssignedEmployeeId(v ?? "")}
                  disabled={isSelf}
                >
                  <SelectTrigger id="edit-assign" aria-label={t("assignedTo")}>
                    <SelectValue placeholder={t("noAssignment")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="none">{t("noAssignment")}</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          {emp.displayName}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field orientation="horizontal">
                <FieldLabel htmlFor="edit-active">
                  <Switch
                    id="edit-active"
                    checked={isActive}
                    onCheckedChange={(c) => setIsActive(c === true)}
                    disabled={isSelf}
                  />
                  {t("active")}
                </FieldLabel>
              </Field>
              <FieldSeparator />
              <FieldDescription>
                {isSelf ? t("selfEditHint") : t("deactivateHint")}
              </FieldDescription>
              <FieldError>{error ?? ""}</FieldError>
            </FieldSet>
            <DialogFooter className="border-t pt-4">
              <Button type="submit" disabled={busy}>
                {busy ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </FieldGroup>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Soft delete (plan 03): the account is deactivated and the user must
 * re-login; the admin cannot deactivate themselves (button disabled).
 */
export function DeleteUserDialog({
  user,
  meId,
  onClosed,
  onDeleted,
}: {
  user: User;
  meId: string;
  onClosed: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations("AdminUsers");
  const message = useApiErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSelf = user.id === meId;

  async function onDelete() {
    if (busy || isSelf) return;
    setBusy(true);
    setError(null);
    const res = await api.DELETE("/admin/users/{id}", {
      params: { path: { id: user.id } },
    });
    if (res.error) {
      setError(message(res.error));
      setBusy(false);
      return;
    }
    onDeleted();
    onClosed();
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClosed()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { name: user.displayName })}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDelete} disabled={busy}>
            {busy ? t("deleting") : t("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Reset-password result (plan 03): the one-time temporary password for the
 * user, shown once.
 */
export function ResetPasswordDialog({
  result,
  onClosed,
}: {
  result: ResetResult;
  onClosed: () => void;
}) {
  const t = useTranslations("AdminUsers");
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.temporaryPassword);
      setCopied(true);
      toast.add({ title: t("copied"), type: "success" });
    } catch {
      // Clipboard blocked — the password stays visible in the dialog.
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClosed()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("resetTitle", { name: result.user.displayName })}</DialogTitle>
          <DialogDescription>{t("tempPasswordOnce")}</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 font-mono text-sm">
            {result.temporaryPassword}
          </code>
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClosed}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
