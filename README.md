<p align="center"><img src="frontend/public/favicon.svg" alt="" width="96" height="96" /></p>

# Archdraft

Describe a cloud architecture in plain language and get an editable, reviewable diagram.

> **Status:** early development. The domain model, the editor and the AI assistant are in place; usage limits, the evaluation suite and the 1.0 polish come next, in the order described in the [roadmap](docs/roadmap.md).

## What it does

1. **Draft**: write "a REST API on containers behind a load balancer, with a Postgres database and a queue for async jobs" and get a structured diagram, not a picture.
2. **Edit**: move, connect and configure components on a canvas, or ask for changes in natural language.
3. **Improve**: ask the assistant for improvements, or for a simpler or a more complete version of the architecture, and apply the proposals you like.
4. **Review**: a rule engine flags design risks as you edit: single points of failure, databases exposed to the internet, long synchronous call chains.
5. **Export**: Mermaid, draw.io, PNG/SVG or JSON. Share a diagram with a link; nothing is stored on a server.

Diagrams are provider-agnostic and can be rendered for AWS, Google Cloud or Azure. The editor is available in English and Spanish.

## Architecture

```mermaid
flowchart LR
  user([User]) --> web["frontend<br/>React + React Flow<br/>GitHub Pages"]
  web -- "POST /v1/assist" --> api["backend<br/>Hono on Cloudflare Workers<br/>AI agent"]
  api --> llm["LLM<br/>Workers AI"]
  shared[["shared<br/>schema · validation · lint · exporters"]]
  web -. uses .-> shared
  api -. uses .-> shared
  evals["Evals<br/>GitHub Actions + Groq"] -. measures .-> api
```

Everything runs on free tiers, with no credit card involved. The full design is in [docs/arquitectura.md](docs/arquitectura.md).

## Tech stack

| Area         | Choice                                                               |
| ------------ | -------------------------------------------------------------------- |
| Language     | TypeScript (strict) across the stack                                 |
| Domain model | Zod 4: types, runtime validation and JSON Schema from one definition |
| Frontend     | React, Vite, Tailwind CSS, React Flow, ELK.js                        |
| Backend      | Hono on Cloudflare Workers, Workers AI                               |
| Quality      | Vitest, Playwright, ESLint (type-aware), Prettier, GitHub Actions    |
| Hosting      | GitHub Pages (web), Cloudflare Workers (API)                         |

## Repository layout

```
frontend/       # @archdraft/web: the editor, runs in the browser
  src/layout/   # automatic layout with ELK, run in a Web Worker
backend/        # @archdraft/api: Cloudflare Worker with the AI agent: create, edit, improve, simplify, extend
shared/         # @archdraft/shared: what both use: domain model, validation, lint, exporters, templates
docs/           # architecture, decisions (ADRs) and roadmap
```

## Getting started

Requirements: Node.js 22.12+ and pnpm 10.

```bash
pnpm install
pnpm check      # format, lint, typecheck, tests with coverage, build
```

| Script               | Purpose                         |
| -------------------- | ------------------------------- |
| `pnpm test`          | Run all unit tests              |
| `pnpm test:coverage` | Tests with coverage thresholds  |
| `pnpm lint`          | Type-aware ESLint               |
| `pnpm typecheck`     | `tsc --noEmit` in every package |
| `pnpm format`        | Format with Prettier            |

To try the AI assistant locally, copy `.env.secrets.example` to `.env.secrets` and put a Groq API key in it, then start the API with `make api` and the editor with `make run`. Shared, non-secret settings live in `.env.defaults`. Builds without `VITE_API_URL` work without AI. Details in [docs/modulos/backend.md](docs/modulos/backend.md).

## Acknowledgements

The canvas is built on [React Flow](https://reactflow.dev) by xyflow (MIT licence) and laid out with [ELK](https://eclipse.dev/elk/) through elkjs. The editor hides React Flow's corner link, which its licence allows; this section is where the credit lives instead.

## Documentation

Design documentation lives in [`docs/`](docs/README.md) and is written in Spanish (see [ADR 0009](docs/adr/0009-idioma.md)). Code, commits and this README are in English.

- [Architecture](docs/arquitectura.md)
- [Domain model](docs/modelo-de-dominio.md)
- [Architecture decision records](docs/adr/)
- [Roadmap](docs/roadmap.md)

## License

[MIT](LICENSE)
