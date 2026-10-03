"use client";

import { useTranslations } from "next-intl";
import type { ApiError } from "./generated-client";

export type { ApiError };

/**
 * Typed error envelope → localized message (plan 03). Every 4xx/429/500 body
 * is `ApiError { code, message }` (the same type the generated SDK types its
 * `error` field with). Known codes map to translated strings (keys must match
 * the ApiError message namespace); anything else — e.g. ASP.NET Identity
 * password-policy text — falls back to the server message, then a generic
 * line.
 */
const KNOWN_CODES = [
  "already_decided",
  "bad_credentials",
  "csrf",
  "deactivated",
  "email_taken",
  "file_too_big",
  "forbidden",
  "guest_already_linked",
  "hiring_not_found",
  "invalid",
  "invalid_employee",
  "invalid_guest",
  "invalid_image",
  "invalid_language",
  "locked",
  "rate_limited",
  "self_modification",
  "server_error",
  "staff_only",
  "too_many_files",
  "unauthenticated",
  "unsupported_file_type",
  "unsupported_image",
  "user_not_found",
  "wrong_password",
] as const;

type KnownCode = (typeof KNOWN_CODES)[number];

function isKnownCode(code: string): code is KnownCode {
  return (KNOWN_CODES as readonly string[]).includes(code);
}

function asApiError(error: unknown): ApiError | null {
  if (error && typeof error === "object") {
    const candidate = error as Partial<ApiError>;
    if (typeof candidate.code === "string" && typeof candidate.message === "string") {
      return candidate as ApiError;
    }
  }
  return null;
}

/**
 * Normalize an unknown SDK error value into a usable `ApiError`. The
 * generated client hands us the parsed error body (the ApiError envelope on
 * every declared error status) — or `{}` when a response body was not JSON.
 * A null/undefined error (network failure — no response at all) yields the
 * fallback envelope.
 */
export function toApiError(error: unknown, fallbackMessage = ""): ApiError {
  const body = asApiError(error);
  if (body) return body;
  return { code: "server_error", message: fallbackMessage };
}

/** Returns a localized user-facing message for an API error value. */
export function useApiErrorMessage() {
  const t = useTranslations("ApiError");
  return (error: unknown): string => {
    const body = asApiError(error);
    if (body && isKnownCode(body.code)) {
      return t(body.code);
    }
    return body?.message || t("fallback");
  };
}
