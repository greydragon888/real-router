# ssr-data-plugin

## 0.4.14

### Patch Changes

- [#1521](https://github.com/greydragon888/real-router/pull/1521) [`d72cff0`](https://github.com/greydragon888/real-router/commit/d72cff062862967806de3265ff903bfc7e2d3122) Thanks [@greydragon888](https://github.com/greydragon888)! - Source types from `@real-router/core` (was the now-folded `@real-router/types`) ([#1520](https://github.com/greydragon888/real-router/issues/1520))

  Type imports move `@real-router/types` → `@real-router/core`, and the `StateContext`
  module augmentation retargets `declare module "@real-router/types"` → `"@real-router/core/types"`
  (wave-2 fold). Internal repackaging — no public API or runtime-behaviour change.

## 0.4.13

### Patch Changes

- Updated dependencies [[`381c597`](https://github.com/greydragon888/real-router/commit/381c5974fd0899390f37bc0b793f2c728f494fa3)]:
  - @real-router/types@0.39.0

## 0.4.12

### Patch Changes

- [#1138](https://github.com/greydragon888/real-router/pull/1138) [`c48e5b9`](https://github.com/greydragon888/real-router/commit/c48e5b903ca245f6c0be4aa2fa7b44ed98c93f53) Thanks [@greydragon888](https://github.com/greydragon888)! - Handle a hydration source without a `context` field without crashing ([#762](https://github.com/greydragon888/real-router/issues/762))

  A partial hydration source object (`{ name, path }` with no `context`) is type-legal via `hydrateRouter`'s `{ path: string }` object-source cast, yet the `start()` interceptor's `config.namespace in hydrationState.context` check threw a bare `TypeError: Cannot use 'in' operator to search for 'data' in undefined`. The shared SSR loader factory now guards `hydrationState.context !== undefined` before the lookup — a missing context is treated as "no server value for this namespace", so the loader runs normally. Behavior for every valid hydration input is unchanged.

## 0.4.11

### Patch Changes

- [#1134](https://github.com/greydragon888/real-router/pull/1134) [`6be188f`](https://github.com/greydragon888/real-router/commit/6be188f097f6fe3c9db39520bd15814a96f22394) Thanks [@greydragon888](https://github.com/greydragon888)! - Keep the server-only defer wire-format out of the client `.` bundle ([#761](https://github.com/greydragon888/real-router/issues/761))

  `shared/ssr/deferRegistry.ts` is split into `deferRegistryClient.ts` (client hydration — `ensureRegistryPromise` + the registry global) and `deferWireFormat.ts` (server-only `escapeForScript` / `formatSettleScript` / `getDeferBootstrapScript`, plus their module-level `RegExp` / `Object.fromEntries` initialisers the bundler cannot prove pure). `createSsrLoaderPlugin` now imports only the client module, so the chunk behind `dist/esm/index.mjs` sheds the ~600–800 B of server-only wire-format that used to ride along. Public API and runtime behavior are unchanged — the wire-format still ships from `@real-router/ssr-data-plugin/server`.

## 0.4.10

### Patch Changes

- [`a12fbd9`](https://github.com/greydragon888/real-router/commit/a12fbd9c33daa401b48b0b10e8749c60c6ab6b40) Thanks [@greydragon888](https://github.com/greydragon888)! - Widen `@real-router/core` peer range to prevent unwanted major bumps (changesets/changesets#822)

  The peer dependency was `workspace:^`, published as `^0.62.0` — patch-only on 0.x,
  so any core minor bump went out of range and changesets escalated this package to a
  major bump. Changed to `workspace:>=0.1.0` (publishes as `>=0.1.0`), keeping core
  minor bumps in range. Backward-compatible range widening — no consumer breakage;
  works in tandem with the existing `onlyUpdatePeerDependentsWhenOutOfRange: true`.

## 0.4.9

### Patch Changes

- Updated dependencies [[`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5), [`7971e79`](https://github.com/greydragon888/real-router/commit/7971e7962652c924744a01350ea345b1bc6f6db5)]:
  - @real-router/core@0.62.0
  - @real-router/types@0.38.0

## 0.4.8

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/types@0.37.0

## 0.4.7

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.4.6

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.4.5

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.4.4

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.4.3

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.4.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - `defer()` formal API for critical/deferred split ([#610](https://github.com/greydragon888/real-router/issues/610))

  Loaders may now return `defer({ critical, deferred })` to split per-route data
  into a critical bundle (resolved before the shell renders) and a record of
  deferred promises (streamed after as they resolve). This is the standard
  pattern shipped by SvelteKit `streamed`, Remix / RR7 `defer()`, and TanStack
  Start `defer()`.

  ```ts
  import { defer } from "@real-router/ssr-data-plugin";
  import { LoaderNotFound } from "@real-router/ssr-data-plugin/errors";

  export const loaders = {
    "products.detail": () => (params) => {
      const product = getProduct(params.id);
      if (!product) throw new LoaderNotFound(`product:${params.id}`);

      return defer({
        critical: { product },
        deferred: {
          reviews: fetchReviews(params.id),
          related: fetchRelated(params.id),
        },
      });
    },
  };
  ```

  Plugin output:
  - `state.context.data` — critical payload (existing contract).
  - `state.context.ssrDataDeferred` — `Record<string, Promise<unknown>>` of the
    deferred promises (server) or registry-backed promises reconstructed from
    the inline settle scripts (client post-hydration).
  - `state.context.ssrDataDeferredKeys` — `string[]` of declared keys, included
    in the SSR state so the client-side plugin can reconstruct the deferred map.

  New server-side subpath `@real-router/ssr-data-plugin/server` exports:
  - `injectDeferredScripts(reactStream, deferredMap, options?)` — wraps an HTML
    `ReadableStream` (e.g. from React 19's `renderToReadableStream`) with inline
    `<script>__rrDefer__("key", json)</script>` chunks emitted as each deferred
    promise resolves. Order is by resolution time.
  - `getDeferBootstrapScript()` — returns the inline JS (no `<script>` wrapper)
    that installs the global `__rrDeferRegistry__` + `__rrDefer__` /
    `__rrDeferError__` functions. Embed once in `<head>` so React's hydration
    walks the pristine `#root` subtree it expects.

  `devalue` / `superjson` integration: pass `{ serialize: devalue.stringify }`
  to `injectDeferredScripts` for non-JSON deferred payloads (Date / Map / Set /
  RegExp / BigInt). The wire-format remains a JSON string the client
  `JSON.parse`s — combine with `hydrateRouter(router, json, { deserialize })`
  from `@real-router/core/utils` for matching critical-data shapes.

  Non-breaking — loaders that return plain values continue to work unchanged
  and never touch the new namespaces. The plugin's `subscribeLeave` revalidation
  channel (`invalidate(router, "data")`, [#605](https://github.com/greydragon888/real-router/issues/605)) also handles deferred returns:
  `router.navigate({ reload: true })` after `invalidate(...)` re-runs the loader
  and overwrites both critical data and the deferred map.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Skip loader call on hydration when `data` namespace is pre-resolved ([#596](https://github.com/greydragon888/real-router/issues/596))

  When `hydrateRouter()` is invoked, the plugin's `start` interceptor consults
  the one-shot hydration scratchpad and reuses the server-resolved value at
  `state.context.data` instead of running the loader a second time. Pure CSR
  `start()` calls and subsequent post-hydration starts continue to run loaders
  as today.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `invalidate(router, "data")` helper for client-side revalidation ([#605](https://github.com/greydragon888/real-router/issues/605))

  Marks the `"data"` namespace as stale on the given router. The next
  navigation (including a same-route reload) re-runs the loader for the
  destination route and overwrites `state.context.data` (and the mode
  marker) via the plugin's `subscribeLeave` listener — fresh data lands
  on the state snapshot **before** `TRANSITION_SUCCESS` fires, so
  subscribers see the new payload.

  `void` (fire-and-forget) return — honest semantics. Compose with the
  existing core API for an explicit synchronous round-trip:

  ```ts
  import { invalidate } from "@real-router/ssr-data-plugin";

  // Fire-and-forget — stale until any next navigation
  invalidate(router, "data");

  // Explicit await — pair with a same-route reload
  invalidate(router, "data");
  await router.navigate(state.name, state.params, { reload: true });
  ```

  Closes the parity gap with Nuxt `useAsyncData(...).refresh()` and
  SolidStart `redirect("/path", { revalidate })`. Surgical alternative
  to `router.navigate({ reload: true })`: only `"data"` re-runs;
  companion plugins (e.g. `rsc-server-plugin`) keep their cached
  `state.context.<ns>` unless their own `invalidate()` was also called.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add per-route SSR mode ([#597](https://github.com/greydragon888/real-router/issues/597))

  `ssrDataPluginFactory` now accepts a per-route object form `{ ssr?, loader? }`
  where `ssr` is `"full" | "data-only" | "client-only" | boolean | (state) => SsrMode`.
  The resolved mode is published to `state.context.ssrDataMode`. New helper
  `getSsrDataMode(state)` returns the mode (fallback `"full"`).

  When mode is `"client-only"` the loader is **skipped on every `start()` call**
  (server and client). The application reads the mode marker and triggers its own
  client-side fetching strategy. Short-form (loader factory directly) remains valid.

  Breaking on the type level: `DataLoaderFactoryMap` now accepts a union of
  factory or `{ ssr?, loader? }` per entry. Existing consumers passing a factory
  directly continue to work; consumers iterating the map (`Object.entries`) need
  a narrow / cast (e.g. `(Object.entries(loaders) as [string, DataLoaderFnFactory][])`).

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/ssr-data-plugin/errors` subpath with typed loader errors ([#594](https://github.com/greydragon888/real-router/issues/594))

  Exports `LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, and `withTimeout` from a new `errors` subpath. Replaces the per-example `_loader-errors.ts` files that were duplicated across 12 examples (`react/vue/solid/svelte/angular` × `ssr/ssr-streaming/ssg/ssr-rsc`).

  Loaders bridge to HTTP semantics by throwing typed errors; handlers match by the structural `code` field (`"LOADER_NOT_FOUND"`, `"LOADER_REDIRECT"`, `"LOADER_TIMEOUT"`) without `instanceof`:

  ```ts
  import {
    LoaderNotFound,
    LoaderRedirect,
    withTimeout,
  } from "@real-router/ssr-data-plugin/errors";

  const loaders: DataLoaderFactoryMap = {
    "users.profile": () => (params) =>
      withTimeout("users.profile", 250, async () => {
        const user = await fetchUser(params.id);
        if (!user) throw new LoaderNotFound(`user:${params.id}`);
        return { user };
      }),
  };
  ```

  Errors live in `shared/ssr/errors.ts` and are mirror-exported by `@real-router/rsc-server-plugin/errors` — RSC apps can throw the same shapes without depending on `ssr-data-plugin`.

  Zero runtime impact on the main entry — `errors` is a separate dist file (`dist/{esm,cjs}/errors.{mjs,js}`), tree-shaken when unused.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - withTimeout passes AbortSignal to loader for cooperative cancellation ([#598](https://github.com/greydragon888/real-router/issues/598))

  The `loader` argument signature changes from `() => Promise<T>` to
  `({ signal }) => Promise<T>`. The signal aborts synchronously when the
  deadline elapses (before the race rejects with `LoaderTimeout`), so loader
  I/O honoring the signal — e.g. `fetch(url, { signal })` — is actually
  cancelled at the network layer. Optional `options.upstreamSignal` composes
  via `AbortSignal.any`, so the loader's signal aborts on whichever happens
  first: the deadline OR an upstream client-disconnect.

  If `options.upstreamSignal` is already aborted at call time, the loader
  is _not_ invoked and the timer is _not_ started — `withTimeout` rejects
  immediately with the upstream's reason.

  Breaking on the type level — TS permits passing a parameter-less function
  to a callback expecting `{ signal }`, so existing call sites that ignore
  the new arg keep working. Cancellation is cooperative — loaders that
  don't pass `signal` into their I/O still run to completion (current
  behavior preserved).

  Requires Node 20.3+ for `AbortSignal.any`.

### Patch Changes

- Updated dependencies [[`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c), [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c)]:
  - @real-router/core@0.53.0

## 0.3.4

### Patch Changes

- [#572](https://github.com/greydragon888/real-router/pull/572) [`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783) Thanks [@greydragon888](https://github.com/greydragon888)! - Internal refactor: extract validate-compile-loop + start-interceptor + claim/teardown logic to `shared/ssr/createSsrLoaderPlugin` ([#566](https://github.com/greydragon888/real-router/issues/566))

  `factory.ts` is now a thin adapter that validates loaders and forwards to the generic `createSsrLoaderPlugin<unknown, Dependencies>`. `validation.ts` is now a thin alias `createLoadersValidator(ERROR_PREFIX)`. Both helpers live in the new `shared/ssr/` directory and are consumed via a git-tracked symlink at `src/shared-ssr` (same pattern as `shared/browser-env/` for browser/hash/navigation-plugin and `shared/dom-utils/` for framework adapters). The companion plugin `@real-router/rsc-server-plugin` consumes the same helpers with `T = ReactNode` and `namespace = "rsc"`.

  **Public API unchanged.** All existing tests pass without modification. No runtime behavior change. Bundle output is structurally identical (same logic, same dependencies, +0.02 KB ESM gzipped).

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a), [`a90f9cf`](https://github.com/greydragon888/real-router/commit/a90f9cfb88ac155478fd9a2f628cb4f68258c70a)]:
  - @real-router/core@0.51.0
  - @real-router/types@0.35.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`8e4551f`](https://github.com/greydragon888/real-router/commit/8e4551f36af69732c0889f92a08e593a723b76c6)]:
  - @real-router/core@0.50.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23), [`4db4ada`](https://github.com/greydragon888/real-router/commit/4db4ada42154d4101bd7fde6a7e9fa041ca35e23)]:
  - @real-router/core@0.49.0

## 0.3.0

### Minor Changes

- [#456](https://github.com/greydragon888/real-router/pull/456) [`8989831`](https://github.com/greydragon888/real-router/commit/8989831062090cf6e94788a0acdc8a0cee54e0b5) Thanks [@greydragon888](https://github.com/greydragon888)! - Add DI access to data loaders via factory pattern ([#439](https://github.com/greydragon888/real-router/issues/439))

  **Breaking Change:** `DataLoaderMap` is replaced by `DataLoaderFactoryMap`. Loaders are now factory functions `(router, getDependency) => loaderFn` instead of plain functions `(params) => Promise<unknown>`.

  **Migration:**

  ```diff
  - const loaders: DataLoaderMap = {
  -   "users.profile": (params) => fetchUser(params.id),
  + const loaders: DataLoaderFactoryMap = {
  +   "users.profile": () => (params) => fetchUser(params.id),
    };
  ```

  With DI:

  ```typescript
  const loaders: DataLoaderFactoryMap = {
    "users.profile": (_router, getDep) => (params) => {
      return getDep("db").query("SELECT * FROM users WHERE id = ?", params.id);
    },
  };
  ```

## 0.2.1

### Patch Changes

- Updated dependencies [[`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38), [`cd12f8a`](https://github.com/greydragon888/real-router/commit/cd12f8a5046e95dff8d162b9264076684a838b38)]:
  - @real-router/core@0.48.0
  - @real-router/types@0.34.0

## 0.2.0

### Minor Changes

- [#443](https://github.com/greydragon888/real-router/pull/443) [`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/internal-source` export condition for monorepo-internal src resolution ([#431](https://github.com/greydragon888/real-router/issues/431))

  A new scoped export condition `@real-router/internal-source` is added to the package exports. Monorepo-internal TypeScript checking (via `tsconfig.json` `customConditions`) and Vitest (via the `workspaceSourceAliases` helper) now resolve `@real-router/*` imports to their `src/*.ts` files directly — no `dist/` artifacts required.

  External consumers (Vite, Webpack, Node.js) don't recognize this scoped condition name, so they continue to resolve via `import` / `require` → `dist/` exactly as before. The `@real-router/internal-source` entry is invisible to non-monorepo tools and doesn't change published package behavior.

  This structurally eliminates the race condition that caused flaky CI type-checks ([#431](https://github.com/greydragon888/real-router/issues/431)) and makes the monorepo resilient to incomplete `.d.ts` generation from tsdown + rolldown RC ([#425](https://github.com/greydragon888/real-router/issues/425)).

### Patch Changes

- Updated dependencies [[`7801bad`](https://github.com/greydragon888/real-router/commit/7801bad69d20728a0816f4d84c42cb8fbcf30a97)]:
  - @real-router/core@0.47.0

## 0.1.10

### Patch Changes

- Updated dependencies [[`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1), [`f5f2abc`](https://github.com/greydragon888/real-router/commit/f5f2abc7fd525b2eb0cea1b3e701059ee75cc3f1)]:
  - @real-router/core@0.46.0

## 0.1.9

### Patch Changes

- [#424](https://github.com/greydragon888/real-router/pull/424) [`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33) Thanks [@greydragon888](https://github.com/greydragon888)! - Remove `"development"` export condition that broke Vite consumers ([#421](https://github.com/greydragon888/real-router/issues/421))

- Updated dependencies [[`41ba6a0`](https://github.com/greydragon888/real-router/commit/41ba6a0e0dfe8ba426109454b85a2dc6ac999c33)]:
  - @real-router/core@0.45.2

## 0.1.8

### Patch Changes

- [#419](https://github.com/greydragon888/real-router/pull/419) [`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c) Thanks [@greydragon888](https://github.com/greydragon888)! - Exclude `src/` from npm tarball to prevent Vite resolving source files ([#418](https://github.com/greydragon888/real-router/issues/418))

- Updated dependencies [[`31bcf07`](https://github.com/greydragon888/real-router/commit/31bcf07001bcaf57b760715633760dda91d3832c)]:
  - @real-router/core@0.45.1

## 0.1.7

### Patch Changes

- Updated dependencies [[`027fd5f`](https://github.com/greydragon888/real-router/commit/027fd5f300b6abdd365580f7f2d0c1229822f76f)]:
  - @real-router/core@0.45.0

## 0.1.6

### Patch Changes

- Updated dependencies [[`98d5e4f`](https://github.com/greydragon888/real-router/commit/98d5e4f7fdef86569e3c162101d0fecec58474bc)]:
  - @real-router/core@0.44.0

## 0.1.5

### Patch Changes

- Updated dependencies [[`b73ba6e`](https://github.com/greydragon888/real-router/commit/b73ba6e5bbdc4e7628491d0b382b7c2827fbd780)]:
  - @real-router/core@0.43.0

## 0.1.4

### Patch Changes

- Updated dependencies [[`7f92e19`](https://github.com/greydragon888/real-router/commit/7f92e190053646c02c7263001fffbcdcaaa550e8)]:
  - @real-router/core@0.42.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`fce4316`](https://github.com/greydragon888/real-router/commit/fce43162adc4423bb4423eacd23c91f19e99b7f0)]:
  - @real-router/core@0.41.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`fb7d2e1`](https://github.com/greydragon888/real-router/commit/fb7d2e1fe128b69249395bc691110a078cf5d440)]:
  - @real-router/core@0.40.0

## 0.1.1

### Patch Changes

- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
- Updated dependencies [d1ebff8]
  - @real-router/core@0.39.0

## 0.1.0

### Minor Changes

- [#323](https://github.com/greydragon888/real-router/pull/323) [`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/ssr-data-plugin` — SSR per-route data loading ([#298](https://github.com/greydragon888/real-router/issues/298))

  New plugin that intercepts `start()` to load per-route data before server rendering. Data is stored in a `WeakMap<State, unknown>` and accessible via `router.getRouteData()`.

  ```typescript
  import { ssrDataPluginFactory } from "@real-router/ssr-data-plugin";

  router.usePlugin(
    ssrDataPluginFactory({
      "users.profile": async (params) => fetchUser(params.id),
    }),
  );

  const state = await router.start(url);
  const data = router.getRouteData();
  ```

  SSR-only by design — does not intercept `navigate()`.

### Patch Changes

- Updated dependencies [[`0993a4f`](https://github.com/greydragon888/real-router/commit/0993a4f4dd6075e1ad979bd1230e7112bf9ee888)]:
  - @real-router/core@0.38.0
