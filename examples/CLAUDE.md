# Examples

## Structure

Layout is organized by **runtime platform**, not by framework. Each platform subtree contains examples that ship for that platform.

```
examples/
  shared/                   ← framework-agnostic: store, api, abilities, styles
  web/                      ← standard browser runtime, Vite-based apps
    react/ preact/ solid/ vue/ svelte/
      shared/Layout.tsx     ← per-framework shell (header + sidebar + content)
      basic/                ← each example is a standalone Vite app
      nested-routes/
      ssr-examples/         ← (react, preact) thematic subgroup — server-rendering approaches
                            ←   react: ssr / ssr-streaming / ssg / ssr-rsc (4 — RSC unique to React)
                            ←   preact: ssr / ssr-streaming / ssg (3 — no RSC; Preact design choice)
      navigation-api/       ← (react only) navigation-plugin exclusive extensions, 5 UX scenarios
      hash-examples/        ← (react) thematic subgroup — hash-fragment + scroll coordination
        link-hash/          ← <Link hash> + state.context.url tab UI demo (#532)
        scroll-restoration/ ← createScrollRestoration behavior matrix, 7 scenarios / 13 e2e tests
        scroll-spy/         ← createScrollSpy URL hash tracks visible section (#575, planned)
      animation-examples/   ← (react) thematic subgroup — four approaches to route animations
        view-transitions/   ← browser View Transitions API
        route-animations/   ← centralised CSS-classes policy (subscribeLeave + manual FLIP)
        page-animations/    ← distributed per-page useEffect hook
        motion-animations/  ← library-driven (motion, formerly Framer Motion) — AnimatePresence + layoutId
      ssr-examples/         ← (react) thematic subgroup — four server-rendering approaches
        ssr/                ← classical Express + Vite SSR (renderToString)
        ssr-streaming/      ← React 19 renderToReadableStream + <Suspense> + use(promise)
        ssr-rsc/            ← React Server Components + Flight protocol via @vitejs/plugin-rsc
        ssg/                ← static site generation (build-time renderToString per route)
      ...
    preact/
      shared/Layout.tsx
      basic/
      ssr-examples/         ← (preact) thematic subgroup — three server-rendering approaches
        ssr/                ← classical Express + Vite SSR (preact-render-to-string renderToString)
        ssr-streaming/      ← Preact 10 renderToReadableStream + chunked transfer (no use(promise) — sync siblings)
        ssg/                ← static site generation (build-time renderToString per route)
                            ← NO ssr-rsc/ — Preact does not support RSC by design
      ...
    vue/
      shared/Layout.vue
      basic/
      ssr-examples/         ← (vue) thematic subgroup — three server-rendering approaches
        ssr/                ← classical Express + Vite SSR (renderToString)
        ssr-streaming/      ← Vue 3 renderToWebStream + <Suspense> + async setup() (no out-of-order placeholders — see README)
        ssg/                ← static site generation (build-time renderToString per route)
      ...
    solid/
      shared/Layout.tsx
      basic/
      ssr-examples/         ← (solid) thematic subgroup — three server-rendering approaches
        ssr/                ← classical Express + Vite SSR (renderToString + generateHydrationScript)
        ssr-streaming/      ← Solid renderToStream + <Suspense> + createResource + <ErrorBoundary> (true OOO Suspense + selective hydration)
        ssg/                ← static site generation (build-time renderToString per route + dual-mode mount)
      ...
    svelte/
      shared/Layout.svelte
      basic/
      ssr-examples/         ← (svelte) thematic subgroup — three server-rendering approaches
        ssr/                ← classical Express + Vite SSR (await render() + <svelte:head> head injection)
        ssr-streaming/      ← Svelte 5 RSC-like deferred-data SSR via {#await} blocks (server ships pending UI, async resolution on client; no chunked HTTP)
        ssg/                ← static site generation (build-time await render() per route + explicit hydrate-vs-mount dual-mode)
      ...
    angular/                ← uses @angular/build (ng build) + sirv for preview, not Vite directly
      shared/Layout.ts
      basic/                ← each example has angular.json + tsconfig.app.json
      nested-routes/
      ssr-examples/         ← (angular) thematic subgroup — three server-rendering approaches
        ssr/                ← classical Express + AngularNodeAppEngine (provideRealRouterFactory + REQUEST per request)
        ssr-streaming/      ← AngularNodeAppEngine + @defer (on viewport/hover) + withIncrementalHydration() — per-defer block lazy hydration
        ssg/                ← static site generation (in-process AngularNodeAppEngine on build-only port + getStaticPaths + sirv preview)
      ...
  desktop/                  ← native-host runtime, webview-based apps
    electron/               ← React renderer + Electron main process (Chromium)
      react/                ← browser-plugin + app:// custom protocol
      react-hash/           ← hash-plugin + file:// (no custom protocol)
      react-navigation/     ← navigation-plugin + HistoryPanel (all 9 exclusive methods)
    tauri/                  ← React renderer + Tauri v2 (Rust main, host WebView)
      react/                ← browser-plugin + tauri:// scheme
      react-navigation/     ← navigation-plugin + OS requirements README
  console/                  ← terminal runtime
    react-ink/              ← React + Ink + memory-plugin; useFocus/useInput-driven
```

Future platforms (`miniapps/`, `mobile/`, …) slot in as additional top-level folders under `examples/`.

Imports from per-framework `shared/Layout` use `../../shared/Layout` (unchanged — shared moved alongside the apps). Imports from top-level `examples/shared/styles.css` use `../../../../shared/styles.css` (one extra `..` segment after reorg).

### Thematic subgroups

When **three or more examples** explore the same problem space with different trade-offs, they go into a thematic subgroup directory (e.g. `animation-examples/`, `ssr-examples/`) rather than living flat alongside unrelated examples. Existing subgroups: `animation-examples/` (four route-animation approaches), `ssr-examples/` (four server-rendering approaches: classical SSR, streaming SSR, RSC, SSG), and `hash-examples/` (hash-fragment + scroll coordination: `<Link hash>` tab UI, scroll-restoration anchor scrolling, scroll-spy URL hash tracking).

Subgrouped examples sit one extra level deeper, so their imports adjust:

- `Layout` import: `../../../shared/Layout` (one extra `..`)
- Top-level styles: `../../../../../shared/styles.css` (one extra `..`)
- `tsconfig.json` `include`: `["src", "../../shared"]` (per-framework shared, one extra `..`)

Workspace glob (`pnpm-workspace.yaml`) includes `examples/web/*/*/*` to register subgrouped packages.

**When to create a subgroup**: ≥3 examples on one theme. Below that threshold, keep them flat — premature grouping for two examples adds nesting without comparison value. Subgroups should appear in **all relevant adapter directories simultaneously** (e.g. when Phase 2 replicates animation examples to preact/vue/solid/svelte/angular, each adapter gets its own `animation-examples/` subgroup — symmetry is more important than minimising depth).

## Desktop-specific notes (`desktop/electron/`, `desktop/tauri/`)

- `desktop/electron/*/` examples have an additional `electron/` directory for the main process (TypeScript) plus a dedicated `electron/tsconfig.json` that emits `dist-electron/`. Dev mode loads `VITE_DEV_SERVER_URL`; prod mode loads `app://` via a custom protocol registered in `main.ts` (or `file://` in `react-hash`).
- `desktop/tauri/*/` examples have a `src-tauri/` directory (Rust project — `Cargo.toml`, `tauri.conf.json`, `src/{main,lib}.rs`). CI only builds the Vite frontend and runs Playwright against `vite preview` on port 4173. A full `tauri build` is a manual sanity check on a supported OS before merging.
- `src-tauri/tauri.conf.json` must have a unique `productName` + `identifier` per example — otherwise `tauri build` refuses to generate the bundle on a machine that already has another example installed.
- `safeParseUrl` is scheme-agnostic (since #496), so `app://`, `tauri://`, and `file://` all work without protocol whitelisting. See [IMPLEMENTATION_NOTES.md](../IMPLEMENTATION_NOTES.md#safeparseurl--scheme-agnostic-parser-496).
- See [Desktop Integration Guide](https://github.com/greydragon888/real-router/wiki/Desktop-Integration) in the wiki for the full plugin × runtime compatibility matrix and plugin selection tree.

## Angular-specific notes

- Angular examples use `@angular/build:application` builder (the standard Angular CLI 21 tool) instead of the bare Vite config used by other frameworks. Reason: `@real-router/angular` is published by ng-packagr in partial-AOT mode (`ɵɵngDeclareComponent`), which requires the Angular linker step during application build. Only `@angular/build` integrates the linker automatically; `@analogjs/vite-plugin-angular` alone leaves the linker off for external node_modules and throws `JIT compiler unavailable` at runtime.
- Unit tests in Angular examples still use `vitest` + `@analogjs/vitest-angular` (via `vite.config.ts` / `vitest.config.ts`), which is decoupled from the `ng build` pipeline.
- Preview for Playwright runs via `sirv --single` (not `vite preview`) because ng build output is a standalone `dist/<name>/browser/` directory without a Vite dev server.
- `index.html` must include `<base href="/" />` so nested deep links (e.g. `/users/1`) load `main.js` via an absolute path.
- Lazy loading is done via native Angular `@defer` blocks — the compiler automatically creates per-component chunks without `import()` boilerplate.
- SSR examples (`ssr-examples/{ssr,ssr-streaming,ssg}/`) use `@angular/build:application` with `outputMode: "server"` + `ssr.entry`. The runtime SSR + streaming examples ship a `server-runner.mjs` Node wrapper at the example root because the compiled `server.mjs`'s `isMainModule` check is fragile across @angular/ssr versions (see plan §6.5.1 finding 3 + ssr/README.md "Why server-runner.mjs?"). The SSG example uses an in-process SSR pipeline at build time (boots `server.mjs` on a build-only port, `fetch`-es each URL, persists static HTML, then `process.exit(0)`) — see `ssg/scripts/ssg-build.ts` header docstring for the architectural rationale (vs `renderApplication` direct, which hits NG0201).
- All three Angular SSR examples require `@angular/router` as a peer dep (with a stub `path: "**"` route) to satisfy `@angular/ssr`'s URL matching. The actual app routing uses Real-Router via `<route-view>` — `@angular/router` is purely a SSR pipeline placeholder.
- All three Angular SSR examples require `security.allowedHosts: ["localhost"]` in `angular.json` — Angular 21 SSR rejects unrecognized hosts by default (SSRF prevention).

## Rules

- Each example is a standalone Vite app with its own `package.json`
- Dependencies use `workspace:^` protocol
- Shared files imported via relative paths: `../../shared/store`
- Layout imported from `../shared/Layout`
- No CSS frameworks — shared `styles.css` only
- No external state managers — shared microstore (`store.ts`)
- Data loading via route config `loadData` + plugin, NOT `useEffect`/`onMount`

## Writing E2E Tests

**MANDATORY: explore the app visually BEFORE writing tests.**

1. Build: `pnpm build`
2. Start preview: `pnpm preview &`
3. Use Playwright MCP: `browser_navigate` → `browser_snapshot` → see real DOM
4. Write tests matching ACTUAL selectors, headings, URLs
5. Kill preview: `lsof -ti:4173 | xargs kill -9`
6. Run: `pnpm test:e2e`

**NEVER guess selectors from source code.** The DOM may differ from what JSX suggests:
- `forwardTo` changes URLs (sidebar link `/users` may resolve to a different child route via redirect)
- Route tree swap changes sidebar content at runtime
- `keepAlive` preserves hidden components in DOM (`.card` selector may match multiple)
- Hash routing uses `#!/` prefix in URLs
- Persistent params add `?lang=en` to all URLs

**Common pitfalls:**
- `useSyncExternalStore` needs immutable snapshots — mutating arrays breaks reactivity
- `onTransitionError` does NOT fire for `TRANSITION_CANCELLED` — use `onTransitionCancel`
- Navigating to current route → `SAME_STATES`, not `TRANSITION_CANCELLED`
- Nested routes need nested `<RouteView nodeName="parent">`, not `segment="parent.child"`
- `viewTransitions` prop is a no-op in browsers without `document.startViewTransition` — do not assert VT pseudo-elements in e2e without a feature-detect (or gate the assertion on `typeof document.startViewTransition === "function"`)

## Playwright Config

All examples use the same pattern:

```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  retries: 1,
  webServer: {
    command: "pnpm preview",
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
  use: {
    baseURL: "http://localhost:4173",
  },
});
```

## Scenario Plans

See `.claude/example-scenarios.md` for full scenario descriptions and implementation plan.
