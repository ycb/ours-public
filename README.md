# Ours

**A private space for two.**

Close relationships run on attention, and attention gets lost in scattered texts and "we should do that
sometime". Ours gives two people one place to suggest ideas for time together, find the ones they both
want, and actually do them.

<p>
  <img src="docs/screenshots/01-ideas.png" width="200" alt="Ideas: what each of you suggested, and whose turn it is">
  <img src="docs/screenshots/05-idea.png" width="200" alt="An idea you both said yes to">
  <img src="docs/screenshots/03-card.png" width="200" alt="Dealing a card from the ideas you both want">
  <img src="docs/screenshots/06-reflect.png" width="200" alt="Reflecting after a date">
</p>

## What's different

- **Only mutual yeses get planned.** Each person answers *I'm in*, *Maybe later* or *Not for me*,
  separately from how into it they are. Nothing reaches Plan until both say yes, and either can step
  back without penalty.
- **Surprise inside agreement.** Deal a card from what you both want, pick *tonight* or *this weekend*,
  and it's Up next on both phones.
- **It closes the loop.** After a date, each person shares what they enjoyed and what they'd change,
  and that becomes the start of the next idea.
- **Private by design.** Row Level Security isolates each couple in the database and keeps drafts from
  partners. Emails never contain content.

## How it was built

One person directing two AI coding agents, Codex and Claude, taking turns on one codebase. They worked
under a written [working agreement](AGENTS.md), tests first, with a shared
[plan and handoff log](docs/plans/2026-10-23-personal-alpha-mvp-implementation.md) either agent could
pick up from. It went from first commit to real use in a week.

- React 19, TypeScript, Vite; Supabase (Postgres RLS, security-definer writes, pg_cron + Edge Function
  email).
- 281 unit and component tests, 1,108 pgTAP assertions on access and isolation, and 7 Playwright specs
  against the real local stack.

## Run it locally

Needs Node 22.13+ and Docker.

```bash
npm install
npx supabase start
npx supabase db reset && npm run dev:accounts
npm run dev
```

Sign in as `partner-a@example.com` and `partner-b@example.com` (password `ours-local-synthetic`) in two
browsers. Tests: `npm test`, `npx supabase test db`, `npm run test:e2e`.
