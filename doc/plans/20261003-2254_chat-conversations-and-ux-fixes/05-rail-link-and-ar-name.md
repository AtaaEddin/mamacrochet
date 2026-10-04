# 05 — Works-rail "browse the full list" becomes a link + ar name هنادي

status: done

Frontend only. Asks 3 and 5.

## 1. Ask 3 — the works-rail foot is just text, not a link

`ProductRail`'s bottom row (`t("railFoot")` — "Or browse the full list —
every piece can be yours.") is a plain `<p>`. Make it a real `Link` to
`/works` (the products list page) — the whole text is the link:

- `Link` styled as the current muted text row (no button chrome), with
  `hover:text-foreground` + underline on hover, focus ring per the rest of
  the rail; keep the existing `ChevronDown` glyph in front (rotate kept as
  is), `aria-label` stays the foot text.
- The row scrolls into view with the rail (it already does — it's the last
  rail element); no other layout change.

## 2. Ask 5 — Hanadi in Arabic is هنادي

- `messages/ar.json`: all 10× **حنادي** → **هنادي** (Metadata.name
  "حنادي كروشيه" → "هنادي كروشيه", Nav.launcher, Works.allSubtitle,
  custom-offer body, ChatPanel label/title/opener/pickerEmpty/emptyThread/
  listEmpty — grep-verified 10/10, no other spelling variants).
- `frontend/scripts/verify-fab-exit.mjs`: the FAB locator asserts
  `aria-label='تحدّثي مع حنادي'` → updated to هنادي (the script must keep
  passing).
- en/tr files untouched (no Arabic there); no backend strings carry the
  name (grep-verified 0 hits in `src/`, `deploy/`).
- Brand feel check: the mark/wordmark elsewhere stays `hanadicrochet`
  (Latin) — only the Arabic persona spelling changes.

## Definition of done

- `pnpm typecheck` · `pnpm lint` green. ✅
- Browser-verified via `frontend/scripts/verify-rail-link-and-ar-name.mjs`
  (playwright-core vs system Chromium) — 29/29 pass:
  - **rail foot link** (desktop; the rail is `hidden` below `lg`), en + ar,
    light + dark: exactly one `/works` link in the rail, `href` points at
    `/works`, the element is focusable (native `<a>` tab stop), and clicking
    navigates to `/<locale>/works`. RTL: the link sits at the rail foot and
    navigates correctly in `ar` (dir=rtl). ✅
  - **Arabic name** (ar pages, mobile + desktop, light + dark): the works
    subtitle shows هنادي; the chat launcher (FAB) `aria-label` is
    «تحدّثي مع هنادي»; the chat panel `section` `aria-label` is
    «الدردشة مع هنادي»; and **no** حنادي appears anywhere in the rendered
    `/ar/works` or `/ar/chat` UI. ✅
  - Note on "document.title-level metadata": `Metadata.name` = "هنادي
    كروشيه" feeds the title template `%s · ${name}`, but no route sets its
    own `<title>` (all use the default), so the app name never lands in
    `document.title`. The name is verified where it actually renders
    (launcher / works subtitle / chat panel label) plus the `ar.json` value.
- `verify-fab-exit.mjs` still passes (28/28): FAB `aria-label` updated to
  هنادي. Its signed-in `T` section was also made auto-open-aware (sub-plan
  03): `/chat` now lands in THREAD mode (the single linked thread
  auto-opens, one-shot), so the flow is thread-mode Back → list → the
  linked thread row is shown, instead of the pre-auto-open
  list→click→thread order. ✅
