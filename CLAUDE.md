# Real-Router

> Simple, powerful, view-agnostic, modular and extensible router

pnpm monorepo with 26 packages + 68 example applications. Run `pnpm install` after cloning.

## Rules

- **NEVER** push without explicit user request
- After completing a task, run: `pnpm build` (turbo runs the full graph: type-check → lint → test → build)
- Prefer editing existing files over creating new ones
- Keep changes minimal and focused

## Key Commands

```bash
pnpm build              # Build all packages (errors-only output)
pnpm build:verbose      # Build with full output (debugging)
pnpm test -- --run      # Run tests once (errors-only output)
pnpm test:verbose       # Tests with full output (debugging)
pnpm lint               # ESLint
pnpm type-check         # TypeScript
pnpm lint:deps          # Check dependency versions (syncpack)
pnpm lint:dedupe        # Check for duplicate deps
pnpm lint:e2e           # Verify e2e directories have spec files
pnpm lint:unused        # Check for unused code (knip)
```

## Non-Obvious Conventions

- 100% test coverage required (enforced in vitest.config). Framework adapters may have slightly lower thresholds for branches/functions due to compiler-generated phantom code (Solid: babel-preset-solid, Vue: defineComponent, Svelte: compiler transforms)
- Pinned versions (`save-exact=true` in .npmrc)
- Workspace packages use `workspace:^` protocol
- Dual ESM/CJS builds via tsup (Solid uses rollup + babel-preset-solid, Svelte uses svelte-package)
- `customConditions: ["development"]` in tsconfig — resolves workspace imports to `src/` via `"development"` export condition in each package.json
- Pre-push hook runs full validation (build + lint:types + lint:package)
- Pre-commit hook runs tests + knip + jscpd + `lint:e2e` (verifies e2e dirs have spec files)
- `outputLogs: "errors-only"` in turbo.json for all tasks — silent on success, full output on failure. Use `build:verbose`/`test:verbose` for debugging
- knip uses `ignoreWorkspaces: ["examples/**"]` — example apps are excluded from unused code analysis
- Vue examples use `vue-tsc -b` (not `tsc -b`) for SFC type checking
- Svelte examples use `vite build` only (no tsc step — Svelte compiler handles types)
- Never use `workspace:^` for `peerDependencies` on 0.x packages — in semver `^0.x.y` is patch-only range, so any minor bump breaks the range and triggers a major bump from changesets
- `onlyUpdatePeerDependentsWhenOutOfRange: true` is set in `.changeset/config.json` to prevent unexpected major bumps when peer deps are updated within range
- Runtime validation is opt-in via `@real-router/validation-plugin` — core ships with structural guards and two invariant guards only (subscribe, navigateToNotFound)

## Release Process

- **Main workflow:** `changesets.yml` — publishing via npm OIDC Trusted Publishing
- **Manual workflow:** `release.yml` — for emergency releases
- Trusted Publisher configured for all @real-router/* packages with workflow `changesets.yml`
- New packages must be published manually first (`npm publish`), then configure Trusted Publisher

## Versioning

- **Pre-1.0 phase:** Use `minor` for all changes, including breaking changes
- Major version bump only when full scope of work is complete and ready for stable release
- In changesets: use `minor` even for breaking changes until 1.0 release

## Changesets

See [.changeset/README.md](.changeset/README.md) for detailed guidelines on creating changesets.

## Documentation Maintenance

When adding packages or features, keep these root files in sync:

### ARCHITECTURE.md
- Update **Package Map** directory tree, **Public packages** list, **Mermaid diagram** (add nodes + deps), and **Layer Rules** diagram
- **Invariants** section documents constraints that break the system if violated — not features
- Mermaid diagrams must remain valid (test rendering)

### IMPLEMENTATION_NOTES.md
- **Problem → Solution → Why** format for every decision record
- Include **Before/After** code examples where applicable
- **Never delete** historical decisions — they explain "why it's this way"
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
- **Integration Guide** per framework (Preact/Solid/Vue/Svelte-Integration.md) — kept in sync with adapter features
- **Per-API pages** (RouterProvider, Link, RouteView, useRouter, etc.) — include import alternatives for all frameworks
- **_Sidebar.md** — links to all integration guides
- Move features from **Planned Features** → implemented sections when shipped

## See Also

- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and package structure
- [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) — Infrastructure decisions
- [packages/core/CLAUDE.md](packages/core/CLAUDE.md) — Core package architecture
- [packages/react/CLAUDE.md](packages/react/CLAUDE.md) — React integration architecture
- [packages/preact/CLAUDE.md](packages/preact/CLAUDE.md) — Preact integration architecture
- [packages/solid/CLAUDE.md](packages/solid/CLAUDE.md) — Solid.js integration architecture
- [packages/vue/CLAUDE.md](packages/vue/CLAUDE.md) — Vue 3 integration architecture
- [packages/svelte/CLAUDE.md](packages/svelte/CLAUDE.md) — Svelte 5 integration architecture
- [packages/browser-plugin/CLAUDE.md](packages/browser-plugin/CLAUDE.md) — Browser plugin architecture
- [packages/hash-plugin/CLAUDE.md](packages/hash-plugin/CLAUDE.md) — Hash plugin architecture
- [packages/logger-plugin/CLAUDE.md](packages/logger-plugin/CLAUDE.md) — Logger plugin architecture
- [packages/persistent-params-plugin/CLAUDE.md](packages/persistent-params-plugin/CLAUDE.md) — Persistent params plugin architecture
- [packages/ssr-data-plugin/CLAUDE.md](packages/ssr-data-plugin/CLAUDE.md) — SSR data plugin architecture
- [packages/validation-plugin/CLAUDE.md](packages/validation-plugin/CLAUDE.md) — Validation plugin architecture
- [packages/dom-utils/.claude/CLAUDE.md](packages/dom-utils/CLAUDE.md) — DOM utilities (route announcer, link helpers)
- [packages/fsm/CLAUDE.md](packages/fsm/CLAUDE.md) — FSM engine internals
- [packages/router-benchmarks/CLAUDE.md](packages/router-benchmarks/CLAUDE.md) — Benchmark suite
- [MCP Servers Guide](.claude/mcp-guide.md)
- [Wiki](https://github.com/greydragon888/real-router/wiki) (local: `/Users/olegivanov/WebstormProjects/real-router.wiki`)
