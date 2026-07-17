# @real-router/sources

> Reactive state primitives for Real-Router. Framework-agnostic observables/stores.

## Exports

### Source factories

| Export | Purpose |
|--------|---------|
| `createRouteSource(router)` | Route state observable — emits on every navigation |
| `createRouteNodeSource(router, node)` | Per-node route observable — **per-router + per-nodeName cached** |
| `createActiveRouteSource(router, name, params?, opts?)` | Active route boolean — **per-router + canonical-args cached**. `opts.hash` (#532) makes the source hash-aware: matches iff route AND `state.context.url.hash` equal expected. |
| `createTransitionSource(router)` | Transition state snapshot — **non-cached** advanced-use factory |
| `getTransitionSource(router)` | Transition state — **per-router cached**, safe for adapters |
| `createErrorSource(router)` | Navigation error observable — **non-cached** advanced-use factory |
| `getErrorSource(router)` | Navigation error — **per-router cached**, safe for adapters |
| `primeErrorSource(router)` | **Side-effect only** (returns `void`) — eagerly create+subscribe `getErrorSource` IF the router is registered, else no-op. Adapters' `RouterProvider` call it at mount so a boundary mounting after an error still sees it (#778), without crashing on a router-like with no internals (test stub / `Object.create` clone). `getErrorSource` stays strict (throws); this is the don't-crash-the-Provider wrapper. |
| `createDismissableError(router)` | Dismissable error wrapper over `getErrorSource` — **per-router cached**, snapshot includes `resetError` |
| `createActiveNameSelector(router)` | O(1) active-name checker — **per-router cached** shared selector (Link fast-path) |

### Options & utilities

| Export | Purpose |
|--------|---------|
| `DEFAULT_ACTIVE_OPTIONS` | Frozen `{ strict: false, ignoreQueryParams: true }` |
| `normalizeActiveOptions(opts?)` | Fills missing fields with defaults |
| `canonicalJson(value)` | Key-order-stable JSON serialization (cache-key builder) |

### Guard primitives (#1435)

Framework-agnostic route-window guards shared by every adapter's `useRouteEnter` / `useRouteExit` (and the Angular `injectRoute*` equivalents). **Not sources** — no `router` arg, no cache, no subscription; the adapter owns the reactive effect wiring + dispatch and calls these for the guard decision.

| Export | Purpose |
|--------|---------|
| `createRouteEnterGate()` | Returns a stateful decision closure `(route, previousRoute, skipSameRoute) => RouteEnterContext \| null`. Owns the canonical enter-guard superset (`!route` → skip-initial → same-route → `lastHandledRoute` dedupe → `!previousRoute`) + the dedupe state. Returns the context to dispatch, or `null` to skip. `skipSameRoute` is **per-call** (not a factory option) so a React ref-held gate honors an options flip without resetting dedupe. |
| `guardLeaveListener(handler, { skipSameRoute? })` | Pure HOF returning a core `subscribeLeave` listener: same-route skip → reentrant-abort pre-check → **passthrough** (`return handler(ctx)`, so the returned Promise blocks the transition). The `LeaveFn` return type is derived via `Parameters<Router["subscribeLeave"]>[0]` (core doesn't re-export it). |

### Types

| Export | Purpose |
|--------|---------|
| `RouterSource<T>` | Base source shape: `subscribe` / `getSnapshot` / `destroy` |
| `RouteSnapshot<P>` / `RouteNodeSnapshot<P>` | Route state snapshot shapes. Optional generic `P extends Params = Params` types `route.params` for typed-route consumers (added in 0.7.0). |
| `RouterTransitionSnapshot` | Transition state (`isTransitioning`, `isLeaveApproved`, `toRoute`, `fromRoute`) |
| `RouterErrorSnapshot` | Error state (`error`, `toRoute`, `fromRoute`, `version`) |
| `DismissableErrorSnapshot` | Same as above + `resetError: () => void` |
| `ActiveRouteSourceOptions` | `{ strict?, ignoreQueryParams?, hash? }` |
| `ActiveNameSelector` | Interface of `createActiveNameSelector` return (`subscribe`, `isActive`, `destroy`) |
| `RouteEnterContext` / `RouteEnterGate` | `createRouteEnterGate` context (`{ route, previousRoute }`, both non-nullable `State`) + the returned gate closure type |
| `RouteExitContext` / `UseRouteExitOptions` | `guardLeaveListener` context (`{ route, nextRoute, signal }`) + options (`{ skipSameRoute? }`). Deliberately re-state core `LeaveState`'s shape under the adapter-canonical names so adapters can re-export them verbatim |

All factories return `RouterSource<T>` **except `createActiveNameSelector`**, which returns an `ActiveNameSelector` (see the row above — the `subscribe` accepts a route-name argument and there is no `getSnapshot()`):

```typescript
interface RouterSource<T> {
  subscribe(listener: () => void): () => void;  // useSyncExternalStore-compatible
  getSnapshot(): T;                              // current value, synchronous
  destroy(): void;                               // teardown (no-op for cached sources — see below)
}
```

## Cached vs non-cached factories

| Factory | Cache scope | `destroy()` behaviour |
|---------|-------------|------------------------|
| `createRouteSource` | not cached | Real teardown — unsubscribes from router. |
| `createRouteNodeSource` | `(router, nodeName)` | **No-op** — shared across consumers. |
| `createActiveRouteSource` | `(router, name, canonicalJson(params), options)` | **No-op for cached path**; **real teardown for the non-cached fallback** (BigInt / circular params). |
| `createTransitionSource` | not cached | Real teardown — unsubscribes from router events. |
| `getTransitionSource` | `(router,)` | **No-op** — wrapped cached source. |
| `createErrorSource` | not cached | Real teardown. |
| `getErrorSource` | `(router,)` | **No-op** — wrapped cached source. |
| `createDismissableError` | `(router,)` | **No-op** — wraps `getErrorSource` with integrated dismissal state. |
| `createActiveNameSelector` | `(router,)` | **No-op** — shared selector, disconnects from router on last unsubscribe. |

**Why two factories for transition/error:** framework adapters share one source across all mount/unmount cycles — `get*` returns the same instance, safe when multiple consumers call `destroy()` (e.g. Angular `sourceToSignal` in `DestroyRef.onDestroy`). `create*` stays as an escape hatch for advanced cases requiring isolated instances with working teardown.

**Cached sources live as long as the router.** The WeakMap entry releases automatically when the router is garbage-collected.

## createTransitionSource / getTransitionSource

Returns `RouterTransitionSnapshot`:

| Field | Type | Description |
|-------|------|-------------|
| `isTransitioning` | `boolean` | Navigation in progress (TRANSITION_START or LEAVE_APPROVED state) |
| `isLeaveApproved` | `boolean` | Deactivation guards passed, activation guards pending |
| `toRoute` | `State \| null` | Destination route |
| `fromRoute` | `State \| null` | Origin route |

**IDLE_SNAPSHOT default:**
```typescript
{
  isTransitioning: false,
  isLeaveApproved: false,
  toRoute: null,
  fromRoute: null
}
```

**Eager subscription:** subscribes immediately to router events. `createTransitionSource` maintains active subscriptions even with zero listeners — required to track `TRANSITION_START` from the beginning.

## createDismissableError

Derived source that wraps `getErrorSource` with integrated "dismissed version" state. Returns snapshot `DismissableErrorSnapshot`:

| Field | Type | Description |
|-------|------|-------------|
| `error` | `RouterError \| null` | Non-null only while `underlying.version > dismissedVersion` |
| `toRoute` / `fromRoute` | `State \| null` | Same as underlying error source; `null` when error is dismissed |
| `version` | `number` | Monotonic version from `getErrorSource` |
| `resetError` | `() => void` | Dismisses current error — `dismissedVersion = version`. Next error (new version) becomes visible. |

Consolidates the `dismissedVersion` state pattern that was duplicated across all 6 adapter `RouterErrorBoundary` components. Framework adapters bridge this source via their standard pattern:

```typescript
// React / Preact
const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
// ...
if (snapshot.error) fallback(snapshot.error, snapshot.resetError);
```

**Per-router cached.** `destroy()` is a no-op.

## createActiveNameSelector

Framework-agnostic port of Solid's `routeSelector` pattern. One shared `router.subscribe` handle for any number of distinct `routeName` consumers — `N` Links with different names produce ONE router subscription, not N.

```typescript
interface ActiveNameSelector {
  subscribe(routeName: string, listener: () => void): () => void;
  isActive(routeName: string): boolean;
  destroy(): void;
}
```

**When to use:** `Link` components with default options (no custom params / `activeStrict: false` / `ignoreQueryParams: true` / no `opts.hash`). Fast-path for the common navigation-link case.

**When NOT to use:** custom params, strict matching, `ignoreQueryParams: false`, or hash-aware matching — use `createActiveRouteSource` instead (its cache handles the full argument surface).

Only notifies a listener when the `routeName`-specific active status actually flips (internal prev/next diff). Non-strict matching (descendants included).

**Per-router cached.** Every framework adapter now resolves default-options `Link` active state through this selector — Svelte (#1101), Angular (#1104), React (#1248), Preact (#1249), Vue (#1416) — while Solid `RouterProvider` uses an inline `createSelector` equivalent of the same pattern. The slow path via `createActiveRouteSource` is reserved for the full argument surface (custom params, strict, `ignoreQueryParams: false`, hash-aware). Migration is a Link-component-level concern — see the [Adapter Guide / "When to migrate a Link component to the fast path"](https://github.com/greydragon888/real-router/wiki/sources-adapter-guide#when-to-migrate-a-link-component-to-the-fast-path) for the recipe and cost-comparison table. `destroy()` is a no-op.

## Lazy vs Eager Subscription

- `createRouteSource`, `createRouteNodeSource`, `createActiveRouteSource` — **lazy**: subscribe to router on first listener, unsubscribe when all removed (onFirstSubscribe/onLastUnsubscribe in `BaseSource`).
- `createTransitionSource` / `getTransitionSource` — **eager**: subscribes immediately (must track `TRANSITION_START`).
- `createErrorSource` / `getErrorSource` — **eager**: subscribes immediately (must track `TRANSITION_ERROR`).

## Notification flow and framework commit timing

The full chain from `router.navigate()` to DOM commit:

```
router.navigate(...)
  └── completeTransition → emit(TRANSITION_SUCCESS)
       └── router.subscribe listener (from createRouteSource)
            └── source.updateSnapshot(newSnapshot)          ← synchronous
                 └── every listener registered via source.subscribe(...)
                      └── including useSyncExternalStore's onStoreChange
                           (or signal writes in Vue/Solid/Svelte/Angular)
                                └── framework schedules rerender             ← asynchronous
                                     └── framework commits DOM               ← asynchronous
```

**Synchronous through `source.updateSnapshot`** — all source-level listeners fire before `router.subscribe` returns. A framework subscriber (`useSyncExternalStore`'s `onStoreChange`, or a Vue/Solid/Svelte signal writer) is called synchronously here.

**Asynchronous from framework subscriber onward.** React schedules a rerender via its scheduler; Vue/Svelte flush in a microtask; Solid fine-grained updates are closer to synchronous but still post-`onStoreChange`. **DOM is not committed inside the `router.subscribe` call stack.**

**Practical consequences:**
- Code running in `router.subscribe` listeners sees the *new* state in the router, but the *old* DOM.
- Naïvely wrapping a `router.subscribe` listener body in `document.startViewTransition(() => {})` with an empty callback captures identical before/after snapshots — no animation.
- For View Transitions / scroll restoration / anything needing post-commit DOM state, use `subscribeLeave` (awaited; pre-commit) to capture old state, then close the transition from `router.subscribe` (or later).
- `useSyncExternalStore`'s tearing-free guarantee is about *consistency across reads*, not about the DOM being updated synchronously when `onStoreChange` fires.

## Per-router cache strategy

All cached factories use `WeakMap<Router, T>` (or `WeakMap<Router, Map<key, T>>` for composite keys). Guarantees:

1. **Router GC releases source automatically** — the WeakMap entry is weakly held by the router instance.
2. **Cached sources are shared** — multiple consumers produce one router subscription, not N.
3. **`destroy()` is no-op on the returned wrapper** — the underlying source survives any external destroy call.
4. **For `createActiveRouteSource`**, `canonicalJson(params)` normalizes key order so `{a:1, b:2}` and `{b:2, a:1}` hit the same cache entry. `Symbol`/`BigInt`/circular refs fall back to creating a fresh non-cached source.
5. **`undefined` params ≠ `{}` params — the cache keys them apart on purpose** (`params === undefined ? "" : canonicalJson(params)`, so `undefined → ""` but `{} → "{}"`). This makes the no-params Link case (`createActiveRouteSource(router, name)`) skip a `canonicalJson` call and share one entry with `useIsActiveRoute(name)`. **Adapter contract (#776):** a no-params `<Link>` / directive MUST pass the raw `routeParams` (possibly `undefined`) here — never an `EMPTY_PARAMS` (`{}`) default — or it keys `"{}"` and opens a *second* eager subscription for the same logical question. Adapters default to `EMPTY_PARAMS` only at the navigation / `buildHref` sites that need a concrete object.

## Gotchas

### Snapshot stabilization

`createTransitionSource` runs every `TRANSITION_START` / `TRANSITION_LEAVE_APPROVE` payload through `stabilizeState()` for `toRoute` and `fromRoute`. There is **also** a same-paths dedup guard on each handler — but after #605 the router always emits fresh `State` references per navigation, so that guard is structurally unreachable today (kept as a defensive net under `v8 ignore`, see the inline comments in `src/createTransitionSource.ts`). For practical purposes, every `TRANSITION_START` / `LEAVE_APPROVE` event produces a new snapshot; only `TRANSITION_SUCCESS` / `ERROR` / `CANCEL` collapse back to the shared `IDLE_SNAPSHOT` singleton.

### Transition state lifecycle

The `isLeaveApproved` flag is set to `true` only when `TRANSITION_LEAVE_APPROVE` event fires. It resets to `false` on `TRANSITION_SUCCESS`, `TRANSITION_ERROR`, or `TRANSITION_CANCEL`. This allows UI to show a "loading" state during the activation phase after deactivation guards pass.

### Cached sources ignore external destroy()

```typescript
const a = getTransitionSource(router);
const b = getTransitionSource(router);
// a === b

a.destroy(); // no-op — shared wrapper
b.getSnapshot(); // still works, router subscription alive
```

Use `createTransitionSource` / `createErrorSource` (non-cached) if you need working `destroy()` for an isolated instance.

### Hash-aware stabilization & active state (#532)

`stabilizeState` compares `state.context.url.hash` in addition to `path`. Without this, `useRoute()` consumers (and any source built atop `createRouteSource` / `createRouteNodeSource`) saw the same reference on a same-path-different-hash transition — tab-style UIs (`/settings#profile` → `/settings#billing`) would not re-render.

`createActiveRouteSource` accepts `opts.hash`; the canonical cache key includes it, so tab-link sources are isolated per-hash variant. The subscribe path re-evaluates active status when `state.context.url.hashChanged === true` — without this signal, route-level comparison alone misses same-path hash flips.

Hash-plugin runtime does not claim the `"url"` namespace → `state.context.url === undefined`. The source collapses the missing namespace to `""` (`readContextHash(...) ?? ""`), so under hash-plugin a **non-empty** `opts.hash` always returns `false`, while `opts.hash === ""` still matches an active route ("no namespace" reads as "no fragment", #532). Sources without `opts.hash` are unaffected.

### BaseSource subscribe order

`BaseSource.subscribe` adds the listener to `#listeners` **before** calling `onFirstSubscribe`. Critical for `useSyncExternalStore` adapters: if reconcile inside `onFirstSubscribe` triggers `updateSnapshot`, the just-added listener receives the notification. Without this order, the post-reconnection snapshot would be missed on re-mount (e.g. Preact RouteView nested remount).

### Partial-registration safety — eager transition / error sources (#1440)

`createTransitionSource` (5 listeners) and `createErrorSource` (2) register their router-event listeners **one-by-one inside a `try`**. If `api.addEventListener` throws mid-registration — the emitter rejects a duplicate listener (`EventEmitter` throws) or hits its `maxListeners` cap — the `catch` unwinds the already-registered listeners and rethrows, so a half-wired source never leaks live listeners that pin the router. `unsubs` is declared **before** the `BaseSource` so its `onDestroy` closure always closes over an initialized binding (a never-assigned `unsubs` would strand the source in the TDZ, undestroyable). Mirrors `@real-router/rx`'s `events$`. The lazy single-listener factories (`createRouteSource` / `createRouteNodeSource` / `createActiveRouteSource` / `createActiveNameSelector`) register exactly one listener, so they have no partial-registration window.

## Module Structure

```
src/
├── BaseSource.ts                — base class (subscribe, getSnapshot, destroy)
├── createRouteSource.ts         — lazy route state observable
├── createRouteNodeSource.ts     — per-router + per-nodeName cached node source
├── createActiveRouteSource.ts   — per-router + canonical-args cached active-route boolean
├── createTransitionSource.ts    — eager transition snapshot + cached getTransitionSource
├── createErrorSource.ts         — eager error snapshot + cached getErrorSource
├── createDismissableError.ts    — derived source: getErrorSource + dismissedVersion state
├── createActiveNameSelector.ts  — shared O(1) active-name selector (Link fast-path)
├── createRouteEnterGate.ts      — route-enter guard gate (stateful decision closure, #1435)
├── guardLeaveListener.ts        — route-exit guard HOF (subscribeLeave listener wrapper, #1435)
├── canonicalJson.ts             — key-order-stable JSON (for cache keys)
├── normalizeActiveOptions.ts    — DEFAULT_ACTIVE_OPTIONS + normalizer
├── computeSnapshot.ts           — shared node-snapshot builder
├── stabilizeState.ts            — reference equality for State objects (compares `path` + `state.context.url.hash` + `state.transition.reload` — #605)
├── types.ts                     — RouterSource<T>, snapshot types
└── index.ts                     — public exports
```

## See Also

- [README.md](README.md) — Quick start and usage examples
- [ARCHITECTURE.md](ARCHITECTURE.md) — Design decisions, cache strategy, data flow
- [INVARIANTS.md](INVARIANTS.md) — Property-based invariants
- [packages/core/CLAUDE.md](../core/CLAUDE.md) — Core router architecture
- [packages/react/CLAUDE.md](../react/CLAUDE.md) — React integration (uses sources internally)
