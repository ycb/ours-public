# Ours: Product Brief

**Prepared:** October 23, 2026 (revised November 9, 2026 for the public repository)
**Status:** personal alpha in daily use by its first couple; this repository is the public edition

## Mission

People need connection, and it doesn't maintain itself. Close relationships deepen when two people keep
learning what the other wants, and actually make time to do it together. Most of that gets lost in
scattered messages, forgotten ideas and "we should do that sometime".

Ours is a private space for two people to collect ideas for shared time, say honestly what they're into,
plan what they both want, and remember how it went. It becomes more useful the more a couple puts into
it: every idea, answer and memory is knowledge of each other.

The sequence is deliberately conventional:

1. Build for one real couple.
2. Share with trusted friends.
3. Run a private beta.
4. Evaluate continued use, referrals, willingness to pay, and positioning.

## Product Identity

- **Product:** Ours
- **Tagline:** A private space for two.
- **Main areas:** Ideas (what either of you suggests) and Plan (what you've both said yes to).

Treat these as interface vocabulary, not database vocabulary. The schema uses neutral identifiers such as
`couples`, `members`, `items`, `categories`, `responses`, `draws`, and `memories`, so renaming stays cheap.

## Product Thesis and Differentiation

Couples can write their way to understanding each other before they know how to say it aloud.

Existing products validate demand for date ideas, prompts, shared lists, and couples games. A shared list,
or a random pick from one, is commoditized. Ours is differentiated by the complete, accumulating loop:

**Suggest → respond → mutually agree → plan → do it → reflect → build on it**

It isn't a catalog of generic date ideas. It's a library two people write together, which preserves
particular knowledge of one another.

## Foundational Product Rules

1. **An idea is an invitation, not a task.** Something can be worth talking about without ever happening.
2. **Enthusiasm is not agreement.** How into it someone is, a favorite, and "I'm in" are separate signals.
3. **Only mutual yeses get planned.** Surprise works inside agreement: the deck deals only from ideas you
   both said yes to, and either person can say "not now" or "not for me" without penalty.
4. **Attention is the core benefit.** Remembering precise details communicates care.
5. **Reflection keeps the connection going.** After a plan happens, each person shares what they enjoyed
   and what they'd change, and that feeds the next idea.
6. **It supports healthy relationships; it is not therapy.** It isn't designed to resolve coercion, abuse,
   betrayal, or acute distress.

## Alpha Scope (built)

- Two partner identities with attribution and dates.
- Ideas: drafts, sharing, line-level "who wrote what", edits, messages, and a turn-based inbox.
- Answers: I'm in / Maybe later / Not for me, plus a separate "how into it" rating. Later is mutual.
- Plan: agreed ideas, filters, and a card deck (or sealed note) that deals one at random. Pick one
  directly with "Plan this".
- Dates: when (tonight, this weekend, sometime), Up next on both phones, "We did it", and a reflection
  prompt with a content-free reminder email.
- Memories that link to the date they came from, and related ideas that keep both lineage links.
- Content-free email for unseen activity, batched and suppressed when already seen.

## Explicitly Deferred

- Public signup, invitations, and account recovery.
- Payments and subscriptions.
- AI generation or analysis.
- Public profiles, community, and moderation.
- Push notifications.
- End-to-end encryption with keys only the couple holds.
- Behavioral advertising or third-party analytics.
- More than two people in one space. One person with several separate spaces is the likely next shape.

## Privacy and Data Boundaries

- Never commit real personal writing, production exports, credentials, database passwords, access
  tokens, or Supabase service-role keys.
- Use synthetic content in seeds, fixtures, tests, screenshots, and demos.
- Notifications and logs never contain content.
- No third-party behavioral analytics.
- Keep `.env.local` ignored and commit only a placeholder `.env.example`.
- Every `VITE_*` value is visible in the browser bundle; only the project URL and publishable key go there,
  and only because Row Level Security and privileges are correct and tested.
- Database structure is recoverable through append-only migrations in Git.
- Honest boundary: the operator of a hosted instance can read stored content. The app does not claim
  otherwise.

## Technical Decisions

- React, TypeScript, and Vite as a responsive, installable web app.
- Supabase: Postgres with Row Level Security on every table, writes only through `security definer`
  functions, and no automatic exposure of new tables.
- Two real Supabase Auth users per couple, so attribution and RLS map directly to identities.
- Static front end on any host; the host never holds personal data.

## Alpha Success Criteria

1. Both partners contribute voluntarily.
2. The library becomes easier and more valuable than informal notes and messages.
3. A partner's changes and answers are easy to notice.
4. Agreeing feels clear rather than bureaucratic.
5. The deck creates anticipation and repeated use.
6. Reflections generate further ideas.
7. The couple returns without artificial reminders.
