# @real-router/rsc-server-plugin

## 0.2.8

### Patch Changes

- Updated dependencies [[`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4), [`70eae16`](https://github.com/greydragon888/real-router/commit/70eae16d05ccfd0195e50483ddcf52246801c6d4)]:
  - @real-router/core@0.61.0
  - @real-router/types@0.37.0

## 0.2.7

### Patch Changes

- Updated dependencies [[`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6), [`f87881d`](https://github.com/greydragon888/real-router/commit/f87881d1a9125c55a0a9ff9354f309d87e16e2a6)]:
  - @real-router/core@0.60.0

## 0.2.6

### Patch Changes

- Updated dependencies [[`e3caf73`](https://github.com/greydragon888/real-router/commit/e3caf7398daf17a85fc652fd4209aa6c5acd6cc1)]:
  - @real-router/core@0.59.0

## 0.2.5

### Patch Changes

- Updated dependencies [[`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b), [`32c062d`](https://github.com/greydragon888/real-router/commit/32c062dc72efa0eb9463596059fa723965b28f5b)]:
  - @real-router/core@0.58.0

## 0.2.4

### Patch Changes

- Updated dependencies [[`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16), [`e6b8340`](https://github.com/greydragon888/real-router/commit/e6b83400a0ced7245ad33adf7be9e9b29b818f16)]:
  - @real-router/core@0.57.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae), [`2cf5293`](https://github.com/greydragon888/real-router/commit/2cf529322894f48f96152e767bf303806397cfae)]:
  - @real-router/core@0.56.0
  - @real-router/types@0.36.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`268dc3e`](https://github.com/greydragon888/real-router/commit/268dc3e7cb29e41f5f524f5644ad64be23eadde4)]:
  - @real-router/core@0.55.0

## 0.2.1

### Patch Changes

- Updated dependencies [[`5313156`](https://github.com/greydragon888/real-router/commit/531315635e0635f1fe98975e74d3bb0d1e14421f)]:
  - @real-router/core@0.54.0

## 0.2.0

### Minor Changes

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Skip loader call on hydration when `rsc` namespace is pre-resolved ([#596](https://github.com/greydragon888/real-router/issues/596))

  When `hydrateRouter()` is invoked and the parsed state contains the `rsc`
  namespace (uncommon — `serializeRouterState({ excludeContext: ["rsc"] })` is
  the typical SSR config), the plugin's `start` interceptor reuses the value
  instead of re-running the loader. Stripped-rsc payloads continue to fall
  through to the loader as today.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `invalidate(router, "rsc")` helper for client-side revalidation ([#605](https://github.com/greydragon888/real-router/issues/605))

  Marks the `"rsc"` namespace as stale on the given router. The next
  navigation (including a same-route reload) re-runs the RSC loader for
  the destination route and overwrites `state.context.rsc` (and the mode
  marker) via the plugin's `subscribeLeave` listener — fresh `ReactNode`
  lands on the state snapshot **before** `TRANSITION_SUCCESS` fires, so
  subscribers see the new payload.

  `void` (fire-and-forget) return. Compose with the existing core API
  for an explicit synchronous round-trip:

  ```ts
  import { invalidate } from "@real-router/rsc-server-plugin";

  // Fire-and-forget — stale until any next navigation
  invalidate(router, "rsc");

  // Explicit await — pair with a same-route reload
  invalidate(router, "rsc");
  await router.navigate(state.name, state.params, { reload: true });
  ```

  Surgical alternative to `router.navigate({ reload: true })` for
  multi-namespace routes: only `"rsc"` re-runs; a side-by-side
  `ssr-data-plugin` keeps its cached `state.context.data` on this same
  transition unless its own `invalidate()` was also called. Behaviour
  during an in-flight transition is deferred — the current transition
  completes unchanged; the _following_ navigation consumes the flag,
  preserving the invariant "one transition = one `state.context`
  snapshot".

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/rsc-server-plugin/errors` subpath with typed loader errors ([#594](https://github.com/greydragon888/real-router/issues/594))

  Mirror of `@real-router/ssr-data-plugin/errors` — exports `LoaderRedirect`, `LoaderNotFound`, `LoaderTimeout`, and `withTimeout` from a new `errors` subpath. Same shared source under `shared/ssr/errors.ts`.

  RSC apps throw the same error shapes as classical SSR apps and discriminate via the structural `code` field — without taking a dependency on `ssr-data-plugin`:

  ```ts
  import { LoaderNotFound } from "@real-router/rsc-server-plugin/errors";

  const loaders: RscLoaderFactoryMap = {
    "users.profile": (_router, getDep) => async (params) => {
      const user = await getDep("db").users.findById(params.id);
      if (!user) throw new LoaderNotFound(`user:${params.id}`);
      return <UserProfile user={user} />;
    },
  };
  ```

  Zero runtime impact on the main entry — `errors` is a separate dist file, tree-shaken when unused.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `RscPayload<TReturn, TFormState>` type + `rscActionPluginFactory` for Server Action integration ([#593](https://github.com/greydragon888/real-router/issues/593))

  The plugin gains two complementary pieces:
  - **`RscPayload<TReturn, TFormState>`** — canonical Flight payload shape (`{ root: ReactNode } & RscActionResult`). Single source of truth used by both producer (rsc entry) and consumers (ssr + browser entries) — eliminates ad-hoc duplication of the same interface in multiple files.
  - **`rscActionPluginFactory(getResult)`** — sibling plugin that claims the `"rscAction"` namespace. Publishes `{ returnValue?, formState? }` to `state.context.rscAction` via the `start` interceptor; coexists with `rscServerPluginFactory` (`"rsc"`) and `ssrDataPluginFactory` (`"data"`) on the same router.

  Use case: Server Action results computed in the RSC fetch handler (via `decodeAction` / `loadServerAction` / `decodeReply`) become part of router state and can be read by any Server Component during the post-action render — eliminates prop-drilling for cross-page action result UI.

  ```ts
  let actionResult: RscActionResult | undefined;
  if (request.method === "POST") {
    // ... execute action ...
    actionResult = { returnValue: { ok: true, data: ... } };
  }

  router.usePlugin(
    rscServerPluginFactory(loaders),
    rscActionPluginFactory(() => actionResult),
  );

  const state = await router.start(pathname);
  // state.context.rsc       — ReactNode tree
  // state.context.rscAction — { returnValue?, formState? }
  ```

  Verified by 12 new functional tests covering write semantics, composition with `rscServerPluginFactory`, namespace collision detection, and teardown.

- [#643](https://github.com/greydragon888/real-router/pull/643) [`f243451`](https://github.com/greydragon888/real-router/commit/f24345194efac6bd85cefed0d4de340c6cc9086c) Thanks [@greydragon888](https://github.com/greydragon888)! - Add per-route SSR mode ([#597](https://github.com/greydragon888/real-router/issues/597))

  Mirror of `ssr-data-plugin`: `rscServerPluginFactory` now accepts the
  `{ ssr?, loader? }` shape per route. `RscSsrMode = "full" | "client-only"` —
  `"data-only"` is rejected at factory time (RSC has no semantically meaningful
  "data without component"). Mode is published to `state.context.ssrRscMode`;
  read via `getSsrRscMode(state)` (fallback `"full"`).

  When mode is `"client-only"` the loader is skipped unconditionally; the
  application is responsible for fetching the Server Component tree via a
  separate mechanism.

  Breaking on the type level: `RscLoaderFactoryMap` now accepts a union of
  factory or `{ ssr?, loader? }` per entry. Existing consumers passing a factory
  directly continue to work without changes.

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

## 0.1.0

### Minor Changes

- [#572](https://github.com/greydragon888/real-router/pull/572) [`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783) Thanks [@greydragon888](https://github.com/greydragon888)! - Add `@real-router/rsc-server-plugin` — per-route `ReactNode` (RSC payload) loading via `start()` interceptor ([#566](https://github.com/greydragon888/real-router/issues/566))

  New plugin mirroring `@real-router/ssr-data-plugin` for React Server Components. Loaders return `ReactNode` (sync or async); the plugin writes the resolved node to `state.context.rsc` via the `"rsc"` namespace claim. Bundler-agnostic — the caller pipes the published node through their bundler's Flight renderer (`@vitejs/plugin-rsc`, `react-server-dom-webpack`, etc.).

  ```typescript
  router.usePlugin(rscServerPluginFactory({
    "users.profile": () => async (params) => {
      const user = await fetchUser(params.id);
      return <UserProfile user={user} />;
    },
  }));

  const state = await router.start(url);
  const flight = renderToReadableStream(state.context.rsc);
  const json = serializeRouterState(state, { excludeContext: ["rsc"] });
  ```

### Patch Changes

- Updated dependencies [[`99a8c3f`](https://github.com/greydragon888/real-router/commit/99a8c3f4722c16d78d322eccb775fb29cc0fd783)]:
  - @real-router/core@0.52.0
