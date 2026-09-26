# Commits — 20260926-1816_mvp-platform-foundation

Append a row for **every** git commit related to this plan (see AGENTS.md → Plan system),
then commit the update.

| Date (local) | Commit | Subject | Note |
|--------------|--------|---------|------|
| 2026-09-26 18:45 | 2038e05 | chore: bootstrap repo — AGENTS.md, plan system, first MVP plan, language configs | First agent: AGENTS.md (domain + rules), doc/ plan system, first plan (main + 10 sub-plans), .gitignore, tsconfig.json (strict), Directory.Build.props (warnings as errors), .editorconfig, rewritten Readme.md, reference doc moved to doc/references/ |

| 2026-09-26 19:05 | 305a321 | docs(plans): owner decisions — drop item 5, email via Google SMTP (D13) | Owner confirmed: ignore list item 5; email via a Google account over SMTP (OAuth 2.0 in prod, app-password dev fallback) — not self-hosted mail. Added D13 to main.md, reworked plan 03 email decisions (IEmailSender), AGENTS.md stack line |

| 2026-09-26 19:38 | 03300f6 | docs(plans): owner updates — guest-first chat core, no email in r1, brand plan 11, guest anti-abuse, future plan (email+notifications+Google login) | Owner: guest-first anonymous chat/orders is THE core idea (D14) w/ anti-abuse bounds (D16); email out of release 1 (D13 post-r1); feminine/fluffy/joyful brand (D15 + new plan 11); en+ar complete in r1; Google sign-in = core but future release (D17); notifications for all roles ship with email (D18) → new plan folder 20260926-1935 |
