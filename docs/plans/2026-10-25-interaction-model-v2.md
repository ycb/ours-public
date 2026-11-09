# Ours Personal Alpha: Interaction Model v2 (Lifecycle, Queues, Notifications)

**Date:** October 25, 2026
**Status:** Draft — Peter answered the open questions on 2026-10-25. Pending: his confirmation of the co-editing model (Q3).
**Supersedes:** in `2026-10-23-personal-alpha-mvp-design.md`, the sections *Roulette state and history* (creator auto-ready rule), *2. Home*, *4. Library*, and the *Explicitly Deferred* line on notifications. Everything else in that document still stands.

## Why this revision

Peter's first hands-on use of the Palette surfaced gaps in the original design:

- Items written by me and items written by my partner were indistinguishable. One is familiar; the other is a surprise and an invitation.
- There was no signal that my partner had added something and wants my review, and no queue of what needs me.
- The first build established function. This revision defines the experience around it.

## Core idea

An item has an **author** and a **direction**. The author offers it; the partner receives it. The app's job is to make what's waiting on *me* obvious and easy to act on, and to make what's *ours* (agreed and playable) feel like a shared result.

## Item lifecycle

| Stage | Who sees it | Author's view | Partner's view |
|---|---|---|---|
| **Draft** | Author only | Draft | (invisible) |
| **Submitted** | Both | Waiting on partner | **New** (unopened) |
| **In review** | Both | Waiting on partner | In review (opened, no decision yet) |
| **Ready for plan** | Both | Ready | Ready |
| **Not now** | Both | Not now (with partner's reason) | Not now (my reason) |

Rules:

1. **Drafts are private.** A draft is invisible to the partner: not in lists, the feed, counts, or notifications. RLS enforces this, not just the UI.
2. **Submitting is the author's Ready.** Submitting sets the author's Roulette decision to `ready`. This replaces the original rule that creation never opts the creator in. The author can still change their own decision later.
3. **Opening is not reviewing, and reviewing is not agreeing.** *New* means the partner hasn't opened it. Once opened it is *In review* until the partner chooses **Ready** or **Not now**. Interest and favorite remain independent and never imply a decision.
4. **Ready for plan** requires both decisions to be `ready` on a submitted, active item. It leaves every action queue and enters the Roulette pool.
5. **Not now** removes the item from plan and from the partner's review queue, and puts it in a **Not now** list. Choosing Not now asks for a **reason**, posted into the item's conversation so dialogue can continue there.
6. **Not now is reversible.** The partner who said Not now can move it back to In review or straight to Ready. The author can edit it (see open question 3) or delete it.
7. **Delete is author-only** (see open question 2 for whether it is permanent).

## Views

- **Mine:** items I authored — drafts first, then submitted items grouped by partner state (Waiting / In review / Ready / Not now).
- **Theirs:** items my partner authored — New first, then In review, then decided.
- **Ours:** every submitted item from both of us (the full palette, with the Task 5 filters). *Ready for plan* is a prominent slice of Ours.
- **Not now:** items either of us declined, each showing who declined and the reason, with the conversation one tap away.

New and unread items get the strongest visual weight; decided items recede.

## The action queue ("Waiting on you")

My queue contains exactly:

1. **New from partner:** submitted by my partner, never opened by me.
2. **Needs your decision:** my partner's submitted items I have opened but not decided on.
3. **Unread messages:** items with partner messages newer than my last visit to that item.

It never contains drafts, my own items awaiting my partner, Ready-for-plan items, or anything archived or deleted.

The queue is the top of **Home**, and a count badge on navigation leads to it. The activity feed stays below it, as secondary context.

## Conversation

Each item has one flat chat. There is no question type or resolve step: people chat, whether it's enthusiasm or a question. "Unread" is derived from per-member last-seen time. The Not-now reason is a chat message, marked as the reason.

## Notifications

- **In-app:** the action queue and its badge. They are a convenient way back into the queue, not an alert stream.
- **Email (alpha):** content-free and sent to the partner when the other partner submits an item. The body says only that something is waiting in Ours, with a link to the app. No titles, descriptions, names of acts, or message text.
- **Cadence:** one email per submitted item; no batching in the alpha (see answer 5).
- **Local testing:** the local Supabase stack's built-in test inbox catches all mail; no real email leaves the machine in development.
- Text/SMS is deferred.

## Data-model consequences (to be detailed in the ExecPlan)

- `items.status` (`draft` | `submitted`) plus `submitted_at`. Archive/delete stay separate.
- RLS: draft items and their responses, revisions, and comments are readable only by their author.
- `submit_item(item_id)`: author-only. Sets status and `submitted_at`, sets the author's decision to `ready`, and enqueues a notification.
- `item_views (member_id, item_id, last_seen_at)` plus `mark_item_seen(item_id)`. These drive New, In review, and unread messages.
- `set_roulette_decision(item_id, 'not_now', reason)`: a reason is required for Not now and stored as a reason-flagged comment in the same transaction.
- `notification_outbox`: content-free rows written by triggers. A scheduled Edge Function batches and sends them through the email provider, and records what was sent.
- `delete_item(item_id)` (author-only) if open question 2 resolves to a permanent delete.

## Open questions (proposed defaults in bold)

1. **Can a draft be shared later than created?** Proposed: **new items start as drafts with "Save draft" and "Submit to [partner]" buttons; remixes too.**
2. **Delete: permanent or archive?** Proposed: **permanent delete of the item and its responses, comments, revisions, and views. It is refused if memories or draws reference the item, and archive is offered instead.** Personal content is better deleted than hidden.
3. **Author edits after submission:** Proposed: **a small edit keeps the partner's decision. Editing a Not-now item offers "Edit and resubmit", which returns the partner to In review (their decision becomes pending) and notifies them.**
4. **Can the author withdraw a submitted item back to draft?** Proposed: **no for the alpha; edit, resubmit, or delete covers it.**
5. **Email batching window:** Proposed: **wait 10 minutes after the first queued event, then send one email, with at most one email per partner per hour.**
6. **Not-now reason:** required or optional? Proposed: **required, at least a few words, since it's the start of the dialogue.**

## Answers (Peter, 2026-10-25)

1. **Yes:** new items and remixes start as drafts, with "Save draft" and "Submit to [partner]".
2. **Permanent delete** (author only). The proposed refusal when memories or draws reference the item stands unless Peter says otherwise.
3. **Co-creation, not author-owned.** Both partners should be able to modify an item on its path to Ready for plan. Proposed model, awaiting confirmation:
   - Once submitted, **either partner may edit**; drafts remain author-only.
   - **Ready applies to a version.** A meaningful edit (title, description, or category) returns the *other* partner's decision to In review and puts the item in their queue as "changed by [partner]". The editor's own decision is unchanged. This also applies to Ready-for-plan items, which leave the pool until both agree again.
   - From Not now, the decliner can edit the item toward a yes; the author reviews it.
   - Revisions record every editor. Saves send the version they started from, and a stale save is rejected with "this item changed since you opened it" plus the newer version, so neither partner silently overwrites the other.
   - Delete stays author-only. Remix remains for "same idea, separate item".
   - This **reverses** the 2026-10-23 "creator-owned originals" decision and the Task 3 invariant "only the creator may edit". The 004 actor tests must be rewritten for the new rule in a new migration.
4. **No:** a submitted item cannot be withdrawn to draft.
5. **Confirmed: one content-free email per submitted item, no batching.** Peter expects a thoughtful pace rather than bursts. Messages, Not-now decisions, and edits notify in-app only. Revisit batching only if real use produces bursts.
6. **Required** Not-now reason to start with.

## Naming (decided by Peter, 2026-10-25)

"Palette" mixes metaphors: a palette belongs to a painting, while Roulette is a game. Peter suggested "missions" or "experiences". Names are interface configuration only; code keeps `items`.

**Decision:** items are **Experiences**, and the library nav and page are titled "Experiences", with Mine / Theirs / Ours / Not now views. The author's action is **"Share with [partner]"**, not "Submit" or "Invite"; "invite" is reserved for one-time account setup. Routes move from `/palette/*` to `/experiences/*`, with redirects from the old paths. Code identifiers (`items`, `features/palette`) stay as they are.

## Information architecture review (Peter, 2026-10-26)

After using Task 6B, Peter found the Theirs / Mine / Ours / Not now tabs and the filter bar (especially "Added by" and "Roulette") duplicative. Decisions so far:

- **"Ideas"** replaces "Experiences".
- **Partner names** replace "Mine" / "Theirs".
- **Ours should be primary**, with an easy way to see one person's ideas.
- Kept, but secondary: category, interest, and favorites. Phone-first; a few dozen ideas expected.
- Still open: whether Ours means *everything shared* or *only agreed*.

Claude prepared three IA proposals as a design canvas, "Ours IA proposals" (in Peter's claude.ai artifacts): (1) one shared list with name and stage chips, (2) stage pipeline (Drafting → Shared → Talking → Agreed), and (3) Ours = agreed only, with a separate conversation-style Talking space. **Gate:** Task 7 waits until Peter picks or blends a proposal.

### Round 2 (Peter, 2026-10-26)

- Only Proposal 1 (one shared list) is viable. Proposal 2 felt like a sales dashboard (a chore). Proposal 3's Ours and Roulette were too similar: once an idea is agreed, it's time to plan.
- Problems with Proposal 1: too much content; stray labels (e.g. "needs-you first"); per-chip counts plus a separate total are confusing; "Everything else" stacked under "Your turn" is confusing.
- Direction:
  - "Mine" matters only for drafts. After sharing, there is **one list with clear attribution and metadata**, plus a workflow that helps the couple discuss and align.
  - Agreed ideas may live behind Plan, with a "see all agreed" link, so draft → discuss → align stays its own place.
  - "Your turn": inline vs. a separate place is still open.
- Claude added Round 2 to the "Ours IA proposals" canvas, with three concepts sharing a two-place structure (Ideas for draft/discuss/align, Plan for agreed): **A** inbox with your turn inline (unread-style bold + dot), **B** a separate "For you" place (one at a time), and **C** side-by-side ✓/?/— alignment glyphs per row. Superseded by the Final IA below.

## Final IA (decided by Peter, 2026-10-26) — supersedes "Views" and "The action queue" above

Two places in the bottom nav: **Ideas** and **Plan**. There is no separate Home, and Roulette lives inside Plan.

**Ideas** has three views across the top: **Drafts · Ideas · Respond**.

- **Ideas (default view):** one inbox-style list of shared ideas that are not yet agreed, ordered by most recent activity. Each row shows the author's initial, the title, a natural-language line for the latest activity (e.g. "Alex edited your wording", "You shared this · waiting on Alex", "You: which book…"), and a relative time. Rows that need me are bold with a dot.
- **Respond:** only what's waiting on me: new from my partner, needs my decision (including after my partner edited my idea), or unread partner messages. It's the only place that shows a number, and when it has items it must catch the eye (accent-filled segment). It ends with "That's everything waiting on you."
- **Drafts:** my unshared ideas as the same inbox rows: a dashed avatar, "Only you · edited …", and a trailing **Share** button. Tapping a row opens the editor.
- **Not now** ideas are hidden by default and shown via Refine ("Show Not now").
- **Refine** (one icon button): Category, Interest (per partner), Favorites, Show Not now. The "Added by" and "Roulette" filters are gone.
- **The tab always opens on Ideas** (predictable). The bottom Ideas tab shows a dot, not a number, when Respond has items.

**An idea** (detail): author · category · time, the title and description, both answers side by side ("Alex: In · very into it" / "You: Not yet"), then the chat. The actions are **I'm in**, **Edit**, and **Not now…**; interest and favorite are secondary controls. Below the actions: "Once you're both in, it moves to Plan."

**Plan:** Spin (Roulette over agreed ideas, Task 8), a "Just agreed" moment, and **See all agreed ideas**. Agreed ideas leave the Ideas list; an edit that resets agreement brings an idea back.

**Copy:** items are **Ideas**. The author's action is **Share with [name]**. A partner's yes is **I'm in** (data: `roulette_decision = 'ready'`). The overall stage words are **Your turn / Waiting on [name] / Agreed / Not now / Draft**. Partner names everywhere; "Mine/Theirs" never appears.

**Consequences for the plan:** Task 7's Home and activity feed are superseded. The latest-activity line on each row plus Respond replace them (no separate feed in the alpha). Task 6C rebuilds the UI to this IA; Task 7B (email on share) and Task 8 (Spin inside Plan) follow.

### Amendment (Peter, 2026-10-26 evening): Respond removed

Respond duplicated the detail view. **Ideas has two views: Ideas · Drafts.**

- **Your turn** (new from my partner, or my decision is pending, including after they edited my idea) is **pinned to the top** of Ideas. It's styled as a tinted row with an accent edge and a "Your turn" tag. There's no section heading.
- **Unread** is a separate signal: a bold title and a dot. It means an idea I haven't opened, or a partner message since my last visit. A row can be both.
- **Tab dots:** Ideas gets a dot for my turn or unread there. Plan gets a dot when an agreed idea has an unread reply.
- A Not now idea with an unread reply stays in Ideas even while Not now is hidden.
- `?view=respond` falls back to Ideas.
- **Copy: "Not now" is only the button; the resulting state is "On hold"** (Peter: nobody knows what "Not now" means as a state).
  - Refine: "Include ideas on hold".
  - Rows: `On hold · Alex: "reason"`. Detail badge and answer card: "On hold". My own line: "You put this on hold."
  - Dialog: "Put this on hold?", with the field "What's holding you back?" and the button "Put on hold". The chat tag reads "Put this on hold".
  - Data and URL keys are unchanged (`not_now`, `notnow=1`).
- The segment labels are **Shared · My drafts** (Peter: the page title already says Ideas). URL values are unchanged (`/ideas`, `?view=drafts`).

### Answer buttons (Peter, 2026-10-26 late)

At most two buttons, each a real decision:
- **Author:** no answer buttons after sharing, because sharing is their yes. After the partner edits it, only **I'm in**, which accepts that version ("Alex changed this. Say I'm in to agree to this version."). To reject an edit, they edit it back or talk in the chat.
- **Partner:** I'm in · Not now… until they answer. Once in, only **Not now…**. On hold, only **I'm in**.
- "Take back my yes" and "Undecided" are removed (they were redundant with Not now and with the chat).

### An idea opens as a sheet (Peter, 2026-10-26 late)

The idea opens over the list rather than as a page with a back arrow.
- The URL stays `/ideas/:id`, as a child route of Ideas, so the list stays mounted underneath. Direct links and refreshes work.
- Phones get a full-screen sheet; wider screens get a centered panel (kept simple, since most use is on phones).
- Close (×) or Escape steps back to where you came from: the list, its view and its scroll position, with focus on the opening row. From a direct link, Close goes to Ideas.
- Focus stays inside the sheet, and the list behind is `inert`.
- New idea and Remix stay as full-page forms.

### Row summary: one job per line (Peter, 2026-10-26 late)

Two partners aligning is the core idea, so every shared row shows both of them, in parallel, without recreating the detail view:
1. **Title** (wraps).
2. **What happened last:** the event only. "Alex shared this", "Alex edited your wording", "You: which book…", and for a hold, `Alex: "reason"`. No ratings and no "waiting on" here.
3. **Where we both stand:** partner first, then me, each as *name · answer · rating · ♥*. The answer is In / Not yet / On hold, and **Your turn** (an accent pill) takes my slot when my answer is needed, replacing the old separate tag. Missing ratings and favorites are simply not shown. Agreed rows (Plan) collapse this line to "Both in". Drafts have no third line.
- **Revised the same evening (Peter: "no redundancy", "not mobile friendly", keep "they're"):** each person is named once. Line 2 names them ("Alex shared this"), and the standing is then two short lines, **them first, then me**, phrased "They're in / They haven't decided / They put it on hold" and "You're in / **Your turn** / You put it on hold", each followed by "· rating" and "· ♥". No names, no side-by-side layout.

### Person colors and answer marks (Peter, 2026-10-27)

- **Each person has one color, the same on both phones,** assigned by member sort order: person A is slate teal (`--color-person-a`) and person B is ochre (`--color-person-b`).
  - It is used wherever they appear: the row's standing lines, answer cards (top strip, plus the border and answer word when In), chat names, and their rating.
  - **The accent rose is reserved for "needs attention"** (Your turn, the tint and edge, dots, primary buttons), so it never means a person.
- **Row marks:** each standing line starts with a small ring in the person's color: filled = In, hollow = not yet, struck through = On hold. The text still says it, so the color and shape are never the only signal.
- **Fallback, if the marks read as obscure:** keep the person colors and drop the shapes (`.person-mark`).
- **Tinted blocks (Peter picked B over solid bands with white text):** each person's line is a soft block in their color, with a color edge and text in that color. The rose row tint is gone. "Your turn" is shown only by the rose left edge and the pill.
- **One edge, on whoever needs to act (Peter):** the row-level rose edge is gone. Only the block of the person the idea is waiting on gets a left edge, in their own color: mine on my turn (with the "Your turn" pill), theirs while I wait. On hold and agreed rows have no edge.
- **Reversed the next morning (Peter):** person blocks have no edge. The row's left line returns for "needs my review" (my turn) and is **always the accent rose**, never a person's color, because it only ever means "needs you", matching the pill and dots. Person colors mean who; rose means attention.
- **Person B is gold `#82671b` (was ochre),** so neither person color sits near the attention rose. It passes 4.5:1 on both page backgrounds. On-hold styling (the chat reason, the row line) is neutral grey, not tan or brown.
