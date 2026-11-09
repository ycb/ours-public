# Ours Personal Alpha: Detailed MVP Interaction and Data Model

**Date:** October 23, 2026
**Status:** Approved October 23, 2026
**Revised:** October 25, 2026. `2026-10-25-interaction-model-v2.md` supersedes the Roulette creator rule, Home, Library, and the notification deferral. Read it first.
**Build gate:** No implementation begins until this document and the companion ExecPlan are approved.

## Purpose

This document turns the approved Ours strategy into the smallest complete personal-alpha experience:

**Create → respond → mutually activate → spin → remember → expand**

The alpha is for one known couple and two fixed partner identities. It should prove that a shared, accumulating palette is more useful than informal notes and messages. It is not a public product, a messaging replacement, or a production-security claim.

## Decisions Needed for the First Loop

### Access: two pre-provisioned Supabase Auth users

Each partner signs in with a separately provisioned email/password account. There is no signup, invitation, account-recovery, or profile-switching interface.

This is the smallest option that preserves trustworthy attribution and maps cleanly to Row Level Security through `auth.uid()`. A shared account would make partner attribution spoofable. A custom shared-passcode server would add a new runtime and secret-management surface. A private URL may remain discreet, but it is not authentication.

### Rating: optional four-state interest language

The rating control is labeled **Interest**, with these ordered values:

1. **Low interest**
2. **Curious**
3. **Into it**
4. **Very into it**

No selection means **Not rated yet**. The scale describes enthusiasm, not a boundary; the interface never converts these labels into consent or roulette eligibility and never shows a combined couple score. **Not now** remains the explicit way to keep an item out of Roulette.

### Favorites: visible to both partners

Each partner has an independent favorite toggle. Both states are visible on item detail because the product is a shared palette and the approved feed includes favorite changes. Favorite status never affects roulette eligibility.

### Organization: one category per item

An item must belong to one couple-scoped category. Category creation is available from the item editor. Tags and multi-category assignment are deferred.

### History and discussion

- The creator may edit or archive their item. Each edit creates an immutable revision. Item detail shows a collapsed timeline with editor and date; expanding a revision shows that snapshot. The other partner responds through comments or creates a remix rather than rewriting the original.
- Comments and questions share one flat chronological thread. Replies, reactions, and comment edit history are deferred.

### Roulette state and history

- Every new or remixed item starts with both partners' decisions at **Pending**.
- Each partner explicitly chooses **Ready for Roulette** or **Not now**. The creator is never opted in automatically.
- Eligibility is derived and exists only while both partners are ready and the item is active.
- A roulette candidate is ephemeral. **Spin again** stores no draw, score, rejection, or activity event.
- **Accept** and **Leave for later** create neutral, dated draw records. Accept means only “save this selection,” not agreement to perform it.
- Eligibility is checked again when a draw is recorded so a stale result cannot survive a partner's revocation.

### Visual tone and discretion

The application chrome is warm, calm, affectionate, and adult without being explicit or clinical. The browser title is simply **Ours**. Feed cards may show item titles after authentication but do not duplicate descriptions, comments, or memories. There are no notifications, third-party analytics, suggestive stock images, or content-bearing URLs.

## Interaction Design

### 1. Sign in

The private URL opens a minimal Ours sign-in screen with email and password fields. There is no signup link. Successful authentication resolves the signed-in user to exactly one `member` row. If that mapping is missing or ambiguous, the app fails closed and shows a non-content-bearing setup error.

### 2. Home

Home is the default authenticated route. It contains:

- A primary **Add an item** action.
- A primary **Open Roulette** action.
- **Needs your response**, defined narrowly as active items whose current member roulette decision is `pending`.
- **Ready for Roulette**, derived from currently eligible items.
- A reverse-chronological activity feed.

Activity cards identify the actor, action, relative date, and affected item. They link to item detail. The feed says things such as “Partner added an item,” “Partner updated their interest,” or “This item became ready for Roulette”; its event records do not copy item bodies or response values.

Empty home explains the loop and points to **Add an item**. It does not seed real or suggestive content.

### 3. Create or remix an item

The editor requires:

- Title.
- Description.
- One category, selected from existing categories or created inline.

Creator and date are automatic. A normal save creates an active item, revision 1, two pending partner-response states, and an activity event. A remix pre-fills the current title, description, and category but creates a distinct item with `source_item_id`; the user must save it explicitly. A remix from a memory also records `source_memory_id`.

Drafts stay only in component memory. Navigation away with unsaved changes asks for confirmation. There is no autosave, offline cache, or local-storage draft.

### 4. Library

The library shows active items and supports:

- Category.
- Creator.
- Either partner's interest value.
- Either partner's favorite status.
- Roulette state: pending, ready, or not now.
- Sort by newest or recently updated.

Filters live in the URL only as non-sensitive identifiers and enum values; titles and descriptions never appear in query parameters. Empty filters never broaden silently.

Each card shows title, category, creator, updated date, and compact partner-state indicators. Description remains on item detail.

### 5. Item detail and response

Item detail is the center of the asynchronous partner interaction. It shows:

- Current title, description, category, creator, creation date, and remix source when present.
- A separate state panel for each partner: interest, favorite, and roulette decision.
- Current member controls for their own state only.
- A reminder beside roulette controls: **Interest is not permission. Roulette requires both partners to choose Ready.**
- A flat comments/questions composer and thread.
- Linked memories.
- Collapsed edit history.
- **Remix** and **Add a memory** actions for either partner; **Edit** and **Archive** only for the creator.

Response writes are independent. Saving an interest value or favorite cannot alter roulette status. Either partner may change their own roulette decision at any time; changing away from Ready immediately removes the item from future draws. Creator-only archiving removes an item from the default library and roulette pool while retaining history and lineage.

### 6. Roulette

Roulette starts with either all eligible items or one selected category. The empty-pool state explains that both partners must explicitly choose Ready and links back to the library; it never falls back to pending items or another category.

The database chooses one eligible item for the authenticated couple. The result screen shows the item and three actions:

- **Accept** — records an accepted draw and offers **Add a memory**.
- **Spin again** — discards the candidate and requests another without recording rejection data.
- **Leave for later** — records a neutral deferred draw and returns to the roulette start state.

The result screen includes: **Accept saves this selection. Either of you can still change course.**

If the item's eligibility changes before Accept or Leave for later, finalization fails safely and the user is invited to spin again.

### 7. Remember and expand

A memory can be added from an item or an accepted draw. It contains:

- **What do you want to remember?** — required body.
- **What felt especially meaningful?** — optional highlight.
- **Next time** — optional: no selection, repeat, or refine.
- **Refinement or variation** — optional text.

Author and date are automatic. After save, the memory appears on item detail and in the activity feed. **Create a related item** opens the item editor and preserves both item and memory lineage.

## Data Model

Every content-bearing table carries `couple_id` directly. Redundant couple keys are deliberate: they make policies and indexes auditable and allow composite foreign keys to prevent cross-couple references.

### `couples`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `display_name` | `text` | Required |
| `created_at` | `timestamptz` | Database default |

The schema remains multi-couple-capable, but the alpha provisions one couple and exposes no couple-management UI.

### `members`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required, references `couples` |
| `auth_user_id` | `uuid` | Required, unique, references `auth.users(id)` |
| `display_name` | `text` | Required |
| `sort_order` | `smallint` | Required, unique within couple |
| `created_at` | `timestamptz` | Database default |

The personal alpha provisions exactly two rows operationally. The schema does not encode a brittle maximum-two constraint.

### `categories`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `name` | `text` | Required; case-insensitive unique among active categories in a couple |
| `sort_order` | `integer` | Required, default `0` |
| `created_by_member_id` | `uuid` | Required; same couple |
| `request_id` | `uuid` | Required; unique with creator for idempotent retries |
| `created_at` | `timestamptz` | Database default |
| `archived_at` | `timestamptz` | Nullable |

### `items`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `creator_member_id` | `uuid` | Required; same couple |
| `category_id` | `uuid` | Required; same couple |
| `source_item_id` | `uuid` | Nullable; same couple; not self |
| `source_memory_id` | `uuid` | Nullable; same couple |
| `request_id` | `uuid` | Required; unique with creator for idempotent retries |
| `title` | `text` | Required; trimmed; bounded length |
| `description` | `text` | Required; trimmed; bounded length |
| `created_at` | `timestamptz` | Database default |
| `updated_at` | `timestamptz` | Database maintained |
| `archived_at` | `timestamptz` | Nullable |

Pending and eligible are derived states, not stored columns.

If both `source_item_id` and `source_memory_id` are present, the source memory must belong to that source item. Create-style `request_id` values are generated once in the UI and retained in component state across retries.

### `item_revisions`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `item_id` | `uuid` | Required; same couple |
| `revision_number` | `integer` | Required; unique with `item_id` |
| `editor_member_id` | `uuid` | Required; same couple |
| `title` | `text` | Snapshot |
| `description` | `text` | Snapshot |
| `category_id` | `uuid` | Snapshot; same couple |
| `created_at` | `timestamptz` | Database default |

Rows are immutable and trigger-created on item insert and meaningful item update.

### `item_responses`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `item_id` | `uuid` | Required; same couple |
| `member_id` | `uuid` | Required; same couple |
| `interest` | enum | Nullable: `low`, `curious`, `into_it`, `very_into_it` |
| `is_favorite` | `boolean` | Required, default `false` |
| `roulette_decision` | enum | Required: `pending`, `ready`, `not_now`; default `pending` |
| `created_at` | `timestamptz` | Database default |
| `updated_at` | `timestamptz` | Database maintained |

There is exactly one row per item/member. A trigger-only, `SECURITY DEFINER` function with a fixed `search_path` creates exactly two same-couple response rows after item creation and fails the item write unless the couple has exactly two members. The trigger function is not executable by browser roles. A member can change only their own response through field-specific write functions. Eligibility requires exactly two total response rows and exactly two `ready` rows.

### `comments`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `item_id` | `uuid` | Required; same couple |
| `author_member_id` | `uuid` | Required; caller; same couple |
| `body` | `text` | Required; trimmed; bounded length |
| `request_id` | `uuid` | Required; unique with author for idempotent retries |
| `created_at` | `timestamptz` | Database default |

Comments are append-only in the first loop.

### `roulette_draws`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `item_id` | `uuid` | Required; same couple |
| `drawn_by_member_id` | `uuid` | Required; caller; same couple |
| `filter_category_id` | `uuid` | Nullable; same couple and matches item when present |
| `outcome` | enum | `accepted` or `deferred` |
| `request_id` | `uuid` | Required; unique with actor for idempotent retries |
| `created_at` | `timestamptz` | Database default |

Spin-again candidates do not create rows. A database function chooses candidates; a second function records accepted/deferred outcomes only after revalidating current eligibility.

### `memories`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `item_id` | `uuid` | Required; same couple |
| `draw_id` | `uuid` | Nullable; same couple, same item, accepted outcome only |
| `author_member_id` | `uuid` | Required; caller; same couple |
| `body` | `text` | Required; trimmed; bounded length |
| `highlight` | `text` | Nullable; bounded length |
| `next_time` | enum | Nullable: `repeat` or `refine` |
| `refinement` | `text` | Nullable; bounded length |
| `request_id` | `uuid` | Required; unique with author for idempotent retries |
| `created_at` | `timestamptz` | Database default |

### `activity_events`

| Field | Type | Rules |
|---|---|---|
| `id` | `uuid` | Primary key |
| `couple_id` | `uuid` | Required |
| `actor_member_id` | `uuid` | Required; same couple |
| `event_type` | enum | Approved event vocabulary |
| `item_id` | `uuid` | Nullable; same couple |
| `comment_id` | `uuid` | Nullable; same couple |
| `draw_id` | `uuid` | Nullable; same couple |
| `memory_id` | `uuid` | Nullable; same couple |
| `metadata` | `jsonb` | Non-content metadata only |
| `created_at` | `timestamptz` | Database default |

Initial event types are `item_created`, `item_edited`, `item_remixed`, `response_changed`, `roulette_decision_changed`, `item_became_eligible`, `comment_added`, `draw_accepted`, `draw_deferred`, and `memory_added`.

Events are trigger-created, append-only, and not directly writable by browser clients. Each persisted approved mutation produces exactly one feed event; the ephemeral Spin again action produces none. When the second Ready decision makes an item eligible, the mutation creates `item_became_eligible` instead of a second `roulette_decision_changed` event. Metadata may contain field names or revision numbers, but never item descriptions, comment bodies, memory text, credentials, or tokens.

## Database Functions and Derived Queries

- `current_member_id()` resolves `auth.uid()` to exactly one member and returns `null` otherwise.
- `get_current_member()` returns only the member whose `auth_user_id` equals `auth.uid()`; the application never infers the current member by querying all same-couple member rows.
- `is_current_couple(couple_id)` is the shared RLS predicate.
- `create_category(request_id, name)` derives actor and couple and returns the existing-or-new category for that actor/request pair.
- `create_item(request_id, title, description, category_id, source_item_id, source_memory_id)` derives creator/couple, validates same-couple lineage, requires `source_memory.item_id = source_item_id` when both sources are supplied, and returns the existing-or-new item for that actor/request pair.
- `update_item(item_id, title, description, category_id)` and `archive_item(item_id)` require the caller to be the immutable creator and change only the named mutable fields.
- `set_item_interest(item_id, interest)`, `set_item_favorite(item_id, favorite)`, and `set_roulette_decision(item_id, decision)` update only the caller's existing response row and cannot alter its identity columns.
- `add_comment(request_id, item_id, body)` and `add_memory(request_id, item_id, draw_id, body, highlight, next_time, refinement)` derive author/couple, validate every reference, and return the existing-or-new row for that actor/request pair.
- `eligible_items` is a security-invoker view or equivalent query over active items whose two response rows are both `ready`.
- `draw_roulette(category_id)` returns one random currently eligible item in the caller's couple without persisting it.
- `record_roulette_outcome(request_id, item_id, category_id, outcome)` derives the actor, revalidates eligibility and filter membership, and returns the existing-or-new `accepted` or `deferred` row for that actor/request pair.

Browser roles receive read privileges on RLS-protected tables but no direct insert, update, or delete privileges. All user writes go through the narrow functions above. Every security-definer function uses a fixed `search_path`, schema-qualifies every object, derives actor/couple from `auth.uid()`, validates every referenced row, and exposes only the minimum execute privilege. Migration code explicitly revokes default execution from `PUBLIC` and `anon`; trigger-only helpers are not executable by `authenticated`.

Every create-style function resolves the authenticated actor, checks for an existing row with that actor/request pair, and returns it before validating current mutable state. Only a new request proceeds through reference/eligibility validation and insert. This ordering makes a retry safe even when state changed after the original commit but before its response reached the browser.

## Authorization Invariants

- Anonymous users receive no application rows and cannot mutate any application table.
- Authenticated users can read only rows for the couple mapped to their auth identity.
- Clients never supply couple or actor identifiers for writes.
- Item creator, couple, source lineage, response member/item identity, category creator, comment author, memory author, draw actor, and creation timestamps are immutable.
- Only the creator may edit or archive an item. Either partner may comment, create a memory, or remix; members change only their own response through field-specific functions.
- Cross-couple category, lineage, draw, or memory references are rejected by composite constraints or validated functions.
- All browser-accessible tables have RLS enabled before privileges are granted.
- No application table can be inserted, updated, or deleted directly from the browser; authenticated writes are function-only. `activity_events` and `item_revisions` are trigger-only.
- The browser receives only the project URL and publishable key. Service-role keys and database passwords never use a `VITE_*` name and never enter source control.

## Persisted and Ephemeral Information

Persisted in Supabase:

- Couple/member attribution.
- Categories and active/archived items.
- Immutable item revisions.
- Current partner responses.
- Flat comments.
- Accepted and deferred draw outcomes.
- Memories and remix lineage.
- Metadata-only activity events.

Ephemeral by design:

- Unsaved drafts.
- Roulette candidate order and spin-again results.
- Library filter preferences.
- UI animation state.
- Passwords and administrative tokens.

The Supabase browser client persists its ordinary access/refresh session so the personal alpha remains usable across reloads. No personal content is stored in browser persistence. A visible Sign out action clears the Supabase session, TanStack Query cache, router state, in-memory drafts, and rendered private UI before another identity can sign in.

The repository contains only code, schema, policies, placeholders, and obviously synthetic fixtures such as `Synthetic Item A`. It contains no real personal writing, production exports, credentials, or production identifiers.

## Failure Behavior

- Authentication, member mapping, or authorization uncertainty fails closed and renders no private records.
- Failed writes remain visibly unsaved and retryable. The UI does not announce success before the database confirms it.
- Response setters and no-op item updates use null-safe meaningful-change checks: repeating the same value changes no timestamp and creates no revision or activity event. Create-style functions require a client-generated request UUID retained across retries; per-actor unique constraints return the original row after an ambiguous retry instead of creating a duplicate.
- Empty roulette pools never broaden their filter.
- A stale candidate whose eligibility changed cannot be recorded.
- User-facing errors and logs contain operation names and opaque record IDs only, never content bodies.
- Partial feed failures show a neutral retry state; they never substitute unscoped data.

## Real-Content Readiness Gate

Implementation and automated verification use synthetic data only. Real personal content must not be entered until all of these are demonstrated:

1. Closed signup and two-user authentication work.
2. RLS and actor-attribution tests pass, including a second synthetic couple isolation test.
3. The browser bundle contains no service-role key or database password.
4. Logs and URLs contain no content bodies. Test artifacts and screenshots contain only obvious synthetic fixtures and no real/private content or secrets.
5. A live application-data purge procedure is tested with a synthetic couple; the operator runbook separately covers disabling/removing Auth users and explains backup residue.
6. A recovery procedure is chosen and restored successfully with synthetic data. Because automatic daily backups are a paid-plan feature, a Free-plan alpha must use and test a manual logical backup. Real-data backups must use encrypted storage outside the repository/worktree with restrictive permissions and a retention/deletion rule, or the project must upgrade before claiming managed recovery. Restore verification must cover application rows plus recovered or deliberately reprovisioned Auth/member mapping.

## Explicitly Deferred

- Public signup, invitations, recovery, payments, and multi-couple onboarding UI.
- End-to-end encryption and public security claims.
- Notifications, third-party analytics, AI, community, moderation, and messaging.
- Threads, reactions, tags, multiple categories, comment editing, and item hard deletion UI.
- Blind responses, aggregate scores, streaks, decline metrics, or personalization algorithms.
- Offline support, autosaved drafts, and content-bearing local storage.
- Self-service export/deletion UI; the alpha instead requires a tested operator purge before real use.

## Acceptance Scenarios

1. Partner A signs in, creates an item, and sees exactly two roulette decisions pending.
2. Either partner may rate, favorite, or comment without changing eligibility.
3. One Ready decision is insufficient; two Ready decisions make the item drawable.
4. Either partner selecting Not now immediately removes the item from the pool.
5. A filtered empty pool stays empty and explains why.
6. Spin again records nothing; Accept and Leave for later record neutral outcomes.
7. Revocation between result and finalization blocks the write.
8. An accepted draw can receive a memory, and that memory can seed a related item with lineage.
9. Creator edits retain immutable revision history and actor/date attribution; the other partner cannot rewrite or archive the original.
10. A user from synthetic Couple B cannot read or mutate Couple A records, even with guessed UUIDs.

## Alternatives Considered

### Feed-led loop — selected

Home centers partner activity and attention. This requires an event model, but best satisfies the approved success criterion that additions and responses be easy to notice.

### Library-led CRUD

This would be slightly faster to scaffold but would reproduce the weakness of shared notes: users must remember what to inspect and what changed.

### Guided stepper

This would make the loop explicit but would make asynchronous exploration feel compulsory and imply that every idea should advance toward enactment.

## Approval Boundary

Approval of this document authorizes planning around these interaction and data choices. It does not authorize remote deployment, provisioning real partner accounts, entering real content, or committing credentials.
