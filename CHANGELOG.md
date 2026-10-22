# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Monorepo with pnpm workspaces, strict TypeScript, type-aware ESLint, Prettier and Vitest.
- Continuous integration on GitHub Actions and Dependabot configuration.
- `@archdraft/core`: diagram schema (Zod), component catalog with AWS, Google Cloud and Azure mappings, graph index and traversal utilities, structural validation and JSON Schema generation.
- Design documentation: vision, architecture, domain model, ADRs 0001–0011 and roadmap.
- `@archdraft/core`: design lint engine (`lintGraph`) with eight rules covering availability, exposure, encryption, synchronous coupling and unconnected components, and `resolveEdgeMode` to infer the mode of unannotated edges.
- ADR 0012: per-finding severity with a default per rule.
- `@archdraft/core`: Mermaid flowchart export (`toMermaid`) with nested subgraphs, shapes by category, dashed async edges and safe ids and labels; stable JSON export (`toJson`); `importJson` with a schema version migration chain (`migrateDocument`) and the `INVALID_JSON`, `UNSUPPORTED_SCHEMA_VERSION` and `MIGRATION_FAILED` codes.
- `@archdraft/core`: `DiagramLayout` and `DiagramDocument` schemas for the positions and sizes stored next to the graph.
- `@archdraft/layout`: `computeLayout` with ELK `layered`, nested containers, configurable direction, default sizes and pinned positions that keep a previous layout and only place new nodes.
