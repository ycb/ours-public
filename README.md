# Ours

**A private space for two.** Collect ideas for time together, say honestly what you're into, plan what
you both want, and remember how it went.

Connection doesn't maintain itself. Ideas for shared time get lost in messages and "we should do that
sometime". Ours gives two people one place to suggest ideas, answer each other's, and turn the mutual
yeses into plans, then reflect afterwards so each date feeds the next.

It's a working personal alpha, in use by its first couple since October 2026.

## How it works

**Suggest → respond → agree → plan → do it → reflect → build on it**

- **Ideas.** Either person adds an idea, as a private draft or shared right away. The other answers
  *I'm in*, *Maybe later* or *Not for me*, and separately rates how into it they are. Edits show who wrote
  which line, and a changed description asks the other person again.
- **Plan.** Only ideas you both said yes to appear here. Deal a card from the deck (or open a sealed
  note) for a surprise, or pick one directly with *Plan this*, then choose *tonight*, *this weekend* or
  *sometime*. Up next appears on both phones.
- **Reflect.** After *We did it*, each person is asked two questions: what they enjoyed and what they'd
  change. Answers become memories on the idea, and any memory can start a related idea.
- **Stay in sync without oversharing.** Live updates while the app is open; otherwise a batched email
  that says only that something is waiting. Emails never contain content.

### Product rules

- An idea is an invitation, not a task.
- Enthusiasm isn't agreement: the rating, a favorite, and *I'm in* are separate signals.
- Only mutual yeses get planned, and *Later* is mutual too. Either person can step back without penalty.
- Reflection, not scoring: there are no streaks, points or stats.

## Architecture

```
React 19 + TypeScript + Vite  ──►  Supabase (Postgres + Auth + Realtime)
  installable web app               RLS on every table; all writes via security-definer functions
  TanStack Query, React Router       pg_cron ─► Edge Function "notify" ─► Resend (content-free email)
```

- **Privacy is enforced in the database.** Every table has Row Level Security scoped to the couple, and
  drafts are private to their author. Browsers can only read; every write goes through a
  `security definer` function with an empty `search_path`, so it can't bypass the rules.
- **Isolation is proven, not assumed.** pgTAP tests sign in as each partner and as a member of a
  second couple, and assert what each can and cannot read or change.
- **Realtime is a signal, never a payload.** Only a content-free events table is published; clients
  refetch through RLS-scoped queries.
- **Email without content.** Actions queue rows in an outbox. Postgres batches them and drops anything
  the recipient already saw in the app. A scheduled Edge Function sends through Resend with an idempotency
  key, and records only short result codes.
- **Append-only migrations** (23 so far): fix forward, never rewrite history.

## Quality

| Check | Command | Count |
| --- | --- | --- |
| Unit and component tests (Vitest, Testing Library) | `npm test` | 281 |
| Database tests (pgTAP: RLS, grants, functions, concurrency) | `npx supabase test db` | 1,108 assertions in 16 files |
| End-to-end on the real local stack (Playwright) | `npm run test:e2e` | 7 specs |
| Lint, types, build | `npm run lint && npm run build` | |

The end-to-end suite runs the full loop in two browsers, as two partners plus an outsider from another
couple. It also checks every screen for sideways scrolling at 320 px, keyboard-only use, visible focus,
reduced motion, and that the email Mailpit receives contains no content.

## Built with AI agents

Ours was built by one person directing two AI coding agents, Codex and Claude, which took turns on the
same branch. The process lives in the repository:

- [`AGENTS.md`](AGENTS.md): the shared working agreement. Read-first list, test-first rule (RED then
  GREEN), commit trailers naming the agent, and a required session-log entry before stopping.
- [`docs/plans/2026-10-23-personal-alpha-mvp-implementation.md`](docs/plans/2026-10-23-personal-alpha-mvp-implementation.md):
  the ExecPlan. Tasks, progress, verification evidence, a decision log, surprises, and a session log
  that lets either agent pick up where the other stopped.
- [`docs/plans/2026-10-30-qa-notes.md`](docs/plans/2026-10-30-qa-notes.md): feedback from real use,
  each round taken from problem to concepts to mockups to a tested change.

The product decisions, design reviews and every production step stayed with the human. The agents never
saw credentials or real content.

## Run it locally

Requires Node 22.13+ and Docker Desktop.

```bash
npm install
npx supabase start
npx supabase db reset && npm run dev:accounts
npm run dev
```

`dev:accounts` creates two synthetic partners (`partner-a@example.com` and `partner-b@example.com`,
password `ours-local-synthetic`) and writes `.env.local`. Sign in as each in two browsers. Then:

```bash
npx supabase test db
npm run test:e2e
```

To deploy your own instance, see [`docs/plans/2026-10-30-first-night-deploy.md`](docs/plans/2026-10-30-first-night-deploy.md)
and [`docs/alpha-email.md`](docs/alpha-email.md).

## Repository map

| Path | What's there |
| --- | --- |
| `src/domain/` | Pure logic: answer states, the inbox, dates and reflections |
| `src/features/` | Ideas, Plan (deck), dates, memories, auth |
| `supabase/migrations/` | Schema, RLS policies, functions, grants |
| `supabase/tests/database/` | pgTAP tests |
| `supabase/functions/` | The `notify` Edge Function and shared email logic |
| `e2e/` | Playwright specs against the local stack |
| `docs/` | Product brief, design docs, ExecPlan, QA notes |

## Privacy boundary, stated honestly

Couples are isolated from each other, and drafts from partners. Whoever operates a hosted instance can
still read stored content through the database. End-to-end encryption, with keys only the couple holds,
is the planned answer and isn't built yet. Because filtering and the inbox already run in the browser,
the server never needs to read content, which keeps that path open.
