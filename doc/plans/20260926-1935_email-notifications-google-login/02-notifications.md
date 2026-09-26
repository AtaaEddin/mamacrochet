# 02 — Notifications (Customer / Employee / Admin)

status: proposed
parent: main.md

## Scope (decision D18)

- `Notification` entity: user, `type` (enum), order/thread ref (nullable),
  `templateKey` + payload JSON (rendered per language), read flag, created at.
- **In-app**: notification center — bell icon + unread count in header, list page
  (grouped by day, mark read / mark all), realtime push over the existing SignalR hub
  (new `notifications` group per user). Mobile-first (sheet on phones).
- **Email**: subset of events also sent as localized emails via sub-plan 01
  (deduplicated per event, not per device).
- **Event catalog (v1)**:
  - Customer: order status changed, new message in their thread, payment recorded,
    delivered, closed, "leave a rating" prompt.
  - Employee: order assigned, new guest thread / new message, order ready to pay,
    order cancelled, rating received.
  - Admin: new guest order, new hiring application, order cancelled, any status
    override performed, unassigned order detected.
- **Preferences** (simple): per user, per event group (orders / chat / account):
  in-app on/off, email on/off. Defaults: in-app on, email on for order events.
- Retention: keep 90 days, then prune (daily job in the API process).

## Tasks

- [ ] Entity + migration + API (list, read state, preferences get/put)
- [ ] `INotificationPublisher` wired into order lifecycle, chat, and hiring flows
      (domain events → typed notifications)
- [ ] SignalR notifications channel + bell UI (mobile-first)
- [ ] Email mapping (which event types email) via sub-plan 01 templates
- [ ] Per-role surfacing: customers on their pages, staff in their dashboards

## Acceptance

- Firing each v1 event in a scripted flow → the right users (customer/employee/admin)
  receive in-app + email in the right language, deduplicated; preference toggles are
  respected; unread counts stay correct across realtime + refresh.
