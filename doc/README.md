# doc/

Documentation home for hanadicrochet.

## plans/

One folder per plan, named `<YYYYMMDD-HHMM>_<title-slug>` (creation datetime + title summary
of the main plan), e.g. `20260926-1816_mvp-platform-foundation/`.

A plan folder contains:

- `main.md` — the plan itself. It may be large but must **reference sub-plan files in the
  same folder** instead of inlining every detail.
- `NN-topic.md` — sub-plans, each with **one responsibility**, small enough to finish in a
  single agent session.
- `COMMITS.md` — table of git commits related to this plan.

Rules (authoritative version in `AGENTS.md` → "Plan system"):

1. No giant plans — always split by responsibility.
2. Every plan file starts with a `status:` header: `proposed | in-progress | done | cancelled`.
3. Before any non-trivial decision (versions, libraries, architecture, UX flows): search the
   web to confirm the current best practice, and record the decision **with source links**
   in the plan file.
4. Whenever an agent commits to git, it appends a row to the `COMMITS.md` of the plan folder
   the commit belongs to (date, short hash, subject, one-line note), then commits that update.
5. Work follows the active plan. If a task reveals missing scope, write a new plan first.

## references/

Saved external reference material (conversations, vendor docs, examples).
