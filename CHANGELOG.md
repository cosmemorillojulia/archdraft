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
- `@archdraft/core`: draw.io export (`toDrawio`) with containers as draw.io containers, layout positions, styles by category, dashed async edges and labels escaped for XML and HTML.
- `@archdraft/web`: editor shell built with Vite, React and Tailwind CSS: drafting-sheet visual system with light and dark themes, base components, header, build panel with the component palette, canvas with the title block of the default template, details panel with tabs, a pane switcher for small screens and centralised strings.
- GitHub Pages deployment workflow that publishes the editor after CI passes on `main`.
- ADR 0013: visual direction based on the technical drawing sheet.
- `@archdraft/web`: canvas-first redesign (ADR 0014, superseding ADR 0013): full-window dot-grid canvas with a floating top bar, searchable components palette with category-coloured icons, prompt dock with one-click templates, design review status and a read-only diagram preview laid out with ELK on demand.
- `design-critique` skill from anthropics/knowledge-work-plugins for reviewing editor screenshots.
- `@archdraft/core`: six architecture templates (`ARCHITECTURE_TEMPLATES`) for the gallery and the generation prompt: three-tier web application, serverless API, event-driven microservices, RAG chatbot, analytics pipeline and static site with a headless CMS. They cover every provider, are valid without warnings and have no design findings.

### Changed

- `DEFAULT_NODE_SIZE` and `DEFAULT_CONTAINER_SIZE` moved from `@archdraft/layout` to `@archdraft/core`.
