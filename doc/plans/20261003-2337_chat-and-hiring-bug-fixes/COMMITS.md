# COMMITS — chat-and-hiring-bug-fixes

| Date | Commit | Subject | Notes |
|------|--------|---------|-------|
| 2026-10-03 | 13b59ca | docs(plans): chat & hiring bug-fix plan — 4 sub-plans from 1303 notes | Plan created (status: proposed): 01 attachment fileSrc, 02 claim-on-open + first-wins claim, 03 hiring dialog overflow, 04 send races + bootstrap dedupe; cross-references in 20261003-1303 main.md + 03 notes |
| 2026-10-04 | 4350184 | fix(api,frontend): chat attachments/claim/hiring + send races, pre-bootstrap send (plan 20261003-2337) | All 4 sub-plans implemented (status: done). Sub 04 note: pre-implementation read-through missed that the composer mounts before bootstrap (guest page) — the send pipeline also handles the "no thread yet" wait, and the guest 409 self-heal re-bootstraps. Browser verification via scripts/verify-chat-hiring-bugs.mjs against the live Aspire stack (mobile+desktop, light+dark, guest/staff/admin paths); script committed for re-run. `pnpm typecheck` + `pnpm lint` green. |
