---
paths:
  - "**/ARCHITECTURE.md"
  - "**/IMPLEMENTATION_NOTES.md"
  - "**/CLAUDE.md"
  - "**/README.md"
  - "**/INVARIANTS.md"
---

# Keeping the docs in sync

When adding packages or features, keep these root files in sync:

### ARCHITECTURE.md

- **PRESENT TENSE ONLY — describe the architecture as it stands, never how it got there.** No issue/PR numbers, no "used to", "was removed", "since #NNN", no account of what a refactor replaced. This holds for the root file **and every per-package `ARCHITECTURE.md`**. A deliberate ABSENCE is architecture and belongs here (a missing edge nobody may re-add, a predicate nobody may re-introduce) — but justify it by what holds today, not by which change removed it. History lives in **IMPLEMENTATION_NOTES.md**, changesets and issues; the two files have deliberately opposite policies, so a change that is worth remembering goes there, and the outcome it produced goes here
- Update **Package Map** directory tree, **Public packages** list, **Mermaid diagram** (add nodes + deps), and **Layer Rules** diagram
- **Invariants** section documents constraints that break the system if violated — not features
- Mermaid diagrams must remain valid (test rendering)

### IMPLEMENTATION_NOTES.md

- **Problem → Solution → Why** format for every decision record
- Include **Before/After** code examples where applicable
- **Never delete** historical decisions — they explain "why it's this way" (the mirror of ARCHITECTURE.md's present-tense rule above: the history belongs here and only here)
- New build strategies, tooling changes, and infrastructure decisions go here

### README.md

- **Framework Integration** table must list all adapter packages
- **Quick Start** shows core + one framework example only (keep concise)
- Link to **wiki** for detailed docs — README is an overview, not a manual
- Update "Framework-agnostic" feature bullet when adapters change

### CLAUDE.md (this file)

- Keep **package count** on line 5 accurate
- **See Also** must link to every package's CLAUDE.md
- **Non-Obvious Conventions** — only things that are hard to guess from code alone

### Package-level docs (per adapter)

- **ARCHITECTURE.md** — Source Structure diagram, key design decisions, data flow
- **CLAUDE.md** — Exports table, composables/hooks table, gotchas
- **README.md** — Quick Start, API tables, code examples per feature

### Wiki (separate repo: `real-router.wiki/`)

- **Integration Guide** per framework (Preact/Solid/Vue/Svelte/Angular-Integration.md) — kept in sync with adapter features
- **Per-API pages** (RouterProvider, Link, RouteView, useRouter, etc.) — include import alternatives for all frameworks
- **\_Sidebar.md** — links to all integration guides
- Move features from **Planned Features** → implemented sections when shipped
