# Ours Personal Alpha MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build and verify the smallest private, responsive Ours loop in which two authenticated partners create an item, respond independently, mutually activate it, draw it in Roulette, record a memory, and expand the palette.

**Architecture:** A Vite React/TypeScript single-page application talks directly to Supabase through the publishable browser client. Postgres owns tenant isolation, actor attribution, revision/activity triggers, and roulette validation through RLS and narrowly scoped functions; the UI is organized in feature slices and uses TanStack Query for server state. All committed data and test artifacts are synthetic.

**Tech Stack:** React, TypeScript, Vite, React Router, TanStack Query, Supabase JS, Postgres/Supabase migrations, pgTAP, Vitest, Testing Library, Playwright, plain CSS design tokens.

---

## Status and Approval Gate

**Status:** Approved October 23, 2026.
**Design dependency:** `docs/plans/2026-10-23-personal-alpha-mvp-design.md`
**Implementation gate:** Approval received; commit this planning baseline before Task 1.
**Execution isolation:** After approval, commit the approved design and ExecPlan on `main`, then use `superpowers:using-git-worktrees` to create a `codex/personal-alpha-mvp` worktree from that commit. The implementation branch owns subsequent Progress/evidence updates until integration so one authoritative plan travels with the code.

## Progress

Codex and Claude alternate on this plan; see `AGENTS.md` for the shared working agreement and the
**Session Log** section below for the latest handoff.

- [x] Read the approved handoff, strategy/design, and lessons.
- [x] Resolve only first-loop interaction and data decisions.
- [x] Draft the detailed interaction/data-model design.
- [x] Draft this ExecPlan.
- [x] Receive user approval for the design and ExecPlan.
- [x] Task 1: Scaffold the application and test harness.
- [x] Task 2: Initialize Supabase and define the core schema.
- [x] Task 3: Add authorization, grants, and database security tests. (`93427ed`)
- [x] Task 4: Add authentication and authenticated application shell.
- [x] Task 5: Implement categories, item creation, and the library.
- [x] Task 6: Implement item detail, independent responses, comments, history, and remix.
- [x] Task 6A: Item lifecycle and review state (drafts, submit = author Ready, per-member seen, Not-now reason, author delete). *v2*
- [x] Task 6B: Mine / Theirs / Ours / Not now views, share flow, New and unread visual hierarchy. *v2*
- [x] Task 6C: Rebuild the UI to the Final IA (Ideas: Drafts · Ideas · Respond; Plan; idea detail with I'm in / Edit / Not now). *v2 final IA*
- [~] Task 7: ~~Home action queue and activity feed~~ — superseded by Task 6C (Respond + the latest-activity line). The nav dot ships in 6C.
- [x] Task 7B: One content-free notification intent per shared idea (outbox, local worker, Mailpit). *v2*
- [x] Task 6D: Idea page cleanup: direct editing, header with favorite and overflow, one place per fact. *v2*
- [x] Task 7C: "Who wrote what": line-level attribution on an idea, hidden by default. *v2*
- [x] Task 7D: Unseen-activity cadence: expedited shares plus an hourly content-free digest. *v2*
  - [x] Task 7D.1: Live viewing acknowledges only successfully refetched, visibly presented event ids.
  - [x] Task 7D.2: Convert the outbox from event rows to delivery batches.
  - [x] Task 7D.3: Revalidate exact seen state when claiming; empty deliveries never send.
  - [x] Task 7D.4: Render and deliver generic batches (one email per claimed delivery).
  - [x] Task 7D.5: Verify the real synthetic loop (two browsers, local worker, Mailpit), plus independent reviews.
- [x] Task 8: Implement safe Roulette selection and outcomes.
- [x] Task 9: Implement memories and expansion.
- [x] Task 10: Verify the complete synthetic responsive loop.
- [ ] Task 11: Add privacy operations and evaluate real-content readiness.

## Replan — Interaction Model v2 (2026-10-25)

**Gate:** Do not start Task 6A until Peter confirms or amends the open questions in `docs/plans/2026-10-25-interaction-model-v2.md`. Record his answers in that doc and in the Decision Log.

Peter's hands-on review after Task 6 found that the first loop established function but not the experience. Authored-by-me and authored-by-partner items were indistinguishable, nothing signalled "your partner added something and wants your review", and there was no action queue. Peter's direction:

- Items move **Draft → Submitted → (partner) New → In review → Ready for plan | Not now**. Drafts are private to the author.
- **Submitting is the author's Ready** (supersedes "creation never opts the creator in").
- "Reviewed" distinguishes **New vs. opened**; it does not mean Ready.
- **Not now** is its own list, with a **reason** and ongoing dialogue. It is reversible by the decliner; the author can edit or delete.
- Views: **Mine** (drafted or submitted, waiting on partner), **Theirs** (needs my input), and **Ours** (merged).
- Action queue: **new items from partner, items needing my decision, unread messages.** Ready-for-plan items are not in the queue.
- Comments are just **chat**; there is no question type.
- Notifications: **in-app** (the queue and badge, a second way in) and **email** (content-free). SMS is deferred.

What stays: Tasks 1–6 (auth, schema and RLS base, palette CRUD, response controls, comments, history, remix). Task 6A adds a migration rather than editing existing ones. Task 6B reorganizes `LibraryPage` and Home, reusing `ItemCard`, `ItemDetailPage`, and `ResponseControls`. Detailed steps for Tasks 6A, 6B, 7 (revised), and 7B will be added here once the gate clears; until then the v2 doc is the specification.

## Task 6C: Rebuild the UI to the Final IA (2026-10-26)

Spec: `docs/plans/2026-10-25-interaction-model-v2.md` → "Final IA". No schema change is expected; everything derives from Task 6A data (status, responses, `item_views`, comments, revisions).

**Steps (test-first, one commit per step if useful):**

1. **Routes and nav.** `/` redirects to `/ideas`. Bottom nav: Ideas (with a dot when Respond is non-empty) · Plan. `/ideas?view=drafts|respond` (the default omits `view`), `/ideas/new`, `/ideas/:id`, `/ideas/:id/edit`, `/plan`, `/plan/agreed`. Redirects from `/experiences/*` and `/palette/*`. Copy: Ideas.
2. **Domain.** `latestActivity(item, responses, revisions, stamps, me, partner)` returns `{ at, line }` with natural-language lines; `needsMe` = stage new | needs_decision, or unread; the Ideas view excludes `ready` (Plan) and, by default, `not_now`. Unit tests cover every line variant.
3. **Inbox rows.** One `IdeaRow` component: initial avatar (dashed for drafts), title, activity line, relative time, bold + dot when needs-me, and an optional trailing action (Share for drafts).
4. **Views.** Drafts / Ideas / Respond as a segmented control. Respond shows a count and an accent fill when non-empty; Ideas and Respond show empty states; Respond ends with "That's everything waiting on you".
5. **Refine sheet.** Category, Interest per partner, Favorites, and Show Not now, serialized in the URL as ids/enums only. Remove the creator and roulette filters.
6. **Detail.** Header with author, category, and time; side-by-side answers; chat; an action bar (I'm in → `set_roulette_decision('ready')`, Edit, Not now… → the existing decline dialog); compact interest chips and a favorite toggle; "Undecided" through a "Change my answer" affordance once decided. Keep the share / delete / archive / co-edit flows from 6B.
7. **Plan.** Agreed ideas: a Spin placeholder until Task 8, "Just agreed" (latest agreed), and `/plan/agreed` as the full list (filters: category, favorites).
8. **Verify.** lint, test, build, the DB harness, and a Playwright pass at 320 and 1280 px (no overflow; Respond catches the eye; Not now hidden by default). Then sync, commit, and update evidence and the Session Log.

## Task 7B: One Content-Free Notification Intent per Shared Idea (2026-10-26)

Spec: v2 doc → Notifications. When one partner shares an idea, Ours creates exactly one outbox intent addressed to the other partner. The email names no idea, act, message or person: it says only that something is waiting in Ours, plus a link. No batching. Nothing leaves the machine in development: mail goes to the local stack's Mailpit. Delivery is at-least-once: a rare crash after SMTP accepts a message but before the database records success can produce a duplicate. Every retry carries the same deterministic, content-free Message-ID so mail clients can deduplicate it.

1. **Outbox (migration + pgTAP, test first).** Add `notification_kind` enum (`idea_shared`). Add `notification_outbox`:
   - Columns: `id`, `couple_id`, `recipient_member_id`, `kind`, `item_id` (cascade on delete, so a deleted idea never emails), `created_at`, `claimed_at`, `sent_at`, `attempts`, `last_error_code`.
   - **No free-text column.** A pgTAP test asserts the column list, so a body or title can never be added silently.
   - Unique `(recipient_member_id, kind, item_id)`: one outbox intent per share.
   - RLS on, with no grants to `anon` or `authenticated`.
   - An `AFTER INSERT` trigger on `activity_events` for `item_created` and `item_remixed` locks the couple and its members in the established order, requires exactly two members including the actor, and enqueues a row for exactly the *other* member. Malformed membership fails closed. Drafts record no event, so they never email.
   - Tests:
     - Sharing enqueues exactly one row for the partner and none for the author.
     - Re-sharing or editing enqueues nothing.
     - Deleting the idea removes its row.
     - Members can't read the outbox.
2. **Delivery functions.** `claim_notifications(p_limit)` returns rows with the recipient's auth email; it sets `claimed_at` and uses `FOR UPDATE SKIP LOCKED`. `mark_notification_sent(id)` and `mark_notification_failed(id, code)` complete delivery. All three are SECURITY DEFINER with `search_path=''` and are executable only by `service_role`. A failed send stores an error *code*, never provider text. A stale claim (older than 10 minutes, unsent) can be re-claimed; after 5 attempts a row stops being retried. This is deliberately at-least-once, not exactly-once: SMTP and the database cannot atomically commit a send.
3. **Message.** `renderNotification(kind, appUrl)` is pure and takes no content inputs.
   - Subject: "Something new is waiting in Ours".
   - Body: "Your partner shared something with you. Open Ours to see it: <appUrl>/ideas".
   - The raw send inputs are pinned by unit tests: idea content and person names cannot affect subject, body, or Message-ID.
   - Message-ID is deterministically `<outbox-uuid@ours.localhost>` and stays stable across retries.
4. **Local worker.** `scripts/notify-worker.mjs` (`npm run notify:worker`):
   - Refuses non-local URLs (like `dev-accounts`).
   - Polls every 10 s and sends via SMTP to Mailpit (enable `[local_smtp] smtp_port`).
   - Logs only counts.
   - Uses the local service-role key from `supabase status`, never a `VITE_` variable.
5. **Verify.**
   - DB tests on the harness and the Mac.
   - A unit test for the renderer.
   - A manual check under normal operation: A shares → one email in Mailpit (web UI) addressed to B, with no title in the subject, body or headers. Its Message-ID is the deterministic outbox identity. Sharing a second idea sends one additional email; editing sends none. A rare ambiguous post-send crash may duplicate delivery, with the same Message-ID for client-side deduplication.
6. **Production delivery is out of scope:** a scheduled Edge Function plus an email provider. It needs a remote checkpoint with Peter and belongs with Task 11's readiness work. The outbox and claim functions are designed so that function can replace the local worker unchanged.

## Task 6D: Idea Page Cleanup (2026-10-26)

From Peter's review: favorite inline with the title, secondary actions in an overflow menu, **no edit mode**, and no redundancy. It is sequenced after 7B and before 7C, because 7C builds on the editable description.

1. **Header.** A bare back arrow; the title; the favorite heart (mine, toggles) top right; and a "⋯" menu with Remix and Delete. Archive leaves the menu; it is offered only when Delete is refused (OU423: "This has memories attached. Archive it instead?").
2. **Direct editing** for the title, description and category, for anyone who can see a live idea (co-editing as today).
   - Fields look like text until focused, and save on blur when changed, with `p_expected_updated_at`.
   - Conflict (OU409): an inline "Alex just changed this: see theirs / keep mine".
   - **Asked again:** if the partner's answer is In, the save is held for 5 s behind "Alex will be asked again · Undo". Undo cancels it, so nothing is written. Otherwise the save is immediate, with a quiet "Saved".
   - The edit page goes away; `/ideas/:id/edit` redirects to `/ideas/:id`. New ideas use the same layout with empty fields and save as a draft once the title and description are filled in.
3. **Answers.** Two cards (You, Alex) with the answer word and interest; my card's interest is the control.
   - Buttons beneath: I'm in / Not now…, or Take back my yes / Undecided.
   - The heading, status chip, "You're in." line and separate interest row are removed.
   - The permission line appears once, under I'm in, only while I haven't answered.
   - A partner's favorite shows as "♥" on their card.
4. **Trims.**
   - Chat: no heading, placeholder "Write to Alex…", a Send button.
   - Byline: one relative time ("Shared 2d ago" / "Alex edited 5h ago").
   - Edit history: hidden until there are 2+ versions.
   - Memories: hidden until agreed or one exists.
   - Drafts: one privacy line beside Share.
5. **App-wide.** Name plus Sign out move into an account menu. On phones the wordmark row is dropped, and the page title leads.
6. **Verify.** Tests first (delayed save + Undo, the conflict, the `/edit` redirect, Archive offered only on refusal, the removed elements gone), lint/build, and screenshots at 320, 390 and 1280 px.

## Task 7C: "Who Wrote What" (Line-Level Attribution) (2026-10-26)

Inspired by Apple Notes' collaboration view (Peter): attribution is hidden by default and revealed on demand.

- **Model (pure, client-side, test first).** `attributeLines(revisions)` replays the revision history (no schema change). Each line of the title and description is assigned to the editor and time of the revision that last changed it. The diff is line-based (LCS over lines). A line with only whitespace changes keeps its author.
- **View.** By default the idea reads as it does today. On phones, swiping the description left reveals a narrow margin with each block's author name and time. Each block gets a soft tint: the accent tint for the partner, neutral for me. A visible "Who wrote what" toggle does the same (for desktop, keyboards and screen readers). Consecutive lines by the same person are grouped, like Notes.
- **Accessibility.** When revealed, each block exposes "Written by Alex, Oct 24" as text, not only as colour. Reduced motion means no slide animation.
- The "Edit history" list stays as the way to see full past versions. The row line "Alex edited your wording" stays.
- **Verify** with unit tests for the attribution (insert, delete, reorder, whitespace-only, three-plus revisions), a component test for the toggle, and screenshots at 320 and 1280 px.

## Task 7D: Unseen-Activity Email Cadence (revised 2026-10-29)

**Design:** `docs/plans/2026-10-28-notification-cadence-design.md`
**Gate:** Approved October 29, 2026; commit this planning revision before implementation.
**Goal:** Let Realtime carry active conversations, then notify externally only about meaningful activity that is still unseen at delivery time.

This revises the earlier event-by-event email outline. The alpha does not need four externally visible email kinds or a preference matrix. It needs one expedited share delivery and one generic rolling digest, both content-free and both suppressed when the recipient has already viewed the affected idea.

### Fixed alpha policy

- `item_created` / `item_remixed`: dedicated share delivery, eligible after five minutes.
- `item_edited`, `comment_added`, `item_declined`, `item_became_eligible`: one rolling digest per recipient, eligible one hour after the first pending event.
- At claim time, suppress only candidates with an exact `(activity_event_id, recipient_member_id)` acknowledgement. `item_views.last_seen_at` remains an in-app unread hint, not the delivery-suppression authority. Send nothing when the batch becomes empty.
- Shares use “Something new is waiting in Ours.” Digests use “There are updates waiting in Ours.” Neither reveals kind, count, content, people, or private identifiers.
- Interest/favorite changes, intermediate decisions, draws, and memories do not email in Task 7D.
- Preferences, quiet hours, daily caps, time zones, Web Push, native push, and production delivery remain deferred.

### Task 7D.1: Make live viewing an acknowledgement

**Files:**
- Create: `src/features/palette/liveUpdateContext.ts`
- Modify: `src/features/palette/useLiveUpdates.ts`
- Modify: `src/features/palette/ItemDetailPage.tsx`
- Modify: `src/features/palette/InlineIdeaFields.tsx`
- Modify: `src/features/palette/LiveUpdates.test.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/features/palette/api.ts`
- Create: `supabase/migrations/20261029000000_live_seen_acknowledgements.sql`
- Create: `supabase/tests/database/010_live_seen_acknowledgements_test.sql`
- Modify: `docs/plans/2026-10-28-notification-cadence-design.md`
- Regenerate locally: `src/types/database.ts`

1. Write failing component tests proving that a content-free Realtime event for the currently open idea in a visible document successfully refetches first and then calls `mark_item_seen` again. Prove that an event for another idea, a hidden document, a failed protected refetch, or a dirty/held/saving/conflicted inline editor does not advance the current idea's view. Add a burst case where an open-idea event is followed inside 250 ms by another item's event; the open idea must still be acknowledged. Add a deferred-refetch case where A starts a refetch, B arrives before A resolves, resolving A acknowledges only A, and B is acknowledged only after the next refetch resolves.
2. Run the focused test and observe the current once-per-visit behavior fail.
3. Preserve the single content-free subscription and serialize refetch cycles. Accumulate every opaque `(event.id, event.item_id, event_type)` tuple in an id-keyed map. When the 250 ms timer fires, atomically swap that map into an immutable cycle snapshot and install a fresh accumulator before starting the protected refetch. Publish only that snapshot after its refetch succeeds. Events arriving during the refetch remain in the fresh accumulator for the next cycle. On failure, publish nothing and merge the snapshot back idempotently for retry. Prove content-like payload fields cannot influence acknowledgement.
4. Have `ItemDetailPage` consume the signal. `InlineIdeaFields` reports whether local state prevents the partner's update from being presented. When the signal matches the open idea, the editor is safe, and `document.visibilityState` is still `visible` immediately before the write, acknowledge exactly the matching event ids from that successfully refetched snapshot.
5. Make initial page-open acknowledgement use the same exact boundary: list the current item's content-free event ids first, successfully refetch the protected idea data second, then acknowledge only the captured ids if the document is still visible and the editor is still presentable. An event committed after capture is not acknowledged by the initial cycle; Realtime handles it as a later snapshot. Drafts with no activity retain the existing item-view write.
6. Add a forward migration with a private `activity_event_acknowledgements` table and browser-callable `mark_item_seen_through_events(item_id, event_ids[])` function. The function requires every unique supplied id to belong to the visible item and current couple, inserts exact event/member acknowledgements idempotently, and updates the existing item-view hint separately. Prove with pgTAP that acknowledging A never acknowledges B even when the events have equal timestamps or commit/arrive in another order. Pin tenant-coherent foreign keys, cascade behavior, RLS, no browser table grants, function grants, `SECURITY DEFINER`, and empty `search_path`, then regenerate types locally.
7. Keep the subscription/context mounted only inside the authenticated shell and close it on sign-out or identity change.
8. Run the focused component and pgTAP tests, then the full unit and database suites.

### Task 7D.2: Convert the outbox from event rows to delivery batches

**Files:**
- Create: `supabase/migrations/20261029000001_notification_batches.sql`
- Create: `supabase/tests/database/011_notification_batches_test.sql`
- Modify: `supabase/tests/database/008_notification_outbox_test.sql`
- Modify: `supabase/tests/database/009_notification_hardening_test.sql`
- Modify: `src/types/database.ts` only through local type regeneration

1. Write pgTAP failures for the forward-only schema:
   - `notification_kind` becomes exactly `idea_shared`, `activity_digest`.
   - `notification_outbox` remains the service-only delivery identity and gains `not_before`, `sealed_at`, `suppressed_at`, and batching-safe constraints.
   - Backfill the event relationship, then drop `notification_outbox.item_id` and its item-scoped uniqueness; a delivery no longer represents one item.
   - Add `notification_outbox_events(outbox_id, couple_id, activity_event_id, suppressed_at)` with identifier/timestamp-only composite foreign keys, uniqueness preventing one event from joining two deliveries, cascade behavior, RLS, no browser grants, and a pinned no-free-text column list.
   - Add the composite uniqueness needed for those foreign keys and a partial unique index allowing only one recipient digest whose `sealed_at is null`.
   - Backfill each existing share row only after proving it has exactly one matching `item_created` or `item_remixed` event. Fail the migration on zero or multiple matches; then drop the old item foreign key, index, column, and claim return field.
2. Run the database test and observe the missing schema fail.
3. Implement the minimum forward migration. Add tenant-coherent composite foreign keys from `(outbox_id, couple_id)` and `(activity_event_id, couple_id)`, plus global event uniqueness. Preserve the existing exact-two-member lock order and fail-closed actor validation from `20261028000000_notification_recipient_hardening.sql`.
4. Target exactly the actor's other locked partner, then map activity events:
   - share/remix creates a dedicated row with `not_before = created_at + interval '5 minutes'`;
   - edit/comment/decline/eligible locks the recipient's single unsealed digest row `FOR UPDATE`, rechecks `sealed_at`, and joins it; if claim sealed it first, create the next row with `not_before = first_event_at + interval '1 hour'`;
   - drafts and all other event types enqueue nothing.
5. Prove concurrent qualifying events create one open digest batch and unique event links without deadlock or duplicates. Add a true two-connection enqueue-vs-claim test: the event must either join before claim seals the snapshot or open batch B, never attach to sealed batch A. Also cover claim A → create B → fail/retry A without merging, reopening, or a uniqueness failure.
6. Rewrite 008/009 assertions through the event-link table while preserving their original column-whitelist, no-content, ACL, retry, delete, exact-recipient, and malformed-membership guarantees. Regenerate types locally and review the diff; never hand-edit generated semantics.

### Task 7D.3: Revalidate seen state when claiming

**Files:**
- Create (fix forward; 7D.2's migration was already committed): `supabase/migrations/20261029000002_claim_seen_revalidation.sql`
- Extend: `supabase/tests/database/011_notification_batches_test.sql`

1. Write failing pgTAP cases for a due share seen during its grace period, an unseen due share, an entirely seen digest, and a partially seen digest spanning multiple ideas.
2. Drop and recreate `claim_notifications` because its return shape changes. Lock due delivery rows with `FOR UPDATE SKIP LOCKED`, set `sealed_at` to freeze membership, timestamp linked events whose exact recipient acknowledgement exists, mark empty deliveries `suppressed_at`, and return only non-empty deliveries.
3. Return one service-only claim row per delivery with its stable outbox id, generic kind, and recipient Auth email. Never return event kind, item id, content, person name, or rendered copy to the worker.
4. Preserve stale-claim recovery, five-attempt limit, short error codes, service-role-only execution, empty `search_path`, and at-least-once semantics.
5. Prove a new event cannot join a claimed batch and instead opens the next digest window.

### Task 7D.4: Render and deliver generic batches

**Files:**
- Modify: `scripts/lib/notify.mjs`
- Modify: `scripts/lib/notify.test.mjs`
- Modify only if the claim shape requires it: `scripts/notify-worker.mjs`

1. Write failing unit tests for the exact `activity_digest` subject/body, two-argument pure renderer, stable batch Message-ID, content-bearing-row resistance, partial failures, and retry identity.
2. Add one generic digest template: “There are updates waiting in Ours.” plus the existing `/ideas` link. Keep the share template generic.
3. Keep one claimed delivery row equal to one send. Batching happens in Postgres; the worker never receives candidate details and does not aggregate content.
4. Keep local-only URL/SMTP refusal, the generic `ours.localhost` SMTP client name, count-only logs, and code-only errors.
5. Run focused worker tests, lint, and the full unit suite.

### Task 7D.5: Verify the real synthetic loop

**Files:**
- Update evidence only after successful verification: `docs/plans/2026-10-23-personal-alpha-mvp-implementation.md`
- Update learnings only for a reusable correction: `docs/learnings.md`

1. Clean-reset the real local Supabase stack and run every pgTAP file plus database lint and the read-only ACL audit.
2. Provision only the two synthetic local accounts. Run the local worker against Mailpit. Browser actions must create every candidate through user-facing flows; privileged local test SQL may backdate only synthetic `not_before` timestamps so verification does not wait five minutes or an hour. Add no production clock override or browser-accessible shortcut.
3. In two browser contexts, verify:
   - an open, visible idea receives a partner reply live and advances seen state;
   - viewing a share inside five minutes yields no email after it becomes due;
   - an unseen share yields exactly one generic email;
   - multiple edit/reply/decline/agreement events yield one digest;
   - viewing all affected ideas before claim yields no digest;
   - viewing only some still yields one generic digest for the unseen remainder.
4. Inspect raw messages and assert generic SMTP hostname, stable Message-ID, generic subject/body/link, intended synthetic recipient, and absence of titles, descriptions, replies, reasons, names, item ids, machine hostname, or credentials.
5. Run `npm run lint`, `npm test`, `npm run build`, repository-content checks that exist at this task's point in the roadmap, browser-secret checks that exist, and `git diff --check`.
6. Request independent specification and code-quality reviews. Resolve all high/medium findings, record evidence and the Session Log, then commit Task 7D. Do not configure hosted delivery or enter real/private content.

## Scope Boundaries

In scope:

- One pre-provisioned couple and two Supabase Auth users.
- Closed sign-in, couple-scoped RLS, and fixed partner attribution.
- Home feed, palette library, item create/edit/detail/remix, responses, comments, Roulette, memories, and archive.
- Synthetic local fixtures and a second synthetic couple used only to prove isolation.
- Operator documentation for provisioning, purge, logical backup, and restore.

Out of scope:

- Public signup, invitations, recovery, payments, production email-provider delivery, push/SMS notifications, AI, analytics, community, moderation, coaching, or public hosting.
- Real partner accounts, real personal content, production credentials, production exports, or remote schema changes without a later explicit execution decision.
- End-to-end encryption, offline mode, autosaved drafts, hard-delete UI, threads, reactions, tags, or aggregate scoring.

## Source and Documentation References

- Product context: `docs/HANDOFF.md`
- Product brief: `docs/HANDOFF.md`
- Detailed build contract: `docs/plans/2026-10-23-personal-alpha-mvp-design.md`
- Project lessons: `docs/learnings.md`
- Vite scaffold command: [Vite Getting Started](https://vite.dev/guide/).
- Supabase local workflow and migrations: [Supabase CLI getting started](https://supabase.com/docs/guides/local-development/cli/getting-started) and [local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows).
- RLS and database tests: [Row Level Security](https://supabase.com/features/row-level-security) and [Testing Your Database](https://supabase.com/docs/guides/database/testing).
- Closed signup: [Auth general configuration](https://supabase.com/docs/guides/auth/general-configuration).
- Logical recovery: [Backup and Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
- Managed-backup plan boundary: [Database backups](https://supabase.com/features/database-backups).

## Planned File Layout

```text
.
├── .env.example
├── .gitignore
├── eslint.config.js
├── index.html
├── package.json
├── playwright.config.ts
├── tsconfig.app.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── docs/
│   ├── alpha-operations.md
│   └── plans/
├── e2e/
│   ├── fixtures.ts
│   └── personal-alpha-loop.spec.ts
├── scripts/
│   ├── check-browser-secrets.mjs
│   └── check-repository-content.mjs
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── vite-env.d.ts
│   ├── app/
│   │   ├── AppProviders.tsx
│   │   ├── AppRouter.tsx
│   │   └── AppShell.tsx
│   ├── components/
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   └── LoadingState.tsx
│   ├── domain/
│   │   ├── constants.ts
│   │   ├── model.ts
│   │   └── model.test.ts
│   ├── features/
│   │   ├── activity/
│   │   ├── auth/
│   │   ├── memories/
│   │   ├── palette/
│   │   └── roulette/
│   ├── lib/
│   │   ├── errors.ts
│   │   ├── queryClient.ts
│   │   └── supabase.ts
│   ├── styles/
│   │   ├── global.css
│   │   └── tokens.css
│   ├── test/
│   │   ├── setup.ts
│   │   └── testUtils.tsx
│   └── types/database.ts
└── supabase/
    ├── config.toml
    ├── seed.sql
    ├── migrations/
    │   ├── <timestamp>_core_schema.sql
    │   ├── <timestamp>_activity_and_revisions.sql
    │   ├── <timestamp>_write_functions.sql
    │   ├── <timestamp>_roulette_functions.sql
    │   └── <timestamp>_rls_grants.sql
    └── tests/database/
        ├── 001_schema_test.sql
        ├── 002_rls_isolation_test.sql
        ├── 003_actor_and_response_test.sql
        ├── 004_roulette_test.sql
        └── 005_purge_test.sql
```

Do not create empty placeholder modules merely to match this tree. Create a file in the task that first uses it.

## Task 1: Scaffold the Application and Test Harness

**Files:**

- Create: `package.json`
- Create: `package-lock.json`
- Create: `eslint.config.js`
- Create: `index.html`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`
- Create: `src/styles/tokens.css`
- Create: `src/styles/global.css`
- Create: `src/test/setup.ts`
- Create: `src/domain/constants.ts`
- Create: `src/domain/constants.test.ts`
- Modify: `.gitignore`
- Create: `.env.example`

**Step 1: Create the isolated execution worktree**

After the approved planning commit exists on `main`, invoke `superpowers:using-git-worktrees`, verify the current branch is clean, and create the requested implementation branch/worktree from that commit.

Expected: implementation work is isolated on `codex/personal-alpha-mvp`; the controller checkout remains available for plan tracking.

**Step 2: Scaffold React/TypeScript without overwriting repository docs**

Run the Vite React TypeScript scaffold in a temporary directory, copy only the generated application files into the worktree, and remove template demo assets through a recoverable patch.

Install runtime dependencies:

```bash
npm install @supabase/supabase-js @tanstack/react-query react-router-dom
```

Install development dependencies:

```bash
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test supabase
```

Expected: `package-lock.json` pins the resolved dependency tree; Node 20 or newer is documented because the project-local Supabase CLI requires it.

**Step 3: Add deterministic scripts**

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:db": "supabase test db",
    "test:e2e": "playwright test",
    "check:repo": "node scripts/check-repository-content.mjs",
    "check:bundle": "node scripts/check-browser-secrets.mjs",
    "verify": "npm run lint && npm run test && npm run build && npm run check:repo && npm run check:bundle"
  }
}
```

Do not add remote deployment scripts.

**Step 4: Write a failing domain-copy test**

Create `src/domain/constants.test.ts` asserting:

```ts
import { describe, expect, it } from "vitest";
import { INTEREST_OPTIONS, ROULETTE_OPTIONS } from "./constants";

describe("first-loop copy", () => {
  it("keeps interest distinct from roulette readiness", () => {
    expect(INTEREST_OPTIONS.map((option) => option.value)).toEqual([
      "low",
      "curious",
      "into_it",
      "very_into_it",
    ]);
    expect(ROULETTE_OPTIONS.map((option) => option.value)).toEqual([
      "pending",
      "ready",
      "not_now",
    ]);
  });
});
```

**Step 5: Run the test and verify the expected failure**

Run:

```bash
npm test -- src/domain/constants.test.ts
```

Expected: FAIL because `INTEREST_OPTIONS` and `ROULETTE_OPTIONS` do not exist.

**Step 6: Add minimal domain constants and neutral shell**

Implement the exact enum values and labels from the design. Replace Vite demo content with a semantic `Ours` shell and a synthetic-only empty state. Define design tokens for warm neutral surfaces, readable contrast, focus rings, spacing, and responsive widths. Do not add images or sample personal copy.

**Step 7: Add environment placeholders**

Create `.env.example` with names only:

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Extend `.gitignore` for Playwright output, local Supabase temp state, ignored local test environments, and a `private-backups/` directory. Confirm the existing exception for `.env.example` remains.

**Step 8: Verify the scaffold**

Run:

```bash
npm run lint
npm test
npm run build
```

Expected: all pass; `dist/index.html` has title `Ours`; no template demo remains.

**Step 9: Commit**

```bash
git add package.json package-lock.json eslint.config.js index.html tsconfig.json tsconfig.app.json tsconfig.node.json vite.config.ts src .gitignore .env.example
git commit -m "chore: scaffold Ours personal alpha"
```

## Task 2: Initialize Supabase and Define the Core Schema

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/seed.sql`
- Create: `supabase/migrations/<timestamp>_core_schema.sql`
- Create: `supabase/migrations/<timestamp>_activity_and_revisions.sql`
- Create: `supabase/tests/database/001_schema_test.sql`
- Create: `supabase/tests/database/002_item_initialization_concurrency_test.sql`
- Create: `src/types/database.ts`

**Step 1: Initialize project-local Supabase**

Run:

```bash
npx supabase init
```

Expected: a commit-safe `supabase/config.toml` is created. Review generated settings; do not add remote credentials or project refs.

**Step 2: Write failing schema tests**

In `001_schema_test.sql`, assert that all nine tables exist, expected enum types exist, required columns and primary keys exist, unique constraints cover member auth identity and item/member response, and RLS is enabled on every application table.

Representative start:

```sql
begin;
select plan(20);
select has_table('public', 'couples');
select has_table('public', 'members');
select has_table('public', 'items');
select has_column('public', 'item_responses', 'roulette_decision');
select col_is_pk('public', 'items', 'id');
select * from finish();
rollback;
```

**Step 3: Run the database test and verify failure**

Start the local Supabase stack, then run:

```bash
npx supabase start
npx supabase test db
```

Expected: FAIL because the application schema is absent. If the local runtime cannot start, stop and report the exact prerequisite rather than designing around an unverified database.

**Step 4: Implement enum types and tables**

Create enums for interest, roulette decision, draw outcome, memory next-time, and activity event type. Create `couples`, `members`, `categories`, `items`, `item_revisions`, `item_responses`, `comments`, `roulette_draws`, `memories`, and `activity_events` exactly as specified in the design.

Use:

- UUID primary keys generated by Postgres.
- Bounded, trimmed text checks.
- `created_at` defaults and database-maintained `updated_at`.
- Composite unique keys such as `(id, couple_id)` and composite foreign keys wherever a reference must remain in-couple.
- Client request UUIDs plus per-actor unique constraints on categories, items, comments, Roulette outcomes, and memories so ambiguous retries return one durable result.
- Partial unique indexes for active category names.
- Indexes on each `couple_id`, foreign key, feed timestamp, library update timestamp, and response eligibility columns.

Do not grant browser access yet.

**Step 5: Implement revisions and response initialization**

Add trigger functions that:

- Derive the actor from the authenticated member.
- Insert revision 1 after item creation.
- Insert a new immutable revision after meaningful item changes.
- Initialize exactly two pending response rows and fail the item write unless the couple has exactly two members.
- Reject direct revision mutation.

The response-initialization and revision trigger functions run as narrowly scoped `SECURITY DEFINER` functions, set an explicit empty or known-safe `search_path`, schema-qualify every object, and are not executable by browser roles.

**Step 6: Add obviously synthetic seed data**

`supabase/seed.sql` creates fixed, obviously synthetic placeholder rows in `auth.users`, then one synthetic couple and exactly two matching members. It does not create application content. The placeholder users need not be able to sign in; database tests set synthetic JWT claims and create transactional content through the same write functions used by the app. Login-capable synthetic users are created later by the ignored local end-to-end fixture. The seed must not contain production users, real addresses, real names, personal text, or any secret.

**Step 7: Reset and test from zero**

Run:

```bash
npx supabase db reset
npx supabase test db
npx supabase gen types typescript --local > src/types/database.ts
npm run build
```

Expected: reset succeeds from an empty database; schema tests pass; generated types compile.

**Step 8: Commit**

```bash
git add supabase src/types/database.ts
git commit -m "feat: define the personal alpha data model"
```

## Task 3: Add Authorization, Grants, and Database Security Tests

**Files:**

- Create: `supabase/migrations/<timestamp>_rls_grants.sql`
- Create: `supabase/migrations/<timestamp>_write_functions.sql`
- Create: `supabase/tests/database/002_rls_isolation_test.sql`
- Create: `supabase/tests/database/003_actor_and_response_test.sql`
- Modify: `supabase/tests/database/001_schema_test.sql`

**Step 1: Write failing anonymous and cross-couple tests**

Create synthetic Couple A, Couple B, two members per couple, and JWT claims for an anonymous request and authenticated members. Assert:

- Anonymous requests return no application data, whether by empty result or explicit denial, and all writes fail.
- Couple A cannot read, update, insert, or reference Couple B rows.
- A guessed UUID does not bypass policies.
- A signed-in auth user without exactly one member mapping receives no application data.

Run:

```bash
npx supabase test db
```

Expected: FAIL because policies and grants are incomplete.

**Step 2: Add reusable current-member predicates**

Implement:

```sql
public.current_member_id() returns uuid
public.get_current_member() returns public.members
public.is_current_couple(target_couple_id uuid) returns boolean
```

The functions derive identity from `(select auth.uid())`. `get_current_member()` filters by `members.auth_user_id`, not by same-couple visibility, and returns only the caller's row. Any security-definer helper sets a fixed `search_path`, schema-qualifies every object, and is not executable by `anon`.

**Step 3: Add least-privilege grants and RLS policies**

- Revoke broad defaults from `PUBLIC`, `anon`, and `authenticated` before adding explicit grants.
- Grant no application-table privileges to `anon`.
- Grant authenticated users only RLS-protected reads on application tables.
- Grant no direct application-table insert, update, or delete privilege to browser roles.
- Implement narrow `SECURITY DEFINER` writes: `create_category`, `create_item`, `update_item`, `archive_item`, `set_item_interest`, `set_item_favorite`, `set_roulette_decision`, `add_comment`, and `add_memory`. Create-style functions accept a client-generated `request_id`; after resolving the actor, each returns an existing authorized actor/request row before validating current mutable state, and only a new request validates references and inserts.
- Every write function derives caller member/couple, accepts no actor/couple parameter, validates all referenced rows, updates only named mutable fields, and uses a fixed `search_path` with schema-qualified objects.
- `update_item` and `archive_item` require the immutable creator. Response setters require the immutable response owner.
- Revoke function execution from `PUBLIC` and `anon`; grant `authenticated` only the user-facing functions. Trigger-only functions remain non-executable by browser roles.
- Restrict draw writes to the later database function rather than table insert.

Apply both `USING` and `WITH CHECK` clauses where relevant.

**Step 4: Write failing actor-forgery tests**

Assert that Partner A cannot:

- Create content attributed to Partner B or supply any actor/couple identifier.
- Update Partner B's response row or mutate an existing response's `member_id`, `item_id`, or `couple_id`.
- Change an item's `creator_member_id`, `couple_id`, lineage, or creation timestamp.
- Edit or archive an item created by Partner B.
- Create a remix, category reference, memory, or draw that crosses couples.
- Create an item whose `source_memory_id` belongs to a different item than its supplied `source_item_id`, even within the same couple.
- Create duplicates by retrying the same create/comment/memory/draw request id.
- Change `updated_at`, create an activity event, or create a revision when a response setter or `update_item` repeats values already stored; tests use null-safe distinct comparisons, including nullable interest values.
- Directly insert an activity event or item revision.
- Execute trigger-only functions or any write function as `PUBLIC`/`anon`.

Expected before policy completion: at least one assertion fails.

**Step 5: Complete policies and verify**

Run:

```bash
npx supabase db reset
npx supabase test db
```

Expected: every schema, isolation, and actor-attribution test passes.

**Step 6: Commit**

```bash
git add supabase/migrations supabase/tests/database
git commit -m "feat: enforce couple isolation with RLS"
```

## Task 4: Add Authentication and the Authenticated Application Shell

**Files:**

- Create: `src/lib/supabase.ts`
- Create: `src/lib/queryClient.ts`
- Create: `src/lib/errors.ts`
- Create: `src/app/AppProviders.tsx`
- Create: `src/app/AppRouter.tsx`
- Create: `src/app/AppShell.tsx`
- Create: `src/features/auth/AuthProvider.tsx`
- Create: `src/features/auth/AuthProvider.test.tsx`
- Create: `src/features/auth/AlphaSignIn.tsx`
- Create: `src/features/auth/AlphaSignIn.test.tsx`
- Create: `src/features/auth/SignOutButton.tsx`
- Create: `src/features/auth/useCurrentMember.ts`
- Create: `src/components/LoadingState.tsx`
- Create: `src/components/ErrorState.tsx`
- Modify: `src/App.tsx`
- Modify: `src/main.tsx`

**Step 1: Write failing sign-in behavior tests**

Test that:

- The form contains email and password fields but no signup or recovery control.
- Submission calls `signInWithPassword` once.
- Invalid credentials show a neutral message without echoing the email/password.
- Authenticated users with no member mapping see a closed setup error and no app content.
- A normal two-member couple resolves only the caller's member row.
- Signing out clears the query cache and rendered private state before the sign-in screen appears.
- Signing in as Partner B after Partner A signs out cannot reveal Partner A's cached data through browser back or refresh.

Run:

```bash
npm test -- src/features/auth/AlphaSignIn.test.tsx
```

Expected: FAIL because auth components do not exist.

**Step 2: Implement configuration validation and Supabase client**

Read only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Throw a content-free configuration error when either is absent. Do not log environment values. Use Supabase's normal persistent browser session for alpha convenience; never store passwords or content in browser persistence.

**Step 3: Implement the auth boundary**

`AuthProvider` listens for Supabase session changes. `useCurrentMember` calls `get_current_member()` and validates that the returned row's `auth_user_id` matches the authenticated user. Missing mapping fails closed. A visible Sign out action clears the Supabase session, TanStack Query cache, router state, in-memory drafts, and private component tree before another identity can sign in. App routes render only after both session and member mapping are valid.

**Step 4: Implement the responsive shell and routes**

Define routes for:

```text
/
/palette
/palette/new
/palette/:itemId
/palette/:itemId/edit
/roulette
```

Use a bottom navigation on narrow screens and compact header navigation on larger screens. Labels are Home, Palette, and Roulette. Keep page title `Ours` across routes.

**Step 5: Verify**

Run:

```bash
npm test -- src/features/auth
npm run build
```

Expected: auth tests pass; unauthenticated and invalid-member states cannot render private routes.

**Step 6: Commit**

```bash
git add src
git commit -m "feat: add closed alpha authentication"
```

## Task 5: Implement Categories, Item Creation, and the Library

**Files:**

- Create: `src/domain/model.ts`
- Create: `src/domain/model.test.ts`
- Create: `src/features/palette/api.ts`
- Create: `src/features/palette/keys.ts`
- Create: `src/features/palette/ItemEditor.tsx`
- Create: `src/features/palette/ItemEditor.test.tsx`
- Create: `src/features/palette/LibraryPage.tsx`
- Create: `src/features/palette/LibraryPage.test.tsx`
- Create: `src/features/palette/ItemCard.tsx`
- Create: `src/components/EmptyState.tsx`
- Modify: `src/app/AppRouter.tsx`

**Step 1: Write failing domain-state tests**

Test pure functions that derive an item's roulette state:

```ts
expect(deriveRouletteState(["pending", "pending"])).toBe("pending");
expect(deriveRouletteState(["ready", "ready"])).toBe("ready");
expect(deriveRouletteState(["ready", "not_now"])).toBe("not_now");
```

Also test stable filter serialization using category/member UUIDs and enum values only.

**Step 2: Implement typed palette queries and mutations**

Create explicit API functions that call the narrow database write functions for:

- List/create active categories.
- Create/update/archive an item.
- Fetch filtered active items with their category, creator, and two partner responses.

The caller never supplies actor or couple IDs for mutation attribution. No browser code directly inserts or updates an application table. Convert Supabase failures into operation-level errors without content.

**Step 3: Write failing item-editor tests**

Test:

- Title, description, and one category are required.
- Inline category creation updates the selectable category list.
- Successful save invalidates palette/activity queries and navigates to detail.
- Failed save retains form input and shows a retryable unsaved state.
- Retrying an ambiguous save reuses the original request UUID and resolves to one item.
- Unsaved navigation requires confirmation.

**Step 4: Implement the item editor**

Use controlled form state only. Generate one request UUID when a create form is initialized and retain it across retries until a confirmed save or deliberate reset. Enforce the same length bounds as the database. Do not put title or description into URLs, logs, query keys, analytics, or local storage.

**Step 5: Write failing library tests**

Test each approved filter independently and in combination, newest/recently-updated sorting, empty results, archived-item exclusion, and that clearing one filter does not clear others.

**Step 6: Implement library and item cards**

Cards show title, category, creator, updated date, and partner state indicators; they do not show full descriptions. Filter query parameters may include only non-sensitive ids/enums.

**Step 7: Verify**

Run:

```bash
npm test -- src/domain src/features/palette
npm run build
```

Expected: all tests pass; create/library routes compile and are keyboard operable.

**Step 8: Commit**

```bash
git add src
git commit -m "feat: add palette creation and browsing"
```

## Task 6: Implement Item Detail, Responses, Comments, History, and Remix

**Files:**

- Create: `src/features/palette/ItemDetailPage.tsx`
- Create: `src/features/palette/ItemDetailPage.test.tsx`
- Create: `src/features/palette/ResponseControls.tsx`
- Create: `src/features/palette/ResponseControls.test.tsx`
- Create: `src/features/palette/CommentThread.tsx`
- Create: `src/features/palette/RevisionHistory.tsx`
- Create: `src/features/palette/RemixButton.tsx`
- Modify: `src/features/palette/api.ts`
- Modify: `src/features/palette/ItemEditor.tsx`
- Modify: `src/app/AppRouter.tsx`

**Step 1: Write failing response-control tests**

Test that:

- Only the signed-in member's interest, favorite, and roulette controls are enabled.
- Updating interest does not send a roulette field.
- Updating favorite does not send a roulette field.
- Updating roulette does not send interest/favorite fields.
- The UI always displays “Interest is not permission.”
- Pending, Ready for Roulette, and Not now remain visibly distinct.

**Step 2: Implement independent response mutations**

Call the separate `set_item_interest`, `set_item_favorite`, and `set_roulette_decision` functions so one signal cannot overwrite another. Invalidate item, palette, eligible-pool, and activity queries after confirmed writes. Show saving/error state next to the control that changed. Do not use optimistic success for consent-adjacent controls.

**Step 3: Write failing detail/history/comment tests**

Test:

- Both partner states display separately.
- Comments render chronologically and a failed comment remains in the composer.
- Retrying an ambiguous comment submission reuses its request UUID and produces one comment/event.
- Revision history is collapsed initially and shows editor/date before content.
- Edit and Archive are available only to the immutable creator; archive requires confirmation and removes the item from active views.
- The non-creator can comment or remix but cannot rewrite or archive the original.
- Missing/unauthorized item ids render a neutral not-found state.

**Step 4: Implement item detail**

Fetch current item, responses, comments, revisions, memories, and lineage with authorized queries. Avoid one unbounded “select everything” payload; select required fields explicitly.

**Step 5: Implement remix behavior**

`RemixButton` routes to the editor with source IDs in router state, not content-bearing query parameters. The editor fetches authorized source data, pre-fills local form state, and creates a distinct pending item only after explicit save.

**Step 6: Verify**

Run:

```bash
npm test -- src/features/palette
npm run build
```

Expected: all detail behaviors pass; no mutation can overwrite another member's response.

**Step 7: Commit**

```bash
git add src/features/palette src/app/AppRouter.tsx
git commit -m "feat: add partner responses and item detail"
```

## Task 7: Implement the Activity Feed and Home Attention States

**Files:**

- Modify: `supabase/migrations/<timestamp>_activity_and_revisions.sql`
- Create: `supabase/tests/database/006_activity_test.sql`
- Create: `src/features/activity/api.ts`
- Create: `src/features/activity/ActivityFeed.tsx`
- Create: `src/features/activity/ActivityFeed.test.tsx`
- Create: `src/features/activity/HomePage.tsx`
- Create: `src/features/activity/HomePage.test.tsx`
- Modify: `src/app/AppRouter.tsx`

**Step 1: Write failing activity-trigger tests**

Assert that each persisted approved mutation appends exactly one event with correct actor, type, timestamp, and typed reference. Assert that:

- Event metadata contains no title, description, comment body, memory body, response value, email, or credential.
- Spin-again has no event.
- Direct client event mutation fails.

**Step 2: Implement trigger-created activity**

Generate events for item create/edit/remix, response-field change, roulette-decision change, transition into eligible, comment, finalized draw, and memory. When the second Ready decision creates eligibility, emit `item_became_eligible` instead of `roulette_decision_changed`, so the one mutation still creates one event. Do not create duplicate “became eligible” events when already eligible.

**Step 3: Write failing home tests**

Test reverse chronology, actor/date labels, item links, content-free summaries, empty home, **Needs your response**, and **Ready for Roulette**. Use only synthetic fixtures.

**Step 4: Implement feed and derived attention queries**

Resolve current item titles through authorized joins at read time. If a source record is archived or unavailable, use a neutral label rather than stale event content.

**Step 5: Verify**

Run:

```bash
npx supabase db reset
npx supabase test db
npm test -- src/features/activity
npm run build
```

Expected: database and UI tests pass; feed storage is metadata-only.

**Step 6: Commit**

```bash
git add supabase src/features/activity src/app/AppRouter.tsx
git commit -m "feat: add shared activity home"
```

## Task 8: Implement Safe Roulette Selection and Outcomes

**Files:**

- Create: `supabase/migrations/20261029000004_roulette_functions.sql`
- Create: `supabase/tests/database/012_roulette_test.sql` (`004` already belongs to actor/response coverage)
- Create: `src/features/roulette/api.ts`
- Create: `src/features/roulette/RoulettePage.tsx`
- Create: `src/features/roulette/RoulettePage.test.tsx`
- Modify: `src/features/palette/PlanPage.tsx`
- Regenerate: `src/types/database.ts`

**Step 1: Write failing database behavior tests**

Assert:

- Zero/one Ready decision is not eligible.
- Eligibility requires exactly two response rows, exactly two Ready decisions, and exactly two provisioned members.
- Not now or archive immediately removes eligibility.
- Category filtering cannot return an item from another category.
- An empty filtered pool returns no candidate and does not widen.
- Anonymous/cross-couple calls return nothing or fail.
- `record_roulette_outcome` accepts only `accepted` or `deferred`.
- Repeating `record_roulette_outcome` with the same actor/request UUID returns one draw.
- Revocation between draw and record blocks the insert.
- Actor is derived from `auth.uid()`.
- No spin-again row or negative score exists.

Run:

```bash
npx supabase test db
```

Expected: FAIL because Roulette functions do not exist.

**Step 2: Implement secure database functions**

`draw_roulette(filter_category_id uuid default null)` returns one random active eligible item for the caller's couple and authorized category. It persists nothing.

`record_roulette_outcome(request_id uuid, item_id uuid, filter_category_id uuid, outcome draw_outcome)`:

1. Resolves caller member/couple.
2. Returns the existing draw immediately when the caller/request pair already exists, even if eligibility changed after the original commit.
3. For a new request, rechecks the item is active, the couple has exactly two members, and exactly two response rows are Ready.
4. Rechecks optional category membership.
5. Inserts one accepted/deferred draw attributed to the caller.
6. Returns the inserted row.

Explicitly revoke execute from `PUBLIC` and `anon`, grant only to `authenticated`, and assert privileges in pgTAP. Trigger-only helpers remain non-client-callable.

**Step 3: Write failing Roulette UI tests**

Test all/category modes, empty state, result rendering, and each action. Specifically assert:

- Spin again calls draw but never record.
- Accept/defer disable while saving and call record once.
- A stale-candidate failure clears the result and explains that availability changed.
- The result includes “Accept saves this selection. Either of you can still change course.”

**Step 4: Implement Roulette UI**

Keep candidate state in memory only. Do not put item content in URLs or storage. Use motion only when reduced-motion is not requested, and never let animation delay or obscure the decision controls.

**Step 5: Regenerate types and verify**

Run:

```bash
npx supabase db reset
npx supabase test db
npx supabase gen types typescript --local > src/types/database.ts
npm test -- src/features/roulette
npm run build
```

Expected: all tests pass; spin-again leaves no persistent evidence.

**Step 6: Commit**

```bash
git add supabase src/features/roulette src/types/database.ts src/app/AppRouter.tsx
git commit -m "feat: add mutually activated Roulette"
```

## Task 9: Implement Memories and Expansion

**Files:**

- Create: `src/features/memories/api.ts`
- Create: `src/features/memories/MemoryComposer.tsx`
- Create: `src/features/memories/MemoryComposer.test.tsx`
- Create: `src/features/memories/MemoryList.tsx`
- Create: `src/features/memories/MemoryList.test.tsx`
- Modify: `src/features/palette/ItemDetailPage.tsx`
- Modify: `src/features/palette/ItemEditor.tsx`
- Modify: `src/features/roulette/RoulettePage.tsx`

**Step 1: Write failing memory tests**

Test:

- Body is required; highlight, next-time, and refinement are optional.
- A draw-linked memory accepts only an accepted draw for the same item.
- Failed saves preserve draft fields in component memory.
- Retrying an ambiguous memory save reuses its request UUID and produces one memory/event.
- Saved memory invalidates detail and activity queries.
- **Create a related item** preserves `source_item_id` and `source_memory_id` without saving until the user submits the editor.

**Step 2: Add database invariant tests if missing**

Add assertions to the database suite for cross-couple memory rejection, mismatched draw/item rejection, and accepted-outcome requirement. Run them before implementation and observe failure.

**Step 3: Implement memory API and composer**

Use exact design labels and bounded fields. Derive author/couple server-side. Do not log bodies or include them in activity metadata.

**Step 4: Integrate with item detail and Roulette**

- Item detail always offers **Add a memory**.
- Accepted Roulette results offer **Add a memory** with draw linkage.
- Deferred outcomes return to Roulette start without implying completion.
- Memory list shows author/date and the stored fields only to authorized partners.

**Step 5: Verify**

Run:

```bash
npx supabase test db
npm test -- src/features/memories src/features/palette src/features/roulette
npm run build
```

Expected: full memory/remix behavior passes and feed events contain metadata only.

**Step 6: Commit**

```bash
git add supabase/tests src/features/memories src/features/palette src/features/roulette
git commit -m "feat: add memories and palette expansion"
```

## Task 10: Verify the Complete Synthetic Responsive Loop

**Files:**

- Create: `playwright.config.ts`
- Create: `e2e/fixtures.ts`
- Create: `e2e/personal-alpha-loop.spec.ts`
- Modify: `docs/plans/2026-10-23-personal-alpha-mvp-implementation.md`

**Step 1: Add local-only synthetic auth fixtures**

Use the local Supabase Auth admin endpoint and the local service key supplied through ignored test environment to provision two login-capable synthetic users for Couple A and one user for Couple B. Never hard-code or print the key. Fixture setup creates exactly two members for each test couple; teardown removes only synthetic ids it created.

**Step 2: Write the failing end-to-end loop**

Cover:

1. Partner A signs in.
2. Partner A creates a category and `Synthetic Item A`.
3. Partner A changes interest/favorite; eligibility remains pending.
4. Partner A chooses Ready; eligibility remains pending.
5. Partner B signs in in a separate browser context, sees the activity, responds, and chooses Ready.
6. The item becomes eligible.
7. Spin again does not add history.
8. Accept records one draw.
9. Partner A adds `Synthetic Memory A`.
10. Partner A creates and saves a related item with lineage.
11. Partner A signs out; the private tree and query cache clear before Partner B signs in in that browser context.
12. Browser back and refresh do not reveal Partner A's cached screen after the identity change.
13. Couple B cannot reach Couple A item detail by guessed route id.
14. An automated Mailpit regression inspects the raw message and asserts the generic SMTP greeting, deterministic Message-ID, generic subject/body/link, intended synthetic recipient, and absence of idea or person content from headers and body.

Expected initial result: FAIL at the first incomplete integration point.

**Step 3: Repair only integration defects exposed by the test**

Use `superpowers:systematic-debugging` for any failure not explained by the test being newly added. Keep fixes inside existing feature boundaries; do not add deferred product behavior.

**Step 4: Run focused visual and accessibility checks**

At minimum verify narrow mobile and desktop widths for sign-in, home, library, item detail, Roulette result, and memory composer. Check:

- Keyboard-only completion of the loop.
- Visible focus.
- Form labels and error association.
- Color contrast.
- Reduced-motion Roulette behavior.
- No horizontal overflow at 320 CSS pixels.
- No real/private content or secrets in screenshot filenames, traces, videos, or stored screenshots; use obvious synthetic data only.

Save only synthetic evidence under an ignored Playwright output directory unless the user explicitly asks to retain review artifacts.

**Step 5: Run the core-loop verification matrix**

Run:

```bash
npm run lint
npm test
npx supabase db reset
npx supabase test db
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected:

- All commands pass.
- No production identifier, real content, credential, local environment, or backup is tracked.
- Git status contains only intentional source/document changes before the final commit.

**Step 6: Compare behavior to `main`**

From the implementation worktree, record that the planning commit contains documentation only and the implementation branch adds the verified first usable loop. Review against the planning commit or recorded base SHA:

```bash
git diff --stat <planning-base-sha>...HEAD
git diff --check <planning-base-sha>...HEAD
git log --oneline <planning-base-sha>..HEAD
```

Confirm every changed file belongs to the approved scope.

**Step 7: Record the synthetic-loop checkpoint**

Record:

- Final command results and dates in **Verification Evidence**.
- Any plan deviations and their reasons in **Decision Log**.
- Any discovered constraints in **Surprises and Discoveries**.
- That the synthetic first loop works while the separate real-content readiness milestone remains blocked.

**Step 8: Commit the core-loop verification artifacts**

```bash
git add playwright.config.ts e2e docs/plans/2026-10-23-personal-alpha-mvp-implementation.md
git commit -m "test: verify the synthetic personal alpha loop"
```

## Task 11: Add Privacy Operations and Evaluate Real-Content Readiness

> **Pending after the gate (Peter, 2026-10-26):** Peter has a list of real ideas to bring in. **Hold all real content until this task's readiness gate passes.** Then build a local-only importer:
> - It reads a file kept outside the repo and is never committed. Agents never see the content.
> - It signs in as the author and creates ideas through `create_item`, so they land as **drafts**.
> - It is idempotent through `request_id`, so it can be re-run safely.
>
> Mapping to confirm with Peter:
> - An entry with sub-options becomes one idea per option.
> - A discussion entry becomes its opening as the description and the replies as chat messages, attributed to whoever wrote them.
> - A title-only entry uses its title as the description.
> - Everything goes into a single "Imported" category, re-sorted later.

This is a separate pre-real-content milestone. The synthetic first usable loop can be demonstrated after Task 10, but no real/private material may be entered until this task's applicable local gates and a later explicitly authorized hosted verification pass.

**Files:**

- Create: `scripts/check-repository-content.mjs`
- Create: `scripts/check-browser-secrets.mjs`
- Create: `docs/alpha-operations.md`
- Create: `supabase/tests/database/005_purge_test.sql`
- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `docs/plans/2026-10-23-personal-alpha-mvp-implementation.md`
- Modify: `docs/learnings.md` only if implementation uncovers a reusable lesson or follows a user correction

**Step 1: Write the repository-content checker test cases**

The checker must fail on tracked `.env.local`, common service-role/database-password assignment names, Supabase secret-key prefixes, and non-synthetic SQL fixture markers. It must skip `.git`, dependencies, build output, and ignored backup/test artifacts. Never print a matched secret value; print only file and rule name.

Run it against a temporary safe fixture and a temporary forbidden fixture under the test temporary directory. Expected: safe passes; forbidden fails without echoing its value.

**Step 2: Implement browser-bundle secret checking**

After `npm run build`, inspect `dist` for known forbidden administrative variable names and compare against any locally supplied service-role/database password values without printing them. Publishable keys are permitted; administrative keys are not.

**Step 3: Write a failing live application-data purge test**

Create two synthetic couples with complete graphs of categories, items, revisions, responses, comments, draws, memories, and events. Execute the operator purge procedure for Couple A and assert all Couple A application rows are gone while Couple B remains intact.

Name this accurately: it proves deletion from live application tables, not immediate erasure from backups or Auth. Do not add a browser purge function; the alpha procedure is operator-only.

**Step 4: Document closed provisioning**

`docs/alpha-operations.md` must document, without real values:

1. Create two Auth users through the Supabase dashboard.
2. Disable new-user signup and anonymous sign-in.
3. Insert one couple and exactly two member mappings using placeholders in a single transaction.
4. Confirm `get_current_member()` resolves the correct row for each account and item creation produces exactly two response rows.
5. Run hosted RLS/isolation checks before real use.

Explicitly warn never to commit substituted SQL, Auth identifiers, or credentials.

**Step 5: Document purge, Auth removal, and backup residue**

Provide a transaction-scoped live-data purge template using a placeholder couple UUID and a preflight count. Require a synthetic dry run and postflight zero-row verification. Then document a separate operator step to disable/remove the associated Auth users after safely capturing their ids. Distinguish immediate live deletion from eventual deletion of backup copies and require the actual retention/expiry window to be recorded before real use.

**Step 6: Document logical backup and restore for Free plan**

Use the official Supabase CLI logical dump/restore flow. The runbook must require:

- Connection string/password from local environment only.
- Synthetic development dumps may use ignored `private-backups/` temporarily.
- Any real-data dump must go directly to encrypted storage outside the repository and worktree, with restrictive permissions and a stated retention/deletion rule.
- No backup paths, secrets, or real data in screenshots, CI artifacts, or source control.
- A synthetic restore into a disposable project/local database.
- Verification of application rows plus either recovered Auth identities or a documented, tested reprovisioning/remapping procedure.
- A recorded last-tested date, without committing the dump.

Do not claim automatic daily backup on the Free plan. Upgrading to a plan with managed backups remains an alternative future operational decision.

**Step 7: Verify local privacy gates**

Run:

```bash
npm run check:repo
npm run build
npm run check:bundle
npx supabase test db
git status --ignored --short
```

Expected: checks pass; ignored local env/test/synthetic-backup locations are visible as ignored when present; no dump or local environment is tracked.

**Step 8: Record the remaining hosted gate**

Do not link or mutate the hosted project without a separate explicit checkpoint. Until closed-signup settings, hosted RLS behavior, live provisioning, and the chosen recovery path are verified with synthetic records on the hosted project, mark **real-content readiness: blocked** in Outcomes.

**Step 9: Request code review**

Invoke `superpowers:requesting-code-review`. Resolve substantive findings with tests, rerun the complete matrix, and then invoke `superpowers:verification-before-completion` before any completion claim.

**Step 10: Commit privacy operations and final local evidence**

```bash
git add scripts docs/alpha-operations.md supabase/tests/database/005_purge_test.sql .gitignore package.json docs/plans/2026-10-23-personal-alpha-mvp-implementation.md docs/learnings.md
git commit -m "docs: add alpha privacy operations"
```

Commit `docs/learnings.md` only when it actually changed.

## Verification Evidence

- **2026-10-29 — Task 8 safe Roulette (Codex):** RED: the new database suite failed because `draw_roulette` did not exist; the Plan interaction tests failed against the disabled placeholder; later regressions exposed opposite-outcome retry after an ambiguous save, loss of accepted state after a replacement-spin failure, and focus loss when saved actions disappeared. GREEN: migration `20261029000004_roulette_functions.sql` adds server-only random selection and idempotent accepted/deferred recording with item-first locking, exact two-member/two-ready-response validation, category revalidation, a stable content-free `OU410` stale-candidate error, one draw event, and authenticated-only execution. Roulette now lives inside Plan with an in-memory category/candidate/request lifecycle; Spin again persists nothing, generic failures retain the stable request id and chosen outcome, a failed replacement spin preserves the saved draw, successful outcomes transfer focus to the next available Spin action, stale candidates clear, defer returns to start, and accepted draws remain available for Task 9. The real local Supabase stack passed **998 assertions across 12 files** (focused Roulette **42/42**, including zero/missing/excess cardinality, one/three-member fail-closed behavior, Not now/archive, tenant/category isolation, complete function ACLs, and a dblink item-lock race; the suite also pre-cleans and end-cleans its fixed race fixtures); focused UI passed **12/12** (category selection, clearing, in-flight controls, outcome focus, and reduced-motion behavior included); `npm run lint`, full `npm test` (**204/204 across 16 files**), `npm run build` (**160 modules**), and `git diff --check` passed. Generated types include both RPCs. No real/private content, credentials, remote data, or hosted changes were introduced.
- **2026-10-30 — Task 8 independent re-reviews and fixes (Claude, Docker-free harness):** An independent specification review and an independent code-quality/security review of `a56658b..7e10026`. **High (fixed):** `record_roulette_outcome` locked the idea, couple and members FOR UPDATE, which conflicts with the KEY SHARE locks every insert's foreign-key check holds. A recording waiting on the couple while holding the idea deadlocked with a partner's reply on that idea; the reviewer reproduced this with three sessions, the same pattern as Task 7D. **Medium (fixed):** (1) `useIdeaInbox` reported an error whenever any query had `isError`, including a failed background refetch that kept its data, and Plan swapped the page out, unmounting Spin and losing an unsaved choice and its request id (a remount and re-Accept could record twice); Spin also unmounted when the last agreed idea stopped being agreed, losing "Saved for plan"; (2) "exactly two members" was never exercised (both extra-member cases also changed the response count); (3) a stale candidate dropped keyboard focus; (4) the fake client returned an empty pool for an archived or foreign category where SQL raised, hiding a permanent generic "Spin couldn't load" in the real app. **Fixes, test-first:** `20261030000000_roulette_review_fixes.sql` locks FOR NO KEY UPDATE (as the 7D enqueue does) and gives the category refusal its own code `OU411`; the inbox reports an error only for a query with no data; `RoulettePanel` stays mounted in one place on Plan whatever the agreed count; a stale result focuses Spin; an `OU411` clears the selection and refreshes categories. Low fixes: a ref guard against double clicks; an always-mounted status region; empty-pool copy that explains both must be in and links to Ideas; `afterEach` unstubs `matchMedia`; the fake mirrors the SQL category checks and can fail table reads; 012 adds the decline/edit-reset/archive function paths, an outcome-enum pin and invalid-value check, a no-score column pin, multi-category, unfiltered cross-couple and no-email checks, a live `pg_blocking_pids` wait instead of `pg_sleep`, and the three-session deadlock regression. A new spin helper replaced a lateral-join pattern that called `draw_roulette` once rather than n times. Without the fixes, exactly the four new concurrency/code checks fail in 012 and five new UI tests fail; with them, `scripts/pg-harness/run.sh .` passes **1,022 across 12 files** (012 66) and `npm test` **210/210**; lint, build and `playwright test --list` passed. Not changed: `draw_roulette` still returns the full item row, all of it readable under RLS (reviewer low, accepted). **Real stack (2026-10-30 11:23 PT, Peter's Mac):** `npx supabase test db` reported `Files=12, Tests=1022, Result: PASS`, matching the harness; Peter then pushed Task 8 (`a56658b..a7d5423`).

To be filled during execution with command, date, and observed result. Required evidence:

- **2026-10-24 — Task 1 scaffold:** `npm run lint`, `npm test`, and `npm run build` passed on Node 24.6.0. Two test files and two tests passed; the production build transformed 17 modules; `dist/index.html` uses the title `Ours`; the worktree was clean after independent specification and code-quality reviews.

- **2026-10-25 — Task 2 schema:** A clean `npx supabase db reset` succeeded, and `npx supabase test db` passed 309 assertions across two files. The membership race was verified RED against the original trigger at 287/288; the lock-order contract was RED while the required foreign keys were immediate and again when category/lineage keys were deferred too broadly; the final suite was GREEN at 309/309. The final design serializes membership through the couple row, captures the two locked member rows once, and defers only the item couple and creator checks until initialization acquires its locks. A genuine two-writer test verifies that a concurrent item creation waits and then completes without deadlock. `npx supabase db lint --local --level warning` reported no schema errors. Regenerated TypeScript database types had no semantic drift (`diff -w` clean). `npm run lint`, `npm test` (2 files, 2 tests), and `npm run build` passed. A read-only ACL audit found no `anon` or `authenticated` table grants, RLS enabled on all 10 application tables, and no browser execution privilege on the four trigger-only `SECURITY DEFINER` functions; each function retains an empty `search_path`.

- **2026-10-25 — Task 3 security (Codex implementation, `93427ed`; Claude re-verification):** Commit adds `20261025000002_rls_grants.sql` (current-member predicates, revoke-then-grant, select-only RLS policies) and `20261025000003_write_functions.sql` (the nine user-facing `SECURITY DEFINER` writes plus activity triggers), with tests `003_rls_isolation_test.sql`, `004_actor_and_response_test.sql`, and `005_security_concurrency_test.sql`. Test files are numbered 003–005 rather than the planned 002–003 because `002` was already taken by the Task 2 concurrency test. Codex's own run output was not recorded before credits ran out. Claude re-verified with the **Docker-free harness** (`scripts/pg-harness/run.sh .`, Postgres 17.x + pgTAP 1.3, Supabase-style default grants emulated): 001 294/294, 002 15/15, 003 247/247, 004 56/56, 005 71/71 — 683 assertions passing. The harness reproduces the Task 2 baseline (309) exactly; a negative control that removed the table revokes and RLS enablement turned 001 and 003 red (10 and 15 failures). `npm ci`, `npm run lint`, `npm test` (2 files, 2 tests), and `npm run build` passed on Linux/Node 22. **Authoritative confirmation (2026-10-25 20:20 PT, Peter's Mac, real local Supabase stack):** `npx supabase db reset` applied all four migrations and the seed; `npx supabase test db` reported `Files=5, Tests=683, Result: PASS`, matching the harness exactly. Local analytics was disabled first (see Surprises). `npx supabase db lint --local --level warning` on the fully reset database: no schema errors. Types regenerated (`src/types/database.ts`, 680 lines) now include all 12 browser-callable functions and exclude trigger-only functions; lint, unit tests, and build pass with them.

- **2026-10-25 — Task 4 auth and shell (Claude):** RED: the four new test files failed at import because the auth, app, and lib modules did not exist. GREEN: `npm test` passed 26 tests across 6 files (sign-in form and submission, neutral invalid-credential error, fail-closed member mapping for missing / all-null / foreign rows, the caller-only member row, cache and private UI both empty when the sign-in screen first appears after sign-out, no Partner A state after Partner B signs in, a cache wipe on a silent identity switch, all six routes, unknown-path redirect, and signed-out deep links). `npm run lint` and `npm run build` passed (Linux, Node 22). A Playwright smoke test against the Vite dev server with mocked Supabase endpoints at 320×640 and 1280×800 showed no horizontal overflow, the title `Ours` on every route, sign-out landing on `/` with empty `localStorage`, and browser Back after sign-out showing no private UI. Not yet run: a real sign-in against the local stack (the seeded synthetic users are banned and have no password by design; Task 10 provisions login-capable fixtures), Mac parity confirmed 2026-10-25 20:35 PT: `npm run lint && npm test && npm run build` passed on Peter's Mac (26/26 tests, 128 modules). The build warns that the single JS chunk is 515 kB (149 kB gzip), mostly React plus supabase-js. Acceptable for the alpha; revisit with route-level code splitting if load time matters.

- **2026-10-25 — Task 5 palette (Claude):** RED: `model.test.ts` failed (no `./model`), then the editor, library, and existing route tests failed (no `appRoutes` or palette modules). GREEN: `npm test` passed 70 tests across 9 files. Domain: roulette-state derivation including "never ready without exactly two decisions", stable filter serialization that drops non-uuid/non-enum params, each filter alone and combined, sorting, archived exclusion, an unknown category returning nothing, and draft bounds counted in code points. Editor: required fields with focus on the first invalid one, inline category creation and selection, duplicate-name handling, a save that invalidates palette and activity queries and opens detail, a failed save that keeps the draft, an ambiguous failure whose retry reuses the request id and yields one item, and the unsaved-changes dialog (keep / discard / no prompt when clean). Library: cards without descriptions, card metadata, sort, five single-filter cases with no content in the URL, combine-then-clear-one, URL restore, a no-match state that never broadens, the empty palette, keyboard order, and the mobile filter toggle. `npm run lint` and `npm run build` passed. A mocked-backend Playwright run at 320×700 and 1280×900 covered empty palette → inline category → save → library, with no overflow at either width, title `Ours`, and the discard dialog blocking navigation with focus on "Keep editing". **Real local stack (2026-10-25 21:31 PT, Peter's Mac):** after `npx supabase db reset && npm run dev:accounts`, Peter signed in as `partner-a@example.com` through real GoTrue and created a category and an item, and the item appeared in the library. That confirms the real `get_current_member`, `create_category`, and `create_item` RPCs and the RLS reads behind the library. Partner responses are not yet possible (Task 6).

- **2026-10-25 — Task 6 item detail (Claude):** RED: 24 of the new response/detail tests failed before implementation. GREEN: `npm test` passed 94 tests across 11 files.
  - Responses: only the caller's controls are enabled; interest, favorite, and roulette each call their own RPC with exactly their own field, verified by argument equality; interest can be cleared to unrated; the "Interest is not permission…" note always shows; Pending, Ready for Roulette, and Not now are distinct; a failed write shows "Not saved" next to that control without claiming success; the partner's state is read-only.
  - Detail: the item, category, creator, and date render; missing and malformed ids get a neutral not-found.
  - Comments: chronological order; post and clear; a failed post keeps its text; an ambiguous retry reuses the request id, giving one comment and one `comment_added` event.
  - History: collapsed by default, with editor and date shown before any content.
  - Creator-only actions: edit records a new version; archive confirms first and removes the item from the library; the partner can comment and remix but sees no Edit/Archive, and gets a neutral page at `/edit`.
  - Remix: source id travels in router state with no query string, the form pre-fills, and saving creates a distinct item with `source_item_id` and a "Remixed from" link.
  - `npm run lint` and `npm run build` passed. A mocked-backend Playwright run at 320 and 1280 px showed no overflow; the state badge turned Ready only after the server confirmed; arrow keys on the interest group keep focus while saving.
  - Not yet run: against the real local stack.

- **2026-10-25 — Task 6A lifecycle schema (Claude):** New migration `20261026000000_item_lifecycle.sql` and new test `006_lifecycle_test.sql` (76 assertions). RED: 006 errored on the missing `status` column. (This also exposed a harness bug: a file that errors before pgTAP prints its plan exited silently. Fixed in `scripts/pg-harness/run.sh`; it now reports FAIL.) GREEN on the Docker-free harness: 001 294, 002 15, 003 247, 004 56, 005 75, 006 76 — **763 assertions**. Negative control: restoring the pre-v2 item visibility turned 006 red on the three draft-privacy checks.
  - 006 covers: drafts invisible to the partner across items, responses, and revisions; no activity while drafting; partner cannot submit, edit, comment on, decide on, mark seen, or remix a draft; submit stamps `submitted_at`, sets the author Ready, and records one `item_created`; submit is idempotent; no return to draft; `mark_item_seen` advances and stays private, with no direct writes; partner co-edit records the partner as editor, resets the other partner to pending, keeps the editor's decision, and records one `item_edited` with no decision event; a no-op co-edit does nothing; a category-only edit resets too; a stale `p_expected_updated_at` raises `OU409`; Not now only via `decline_item` with a non-blank reason, giving one `not_now_reason` comment, one `item_declined` event, and idempotent retries; the decliner can return the item to pending or ready; delete is author-only, purges responses, revisions, comments, views, and activity, and is refused when memories, draws, or remixes depend on the item; revisions stay immutable outside delete; and RLS and execute grants on the new objects.
  - **Changed existing tests, each because Peter changed the contract** (each edit is commented in the file):
    - 001: the event enum list includes `item_declined`.
    - 003: the signature is now `update_item(uuid,text,text,uuid,timestamptz)`.
    - 004: "a partner cannot edit another member's item" became "a partner can co-edit a submitted item", and two `create_item` drafts are promoted directly before the response-signal assertions.
    - 005: the concurrent item is promoted through a committed dblink connection before the concurrent-Ready checks (+4 assertions).
  - **Real stack (Peter's Mac, 2026-10-25 22:20 PT):** `npx supabase db reset` applied the migration, `npx supabase test db` passed (763), and the types were regenerated (`8d5d72c`). The app builds and 94 unit tests pass against them.

- **2026-10-25 — Task 6B views and lifecycle UI (Claude):** RED for each slice before implementing (the rename kept 94 green; 10 editor/co-edit tests, 11 domain stage tests, 8 view tests, and 8 lifecycle tests started red). GREEN: `npm test` **125 tests across 13 files**; `npm run lint` and `npm run build` clean; Docker-free harness **763/763** including the new `20261026000001_delete_refusal_code.sql`.
  - Rename: Palette → **Experiences**, routes `/experiences/*`, `/palette/*` redirects (path, query, and state preserved), central `src/app/paths.ts`.
  - Editor: **Save draft** / **Share with [partner]**. Enter never shares. A create that saves but fails to share continues as an edit of that draft, with no duplicate. A co-edit sends `p_expected_updated_at`; a stale save keeps the typed text and offers "Load their version" or "Save mine anyway". The edit page pins the version it opened, so background refetches can't wipe a draft in progress (a bug found by the conflict test).
  - Stages: `deriveViewerStage` (draft / new / needs_decision / waiting / ready / not_now) and `hasUnreadMessages` in `src/domain/model.ts`.
  - Views: tabs Theirs / Mine / Ours / Not now with "N need you" counts. Theirs is sectioned New → Needs your decision → Waiting; Mine is Needs your decision (partner edited) → Drafts → Waiting; Ours is every shared experience with the Task 5 filters; Not now is both authors.
  - Cards: "From you / From [partner]", a stage badge, "New messages", and a draft note. The visual hierarchy strongest-first is New (accent edge, tint, solid badge) → Needs your decision (accent outline) → Draft (dashed) → the rest.
  - Detail: marks seen on open; drafts show "Only you can see this draft", **Share with [partner]**, Edit, and Delete, with responses and chat hidden; Not now opens a reason dialog (`decline_item`) and never calls `set_roulette_decision('not_now')`; reasons are tagged in the chat; "Undecided" appears once a decision exists; Delete is author-only, asks first, and explains a dependency refusal via SQLSTATE `OU423`; Edit is available to both partners on shared experiences.
  - Overall-state copy is now "Ready to plan"; the per-partner decision stays "Ready for Roulette".
  - Mocked-backend Playwright at 320 and 1280 px: no horizontal overflow on Theirs, Mine, Ours, Not now, the decline dialog, or the draft detail (tabs initially forced 410 px on a phone; fixed with `min-width: 0` on shell children).
  - **Owed on the Mac:** `npx supabase db reset && npx supabase test db` (expect 763), `npx supabase gen types typescript --local > src/types/database.ts` (no change expected), `npm run lint && npm test && npm run build`, and a two-window walkthrough.
- **2026-10-26 — Task 6C (Claude), Linux container, mocked backend:**
  - `npm run lint`: clean. `npx tsc -b`: clean. `npm run build`: built.
  - `npx vitest run`: **119 passed, 13 files** (RED first for `src/domain/inbox.test.ts`, `IdeasPage.test.tsx` and the rewritten `ResponseControls.test.tsx`). The identity-switch privacy test passed 3 of 3 runs after the AuthProvider fix (see Surprises).
  - Playwright against the real app on the in-memory test client (scratch harness, not committed) at 320, 390 and 1280 px: Ideas, Respond, Drafts, Not now via Refine, the Refine bottom sheet, idea detail (partner's and mine), Plan, and agreed ideas. No horizontal overflow and no console errors.
  - No schema change, so the database suite is unaffected (763 on the Mac after 6A).
  - **Owed on the Mac:** `npm run lint && npm test && npm run build` (the device shell is a Linux VM, and `node_modules` holds macOS binaries, so Claude can't run it there), plus a two-window walkthrough: A shares, B sees Respond light up, B edits, and A sees "edited your wording".

- **2026-10-28 — Task 7B real-stack and Mailpit gate (Codex):** Restarted the Mac Docker-backed local stack so the configured SMTP port was active. `npx supabase test db --local` passed **797 assertions across 8 files**. `npm run lint`, `npm test` (**150 tests across 13 files** after the notification privacy regression), `npm run build`, and `git diff --check` passed. Using only the two local synthetic accounts and the user-facing RPCs, Partner A shared `Synthetic Mail Check Alpha`; the worker logged `1 sent, 0 failed`, and Mailpit received exactly one message addressed to Partner B. Editing the idea and replying as Partner B produced no additional message after a worker cycle. Sharing a second distinct synthetic idea produced exactly one additional message. The raw post-fix message used `Received: from ours.localhost`, the generic subject/body/link specified in Task 7B, and contained no idea title, description, message text, or person name. Worker logs contained counts only. During RED verification, Nodemailer's default SMTP greeting exposed the Mac hostname in Mailpit's `Received` header; a failing unit test now requires the generic `ours.localhost` client name, and the worker uses that tested transport configuration.

- **2026-10-28 — Task 7B recipient and retry hardening (Codex):** RED: the new pgTAP regression showed that privileged three-member and one-member misprovisioning still allowed submission and could select the wrong recipient cardinality; focused worker tests also failed because no deterministic Message-ID existed. GREEN: forward migration `20261028000000_notification_recipient_hardening.sql` serializes on the couple row, locks member rows in UUID order, requires exactly two members including the actor, and inserts exactly the other member. It also preserves the established item-initialization error contract by ordering the item initializer before activity generation. A clean `npx supabase db reset --local` applied all nine migrations, then `npx supabase test db --local` passed **805 assertions across 9 files**. `npm test -- scripts/lib/notify.test.mjs` passed **9/9**; `npm run lint`, `npm test` (**152 tests across 13 files**), `npm run build` (154 modules), and `git diff --check` passed. `npx supabase db lint --local --level warning` exited successfully with only the existing unused `target` variable warning in `mark_item_seen`; the new migration produced no lint finding. The read-only ACL audit confirmed outbox RLS, no `anon`/`authenticated` outbox read or enqueue/claim execution, service-role claim execution, and `SECURITY DEFINER` plus empty `search_path` on all four notification functions. Through the synthetic Partner A user-facing create/share RPC workflow, the worker logged `1 sent, 0 failed`; Mailpit's raw message was addressed only to synthetic Partner B, used the generic subject/body/link and `Received: from ours.localhost`, matched its Message-ID exactly to `<outbox-uuid@ours.localhost>`, and contained none of the synthetic idea title, description, or person names. Task 7B now states the actual guarantee: one outbox intent per share and at-least-once delivery; a rare post-send/pre-ack crash may duplicate a message, while the stable Message-ID supports client deduplication.

- **2026-10-28 — Task 7C line attribution (Codex):** RED: the detail integration could not find a "Who wrote what" control, the same-author/later-line regression showed an older line being labeled with the newer date, and the first full-suite run exposed a textarea focus race while asynchronous revisions changed the wrapper shape. GREEN: `attributeLines` replays title and description snapshots with a whitespace-tolerant line LCS; the optional view keeps the editable description mounted, groups only adjacent lines with the same author and revision time, names the author/date in text, and supports a visible toggle plus a left touch/pen swipe with vertical scrolling preserved. `npm run lint`, `npm test` (**163 tests across 15 files**), `npm run build` (**157 modules**), and `git diff --check` passed. A real local two-account Chrome flow used only synthetic content: Partner A shared, Partner B added a line, and Partner A saw two correctly labeled blocks. At 1280×800 and a true 320×640 load there was no horizontal overflow; reduced-motion computed `animation-name: none`. Independent quality review passed; specification review's timestamp and mobile-touch findings were fixed and regression-covered. The aggregate `npm run verify` reaches and passes lint/test/build, then stops at the pre-existing missing `scripts/check-repository-content.mjs`; both repository-content checker files are planned for Task 11 and were not fabricated here. No schema changed, so the existing **805-assertion** database result remains applicable.

- **2026-10-29 — Task 7D.1 live viewing acknowledgement (Codex):** RED: component tests first exposed the old once-per-visit behavior, lost burst members, overlapping refetch cycles, hidden/blocked presentation, fail-fast invalidation, failed-write retry loops, stale in-flight completion, the initial read/write boundary, and replacement of pending snapshots. The database regression first failed because no exact acknowledgement function/table existed, then rejected a timestamp-only implementation because equal-time event B could be inferred seen with A. GREEN: one authenticated, content-free Realtime subscription reduces payloads to opaque event tuples, batches by event id, atomically swaps immutable snapshots, waits for all protected refetches to settle, serializes cycles, accumulates pending event ids, and idempotently retains failed work. Initial viewing captures current event ids before refetching; live viewing acknowledges only matching ids after successful visible presentation. `activity_event_acknowledgements` persists exact event/member facts behind RLS with no browser table grants; its security-definer write validates every supplied id against the visible item and current couple. Task 7D.3 now suppresses only exact acknowledgements, never a timestamp inference. `npm test -- src/features/palette/LiveUpdates.test.tsx` passed **23/23**; a clean `npx supabase db reset --local` applied all ten migrations; `npx supabase test db --local` passed **820 assertions across 10 files**; database lint reported only the pre-existing unused `target` warning in the old `mark_item_seen`; `npm run lint` passed; `npm test` passed **183/183 across 15 files**; `npm run build` passed (**158 modules**); and `git diff --check` passed. Independent architecture, data-model, and test reviews drove exact acknowledgements, the initial capture-before-refetch boundary, hidden-live coverage, all-refetch settlement, initial-before-pending-snapshot ordering, and lossless pending-ID accumulation. No notification delivery, credentials, real/private content, or production data were added.

- `npm run lint`
- `npm test`
- clean `npx supabase db reset`
- `npx supabase test db`
- `npm run build`
- repository-content and bundle-secret checks
- Playwright two-partner loop
- responsive/accessibility review
- synthetic purge test
- synthetic backup/restore drill before real content

- **2026-10-29 — Task 7D.2 delivery batches (Claude, Docker-free harness only):** RED: `011_notification_batches_test.sql` was written first and failed (`relation "public.notification_outbox_events" does not exist`). GREEN: `20261029000001_notification_batches.sql` swaps `notification_kind` to exactly `idea_shared`/`activity_digest` (via a new type, so the new label is usable in the same migration); adds `not_before`, `sealed_at`, `suppressed_at` and checks (claimed/sent requires sealed; suppressed requires sealed and unsent; a share is always sealed); adds the identifier-only `notification_outbox_events` link table (event-unique PK, composite couple FKs with cascade, RLS on, no grants to any role); backfills each existing share row with exactly one `item_created`/`item_remixed` event or fails the migration; then drops `item_id`, its FK, index and uniqueness. One partial unique index allows one unsealed digest per recipient. `enqueue_activity_notification()` keeps the couple → members(id order) lock and the exactly-two-member/actor validation, routes shares to a dedicated delivery due at event + 5 min and `item_edited`/`comment_added`/`item_declined`/`item_became_eligible` to the recipient's open digest (locked FOR UPDATE; due at first event + 1 hour), and links nothing else. `claim_notifications` returns `(id, kind, recipient_email)`, claims only due rows with SKIP LOCKED, and seals on claim. 011 covers schema/ACLs, the event-to-delivery mapping, constraint errors, seal-then-next-digest, fail/retry with no merge, delete-empties-and-suppresses, and three dblink cases: enqueue waits on a claim then opens the next digest; a claim skips a digest an enqueue holds without waiting; and two concurrent enqueues share one digest. 008 and 009 were rewritten through the link table, keeping their guarantees; 005's cleanup now deletes the couple's outbox rows, because item deletion no longer cascades to deliveries. `scripts/pg-harness/run.sh .` passed **906 assertions across 11 files** (008 33, 009 8, 011 83). `npm run lint`, `npx tsc -b` and `npm test` (**183/183**) passed. **Real stack (2026-10-29 17:13 PT, Peter's Mac):** Peter ran `npx supabase db reset && npx supabase test db`, regenerated `src/types/database.ts` (drops `item_id`, adds `not_before`/`sealed_at`/`suppressed_at` and `notification_outbox_events`; the claim result no longer carries `item_id`), and ran `npm run build`, reporting all done; the types were committed separately.

- **2026-10-29 — Task 7D.3 claim-time seen revalidation (Claude, Docker-free harness only):** RED: 15 new 011 cases were written first; 8 failed against the 7D.2 claim (a seen share and an entirely seen digest were still returned; no candidate was timestamped). GREEN: `20261029000002_claim_seen_revalidation.sql` replaces `claim_notifications` (same return shape, `(id, kind, recipient_email)`, so no drop or type change). After locking due rows with SKIP LOCKED, it timestamps `notification_outbox_events.suppressed_at` for every candidate with an exact `(activity_event_id, recipient)` acknowledgement, suppresses and unclaims any delivery with no unsuppressed candidate, and seals and returns the rest. Cases cover: a share seen during its grace period (suppressed, candidate timestamped); an unseen share sent even though its author viewed it (only the recipient's acknowledgement counts); an entirely seen digest (suppressed); a digest spanning two ideas with one seen (sent once, only the unseen idea's edit left live); a failed partial digest whose remainder is seen before the retry (the retry sends nothing); and an event after the claim opening the next digest. Stale-claim recovery, the five-attempt limit, error codes, service-role-only execution and empty `search_path` are unchanged and still covered by 008/001. `scripts/pg-harness/run.sh .` passed **925 assertions across 11 files** (011 102; first recorded as 921, a mis-sum). No TypeScript or type changes. **Real stack (2026-10-29 18:37 PT, Peter's Mac):** `npx supabase test db` reported `Files=11, Tests=925, Result: PASS`, matching the harness.

- **2026-10-29 — Task 7D.4 generic batch rendering (Claude):** RED: six new `scripts/lib/notify.test.mjs` cases failed first (no `activity_digest` template). GREEN: `renderNotification` gains one digest template (subject "There are updates waiting in Ours", body "Open Ours to see them: <app>/ideas"); the share template is unchanged; the renderer still takes exactly two arguments and refuses unknown kinds, including inherited object keys. Cases cover the exact digest copy; no digit, event word, idea, category or decision word in either template (outside the link); one send per claimed digest with its own Message-ID; a digest row carrying event types, item ids, a count, a reply body or a name sends exactly the generic message; a failed-then-retried delivery sends a byte-identical message with the same `<outboxId@ours.localhost>` Message-ID; an unknown kind is marked `send_failed` without sending while the rest of the batch continues. `scripts/notify-worker.mjs` needed no change (the claim shape is unchanged); local-only refusal, the `ours.localhost` client name, count-only logs and code-only errors are untouched. `npx vitest run scripts/lib/notify.test.mjs` **15/15**, `npm run lint` passed, `npm test` **189/189 across 15 files**.

- **2026-10-29 — Task 7D.5 real loop and independent reviews (Claude; real stack for the loop, harness for the fixes):** `npx playwright test e2e/notifications.spec.ts` passed on Peter's Mac against the real local stack and Mailpit (**1/1, 22.9 s**) after a clean `npx supabase db reset && npm run dev:accounts`. The first run failed in the test helper (a data-modifying `WITH` inside the JSON wrapper), fixed in `2070fa1`. Container: `npm run lint`, `npm test`, `npm run build` passed; `git diff --check 3c4bea1 HEAD` passed on the Mac; `check:repo` and `check:bundle` are not yet implemented (Task 11), so they were not run. **Reviews:** an independent specification review and an independent code-quality/security review of 7D.2–7D.5 found no high-severity issues. Medium findings fixed test-first in `20261029000003_notification_review_fixes.sql` and `scripts/lib/notify.mjs`: (1) enqueue upgraded foreign-key KEY SHARE locks to FOR UPDATE, so two near-simultaneous actions could deadlock (reproduced on the harness), and now locks FOR NO KEY UPDATE; (2) claim vs `delete_item` deadlocked on candidate rows (reproduced), and a BEFORE DELETE trigger on `activity_events` now locks the affected deliveries first (the reviewer's probe now completes, with the claim skipping the locked digest); (3) `mark_notification_sent` threw on a delivery suppressed by a stale reclaim, and both mark functions now ignore suppressed rows; (4) the worker marked a sent email failed when only recording the send failed, causing a duplicate send, and now never does (counts it as `unrecorded`), and a failing `markFailed` no longer stops the batch. Low findings fixed: a recipient with no Auth email is suppressed with `no_recipient_email` instead of dying after five silent attempts; the due index leaves out rows with five attempts; `pg_sleep` busy checks became `pg_blocking_pids` waits; 011 pre-cleans fixtures from an aborted run; it pins both indexes and the cross-couple event boundary; the e2e spec checks the URL-derived idea id is a UUID before using it in SQL; prototype-key kinds are covered. With the fixes removed, exactly the six new database cases fail; with them, `scripts/pg-harness/run.sh .` passes **956 across 11 files** (011 133) and `npm test` **192/192**. Open: no test exercises the backfill's fail-closed path (it ran once, on the real stack, against existing rows). **Real stack after the fixes (2026-10-29 19:30 PT, Peter's Mac):** `npx supabase db reset && npx supabase test db` reported `Files=11, Tests=956, Result: PASS`, and, after a fresh reset and `npm run dev:accounts`, `npx playwright test e2e/notifications.spec.ts` passed **1/1 (20.1 s)**. (One run in between correctly refused to start because the couple already had two ideas from activity after the reset.)

- **2026-10-30 — Task 9 memories and expansion (Claude, Docker-free harness):** Database RED: the new `013_memories_test.sql` showed that `add_memory` accepted a memory on a draft, including the partner's view of the author's private draft (it checked only couple membership). GREEN: `20261030000001_memory_requires_shared_idea.sql` requires a submitted idea, refusing with the cross-couple message so a draft's existence isn't revealed. 013 also covers another couple's idea, body required and bounded, the `memory_next_time` labels, one content-free `memory_added` event, no email, and related-idea lineage (both links kept, starts as a draft, a memory from another idea or another couple refused). The existing 004 draw checks (accepted draw for the same idea only; deferred, mismatched and cross-couple draws refused) stand. UI: `src/features/memories/` adds `api.ts` (bounded validation mirroring the CHECK constraints; author and couple derived server-side; no bodies in logs or keys), `MemoryComposer.tsx` (the design's labels; body required; optional highlight, Next time — No preference / Repeat / Refine — and refinement; the draft and request id held in component memory; a failed save keeps the fields; an ambiguous retry reuses the request id; a save invalidates the idea, its memories and activity) and `MemoryList.tsx` (author and date, then only the filled fields, and **Create a related idea**). The idea page's Memories section offers **Add a memory**; an accepted spin offers **Add a memory** linked to that draw, and Leave for later offers none; `/ideas/new` takes `fromMemory` from router state (ids only) and passes `source_memory_id` with `source_item_id`, saving nothing until the editor saves. The fake client gains a parity `add_memory`. RED: with the implementation removed, all 13 new UI tests fail. GREEN: `scripts/pg-harness/run.sh .` **1,038 across 13 files** (013 16); `npm test` **222/222 across 18 files**; lint; build. **Not yet run on the real stack.**

- **2026-10-30 — Task 10 synthetic-loop checkpoint (Claude; real stack on Peter's Mac):** From a clean `npx supabase db reset && npm run dev:accounts`, `npx supabase test db` reported `Files=13, Tests=1038, Result: PASS` (this also confirms Task 9 on the real stack), and `npm run test:e2e` passed **6/6 in 47.1 s**:
  - `notifications.spec.ts`: the unseen-activity email loop, 21.6 s.
  - `personal-alpha-loop.spec.ts`: steps 1–13, 8.9 s. Share; rate and favorite with eligibility still pending; the partner responds and is in; the idea moves to Plan; Spin and Spin again record nothing; Accept records one draw; a memory linked to that draw; a related idea keeping both lineage links; A signs out and B signs in on the same page; back and refresh never show A's private draft; a second couple cannot reach Couple A's ideas by URL.
  - `responsive.spec.ts`: no sideways scrolling at 320 and 1280 px on eight screens; keyboard-only Spin with a visible focus indicator and focus moving to the result; reduced motion.
  Earlier in the same session `npm run lint`, `npm test` (222/222) and `npm run build` passed on the Mac. `git diff --check` was clean against HEAD. Against the planning base `6118a7a` it reports only the documented exceptions (Decision Log, Task 10). Step 6 scope review: recorded in the 12:45 Session Log entry. Fixes needed to get here:
  - two unit tests timing out at Testing Library's 1 s default on the Mac's first render (`98eb022`);
  - the Couple B fixture's Auth user list returning 500 on a reset stack (`9a7717e`);
  - no per-action timeouts, which hid a stuck step behind a 3-minute test timeout (`60eb3bd`);
  - step 11 clicking Account behind the idea sheet's modal backdrop (`3e33dce`).
  **The synthetic first loop works. Real content remains blocked on Task 11's readiness gate.** Colour contrast is still to be checked by eye from the screenshots in `test-results/`.

## Session Log

Newest first. Every agent session ends with an entry (format in `AGENTS.md`).

### 2026-11-09 11:45 PT — Claude
- Done: created this public edition from a snapshot of the private build (`8dc57a6` plus the decision-log commits), with fresh history. The product is repositioned around connection and shared time: Desires became Ideas and Play became Plan, in copy, routes (`/ideas`, `/plan`), identifiers, file names, and the `idea_shared` email kind. The rating keeps its four steps with neutral emoji (😐 🤔 🙂 🤩). `docs/HANDOFF.md` was rewritten as the product brief; the original strategy doc was removed; personal and hosting details were scrubbed from the plans; a README was added.
- State: clean.
- Verified with: Docker-free harness (16 files, 1108 assertions); `npm test` 281/281; lint; build. e2e not yet re-run after the rename.
- Next: run `npx supabase db reset && npm run dev:accounts && npx supabase test db && npm run test:e2e` on a Docker machine, and keep screenshots for the README.

### 2026-11-03 22:25 PT — Claude
- Done: set up Peter's temporary MacBook Pro as a dev machine (Homebrew, Node 22, gh, clone at `~/ours/app`, Docker Desktop with `~/.docker/bin` on PATH). Regenerated `src/types/database.ts` from the local stack and brought e2e up to date with QA 9–15 (`8632e73`): the form's Description label is now "Description (optional)", and the loop's memory step follows the dates flow (When? → Up next → We did it → How was it?). Fixed a real phone-width bug the e2e caught (`3b3be98`): `.field input { width: 100% }` outranked `.visually-hidden`, so the form's hidden heat radios were 250 px wide and /ideas/new scrolled sideways (380 > 320 px). This bug is live in production until the next site upload.
- State: clean.
- Verified with: **real Supabase stack** (Peter's temp Mac). `npx supabase db reset && npx supabase test db`: `Files=16, Tests=1108, Result: PASS`, which confirms QA 9–15's migrations beyond the harness. `npx supabase db reset && npm run dev:accounts && npm run test:e2e`: **7/7 in 34.9 s**. The phone-320 case was RED before `3b3be98` and GREEN after. `npm test` 281/281 (one earlier RoulettePage timeout under Docker load passed on re-run: 21/21), lint, build.
- Surprises: on a new machine, e2e needs `npm run dev:accounts`. It creates the synthetic sign-ins and writes `.env.local`; without it the app shows "Ours isn't configured" or sign-in fails. The e2e specs hadn't run on a real stack since Oct 30, so selector drift went unnoticed. Run `test:e2e` after UI copy changes.
- Production (22:25 PT): Peter uploaded `ours-site-2026-11-04.zip`. The quick-add and dates SQL files and the current `notify-function.ts` were already applied (the regenerated bundle is byte-identical). **A real email arrived through Resend**, which confirms production email end to end.
- Next: review `npm audit` warnings (never `--force`); deferred: concept E (shared reveal), a memories timeline, a `backup.sh` restore test.

### 2026-11-03 22:30 PT — Claude
- Done: QA 15 (`qa-notes` §15), dates and reflections, in three parts: database `ab8020f`, app `4ce72ac`, reminder email (this commit). RED first in each part: 016 failed on missing `plan_item`; 9 date tests and 4 domain tests failed; 4 reminder tests failed.
- Correction: QA 14's log said 266 tests; the real count was 264.
- State: clean once committed.
- Verified with: Docker-free harness (16 files; 016 27/27); `npm test` 281/281; lint; build; `deno check` on the function and on the generated single file; 390 px screenshots of Plan with Up next, the sheet, the avatar menu, the reflect sheet and the idea page. Not run on a real stack or against Resend.
- Next:
  - Peter applies `20261103000003` (SQL editor file), uploads the site, and re-pastes the function (generated file).
  - On a Docker machine, run `db reset`, `test db`, `test:e2e` and gen types; the types for the date columns and functions were hand-edited.

### 2026-11-03 21:30 PT — Claude
- Done: QA 14 (`qa-notes` §14): quick add (migration `20261103000002`), the home-screen app, and the backup script. RED first: 015 failed 5/7; 5 form, detail and domain tests and 2 home-screen tests failed.
- State: clean once committed. Next up is the pick-to-date-to-reflection flow (mockups first).
- Verified with: Docker-free harness (15 files; 015 7/7); `npm test` 266/266; lint; build. The backup script was checked for syntax, for refusing paths in the repo, and for an encrypt/decrypt round trip on synthetic files; it hasn't run against the project.
- Next: Peter applies the quick-add migration (SQL editor file) and uploads the site; on a Docker machine, run `test:e2e`.

### 2026-11-03 21:00 PT — Claude
- Done: QA 13 (`qa-notes` §13). Toggle clear of the account button, measured; the count follows the filter; Plan rows show the latest pick, memory or message; the form uses the heat bar. RED first: 6 domain, Plan and form tests failed.
- State: clean once committed. No database change (reads existing tables under existing RLS).
- Verified with: `npm test` 259/259; lint; build; measured toggle and account gaps at 320, 390 and 1280 px. The e2e specs include the new gap check but haven't run on a real stack.
- Next: Peter uploads the site zip; on a Docker machine, run `test:e2e`.

### 2026-11-03 20:40 PT — Claude
- Done: QA 12, Plan cleanup (`qa-notes` §12). The toggle is top right; the filter pills sit under the count and above the list; the deck hint names its source; Plan rows drop "Both in". RED first: 8 Plan and roulette tests failed.
- State: clean once committed.
- Verified with: `npm test` 258/258; lint; build; 390 px screenshots. The e2e specs use the "Filter ideas" group but haven't run on a real stack.
- Next: Peter uploads the site zip; on a Docker machine, run `test:e2e`.

### 2026-11-03 20:20 PT — Claude
- Done: QA 11, the answer area as variation 3 (`docs/plans/2026-10-30-qa-notes.md` §11). It has a partner line, three emoji answer tiles that collapse to a row with Change, and a heat-bar rating. RED first: 13 detail-page and feedback tests failed against the old cards.
- State: clean once committed. No database change.
- Verified with: `npm test` 256/256; lint; build; `playwright test --list` (6). Screenshots at 390 px from synthetic data; the e2e specs follow the new controls but haven't run on a real stack.
- Next:
  - Peter uploads the rebuilt site.
  - On a Docker machine, run `test:e2e`.
  - Open: the new-idea form still uses the rating dropdown.

### 2026-11-03 19:30 PT — Claude
- Done: QA 10, production email. The `notify` Edge Function sends through Resend; the email logic is shared with the local worker; runbook in `docs/alpha-email.md`. RED first: the new sender and handler tests failed on a missing module.
- State: clean once committed. The function is not deployed; that needs Peter (secrets, deploy, cron).
- Verified with: `npm test` 261/261; lint; `deno check supabase/functions/notify/index.ts`. Not yet run against Resend or the hosted project.
- Next: Peter follows `docs/alpha-email.md`, then shares a test idea to confirm an email arrives. Remaining from QA 9: on a Docker machine, run `db reset`, `test db`, `test:e2e` and gen types.

### 2026-11-03 19:10 PT — Claude
- Done: QA 9, answers v3 from Peter's first real-use feedback (`docs/plans/2026-10-30-qa-notes.md` §9). Both people answer alike, the author included. Later is mutual. Not for us archives. Only description edits re-ask. RED first: 014 failed on `item_passed` and the edit rule; 11 detail-page and 3 domain tests failed before the change.
- State: clean once committed.
- Verified with: Docker-free harness (all 14 files; 014 23/23); `npm test` 255/255; lint; build; `playwright test --list` (6). Types for `pass_item` and `item_passed` are hand-edited; regenerate on the Mac (expect no diff).
- Next:
  - Peter reruns `npx supabase db reset && npx supabase test db && npm run test:e2e` on the Mac.
  - Then `npx supabase db push --linked` (2 migrations) and a rebuild plus re-upload of `dist/`.
  - Then production email: a scheduled Edge Function plus Resend (Peter's existing account, a new domain and key).

### 2026-10-30 16:00 PT — Claude
- Done: first real use, deployed per `docs/plans/2026-10-30-first-night-deploy.md` (Peter ran every hosted step). Migrations pushed to the hosted project, couple provisioned, front end on a shared-hosting subdomain (HTTPS, SPA fallback, noindex verified). Local-only importer `b877e53` (`scripts/import-ideas.mjs`): Peter imported both partners' ideas from files outside the repo; it reported success. No real content is in the repo or this log.
- Decision (Peter): real use started before Task 11's gate, accepting no tested backup or purge runbook, no production email, and no content checkers (see the deploy plan, step 0).
- State: clean.
- Verified with: hosted smoke test by Peter (sign-in, live update, share/agree); `npm test` 246/246, lint and build in the container; the importer was run only by Peter, on the hosted project.
- Next: Peter takes a manual backup after the evening (plan step 7). Then Task 11 (purge runbook, tested restore, content checkers, email delivery) and more QA.

### 2026-10-30 15:05 PT — Claude
- Done: QA 8, one pill row replaces Refine on Ideas and Plan (category + ♥ Favorites, only options that match, one Clear); `20261030000004_draw_favorites.sql` lets the deck honour ♥. RED first: 012 failed on `draw_roulette(unknown, boolean)`; 14 UI and domain tests failed before the change.
- State: clean once committed.
- Verified with: Docker-free harness (all 13 files, 012 73/73); `npm test` 239/239; lint; build; `playwright test --list` (6). Types edited by hand for the new argument; regenerate on the Mac (expected identical).
- Next: Mac rerun (`db reset`, `test db`, `test:e2e`, gen types), then the first real-use deploy plan (`docs/plans/2026-10-30-first-night-deploy.md`).

### 2026-10-30 14:50 PT — Claude
- Done: QA 7 (Plan category pills with one Clear; Deal/Draw another goes back to the deck or seal; red text links; "New" link in the empty drafts view). RED first: 6 pill tests and 3 reset tests failed against the select and the immediate redraw.
- State: clean once committed.
- Verified with: `npm test` 236/236; lint; build; `playwright test --list` (6). e2e specs now pick the category by pill. Not yet run on the real stack.
- Next: Peter's Refine simplification (QA 8, to be decided), then the Mac rerun.

### 2026-10-30 14:45 PT — Claude
- Done: QA 5, reveal styles (deal a card or a sealed note, switchable; one primary "Let's do it"; Leave for later removed from the result), and QA 6, counts on the bottom tabs and Ideas views, a link-only empty state, and "N ideas ready to plan". RED first: 18 Plan tests failed against the old Spin; 7 count and wording tests failed before the change.
- State: clean once committed.
- Verified with: `npm test` 235/235; lint; build; `playwright test --list` (6). Not yet run on the real stack.
- Next: Peter reruns `npx supabase db reset && npm run dev:accounts && npx supabase test db && npm run test:e2e` on the Mac; then more QA or Task 11.

### 2026-10-30 14:35 PT — Claude
- Done: QA 2 (every agreed idea on Plan, with Refine in place; `/plan/agreed` redirects) and QA 4 ("All caught up" with linked counts). RED first: 5 new UI tests failed. The e2e specs follow Plan's new list; the responsive spec drops the retired `/plan/agreed` screen.
- State: clean once committed. Next: QA 5, reveal styles A (deal a card) and B (sealed envelope) with a switch, one primary "Let's do it", and no Leave for later. E (both hold, across both phones) is deferred (Peter).
- Verified with: `npm test` 236/236; lint; build; `playwright test --list` (6 tests).

### 2026-10-30 14:20 PT — Claude
- Done: QA 3, Later (`docs/plans/2026-10-30-qa-notes.md`): `20261030000003_later_note_optional.sql`; a Later view in Ideas with its latest word and an unread dot; wording; Refine's hold option removed; `?notnow=1` opens Later. RED first: 006 failed on the no-note path; 14 UI and domain tests failed against the old code.
- State: clean once committed. Next: QA 2 (every agreed idea on Plan), QA 4 (empty state), QA 5 (reveal styles A and B).
- Verified with: Docker-free harness (all 13 files); `npm test` 233/233; lint; build; `playwright test --list`.
- Next: those three; then Peter runs the Mac matrix.

### 2026-10-30 14:05 PT — Claude
- Done: QA fix 1 (`docs/plans/2026-10-30-qa-notes.md`): rating up front in the editor, the author can rate their own draft (`20261030000002_author_rates_draft.sql`; 006 updated), a "Saved · [partner] can see this" cue, and Send disabled until there is a message. RED first: 2 database and 5 UI tests failed without the change.
- State: clean once committed. QA fix 2 (Plan shows every agreed idea) next.
- Verified with: Docker-free harness (all 13 files; 006 78/78); `npm test` 228/228; lint; build.
- Next: QA fix 2; then Peter reruns `npx supabase db reset && npx supabase test db` on the Mac.

### 2026-10-30 13:40 PT — Claude
- Done: Task 10 complete. Real stack: 1,038/1,038 pgTAP; `npm run test:e2e` 6/6 from a clean reset. Fixes on the way: `98eb022`, `9a7717e`, `60eb3bd`, `3e33dce`.
- State: clean once committed. Commits since the last push: `6437677` onward (Peter pushes).
- Verified with: real local Supabase stack on Peter's Mac.
- Next: Peter checks the `test-results/` screenshots for contrast and layout. Then Task 11 (privacy operations and the real-content readiness gate). Real content stays out until that gate passes.

### 2026-10-30 12:45 PT — Claude
- Done: Task 10 browser checks written: `e2e/fixtures.ts` (Couple B), `e2e/personal-alpha-loop.spec.ts` (steps 1–13; step 14 is `notifications.spec.ts`), `e2e/responsive.spec.ts` (Step 4), shared helpers in `e2e/local.ts`. Step 6 on the Mac: merge base with `main` is `6118a7a` (planning only); 80 commits and 137 files since then, all in app, database, docs or tooling scope; no credentials, `.env.local`, exports or backups tracked (`.env.example` holds empty placeholders).
- State: clean once committed. Task 10 stays unchecked until the browser checks pass on the real stack.
- Verified with: `npx playwright test --list` (6 tests in 3 files), lint. Not run against a stack.
- Next: on the Mac, run the Step 5 matrix: `npm run lint && npm test && npx supabase db reset && npm run dev:accounts && npx supabase test db && npm run build && npm run test:e2e && git diff --check && git status --short`. Review the screenshots in `test-results/`; then tick Task 10 and record the checkpoint (the synthetic loop works; real content stays blocked on Task 11).

### 2026-10-30 12:15 PT — Claude
- Done: Task 8 real-stack pass and push recorded (Peter: 1,022/1,022). Task 9 test-first: `20261030000001_memory_requires_shared_idea.sql`, `013_memories_test.sql`, `src/features/memories/` (api, composer, list), idea page, Roulette and related-idea wiring, fake `add_memory`, styles.
- State: clean once committed.
- Verified with: Docker-free harness 1,038/1,038; `npm test` 222/222; lint; build. Not yet on the real stack; no screenshots yet.
- Next: on the Mac, `npx supabase db reset && npx supabase test db` (expect 1,038 across 13 files) and `npx supabase gen types typescript --local > src/types/database.ts` (expected unchanged), then push. Then Task 10 (the complete synthetic responsive loop), which extends `e2e/` and includes the visual and accessibility pass.

### 2026-10-30 11:30 PT — Claude
- Done: re-reviewed Codex's Task 8 (`a56658b..7e10026`) with independent specification and code-quality reviews; fixed the high and medium findings and most lows test-first (`20261030000000_roulette_review_fixes.sql`, inbox error semantics, Spin mounting and focus, OU411 recovery, fake parity, 012 regressions).
- State: clean once committed. Task 8 stays checked; it needs the real-stack run below before pushing.
- Verified with: Docker-free harness 1,022/1,022; `npm test` 210/210; lint; build.
- Next: on the Mac, `npx supabase db reset && npx supabase test db` (expect 1,022 across 12 files), `npx supabase gen types typescript --local > src/types/database.ts` (expected unchanged: signatures did not change), `npm run build`; then push. Then Task 9 (memories and expansion).

### 2026-10-30 10:13 PT — Codex
- Done: resolved the final Task 8 review findings (`ecd56c3` plus this commit): successful Accept and Leave-for-later outcomes transfer keyboard focus to the next Spin action; the committed dblink race fixture is pre-cleaned as well as end-cleaned; the reduced-motion regression no longer adds Node test types to the browser ambient declarations; and the optional result reveal animates copy only, never the decision controls.
- State: clean once committed; Task 8 is ready for specification and code-quality re-review.
- Verified with: real local Supabase stack (focused Roulette 42/42 twice without reset; full database suite 998/998); focused Roulette UI 12/12; full unit/component suite 204/204; lint; production build (160 modules); database lint with only the pre-existing `mark_item_seen.target` warning; diff check.
- Next: re-run independent Task 8 specification and code-quality reviews; if approved, push the Task 8 commits. Then begin Task 9 (memories and expansion).

### 2026-10-29 21:20 PT — Codex
- Done: Task 8 implemented test-first and review findings resolved: safe server-selected Roulette, accepted/deferred outcomes, accepted-state and focus preservation, Plan integration, fake-client parity, resilient database isolation/concurrency coverage, generated types, and ExecPlan evidence.
- State: clean once committed.
- Verified with: real local Supabase stack (998/998 pgTAP; focused Roulette 42/42 twice without reset); focused Roulette UI (12/12); lint; full unit/component suite (204/204); production build (160 modules); database lint with only the pre-existing `mark_item_seen.target` warning; diff check.
- Next: independent Task 8 specification and code-quality reviews, then push if approved. After that, Task 9 (memories and expansion).

### 2026-10-29 19:40 PT — Claude
- Done: Task 7D complete (7D.1 Codex; 7D.2–7D.5 and review fixes Claude: `7c35ecc`, `6a3a1e7`, `34672f8`, `b8b0b12`, `d55cd4f`, `6b6bbfc`, `2070fa1`, `52226fb`, `0e2a226`). Peter kept the share email's lead line for the alpha (Decision Log).
- State: clean once committed.
- Verified with: real Supabase stack (956/956 pgTAP; browser loop 1/1).
- Next: Task 8 (safe Roulette selection and outcomes). Read its section and the v2 doc's Plan rules first.

### 2026-10-29 19:35 PT — Claude
- Done: Task 7D.5 complete. Review fixes `52226fb` verified on the real stack (956/956 pgTAP; browser loop 1/1).
- State: clean once committed. Task 7D stays unchecked for one decision: whether the share email keeps "Your partner shared something with you." or drops to the link line (spec review M2; the 7D design says copy never names a person or event).
- Verified with: real Supabase stack on Peter's Mac.
- Next: apply Peter's wording decision to `scripts/lib/notify.mjs` and its tests (and the design doc if the line is kept), then tick Task 7D. Then Task 8 (Roulette).

### 2026-10-29 19:10 PT — Claude
- Done: 7D.5 real loop passed on Peter's Mac; ran independent spec and code-quality reviews; fixed all medium findings and most low ones test-first (`20261029000003_notification_review_fixes.sql`, worker bookkeeping, 011 hardening, e2e id guard). Corrected the 7D.3 count to 925, confirmed on the real stack.
- State: clean once committed. 7D.5 and 7D stay unchecked until the real stack reruns with `20261029000003`, and until Peter decides the share email's wording (see below).
- Verified with: Docker-free harness 956/956 (the six new cases fail without the fix); `npm test` 192/192; lint; tsc; `playwright test --list`.
- Next: on the Mac, `npx supabase db reset && npx supabase test db` (expect 956 across 11 files), `npm run dev:accounts`, `npx playwright test e2e/notifications.spec.ts`. Peter decides whether the share email keeps "Your partner shared something with you." (the 7D design says copy never names a person or event). Then tick 7D.5 and 7D.

### 2026-10-29 18:30 PT — Claude
- Done: wrote the Task 7D.5 browser check (`e2e/notifications.spec.ts`, `e2e/local.ts`, `playwright.config.ts`) and excluded `e2e/**` from vitest. In one run it covers: a share seen within its grace period (no email); an unseen share (one email); a live reply in an open idea (appears without a refresh, acknowledgement recorded); one digest collecting a reply, an agreement, a co-edit and a hold across two ideas; an entirely seen digest (no email); a partly seen digest (one email); and raw-message checks (Message-ID, From, To, subject, body, generic SMTP greeting, and no titles, descriptions, replies, reason, category, names, private ids, Mac hostname or keys).
- State: clean once committed. Task 7D.5 remains unchecked until the spec passes on the real stack.
- Verified with: container only. `npm run lint`, `npx tsc -b`, `npm test` 189/189, and `npx playwright test --list` (1 test). Not yet run against a real stack.
- Next: on the Mac, `npx supabase db reset && npx supabase test db` (expect 921/11), `npm run dev:accounts`, `npx playwright install chromium` (first time only), then `npx playwright test e2e/notifications.spec.ts`. On a pass, record the evidence, run `npm run verify` and `git diff --check`, run the independent reviews, then tick 7D.5 and 7D.

### 2026-10-29 17:35 PT — Claude
- Done: Task 7D.4 test-first (generic digest template; worker unchanged). Earlier this session: 7D.2 (`7c35ecc`, types `6a3a1e7`), 7D.3 (`34672f8`, `b8b0b12`).
- State: clean once committed. Task 7D.5 (real two-account Mailpit loop) and the Task 7D wrap-up reviews are open.
- Verified with: unit tests and lint (container). The 7D.3 real-stack run is still pending on the Mac.
- Next: on the Mac, `npx supabase db reset && npx supabase test db` (expect 921 across 11 files), then Task 7D.5 against the real local stack and Mailpit.

### 2026-10-29 17:30 PT — Claude
- Done: Task 7D.3 test-first (claim-time revalidation against exact acknowledgements) in the new migration `20261029000002_claim_seen_revalidation.sql`; extended 011. Earlier this session: 7D.2 (`7c35ecc`) and regenerated types (`6a3a1e7`).
- State: clean once committed. 7D.4 (generic digest template and delivery) and 7D.5 (real Mailpit loop) are open.
- Verified with: Docker-free harness (921/921). Not yet on the real Supabase stack.
- Next: on the Mac, `npx supabase db reset && npx supabase test db` (expect 921 across 11 files). Then Task 7D.4: add the `activity_digest` copy ("There are updates waiting in Ours.") to `scripts/lib/notify.mjs` and prove a delivery's Message-ID stays `<outboxId@ours.localhost>` across retries.

### 2026-10-29 PT — Claude
- Done: Task 7D.2 test-first. Added `20261029000001_notification_batches.sql` and `011_notification_batches_test.sql`; rewrote 008 and 009 onto the link table; fixed 005's cleanup; dropped `item_id` from the worker test fixtures. Also includes Codex's 7D.3 file-list correction (`...000001_notification_batches.sql`).
- State: clean once committed. 7D.3 through 7D.5 are open. Until 7D.4 adds the digest template, the worker would fail `activity_digest` rows with `send_failed` (they are not due for an hour, and no hosted delivery exists).
- Verified with: Docker-free harness (906/906), lint, tsc, unit 183/183; Peter then ran the real-stack reset/test, type regeneration and build on his Mac.
- Next: on the Mac, run `npx supabase db reset && npx supabase test db`, then `npx supabase gen types typescript --local > src/types/database.ts` and `npm run build`; commit the regenerated types. Then Task 7D.3 (claim-time revalidation against `activity_event_acknowledgements`, using `notification_outbox_events.suppressed_at`).

### 2026-10-29 09:32 PT — Codex
- Done: completed Task 7D.1 test-first. Added the authenticated content-free Realtime context, immutable serialized refetch snapshots, visibility/editor presentation guards, lossless pending-ID accumulation, exact event/member acknowledgements, and an initial capture-before-refetch boundary. Updated the notification design and Task 7D.3 to use exact acknowledgements rather than timestamp inference.
- State: Task 7D.1 is complete and ready to commit; overall Task 7D remains open. The only schema addition is the private identifier/timestamp-only acknowledgement table and its write function. No notification delivery behavior, credentials, real/private content, or production data changed.
- Verified with: focused RED/GREEN component and pgTAP regressions; clean local database reset; **820/820 database assertions across 10 files**; database lint with only the known old `mark_item_seen` warning; lint; **183/183 unit/component tests across 15 files**; production build (**158 modules**); diff check; and independent architecture, data-model, and test reviews with no remaining P1/P2 findings.
- Next: commit and push Task 7D.1, then implement Task 7D.2 test-first (`20261029000001_notification_batches.sql` and `011_notification_batches_test.sql`).

### 2026-10-29 08:44 PT — Codex
- Done: replanned Task 7D around unseen activity rather than unconditional event email. Added the approved notification-cadence design and a five-part test-first implementation plan: Realtime viewing acknowledgement, delivery batches, send-time seen revalidation, generic batch rendering, and a real two-account Mailpit gate.
- State: planning-only changes ready to commit. Task 7D implementation remains unchecked and no schema/application code has changed.
- Reviewed: two independent plan reviews drove permanent `sealed_at` membership, exact migration away from single-item outbox rows, tenant-coherent event links, preservation of 7B tests, dirty-editor acknowledgement guards, serialized immutable Realtime snapshots, and an enqueue-vs-claim row-lock contract with a true concurrency test.
- Next: commit and push this approved planning revision; then implement Task 7D.1 test-first in a new execution turn.

### 2026-10-28 22:26 PT — Codex
- Done: completed Task 7C with pure line attribution, an optional authorship view for live and archived ideas, explicit author/date text, self/partner tints, toggle and phone swipe access, reduced-motion handling, and stable direct editing while revisions load. Fixed the independent spec review's timestamp grouping and touch-delivery findings.
- State: Task 7C checked and ready to commit; no schema changes and no real/private content added. Local ignored state contains only synthetic accounts, ideas, screenshots, and build/test output.
- Verified with: test-first focused regressions; lint; **163/163 unit/component tests across 15 files**; build (**157 modules**); diff check; independent spec and quality reviews; and a real local two-account Chrome flow at 320×640 and 1280×800 with no overflow and reduced motion confirmed. `npm run verify` cannot run its two final future privacy checks because their referenced Task 11 scripts do not exist on the branch.
- Next: commit Task 7C, then plan Task 7D before implementation.

### 2026-10-28 16:38 PT — Codex
- Done: hardened Task 7B recipient cardinality and retry identity after review. Added the forward-only migration, malformed-membership pgTAP coverage, deterministic content-free Message-ID, raw-send privacy coverage, honest at-least-once documentation, and a Task 10 raw-Mailpit regression note.
- State: Task 7B remains checked after the complete local gate. Clean after the Task 7B hardening commit.
- Verified with: clean real Docker-backed Supabase reset; **805 pgTAP assertions across 9 files**; focused notification tests **9/9**; full unit suite **152 tests across 13 files**; lint; build; DB lint; diff check; ACL audit; and a synthetic user-facing share inspected in Mailpit raw form.
- Next: commit this Task 7B hardening only. Do not begin Task 7C or 7D in this session.

### 2026-10-28 16:28 PT — Codex
- Done: completed Task 7B's real Mac/Supabase/Mailpit gate and fixed the SMTP greeting privacy leak. The new regression test was RED when `localSmtpTransportOptions` did not exist, then GREEN after the worker adopted the generic `ours.localhost` client name.
- State: clean after the Task 7B verification commit.
- Verified with: real Docker-backed Supabase (**797 pgTAP assertions**), local synthetic accounts and RPCs, local worker and Mailpit raw messages, plus lint, **150 unit tests**, build, and diff check.
- Next: Task 7C, line-level "Who wrote what" attribution inside the idea sheet.

### 2026-10-27 01:30 PT — Claude
- Done, all small follow-ups to 6D from Peter's review:
  - Answer buttons trimmed (`da66881`).
  - "they're into it" (`42d164b`), with the rating styled as a value (`cf62fee`).
  - Account menu top right with a person icon (`1a6e310`).
  - Rows wrap (`b49aae6`).
  - "New category…" in the inline category menu, with `NewCategory` extracted and shared with `ItemEditor` (`dad0898`).
  - **An idea opens as a sheet** (`IdeaSheet`, a child route of `/ideas`): the list stays mounted and inert, Close/Escape steps back, focus returns to the row, and the back arrow is gone.
- State: clean.
- Verified with: Linux container (lint clean, build passes, **148 tests**) and Playwright at 390 and 1280 px (open, scroll and close; focus returns to the row; no console errors). Mac pass still owed.
- Next: Peter's Mac checks (7B Mailpit, 6D, the sheet). Then Task 7C (who wrote what) inside the sheet's description.

### 2026-10-27 00:40 PT — Claude
- Done: Task 6D.
  - **Header:** a bare back arrow; the title row with my heart (`FavoriteButton`) and a "⋯" `IdeaMenu` (Remix, Delete…); Archive only as "Archive instead" when Delete is refused.
  - **Editing in place:** `InlineIdeaFields` edits the title, description and category in place and saves on blur with the expected version.
    - OU409 shows "Alex just changed this: See theirs / Keep mine".
    - When the partner is In, the save is held for `ASKED_AGAIN_DELAY_MS` (5 s) behind "Alex will be asked again · Undo". Undo writes nothing, and leaving the page flushes the held save.
    - The edit page is removed (`/ideas/:id/edit` → `EditRedirect`), along with `ItemEditor`'s edit path. `ItemEditor` now only creates and remixes.
  - **Answers:** two cards, with my interest as a select on my card. Buttons: I'm in / Not now…, or Not now… / Take back my yes, or I'm in / Undecided. The permission line shows only while I haven't answered, and "Ready to plan" appears when agreed. The heading, chip, "You're in." line and radio rows are gone.
  - **Trims:** the chat has no heading, the placeholder "Write to Alex…" and a Send button. The byline is one relative time via a new `formatAgo`. History is hidden below 2 versions; Memories are hidden until agreed or one exists; drafts show one line beside Share.
  - **App-wide:** `AccountMenu` (name + Sign out) moved into the tab bar, and the wordmark row is hidden under 40rem.
  - **Tests:** `ItemDetailPage`/`ItemLifecycle`/`ResponseControls` tests were consolidated into `IdeaDetail.test.tsx` (41 tests).
- State: clean.
- Verified with: Linux container (lint clean, build passes, **137 tests**) and Playwright on the in-memory client at 320, 390 and 1280 px (no overflow, no console errors).
  - RED was observed only as the new test file failing to build against the old code, not behavior by behavior.
  - Mac pass still owed.
- Decision: the New idea and Remix still use the form editor, because an idea can't exist without a title and description. Making New inline would mean creating a row on the first keystroke; revisit if the form feels out of place.
- Next: Peter's Mac checks (7B Mailpit + 6D). Then Task 7C, which builds on `InlineIdeaFields`' description.

### 2026-10-26 23:35 PT — Claude
- Done: added Task 6D (idea page cleanup) from Peter's review, sequenced after 7B and before 7C. Peter approved the "asked again" behavior; the save is held 5 s behind Undo when the partner is In.
- State: clean (docs only).
- Next: Task 6D. 7B still awaits Peter's Mac + Mailpit check.

### 2026-10-26 23:20 PT — Claude
- Done: Task 7B steps 1–4.
  - Migration `20261027000001_notification_outbox.sql`:
    - `notification_kind` enum and the `notification_outbox` table (ids, kind, timestamps and counters only; the error code is constrained to `^[a-z0-9_]{1,40}$`).
    - One outbox intent per recipient, kind and item. The item foreign key cascades on delete.
    - RLS is on, and grants are revoked from every API role.
    - A trigger on `activity_events` (`item_created`/`item_remixed`) enqueues one row for the other member.
    - `claim_notifications` / `mark_notification_sent` / `mark_notification_failed` are `service_role` only. Claims use `SKIP LOCKED`, re-claim after 10 minutes, and give up after 5 attempts.
  - `scripts/lib/notify.mjs` is a pure renderer plus delivery loop, with unit tests.
  - `scripts/notify-worker.mjs` (`npm run notify:worker`) is local-only, delivers to Mailpit SMTP 54425 (`[local_smtp] smtp_port` is now set), and logs counts only.
  - New dev dependency: `nodemailer`.
- State: clean.
- Verified with: Docker-free harness (**797 assertions**; `008_notification_outbox_test.sql` has 30) and the Linux container (lint clean, **127 tests**).
- Not verified: the real stack and Mailpit.
- Surprise: `npm run check:repo` / `check:bundle` point at scripts that don't exist yet. They belong to Task 10/11, and `npm run verify` will fail until then.
- Next, for Peter on the Mac:
  1. `npm install`. The `smtp_port` change needs a restart: `npx supabase stop && npx supabase start`. Then `npx supabase migration up` (or `db reset` + `npm run dev:accounts`).
  2. `npx supabase test db` (expect 797), then `npm run lint && npm test && npm run build`.
  3. `npm run notify:worker` in a terminal next to `npm run dev`.
  4. Under normal operation, A shares an idea → one email appears in Mailpit (http://127.0.0.1:54424) addressed to partner B. The subject, body and headers carry no title or name. Editing or replying sends nothing; a second share sends one additional email. Delivery is at-least-once, so an ambiguous post-send crash may retry with the same deterministic Message-ID.
  - Then tick 7B and start 7C.

### 2026-10-26 22:45 PT — Claude
- Done: replanned with Peter. The order is 7B (one content-free email per share), then 7C (line-level "who wrote what", hidden by default, from Apple Notes), then 7D (more email updates, opt-in).
- State: clean (docs only).
- Next: Task 7B, step 1.

### 2026-10-26 22:30 PT — Claude
- Done: live updates. Peter's report: the partner had to refresh to see a share.
  - Migration `20261027000000_realtime_activity.sql` publishes **only** `activity_events` to `supabase_realtime`.
  - `useLiveUpdates()` in the shell subscribes to INSERTs (channel `ours-activity`). It ignores the payload and, after a 250 ms settle, invalidates the palette, activity and roulette keys.
  - The four inbox queries also poll every 30 s while the tab is visible, which covers deletes and anything else that records no event.
  - Test `007_realtime_test.sql` asserts that no other public table is published. The harness shim now creates the publication the real stack provides.
  - Earlier the same evening: "Not now" state → "On hold", the Refine checkbox fix, the "Shared · My drafts" segments, and the real-content importer parked behind Task 11.
- State: clean.
- Verified with: Docker-free harness (767 assertions) and the Linux container (lint clean, 121 tests). Not run on the Mac yet.
- Next:
  - Peter applies the migration with `npx supabase migration up` (or `db reset` + `npm run dev:accounts`), then runs `npx supabase test db` (expect 767) and `npm run lint && npm test && npm run build`. Then a two-window check: A shares, and B's list updates within about a second.
  - Known gap: a message that arrives while the partner has that idea open still marks it unread. `useMarkSeen` marks once per visit and could re-mark when the thread changes.
  - Then Task 7B.

### 2026-10-26 22:10 PT — Claude
- Done: removed Respond at Peter's direction (see the v2 doc's "Amendment: Respond removed").
  - Ideas · Drafts only.
  - "Your turn" (`InboxEntry.yourTurn`) is pinned and styled: a tint, an accent edge and a tag.
  - "Unread" (`InboxEntry.unread`, which now includes never-opened ideas) is shown as bold with a dot.
  - `tabAttention()` drives dots on both the Ideas and Plan tabs.
  - A Not now idea with an unread reply stays visible.
- State: clean.
- Verified with: Linux container, mocked backend. Lint clean, build passes, 118 tests pass, and 390 px screenshots checked. The Mac pass is still owed (same as 6C).
- Next: Peter runs the Mac checks and the two-window walkthrough, then Task 7B.

### 2026-10-26 21:30 PT — Claude
- Done: Task 6C, the UI rebuilt to the Final IA.
  - `/` → `/ideas`, with Drafts · Ideas · Respond (`?view=drafts|respond`) and Plan (`/plan`, `/plan/agreed`).
  - Bottom tab bar: a dot on Ideas when Respond has items.
  - Inbox rows show an avatar, title, latest-activity line and relative time; rows that need me are bold with a dot.
  - Refine sheet: category, interest, favorites, Show Not now.
  - Idea detail: side-by-side answers; I'm in / Edit / Not now…; interest and favorite as secondary controls.
  - `/experiences/*` and `/palette/*` redirect, and `/roulette` → `/plan`.
  - Removed: `LibraryPage`, `ItemCard`, the old view model and 54 dead CSS rules.
- State: clean.
- Verified with: Linux container (mocked backend), lint, build, 119 tests, and Playwright screenshots. Not yet run on the Mac (see evidence).
- Next: Peter runs the Mac checks and a two-window walkthrough. Then Task 7B (one content-free email per share). Then Task 8: Spin goes in the Plan `.spin-panel`, which is a disabled placeholder today, and its pool is `selectIdeaView(entries, "agreed", {})`.

### 2026-10-26 17:35 PT — Claude
- Done: IA review with Peter over three rounds on the "Ours IA proposals" design canvas; Final IA recorded in the v2 doc; Task 6C added; Task 7 superseded.
- State: clean (docs only).
- Next: Task 6C per its steps.

### 2026-10-25 23:20 PT — Claude
- Done: Task 6B (see evidence). Peter chose "Experiences" and "Share with [partner]".
- State: clean after the `feat: add experience views and sharing lifecycle` commit. The UI and schema are consistent again: drafts can be shared, Not now asks why, and delete works.
- Verified with: unit/component tests (125), lint, build, the Docker-free DB harness (763), and a mocked-backend browser pass. Real stack pending (see "Owed on the Mac").
- Not done (candidates for Task 7): an in-detail notice of what the partner changed since my last visit (data exists: revisions plus `item_views`); a nav-level badge; the Home "Waiting on you" queue that combines New, Needs your decision, and unread messages (`ACTION_STAGES` and `hasUnreadMessages` are ready to reuse).
- Next: Task 7 (Home action queue and feed), then 7B (email on share).

### 2026-10-25 22:45 PT — Claude
- Done: Task 6A schema and tests (see evidence). Peter confirmed co-editing ("Ready applies to a version") and one email per submission.
- State: clean after the `feat: add item lifecycle, co-editing, and review state` commit. **The UI is mid-transition until Task 6B:** after a `db reset`, new items are created as drafts and there is no Submit button yet, so a partner won't see newly created items. Existing UI calls still work (`update_item` without the version argument, ready/pending decisions). The UI does not yet offer Not now (the old radio now gets "not now requires a reason").
- Verified with: Docker-free harness only (763/763). Real stack and type regeneration pending on the Mac.
- Next: (1) on the Mac, `npx supabase db reset && npx supabase test db`, then `npx supabase gen types typescript --local > src/types/database.ts`; (2) Task 6B — Mine / Theirs / Ours / Not now views, Save draft / Submit, New and unread styling via `item_views`, a decline-with-reason dialog, co-edit with `p_expected_updated_at` and stale-save handling, and author delete; (3) settle naming (Palette → ?), which is open in the v2 doc.

### 2026-10-25 22:15 PT — Claude
- Done: captured Peter's usability direction as `docs/plans/2026-10-25-interaction-model-v2.md` (lifecycle, views, action queue, chat, email notifications). Replanned Progress (Tasks 6A, 6B, revised 7, 7B) and pointed `AGENTS.md` and the original design doc at v2.
- State: clean after the docs commit. No code changes.
- Next: **blocked on Peter** confirming the six open questions in the v2 doc. Then write detailed Task 6A steps (migration: `items.status`, draft RLS, `submit_item`, `item_views`/`mark_item_seen`, Not-now reason, `delete_item`) and implement test-first.

### 2026-10-25 22:05 PT — Claude
- Done: Task 6 (item detail, independent response controls, comments, collapsed history, creator-only edit/archive, remix).
- State: clean after the `feat: add partner responses and item detail` commit.
- Verified with: 94 unit/component tests, lint, and build on Linux; a mocked-backend Playwright run. No database changes.
- Next: (1) Peter tries two-partner responses on the real local stack (A and B in separate windows); (2) Task 7 — activity feed and home attention states. Coalesce `response_changed` bursts, and remember that `activity_events.metadata` never carries content.

### 2026-10-25 21:35 PT — Claude
- Done: `npm run dev:accounts` now works on the real stack after three fixes (seed token columns, create before listing, member mapping via `docker exec` as `postgres`). Peter confirmed sign-in plus palette create and browse on the real local stack.
- State: clean.
- Next: Task 6 (item detail, responses, comments, history, edit, remix). To try the app locally: `npx supabase start && npx supabase db reset && npm run dev:accounts && npm run dev`.

### 2026-10-25 21:10 PT — Claude
- Done: Task 5 (domain model, palette API and queries, item editor with inline categories, library with URL filters, cards, empty states).
- State: clean after the `feat: add palette creation and browsing` commit.
- Verified with: unit/component tests (70), lint, and build on Linux; mocked-backend Playwright flow. No database changes.
- Next: (1) on the Mac, `npm run lint && npm test && npm run build`; (2) Task 6 — item detail, responses, comments, history, edit, and remix. Reuse `ItemEditor` for edit/remix (props `initial`, `sourceItemId`, `sourceMemoryId`), add `get`/`responses`/`comments` reads to `src/features/palette/api.ts`, and extend the fake client in `src/test/testUtils.tsx` (`handlers` map) for the new RPCs.

### 2026-10-25 20:45 PT — Claude
- Done: Task 4 (closed sign-in, auth boundary, member resolution, sign-out clearing, responsive shell, six routes with content-free placeholder bodies).
- State: clean after the `feat: add closed alpha authentication` commit.
- Verified with: unit/component tests, lint, and build on Linux; mocked-backend Playwright smoke test. No database changes, so the DB suite is unaffected (683/683).
- Mac parity: confirmed 20:35 PT (26/26, lint and build pass).
- Next: Task 5 — categories, item creation, and the library. Replace the `RoutePlaceholder` bodies for `/palette` and `/palette/new` in `src/app/AppRouter.tsx`, and read the signed-in member with `useMember()` from `src/features/auth/currentMemberContext.ts`.

### 2026-10-25 20:25 PT — Claude
- Done: Peter ran the authoritative DB suite on the Mac: 683/683 PASS. Disabled local analytics in `supabase/config.toml` so `supabase start` passes its health checks.
- State: clean after this commit. Task 3 is fully verified.
- Verified with: real Supabase stack (Mac) and the Docker-free harness, which give identical results.
- Next: Task 4 — write the failing auth tests (`src/features/auth/AlphaSignIn.test.tsx`). Types and schema lint are done (20:24 PT).

### 2026-10-25 20:05 PT — Claude
- Done: picked up after Codex ran out of credits. Reviewed Task 3 (`93427ed`) against the plan: all three predicates and nine write functions present; RLS/grant tests present. Re-verified Task 3 with the Docker-free harness (683/683) and lint/unit/build. Added `AGENTS.md` + `CLAUDE.md` (shared Codex/Claude handoff protocol), `scripts/pg-harness/`, this Session Log, and Task 3 evidence.
- State: clean after the `docs:`/`chore:` commit that adds these files.
- Verified with: Docker-free harness; real Supabase stack **not** re-run.
- Next: (1) on the Mac, run `npx supabase db reset && npx supabase test db` and `npx supabase db lint --local --level warning` and note the result here; (2) Task 4 — start by regenerating `src/types/database.ts`, then write the failing auth tests.

### 2026-10-25 19:41 PT — Codex (reconstructed by Claude)
- Done: Task 3 implementation committed as `93427ed`.
- State: clean; ExecPlan Progress/evidence were not updated before credits ran out.

## Decision Log

- **2026-10-23 — Two Auth users:** Selected over a shared account or passcode server to preserve partner attribution and direct RLS mapping.
- **2026-10-23 — Feed-led home:** Selected because noticing partner activity is a named alpha success criterion.
- **2026-10-23 — Four-state interest scale:** Selected to keep language human and avoid aggregate/numeric scoring. Favorite and Roulette remain independent.
- **2026-10-23 — Single category and flat comments:** Selected as the smallest structure that satisfies the approved experience; tags and threads are deferred.
- **2026-10-23 — Creator-owned originals:** Only the creator edits or archives an original; the partner comments or remixes, preserving authorship while supporting co-creation.
- **2026-10-23 — Explicit creator activation:** Creating an item never opts its creator into Roulette.
- **2026-10-23 — Ephemeral spin-again:** Only accepted/deferred outcomes persist, avoiding a rejection trail.
- **2026-10-23 — Function-only browser writes:** RLS-protected tables are readable but not directly writable by browser roles. Narrow Postgres functions derive actor/couple and protect immutable identity fields.
- **2026-10-23 — Idempotent create retries:** Create-style functions accept a client request UUID and enforce one result per actor/request pair, preventing duplicate items, comments, draws, or memories after ambiguous failures.
- **2026-10-23 — Persistent session, cleared private state:** Supabase session persistence supports repeat alpha use; visible sign-out clears session, query cache, router state, drafts, and rendered private UI before an identity change.
- **2026-10-23 — Database-owned security transitions:** Actor derivation, revision/activity triggers, and Roulette revalidation live in Postgres rather than relying on UI discipline.
- **2026-10-23 — Synthetic-only implementation:** Remote identities, credentials, and real personal material remain outside this plan's implementation work.
- **2026-10-25 — Membership serialization during item creation:** The item couple and creator foreign keys are initially deferred so their key-share locks cannot precede and deadlock with initialization; category and lineage foreign keys remain immediate to reject invalid or cyclic lineage promptly. The trigger takes the couple row lock first, locks existing member rows in UUID order, validates and captures that single set, then initializes responses from the captured ids. This gives concurrent item creation plus member insertion, deletion, and reassignment a consistent serialization boundary and avoids both lock upgrades and a count-then-requery race.

## Decision Log Additions (beyond two partners, Peter, 2026-11-03)

- **Not now; recorded for later.** The alpha stays exactly two partners per couple.
- **The realistic next shape is one person with several separate partners.** Each relationship is its own private space, and the person switches between spaces. An idea may be copied into another space, but nothing is ever visible across spaces. The couple stays the privacy wall, so RLS and the isolation tests keep their meaning. The schema already names things `couples`/`members` so this stays cheap.
- **Rejected: solo-only use.** A space of one, with Plan locked until someone joins, "doesn't go anywhere".
- **Out of scope: more than two people in one shared space.** It would redefine agreement, Later, the deck and who sees a "not for me".

## Decision Log Additions (Task 10, Claude, 2026-10-30)

- **`npm run test:e2e` needs a fresh local reset.** Run `npx supabase db reset && npm run dev:accounts` first. `notifications.spec.ts` requires an empty couple and runs first (files run alphabetically, one worker). The loop and layout specs add per-run name suffixes so they don't depend on it.
- **Couple B is a fixture, not seed data.** `e2e/fixtures.ts` creates two login-capable synthetic users through the local Auth admin API (local service key from `supabase status`, never printed) plus the couple and its two members through local SQL. Before and after the run it removes only those fixed ids.
- **Step 4 is automated where it can be.** `e2e/responsive.spec.ts` checks for no sideways scrolling at 320 and 1280 CSS pixels on sign-in, Ideas, New idea, idea detail, the memory composer, Plan, a Spin result and Agreed. It also covers keyboard-only Spin with a visible focus indicator and focus moving to the result, and reduced motion removing the reveal while every control stays visible and enabled. Colour contrast is reviewed by eye from the screenshots it writes to the ignored `test-results/`.
- **Whitespace exceptions.** `git diff --check` against the planning base flags trailing whitespace only in generated `src/types/database.ts` (regenerated, never hand-edited) and a trailing blank line in `20261030000000_roulette_review_fixes.sql` (committed and pushed, so it stays under the append-only rule). `ItemEditor.tsx`'s trailing blank line was fixed.

## Decision Log Additions (Task 9, Claude, 2026-10-30)

- **Memories stay where 6D put them.** The plan says the idea page "always offers Add a memory"; since 6D, Peter's no-redundancy cleanup shows Memories only once you're both in, or once one exists. Add a memory lives in that section, so the 6D rule stands.
- **"Create a related idea", not "item".** v2 copy calls items ideas; the action keeps the design's meaning, with both lineage links.
- **A memory needs a shared idea.** Drafts are private and haven't been tried together; `add_memory` refuses them as if the idea didn't exist.

## Decision Log Additions (Task 8 review, Claude, 2026-10-30)

- **Roulette recording locks FOR NO KEY UPDATE.** Same rule as the 7D enqueue: serialize against revocations, edits, archives and member updates, but never take a lock that conflicts with foreign-key KEY SHARE. A partner's reply now waits briefly behind an open recording (the enqueue's couple lock) instead of deadlocking with it.
- **A refetch failure with data on screen is not a page error.** `useIdeaInbox` reports `error` only when a query has nothing to show, so pages keep their last good data (and Spin its in-memory result) through a dropped request.
- **Spin is mounted once on Plan.** It renders nothing when nothing is agreed and nothing is on screen; otherwise it keeps its result while the agreed list changes underneath it.
- **`OU411` means "the category you're spinning from is gone."** The panel resets to all agreed ideas and refreshes categories.

## Decision Log Additions (Task 7D, Peter + Codex, 2026-10-29)

- **External notifications cover unseen activity, not every event.** A Realtime connection is not proof of attention. Suppression uses exact event/member acknowledgements written only after a successful, visible presentation; timestamp-only item views are not authoritative.
- **Shares are expedited; conversation updates are bundled.** An unseen share becomes eligible after five minutes. Edits, replies, Not-now decisions, and agreement form one rolling digest eligible one hour after its first event.
- **Seen state is revalidated at claim time.** Activity viewed during the waiting window is removed immediately before delivery; an empty batch sends nothing. The small final-check-to-SMTP race is accepted.
- **Email stays generic and content-free.** A share says something new is waiting; a digest says updates are waiting. Neither reveals kind, count, idea, content, people, or private identifiers.
- **Delivery batches have immutable membership once claimed.** `sealed_at` is separate from retryable `claimed_at`; enqueue and claim lock the same open batch row so an event either joins before sealing or opens the next batch.
- **An empty delivery is suppressed at claim (Claude, 7D.2).** Removing the item FK meant a deleted idea's share row would otherwise survive and send. Deletion already removes the item's activity events, which cascades their links; a claim marks any due delivery with no links as `suppressed_at` and never returns it. 7D.3 extends the same path to acknowledged links.
- **7D.3 is a separate fix-forward migration (Claude, 2026-10-29).** The plan said to fold 7D.3 into 7D.2's migration before committing, but 7D.2 was committed (and applied on Peter's stack) first. `20261029000002_claim_seen_revalidation.sql` replaces only `claim_notifications`; the return shape did not change, so no drop was needed.
- **Notification locks are NO KEY UPDATE; deletes lock deliveries first (Claude, 7D review).** Enqueue still serializes per couple (NO KEY UPDATE conflicts with itself and with member updates and deletes), but no longer conflicts with the KEY SHARE locks every foreign-key check takes. One trade-off: a brand-new member row inserted concurrently is not blocked by an enqueue; membership is provisioned by hand, and the next enqueue fails closed on three members. Item creation's own FOR UPDATE initializer is unchanged, and it cannot cycle with NO KEY UPDATE.
- **A sent-but-unrecorded email is left to expire, not marked failed (Claude, 7D review).** Marking it failed released the claim and sent it again 10 seconds later. Now the claim expires after 10 minutes and is reclaimed, which rechecks seen state; the same Message-ID lets mail clients dedupe the rare repeat.
- **7D.5 is a Playwright spec, and it creates the Task 10 harness early (Claude, 2026-10-29).** Peter chose a script over a manual click-through because digests wait an hour. `playwright.config.ts` (local dev server, one worker, traces, screenshots and video off), `e2e/local.ts` (local-only `docker exec` SQL, Mailpit, worker and sign-in helpers) and `e2e/notifications.spec.ts` now exist; Task 10 extends them rather than creating them. The spec's only privileged write is `makeDue` (synthetic `not_before` backdating within the seeded couple). It refuses to start unless the couple has no items and the outbox is empty, so it needs a fresh `npx supabase db reset && npm run dev:accounts`. `vite.config.ts` now excludes `e2e/**` from vitest.
- **The share email keeps its lead line for now (Peter, 2026-10-29).** The spec review flagged that "Your partner shared something with you." names a person and an event, against the 7D design's copy rule. Peter chose to keep it for the personal alpha ("I don't think this matters right now"); the subject stays "Something new is waiting in Ours". Revisit before anything other than the local test inbox delivers mail.
- **The digest email is one line (Claude, 7D.4).** It has no lead sentence: anything beyond "updates are waiting" would hint at what kind of update, and the subject already says it. The share keeps "Your partner shared something with you."
- **A retry rechecks seen state (Claude, 7D.3).** Every claim, including a retry of a sealed digest, re-runs the acknowledgement check, so a retry covers the same candidates or fewer, never more. A delivery suppressed this way has `claimed_at` cleared and keeps its attempt count.
- **Deliveries are no longer deleted with their idea (Claude, 7D.2).** Only the links go. Test cleanups that delete members must delete the couple's outbox rows first (see 005).
- **The alpha uses a fixed cadence.** Per-person preferences, quiet hours, daily caps, time zones, Web Push, native push, and production provider delivery wait for evidence from real use. The underlying event/seen/batch model remains channel-neutral.

## Decision Log Additions (Task 6C, Claude, 2026-10-26)

- **Live updates use Realtime as a signal only.** Only `activity_events` is published, and its metadata is content-free by check constraint. Realtime enforces the table's RLS for each subscriber, and the client discards the payload and refetches through the normal RLS-scoped queries. So no idea content ever travels over the live channel, and publishing a content table would fail `007_realtime_test.sql`. A 30 s visible-tab poll is the fallback for anything that records no event.

- **Inbox derivation is pure and client-side** (`src/domain/inbox.ts`). One `useIdeaInbox()` hook feeds Ideas, the nav dot and Plan from shared cached queries (items, responses, views, all messages, revision stamps). That's fine at alpha scale (dozens of ideas). A server view is the upgrade path if it grows.
- **Latest-activity line** comes from the share (`submitted_at`), edits (revision > 1) and messages; the latest wins, and on a tie a message beats an edit beats the share. Waiting rows say whom they wait on. Decisions are not events of their own, because `item_responses.updated_at` also moves for interest and favorite. "You're in · waiting on X" is therefore derived from the stage.
- ~~Respond = new | needs my decision | unread~~ — **superseded the same evening:** Respond was removed. Your turn (pinned and tagged) and unread (bold with a dot) are separate signals on Ideas rows, and tab dots cover Plan. Not now rows are excluded from Ideas unless Refine's "Show Not now" (`?notnow=1`) is on or the row has an unread reply.
- **Refine sits on the Ideas view and the agreed list only.** Drafts and Respond are short and unfiltered. The old creator and roulette filters and the sort control are gone; ordering is always by latest activity.
- **Copy:** an answer reads In / Not yet / Not now. Standing reads Your turn / Waiting on X / Agreed / Not now. Taking back a yes is a quiet "Take back my yes" link, not a third radio.

## Decision Log Additions (Task 6A schema, Claude, 2026-10-25)

- **`items.status` defaults to `submitted` at the column level; `create_item` writes `draft` explicitly.** Direct fixture inserts (postgres only) keep their prior meaning, and every browser-created item starts as a draft. A trigger fills `submitted_at` for submitted inserts.
- **Draft privacy is RLS.** `can_read_item(item_id)` (security definer, executable by `authenticated` because policies call it) gates `item_revisions`, `item_responses`, `comments`, and `activity_events`. `items` itself checks `status = 'submitted' or creator = current member`.
- **Submission is the creation event.** Drafts record no activity; draft→submitted records `item_created`/`item_remixed`. No `item_submitted` enum value was needed.
- **One action, one event.** Functions that cause side effects set the transaction-local `ours.suppress_activity` (submit's author-Ready, a co-edit's partner reset, decline's response change and comment) and record a single event themselves where needed.
- **Co-edit concurrency.** `update_item(..., p_expected_updated_at timestamptz default null)` raises SQLSTATE `OU409` "item changed since it was opened" on a stale save. The UI must send the `updated_at` it loaded.
- **Not now.** `set_roulette_decision(..., 'not_now')` is rejected; `decline_item(request_id, item_id, reason)` is the only path. It shares the `add_comment` request-id namespace, so a retry returns the original. `comments.kind` is `message` or `not_now_reason`.
- **Delete.** `delete_item` is author-only and permanent. It uses the transaction-local `ours.allow_item_purge` to remove immutable revisions, and refuses when memories, draws, or remixes reference the item ("archive it instead").
- **Error-message ordering kept.** A cross-couple target still gets "owned item response required" before any draft check, so a request cannot tell whether a foreign id exists.

## Decision Log Additions (v2 direction, Peter, 2026-10-25)

- **Submit = author Ready.** Supersedes "Explicit creator activation" (2026-10-23).
- **Reviewed means opened, not agreed.** New → In review → Ready | Not now.
- **Not now is a destination with a reason and dialogue**, reversible by the decliner; the author may edit or delete.
- **Mine / Theirs / Ours** organize the palette; the action queue covers new, needs-decision, and unread-message items only.
- **Chat, not Q&A.** No question type or resolve state.
- **Email notifications in scope** (content-free, batched); SMS deferred. Supersedes the 2026-10-23 deferral of notifications.

## Decision Log Additions (Task 6)

- **2026-10-25 — No optimistic writes for responses (Claude):** Controls reflect only the row the server returns (written into the item query cache), then palette, activity, and roulette queries are invalidated. While a write is in flight its controls are `aria-disabled` rather than `disabled`, so keyboard focus is not lost; input is ignored until the write settles.
- **2026-10-25 — Arrow keys save each step (Claude):** Native radio groups select on arrow keys, so arrowing through interest saves each value and each meaningful change records a `response_changed` event. **Task 7 should coalesce consecutive `response_changed` events by the same actor on the same item** in the feed rather than change this behavior.
- **2026-10-25 — Partner state is text, not disabled controls (Claude):** The other partner's interest, favorite, and decision render as a definition list, so nothing looks editable that isn't.
- **2026-10-25 — Roulette choices (Claude):** Members pick "Ready for Roulette" or "Not now"; "pending" is shown as "You haven't decided yet" and is not offered as a choice to return to.
- **2026-10-25 — Archived items are read-only (Claude):** Detail still opens (for lineage and history) with an archived note; responses become read-only and Edit/Archive disappear; comments and remix stay available.
- **2026-10-25 — Remix and edit pages (Claude):** `ItemFormPages.tsx` holds `NewItemPage` (blank or remix via `location.state.remixOf`; an archived source category is left blank) and `EditItemPage` (creator only). `ItemEditor` gained `editItemId` and calls `update_item` when set. `NewItemRouteState` also reserves `fromMemory` for Task 9.
- **2026-10-25 — Test fake ids are valid hex UUIDs (Claude):** `nextId` in `testUtils.tsx` maps its readable prefixes to hex digits; the app rejects non-UUID route ids, which is the behavior under test.

## Decision Log Additions (Task 5)

- **2026-10-25 — Data router (Claude):** Switched from `BrowserRouter` to `createBrowserRouter` / `createMemoryRouter` with a shared `appRoutes` table (`src/app/routes.tsx`), because `useBlocker` (unsaved-draft confirmation) works only in data routers. `AuthGate` is the root route element; the private tree renders through `<Outlet />`.
- **2026-10-25 — Client-side library join and filtering (Claude):** The library reads four RLS-scoped lists (active items, responses, categories, members) and joins and filters them in the browser. This avoids PostgREST embedding over the composite `(id, couple_id)` foreign keys and is cheap at one couple's scale. Query keys hold no filter values. Move filtering server-side only if the library grows large.
- **2026-10-25 — Filter encoding (Claude):** URL params are `category`, `creator` (uuid), `interest=<memberId>:<interest|unrated>`, `favorite=<memberId|both>`, `roulette=<pending|ready|not_now>`, and `sort=newest` (default `updated` omitted). Anything else is discarded at parse time.
- **2026-10-25 — Overall vs. per-partner state labels (Claude):** Cards show the derived state ("Pending", "Ready for Roulette", "Not now") once, plus each partner's own short decision ("undecided", "ready", "not now") so the two never read as the same signal. Interest label `low` is now "Low interest", per the design doc.
- **2026-10-25 — Request ids (Claude):** The item editor creates one request id per form and keeps it across retries. Inline category creation does the same, but rotates its id after a unique-name violation, since a new name is a new request.
- **2026-10-25 — Edit route deferred (Claude):** `updateItem` and `archiveItem` API functions exist, but the `/palette/:itemId/edit` UI stays a placeholder until Task 6, which owns item detail and history. `ItemEditor` already accepts `initial` and source ids for the remix flow.

## Decision Log Additions (Task 4)

- **2026-10-25 — Explicit `signing_out` state (Claude):** Sign-out first unmounts the private tree into a neutral loading state, then clears the TanStack Query cache, then ends the Supabase session (with a local-scope fallback if the server call fails), and only then renders sign-in. A tested `MutationObserver` check confirms the cache is empty and no private UI exists when the sign-in form first appears.
- **2026-10-25 — Identity-keyed private tree (Claude):** `MemberBoundary` is keyed by auth user id, and `AuthProvider` clears the query cache whenever the session user id changes, including silent switches from another tab.
- **2026-10-25 — Signed-out deep links are dropped (Claude):** While signed out, any path, query, hash, or history state is replaced with `/` before sign-in renders. The next identity never inherits the previous route, and private ids never stay in the address bar. Post-login redirect is deferred.
- **2026-10-25 — Injected client (Claude):** `AppProviders` receives the Supabase client (`SupabaseContext`), so tests use an in-memory fake (`src/test/testUtils.tsx`) and only `main.tsx` reads env. Contexts live in separate `*.ts` files to satisfy react-refresh lint.
- **2026-10-25 — Title owned by the shell (Claude):** `APP_TITLE` in `src/domain/constants.ts`; `AppShell` resets `document.title` on every route change so later pages cannot leak item titles into the tab.

## Surprises and Discoveries

- **2026-10-30 (Task 10):** On a freshly reset local stack, GoTrue's admin `listUsers` returns 500, because seeded `auth.users` rows hold values it can't serialize. Look users up with local SQL; never list them (`dev-accounts` already avoids it).
- **2026-10-30 (Task 10):** An idea opens as a modal sheet whose backdrop covers the header, so the Account menu can't be reached while one is open. This is intended; browser tests must close the sheet or act from a list.
- **2026-10-30 (Task 10):** With no `actionTimeout`, Playwright retries a blocked click until the whole test times out, with no hint where. The config now bounds actions at 15 s and navigation at 30 s, and the loop runs as named steps.
- **2026-10-30 (Task 10):** On the Mac, the first render in a test file can exceed Testing Library's 1 s default, because each file gets a fresh jsdom, all files run in parallel, and the app loads cold. `src/test/setup.ts` sets `asyncUtilTimeout` to 5 s.

- **2026-10-29 (Codex, Task 7D.1):** `Promise.all` rejects before slower protected refetches settle, so using it as a cycle barrier can start a retry while an earlier protected read is still in flight. Live-update cycles use `Promise.allSettled` and fail the cycle after every read settles. Seen writes need both a client trigger identity (item, live sequence, and visibility opportunity) and persisted exact event identities: timestamps can tie, commit order can differ from timestamp order, and a wall-clock write after event B can falsely imply B was presented with A. Initial viewing therefore captures ids before refetching, pending snapshots accumulate in an id-keyed set, and external suppression uses exact event/member acknowledgements rather than `last_seen_at`.

- **2026-10-28 (Codex, Task 7B):** SMTP libraries may announce the operating system hostname during the `EHLO` handshake, and Mailpit records it in the raw `Received` header. On a personal Mac that hostname can contain a person's name even when the application subject and body are content-free. Local notification transports now set the generic client name `ours.localhost`, and the regression test inspects the exact transport options.

- **2026-10-26 (Claude):** On Peter's Mac, after `migration up` (not `db reset`), `001_schema_test.sql` failed from test 260 with "authenticated member required". The cause: `npm run dev:accounts` re-points the seeded members at local sign-in accounts, and 001 acts as the *seeded* auth users. 001 now restores the seed mapping inside its own rolled-back transaction, which the harness reproduced and verified. Any future suite that uses the seeded couple must do the same, or use its own fixtures as 002–008 do.

- **2026-10-26 (Claude, Task 6C):** After `queryClient.clear()` on an identity switch, query observers still mounted for the previous person re-rendered and re-created a `current-member` cache entry before the keyed private tree unmounted. The shell's new inbox queries widened that race, and the privacy test caught it. `AuthProvider` now `flushSync`s the private tree to a neutral loading state *before* clearing, mirroring sign-out. Any future identity-boundary change must keep that order: unmount, then clear, then render the next identity.
- **2026-10-26 (Claude):** The device shell is a Linux VM. Mac `node_modules` holds darwin native binaries (rolldown, esbuild), so `npm test` and the build fail there. JS verification runs in the container; Peter runs the authoritative Mac pass.

- **2026-10-25 (Claude, Task 4):** `get_current_member()` returns a single composite, so "no member" can arrive as `null` or as an all-null object depending on PostgREST. `useCurrentMember` treats anything other than a row whose `auth_user_id` equals the session user as a mapping failure.
- **2026-10-25 (Claude):** On the real local stack, `service_role` has **no** privileges on public tables (`auto_expose_new_tables = false`; an update returned 42501). Do not add grants for tooling: local fixtures that must write tables run SQL as `postgres` via `docker exec supabase_db_<project_id> psql`, as `scripts/dev-accounts.mjs` does, or use the user-facing RPCs. The harness shim was corrected to match (it had granted `service_role` everything). Also, GoTrue's admin user listing returns 500 when `auth.users` token columns are NULL; the seed now writes `''`.
- **2026-10-25 (Claude):** `npm run dev:accounts` (`scripts/dev-accounts.mjs`) makes local manual testing possible. It refuses non-local URLs; creates or re-passwords `partner-a@example.com` / `partner-b@example.com` through the local Auth admin API; points the seeded member rows at them; and writes the two `VITE_` values to `.env.local`. Re-run after each `db reset`. Task 10 fixtures can build on it.
- **2026-10-25 (Claude, Task 4):** Seed users cannot sign in (`banned_until = infinity`, no password). Manual sign-in against the local stack needs a separately provisioned synthetic login (Task 10 fixtures) and must never use the seed rows.

- The repository contains only planning documents and `.gitignore`; implementation starts from a clean slate.
- Current Supabase documentation distinguishes managed daily backups as a paid-plan capability. The approved Free-plan direction therefore requires a tested manual logical backup/restore before real-content readiness, or a later plan upgrade.
- **2026-10-25 (Claude):** `src/types/database.ts` lagged Task 3 (no RPC types). Regenerated on the Mac after verification. Regenerate it after every migration change; the CLI's "unformatted" notice is expected and harmless.
- **2026-10-25 (Claude):** `npx supabase start` failed health checks because the local `analytics` (Logflare) and `vector` containers crashed ("No Free Plan created yet in database"), even though every migration had applied. Ours uses no analytics, so `[analytics] enabled = false` is now set in `supabase/config.toml`; the stack then starts and tests pass.
- **2026-10-25 (Claude):** Cloud agents without Docker cannot run `npx supabase test db`. `scripts/pg-harness/` provides an emulated fallback; evidence from it is labeled as such.
- Local Supabase database verification requires Docker Desktop; the project-local stack uses isolated `5442x` ports and the pgTAP concurrency test derives the running database host and port rather than embedding those host ports.

## Outcomes

Planning outcome as of October 23, 2026:

- The detailed first-loop interaction and data model are drafted.
- Necessary MVP choices are resolved without selecting beta infrastructure.
- The implementation is decomposed into test-first, independently verifiable tasks.
- No application code, remote schema, credentials, production data, or personal content has been added.
- The detailed design and ExecPlan are approved; implementation begins only after this planning baseline is committed and isolated in the planned worktree.

## Execution Handoff

After approval, choose one:

1. **Subagent-driven in this session** — invoke `superpowers:subagent-driven-development`, dispatch one fresh implementation subagent per task, review between tasks, and keep this plan's Progress section current.
2. **Separate execution session** — open the approved implementation worktree in a new session and invoke `superpowers:executing-plans`, executing in batches with review checkpoints.

In any mode, follow `AGENTS.md`: keep Progress, Verification Evidence, and the Session Log current so Codex and Claude can hand off at any commit.

In either mode, remote Supabase linking, real account provisioning, and real-content entry require a separate explicit checkpoint after local synthetic verification.
