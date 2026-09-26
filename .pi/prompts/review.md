---
description: Review changes against mamacrochet rules (correctness, domain rules, security, plan scope)
argument-hint: "[focus]"
---
Review the current changes against this repo's rules (AGENTS.md + active plan in
doc/plans/). Focus: ${1:-correctness, domain rules, security, and plan scope}.

Check specifically:
1. Order state machine: every status transition guarded; timeline event written in
   the same transaction; receipt required for `paid` (admin override ⇒ mandatory note);
   close only when paid + delivered (or admin override).
2. Guest safety (D16): rate limits + caps enforced server-side for guest chat/orders;
   nothing sensitive trusted from a guest request.
3. RBAC: role policies enforced server-side (Customer/Employee/Admin), not just UI.
4. Code rules: 0 warnings, no `any`/suppression, EF migrations for schema, semantic
   design tokens, no secrets/env files staged.
5. Scope: changes stay inside the active plan; otherwise flag a new plan.

Fix small issues directly; list anything that needs a plan or owner decision.
