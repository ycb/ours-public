# Agent Working Agreement (Codex and Claude)

This repository is built alternately by Codex and Claude. Either agent must be able to stop at any
commit and let the other continue without re-reading the conversation that produced it. Git and the
documents below are the only shared memory.

## Read first, every session

1. `docs/HANDOFF.md` — product mission, rules, and privacy boundaries.
2. `docs/plans/2026-10-23-personal-alpha-mvp-implementation.md` (the ExecPlan) — read
   **Progress**, **Session Log** (newest entry first), and the task you are about to start.
3. `docs/plans/2026-10-25-interaction-model-v2.md`, then `docs/plans/2026-10-23-personal-alpha-mvp-design.md` — the build contract. Where they differ, v2 wins.
4. `docs/learnings.md`.
5. `git log --oneline -15` and `git status` on `main`. If the working tree is
   dirty, the previous session ended mid-task: read the latest Session Log entry before touching it.

Do not redo work whose Progress box is checked and whose evidence is recorded. If a box is checked but
evidence is missing, re-run that task's verification instead of re-implementing it.

## Where work happens

- Work happens on `main`. Do not create per-agent branches.
- This public repository started from a snapshot of the private build (see the README). The ExecPlan and
  Session Log keep the history of how it was built; older entries mention the private branch and paths.

## Unit of work

One ExecPlan task (or one clearly named sub-step of it) per commit series. A task is done only when:

1. Its tests were written first and observed failing (RED), then passing (GREEN).
2. Its verification commands pass.
3. The ExecPlan is updated **in the same commit or the commit immediately after**:
   - tick the Progress box;
   - add a dated **Verification Evidence** bullet naming the agent, commands, and observed results;
   - add **Decision Log** / **Surprises** entries for anything a successor would otherwise rediscover.

## Ending a session (required, even when stopping early)

Before you stop — finished, out of credits, or interrupted — leave the tree committed and add a
Session Log entry at the top of that section in the ExecPlan:

```markdown
### YYYY-MM-DD HH:MM PT — <Codex|Claude>
- Done: <tasks/steps completed, with commit hashes>
- State: <clean | WIP commit <hash> — what is half-finished>
- Verified with: <real Supabase stack | Docker-free harness | not verified>
- Next: <the exact next step, and anything the next agent must re-check>
```

If work is unfinished, commit it as `wip: <task> — <what remains>` rather than leaving it uncommitted.

## Commit conventions

- Conventional prefixes as already used (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, `wip:`).
- Add a trailer naming the agent: `Agent: Codex` or `Agent: Claude` (Claude also adds its
  `Co-Authored-By` line).

## Verification

| Check | Command | Needs |
| --- | --- | --- |
| Lint / unit / build | `npm run lint && npm test && npm run build` | Node 22.13+ |
| Database (authoritative) | `npx supabase db reset && npx supabase test db` | Docker Desktop (Mac) |
| Database (fallback) | `scripts/pg-harness/run.sh .` | Linux, Postgres 17 + pgTAP, no Docker |
| Types | `npx supabase gen types typescript --local > src/types/database.ts` | running local stack |

The fallback harness emulates only the Supabase objects these migrations use. Evidence produced with it
must say so, and the next session with Docker must re-run the authoritative command before marking a
real-content readiness gate.

## Hard boundaries

- Synthetic data only. Never commit real personal content, credentials, `.env.local`, or exports.
- No remote Supabase linking, real accounts, or remote schema pushes without an explicit user checkpoint.
- Migrations are append-only once committed; fix forward with a new migration.
