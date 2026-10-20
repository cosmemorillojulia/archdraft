# Contributing

## Workflow

Work is planned in [docs/roadmap.md](docs/roadmap.md). Each task has a scope, deliverables and acceptance criteria. Pick the first pending task whose dependencies are done.

For every task (see [ADR 0011](docs/adr/0011-flujo-de-trabajo-y-commits.md)):

1. Branch off `main`: `git switch -c <type>/tNN-<slug>`, e.g. `feat/t02-lint-engine`.
2. Read the task and the documents it references.
3. Implement it with tests, committing in small, logical steps. Keep the scope to the task; note follow-ups in the roadmap instead of expanding it.
4. Update the documentation the change touches (see below), mark the task as done in the roadmap and add an entry to `CHANGELOG.md`.
5. Review the whole branch diff: simplify what can be simpler, then review it as a strict code reviewer would. Fix what comes up in further commits.
6. Run `pnpm check`. Nothing is merged unless it passes.
7. Merge with `git switch main && git merge --no-ff <branch> -m "<type>: <summary> (TNN)"`, delete the branch and push `main`.

If CI is red on `main`, fix it first in a `fix/...` branch before starting new work.

## Documentation rules

- A change that alters behaviour updates the relevant document in `docs/` in the same change set.
- A decision with alternatives worth recording gets an ADR in `docs/adr/` (copy `0000-plantilla.md`, take the next number). ADRs are immutable once accepted: to change a decision, write a new ADR that supersedes the old one.
- Each module gets a page under `docs/modulos/` when it is created.
- Documentation in `docs/` is written in Spanish; code, identifiers, comments and commit messages in English.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <summary in imperative mood, lower case, no final period>
```

- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `perf`.
- Scopes: `core`, `web`, `api`, `evals`, `docs`, `repo`.
- The scope is optional; use it when the change is confined to one package.
- One concern per commit. Tests may go with the code they cover.
- Merge commits follow the same convention and end with the task id: `feat: add design lint engine (T02)`.
- The body explains _why_ when it is not obvious from the summary.

## Code conventions

- TypeScript strict mode, no `any`. Validate untrusted input with the Zod schemas from `@archdraft/core`.
- Relative imports use explicit `.ts` extensions so that packages run natively on Node.js.
- Pure functions and immutable data in `packages/*`; side effects live in `apps/*`.
- Tests sit in each package's `test/` folder and are named `*.test.ts`. `packages/core` keeps coverage above its thresholds.
