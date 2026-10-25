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
- `@archdraft/web`: readable diagram on phones (top-to-bottom layout, minimum scale and a scrolling canvas, tap to highlight), opaque groups that hide the canvas dots, a filled sparkles icon and a whole-page colour blend when the theme changes (ADR 0016).
- `@archdraft/web`: components palette on narrow screens as a bottom sheet that closes with its button, Escape, a tap outside or a drag down; Escape also closes the side panel.
- `@archdraft/web`: fixed header with only the product name and a floating diagram card (ADR 0015); fluid animations with Motion: the diagram builds from left to right, edges draw in and carry flowing particles, hovering a component highlights its connections, the palette slides and reflows, the active template slides, example prompts rotate and the theme spreads from the toggle.
- `@archdraft/web`: diagram canvas on React Flow: a pure `toFlow` adapter, layout in a Web Worker so ELK stays out of the initial load, zoom with the mouse wheel, trackpad or finger pinch and floating controls with fit, an initial view that keeps labels readable, a minimap on wide screens and provider badges on components; the build animation, flowing particles and highlight carry over from the preview.
- `@archdraft/web`: manual editing (ADR 0017): add components from the palette by clicking, tapping or dragging them onto the diagram, connect by dragging from a component or from the inspector, move nodes in and out of groups, duplicate and delete, with undo and redo (100 steps, buttons and keyboard shortcuts). A floating inspector edits names, products, providers, descriptions, operational facts and connection protocols and modes. Every edit is validated, and one that would make the diagram invalid is explained instead of applied.
- `@archdraft/web`: design review panel, opened from the review status of the diagram card: findings grouped by severity with filters, the rule behind each one, a click to select and centre the components involved, severity marks on the canvas, and rules that can be turned off in the browser. The review is recalculated once per version of the document.
- `@archdraft/core`: `documentToJson` and `importDocument` for a diagram with its layout (`{ graph, layout }`), also reading a bare graph; the graph goes through the same steps as `importJson`.
- `@archdraft/web`: the open diagram is saved in the browser and restored on the next visit; a Share menu creates a link with the whole diagram compressed in its fragment, warns when it is long, and downloads or opens JSON files (ADR 0019). Damaged or manipulated links and files are explained and never break the editor.
- `@archdraft/core`: generic shapes (`box`, `circle`, `diamond` and `note`, category `shape`) for simple flows, with `SHAPE_KINDS`, `isShapeKind`, `SHAPE_SIZES` and `defaultSizeOf`; Mermaid and draw.io draw them as their own shapes and the design rules ignore them.
- `@archdraft/web`: generic shapes first in the palette, resizable on the canvas, with a reduced inspector and counted apart in the diagram card; a button under the zoom controls hides or shows the particles on connections and the choice is remembered in the browser.
- `@archdraft/web`: the interface in English and Spanish (ADR 0020), switched with an EN/ES button in the header that shows the current language, remembers the choice and starts in Spanish when the browser prefers it. Kind names, design findings and templates are translated, and an untouched template follows the language.
- `@archdraft/web`: every node can be resized when selected, groups included (never smaller than what they hold, with their contents kept in place); palette tiles can be dragged onto the diagram with the mouse or, after holding them, with a finger, with the node following the pointer.
- `@archdraft/web`: export from the Share menu: copy or download Mermaid, download draw.io, and SVG and PNG images drawn from the document in the theme and language of the editor, with file names taken from the title.
- `@archdraft/web`: preview card for shared links (`og-image.png`, 1200 × 630) with the Open Graph and Twitter tags in `index.html`.
- `@archdraft/core`: six architecture templates (`ARCHITECTURE_TEMPLATES`) for the gallery and the generation prompt: three-tier web application, serverless API, event-driven microservices, RAG chatbot, analytics pipeline and static site with a headless CMS. They cover every provider, are valid without warnings and have no design findings.

### Changed

- `DEFAULT_NODE_SIZE` and `DEFAULT_CONTAINER_SIZE` moved from `@archdraft/layout` to `@archdraft/core`.
- `@archdraft/web`: the header shows the product name in slanted capitals, as a wordmark.
- `@archdraft/web`: every diagram opens fitted whole in the free part of the canvas, on phones too, instead of at a readable minimum zoom.
- `@archdraft/web`: the theme change is a cross-fade made with View Transitions where the browser supports them (ADR 0018), smoother on large diagrams; elsewhere the colour blend remains, and it no longer jumps at the end.
- `CONTAINER_PADDING` moved from `@archdraft/layout` to `@archdraft/core`, so the editor can place components inside groups without loading ELK.
- `@archdraft/web`: the header no longer links to the source code, React Flow's corner link is hidden (it is credited in the README), component names take up to two lines instead of being cut, the palette search ignores accents, and the diagram card says 1 component instead of 1 components.
- `@archdraft/web`: new logo, a small diagram shaped as an A inside drawing-sheet corner marks, as the page icon, the iOS home screen icon and at the top of the README.
- `@archdraft/web`: on touch screens the floating panels are nearly opaque instead of blurred, so the canvas under them is cheaper to redraw.

### Fixed

- `@archdraft/web`: dragging a node re-rendered every node and edge at each step and opened the inspector; it is now about twice as cheap and leaves the selection alone. A resize made with a finger was never saved.

- `@archdraft/web`: arrowheads were hidden inside the target or out of place, because connection points were measured in the middle of the entrance animation; they are now drawn by the edge, with the line ending at their base and the tip on the border.
- `@archdraft/web`: edges were unmounted and drawn in again after every edit or drag step, and looked cut short while a node moved, because React Flow dropped the measured size of each new node object; nodes now carry the size of the layout as measured.
