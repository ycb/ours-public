# Notification Cadence Design

**Date:** October 28, 2026
**Status:** Approved October 29, 2026
**Scope:** Task 7D planning only; no production delivery or real/private content

## Why notifications matter here

Ours is not using notifications as a generic retention device. A share, edit, reply, Not-now decision, or agreement can follow a vulnerable relational act. Timely awareness helps the conversation continue, while redundant or overly specific notifications can create pressure and can expose private activity on a lock screen or in an inbox.

The app already supports live in-app updates. While a signed-in browser is open, it subscribes to content-free `activity_events` through Supabase Realtime, consumes only opaque event/item identifiers and the event enum, and refetches protected data through normal RLS-scoped queries. It never uses content fields from a Realtime payload. External notifications should therefore cover activity that remains unseen, not mirror every event unconditionally.

## Product contract

### In-app experience

- In-app updates remain immediate and authoritative.
- Shares, meaningful edits, replies, Not-now decisions, and agreement already produce content-free activity events.
- If one of those events arrives for the idea currently open in a visible tab, Ours refetches it and records acknowledgement of those exact activity-event ids only after the updated state is actually presentable. Realtime bursts run as serialized immutable snapshots: an event arriving during a refetch waits for the next refetch cycle and cannot be acknowledged by the earlier one. A dirty, saving, held, or conflicted inline editor blocks acknowledgement so a partner edit that has not replaced the local wording is not treated as seen. An initial page view first captures the current event ids, then refetches the protected idea data, then acknowledges only that captured boundary.
- A live socket alone never counts as seen. A hidden tab, an unattended device, or viewing another idea does not suppress a notification.

### External notification experience

- A newly shared idea gets an expedited, content-free email only if it is still unseen after five minutes.
- Meaningful edits, replies, Not-now decisions, and agreement join one rolling activity digest per recipient. The digest becomes eligible one hour after the first pending event.
- Immediately before delivery, Ours rechecks every candidate for an exact acknowledgement by that recipient. Acknowledged candidates are suppressed. If no unseen candidate remains, no email is sent.
- Several unseen candidates become one generic email. Candidates seen during the waiting window disappear from the batch; unseen candidates remain.
- External copy never names the event type, count, idea, category, content, person, or decision:
  - Share: “Something new is waiting in Ours.”
  - Digest: “There are updates waiting in Ours.”
- Delivery remains at-least-once. Every delivery batch has a stable, content-free Message-ID so mail clients can deduplicate a rare ambiguous retry.

### What counts as a Task 7D event

| Activity event | External treatment |
| --- | --- |
| `item_created`, `item_remixed` | Dedicated share delivery, eligible after five minutes |
| `item_edited` | Hourly activity digest |
| `comment_added` | Hourly activity digest |
| `item_declined` | Hourly activity digest |
| `item_became_eligible` | Hourly activity digest |
| Interest, favorite, intermediate decision, draw, memory | No Task 7D external notification |

Drafts remain silent. A Not-now action emits one `item_declined` event rather than a second `comment_added`, so it contributes one candidate.

## Delivery model

The existing `notification_outbox` remains the delivery record and gains batching semantics. One row represents one email attempt identity, not one activity event. Its current single `item_id` moves to a new content-free join table that links a delivery row to one or more `activity_events`. The join carries `couple_id` for composite tenant-consistency foreign keys and a nullable `suppressed_at`; it still contains identifiers and timestamps only.

- A share creates its own delivery row with `not_before = event.created_at + 5 minutes`.
- The first digest event creates a recipient's open digest row with `not_before = event.created_at + 1 hour`.
- Later digest events join that open row until it is claimed. The enqueue mapper locks the current unsealed digest row and rechecks `sealed_at` before linking; claiming takes the same row lock and atomically sets `sealed_at`. Therefore an event either joins before the claim snapshot or opens the next digest, never changes a batch already being sent. An event can belong to only one delivery row, and a partial unique index permits only one digest with `sealed_at is null` per recipient.
- Claiming first timestamps linked candidates whose idea was seen after the event. Empty rows complete without email. Non-empty rows are locked and returned to the worker.
- A new event arriving after a row is claimed creates the next digest row; it never enters a batch already being sent.
- `sealed_at` freezes membership; it does not mean delivery succeeded. A sealed row still follows the existing stale-claim and retry rules and never reopens when `claimed_at` is cleared after failure. The batch UUID remains the deterministic Message-ID across retries.

Both tables contain identifiers, enums, booleans, counters, and timestamps only. They contain no titles, descriptions, reply bodies, reasons, names, addresses, rendered copy, or provider error text. Recipient email is joined from Auth only inside the service-role claim function, as it is today.

## Seen semantics and the unavoidable race

At the final claim, an event is seen only when its exact `(activity_event_id, recipient_member_id)` acknowledgement exists. `item_views.last_seen_at` remains useful for the in-app unread display, but it is not authoritative for external suppression because timestamps can tie and a later write can race a newer unpresented event.

There is an unavoidable small race after the database performs the final seen check and before SMTP accepts the message. If the recipient opens the idea in that interval, an email can still arrive. Ours will not add distributed locks around human viewing to eliminate this edge case; the email is generic and the race is harmless.

## Channel strategy

The event, seen, batching, and delivery concepts are intentionally channel-neutral. The lean alpha uses email because it is testable with the existing local Mailpit worker. A later installed web app can use Web Push for faster delivery without changing which activity is pending or seen. Native App Store distribution remains optional rather than an architectural dependency.

The eventual preference model separates:

- channel: in-app, push, email;
- cadence: immediate, bundled, daily, off;
- event classes.

Per-person settings, quiet hours, time zones, daily caps, Web Push subscriptions, and native push are deferred until actual alpha use supplies evidence for them. The two-person v1 uses the fixed policy above.

## Failure behavior

- Unknown notification kinds fail closed.
- A deleted idea removes its pending candidates; an empty delivery is suppressed.
- A malformed couple still fails closed unless it has exactly two locked members including the actor.
- Claim concurrency uses `FOR UPDATE SKIP LOCKED`.
- A stale claim is retryable after ten minutes, with a maximum of five attempts.
- Logs contain counts and short error codes only.
- Disabling or stopping the worker never loses in-app activity; it only delays external delivery.

## Success criteria

Using only synthetic local accounts and content:

1. A live update appears in the open idea without refresh and records its exact event acknowledgement only when the correct idea is visible, the protected refetch succeeds, and no dirty/conflicted editor prevents the updated state from being shown.
2. A share viewed during its five-minute grace period sends no email.
3. An unseen share sends one generic email after the grace period.
4. Several digest events produce one generic email after the rolling hour.
5. Viewing every affected idea before claim produces no digest.
6. Viewing only some affected ideas still produces one generic digest for the unseen remainder.
7. Raw email, headers, Message-ID, outbox rows, logs, URLs, fixtures, and screenshots contain no real/private content or machine-derived personal hostname.

## Explicitly deferred

- Production provider and scheduled Edge Function.
- Hosted-project mutation or real recipient delivery.
- Web Push, native push, App Store submission, or moderation policy implementation.
- Notification settings UI, quiet hours, time zones, daily caps, and per-event preferences.
- Content-bearing notifications or direct links containing private identifiers.
