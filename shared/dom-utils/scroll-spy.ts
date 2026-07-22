import { getTransitionSource } from "@real-router/sources";

import type { NavigationOptions, Router } from "@real-router/core";

/**
 * Router-coordinated scroll spy (#575).
 *
 * On `IntersectionObserver` notifications the utility picks the topmost
 * visible anchor inside the configured scroll container and emits a forced
 * same-route transition with `{ hash, replace: true, force: true, hashChange:
 * true }` through `router.navigate(...)`. The URL plugin
 * (`@real-router/browser-plugin` or `@real-router/navigation-plugin`) updates
 * `state.context.url.hash` so sibling hash-aware `<Link hash>` re-highlights
 * via the standard `createActiveRouteSource` pipeline.
 *
 * **Anti-flicker gates** (RFC §5.2):
 * 1. `getTransitionSource(router).getSnapshot().isTransitioning` — skip emits
 *    while a transition is in-flight (re-entrant lock).
 * 2. `coolingDown` — set on a user-driven hash transition (e.g. `<Link hash>`
 *    click + smooth `scrollIntoView`). Cleared on `scrollend` or after a
 *    500ms safety timeout. Spy's own emits are excluded via the synchronous
 *    `selfEmitting` flag — required so the spy doesn't rate-limit itself.
 *
 * **Self-healing** (RFC §7.3): if the initial URL contains a hash without a
 * matching `id` (e.g. `/page#nonexistent`), the first IO event emitted right
 * after observe()-ing picks the topmost real anchor and corrects the URL.
 *
 * **Hash-only transition pipeline cost** (RFC §5.3): for same-route same-
 * params hash-only navigations, `getTransitionPath` returns empty
 * `toDeactivate` / `toActivate` arrays, so `runGuards` is a no-op. The only
 * work is the URL plugin's `onTransitionSuccess` write and the
 * `getTransitionSource` flip — cheap.
 *
 * **Architecture**: decomposed into 4 private subsystem closure factories
 * (`createUrlPluginDetector`, `createCooldown`, `createDebouncer`,
 * `createObserverPair`). The main `createScrollSpy` wires them together
 * around the shared `silenced` / `destroyed` / `selfEmitting` flags and the
 * `flush()` emit logic. Each subsystem owns its state + cleanup; `destroy()`
 * delegates to each. See section banners below.
 *
 * @returns A `ScrollSpy` handle whose `destroy()` is idempotent.
 */
export interface ScrollSpyOptions {
  /**
   * CSS selector for anchor candidates. Empty string `""` or `undefined`
   * disables the spy (returns a NOOP handle). Common values:
   * `"[id]"`, `"[id]:is(h1,h2,h3)"`, `"section[id]"`.
   */
  selector: string;

  /**
   * `IntersectionObserver` `rootMargin`. Default
   * `"-20% 0px -60% 0px"` — an anchor is considered "active" once it crosses
   * into the top 20 % of the viewport (or scroll container).
   */
  rootMargin?: string | undefined;

  /**
   * Lazy getter for the scrollable container. Consulted at creation and
   * re-consulted on every reconcile (DOM mutation), so a container that
   * MOUNTS or CHANGES after the spy is created is honoured: the
   * `IntersectionObserver` root and `MutationObserver` target — both immutable
   * once constructed — are rebuilt to match (#780). `null` (or a missing
   * getter) falls back to the window viewport (`root: null` on the
   * `IntersectionObserver`).
   */
  scrollContainer?: (() => HTMLElement | null) | undefined;
}

export interface ScrollSpy {
  /** Tear down observer + listeners. Idempotent. */
  destroy: () => void;
}

const NOOP_INSTANCE: ScrollSpy = Object.freeze({
  destroy: () => {
    /* no-op */
  },
});

// Hardcoded internals (RFC §5.1 — promote only with evidence).
const RAF_DEBOUNCE_MS = 150;
const MUTATION_DEBOUNCE_MS = 250;
const COOLDOWN_TIMEOUT_MS = 500;
const DEFAULT_ROOT_MARGIN = "-20% 0px -60% 0px";

// Local extension type — browser-plugin / navigation-plugin augment
// `NavigationOptions` with `hash` and `hashChange`, but `shared/dom-utils`
// is plugin-agnostic and cannot rely on the augmentation. Mirrors the
// `HashAwareNavigationOptions` pattern in `link-utils.ts`.
type HashAwareNavigationOptions = NavigationOptions & {
  hash?: string;
  hashChange?: boolean;
};

// The `url` namespace contract is owned by browser-env: both URL plugins
// (browser-plugin, navigation-plugin) write `{ hash: string; hashChanged }` on
// every transition. This is a local mirror (keeps dom-utils independent of
// browser-env) and must match that canonical shape — `hash` is always present,
// never a partial slice.
interface UrlContextSlice {
  hash: string;
  hashChanged: boolean;
}

const getUrlContext = (state: {
  context?: unknown;
}): UrlContextSlice | undefined =>
  (state.context as { url?: UrlContextSlice } | undefined)?.url;

// =============================================================================
// Picker — pure, no state. RFC §5.2 selection rule.
// =============================================================================

// Pick the anchor closest to the active zone top in viewport coordinates.
// `entry.rootBounds.top` already reflects `rootMargin` (per W3C IO spec
// §3.3) — for `rootMargin: "-20% 0px -60% 0px"` it returns 20% of root
// height, for `"-50% 0px -50% 0px"` it returns the center, etc. Distance
// = boundingClientRect.top − zoneTop in viewport pixels: positive = anchor
// below zone top (just entered), negative = anchor above zone top (body
// crossing zone from above). We prefer smallest non-negative; fall back to
// least-negative when no entry has crossed yet.
// Falls back to zoneTop = 0 when rootBounds is null (cross-origin roots,
// unit tests). Single pass — handles `Iterable` so flushes can pass
// `Map.values()` directly without realising the array.
const pickTopmost = (
  entries: Iterable<IntersectionObserverEntry>,
): IntersectionObserverEntry | null => {
  let bestPositive: IntersectionObserverEntry | null = null;
  let bestPositiveDist = Number.POSITIVE_INFINITY;
  let bestNegative: IntersectionObserverEntry | null = null;
  let bestNegativeDist = Number.NEGATIVE_INFINITY;

  for (const entry of entries) {
    if (!entry.isIntersecting) {
      continue;
    }

    const zoneTop = entry.rootBounds?.top ?? 0;
    const distance = entry.boundingClientRect.top - zoneTop;

    if (distance >= 0) {
      if (distance < bestPositiveDist) {
        bestPositive = entry;
        bestPositiveDist = distance;
      }
    } else if (distance > bestNegativeDist) {
      bestNegative = entry;
      bestNegativeDist = distance;
    }
  }

  return bestPositive ?? bestNegative;
};

// =============================================================================
// Subsystem: URL plugin detector (RFC §5.5)
// Calls `onMissing` if `state.context` is published but `url` key is missing
// (i.e. no URL plugin installed). Either synchronous on start, or deferred
// via a one-shot `router.subscribe` if the router has not started yet.
// `silenced` flag itself lives in main scope — detector signals via callback
// (per Oracle Q1 — `silenced` has multiple unrelated triggers; main scope
// owns the kill switch).
// =============================================================================

interface UrlPluginDetector {
  destroy: () => void;
}

const createUrlPluginDetector = (
  router: Router,
  onMissing: () => void,
): UrlPluginDetector => {
  let detectionUnsub: (() => void) | null = null;

  const verify = (state: { context?: unknown }): void => {
    const context = state.context as
      (Record<string, unknown> & { url?: unknown }) | undefined;

    if (context && context.url === undefined) {
      console.warn(
        "[real-router] scroll-spy: state.context.url is not claimed. " +
          "Spy requires browser-plugin or navigation-plugin. Disabling.",
      );
      onMissing();
    }
  };

  const peekState = router.getState();

  if (peekState) {
    verify(peekState);
  } else {
    // Re-entry guard: `router.subscribe` MAY invoke the callback synchronously
    // from inside `.subscribe(...)` before the function returns. In that case
    // `detectionUnsub` is still `null` when the callback fires. Without this
    // boolean, a hypothetical multi-fire would double-warn.
    let detectionConsumed = false;

    detectionUnsub = router.subscribe(({ route }) => {
      /* v8 ignore next 3 -- @preserve: the multi-fire is hypothetical (see above) — the real router never invokes a subscriber synchronously twice before unsub; defensive guard, not testable without a contract-violating fake */
      if (detectionConsumed) {
        return;
      }

      detectionConsumed = true;
      verify(route);

      detectionUnsub?.();
      detectionUnsub = null;
    });
  }

  return {
    destroy(): void {
      detectionUnsub?.();
      detectionUnsub = null;
    },
  };
};

// =============================================================================
// Subsystem: Cooldown gate (RFC §5.2 — anti-flicker for smooth scrollIntoView)
// Set on user-driven `<Link hash>` click → smooth scroll. Cleared on
// `scrollend` (Baseline 2026) or 500ms safety timeout (older Safari).
// =============================================================================

interface Cooldown {
  readonly active: boolean;
  start: () => void;
  destroy: () => void;
}

const createCooldown = (getContainer: () => HTMLElement | null): Cooldown => {
  let active = false;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let listenerContainer: HTMLElement | null = null;
  let listener: (() => void) | null = null;

  const clear = (): void => {
    if (timeout !== null) {
      clearTimeout(timeout);
      timeout = null;
    }

    if (listener) {
      const target: EventTarget = listenerContainer ?? globalThis;

      target.removeEventListener("scrollend", listener);
    }

    listener = null;
    listenerContainer = null;
    active = false;
  };

  return {
    get active(): boolean {
      return active;
    },
    start(): void {
      // Reset rather than stack timers if cooldown is already active.
      clear();

      active = true;

      const lift = (): void => {
        clear();
      };

      listener = lift;
      listenerContainer = getContainer();

      const target: EventTarget = listenerContainer ?? globalThis;

      target.addEventListener("scrollend", lift, { once: true });

      timeout = setTimeout(lift, COOLDOWN_TIMEOUT_MS);
    },
    destroy(): void {
      clear();
    },
  };
};

// =============================================================================
// Subsystem: rAF + trailing debounce (RFC §5.1)
// Coalesces a burst of IO events into ≤ 1 callback per debounce window.
// rAF reduces N setTimeout creations to 1 per animation frame; the trailing
// 150ms setTimeout waits for the IO stream to quiesce.
// =============================================================================

interface Debouncer {
  schedule: () => void;
  destroy: () => void;
}

const createDebouncer = (
  callback: () => void,
  trailingMs: number,
): Debouncer => {
  let raf: number | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(): void {
      if (raf !== null) {
        return;
      }

      raf = requestAnimationFrame(() => {
        raf = null;

        if (timeout !== null) {
          clearTimeout(timeout);
        }

        timeout = setTimeout(() => {
          timeout = null;
          callback();
        }, trailingMs);
      });
    },
    destroy(): void {
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }

      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
    },
  };
};

// =============================================================================
// Subsystem: Observer pair (IntersectionObserver + MutationObserver)
// IO + MO genuinely form one subsystem — both write/read `observed` set and
// `pending` map, and reconcile flow couples them. Per Oracle Q10, splitting
// would force cross-subsystem references that re-introduce the wiring
// problem we're trying to solve.
//
// Exposes `pending` directly (per Oracle Q4: hiding behind `consume()` adds
// boilerplate without isolating the shared mutable state — observers write
// from IO callbacks while main scope reads in `flush()`).
// =============================================================================

interface ObserverPair {
  readonly pending: Map<Element, IntersectionObserverEntry>;
  /** True when a resolved container has since detached from the DOM (#1216). */
  isContainerDetached: () => boolean;
  /** Re-resolve the container + re-observe matches (rebuilds the pair on change). */
  reconcile: () => void;
  destroy: () => void;
}

const createObserverPair = (
  selector: string,
  rootMargin: string,
  getContainer: () => HTMLElement | null,
  onIntersection: () => void,
  onInvalidSelector: () => void,
  isStopped: () => boolean,
): ObserverPair => {
  const observed = new Set<Element>();
  // Latest IO entry per target — accumulated across batches. IO delivers
  // entries only for targets whose intersection state CHANGED (W3C IO
  // §3.2.1), so a fast scroll that lands two callbacks inside the same
  // debounce window must merge by target, not overwrite. Entries are
  // dropped from the map when their target leaves the DOM (see `reconcile`)
  // and on `destroy()`.
  const pending = new Map<Element, IntersectionObserverEntry>();

  let duplicateIdWarned = false;
  let mutationTimer: ReturnType<typeof setTimeout> | null = null;

  const handleIntersection: IntersectionObserverCallback = (entries) => {
    // Defensive: IO callback may fire AFTER `destroy()` if a queued event
    // was already scheduled by the browser before `disconnect()`. Cheap
    // belt-and-suspenders.
    if (isStopped()) {
      return;
    }

    for (const entry of entries) {
      pending.set(entry.target, entry);
    }

    onIntersection();
  };

  // Build (and rebuild) the IntersectionObserver for a given root. A root is
  // immutable once its IO is constructed, so `reconcile` recreates the IO via
  // this same factory when the resolved container changes (#780) — one
  // definition, two call sites.
  const makeIo = (container: HTMLElement | null): IntersectionObserver =>
    new IntersectionObserver(handleIntersection, {
      root: container,
      rootMargin,
      threshold: 0,
    });

  // Container the IntersectionObserver root + MutationObserver target are
  // built with. Both are immutable once the observer is constructed (W3C), so
  // a `scrollContainer` that resolves to a different element after creation —
  // most importantly one that MOUNTS after the spy starts (Angular wires the
  // spy at bootstrap, before any component renders; a docs route's container
  // mounts on navigation) — is only honoured by rebuilding the pair in
  // `reconcile`. Tracked here so `reconcile` can compare on every run (#780).
  let observerContainer = getContainer();

  let io = makeIo(observerContainer);

  const observeMatches = (): void => {
    const scope = getContainer() ?? document;
    let candidates: NodeListOf<Element>;

    try {
      candidates = scope.querySelectorAll(selector);
    } catch {
      onInvalidSelector();

      return;
    }

    const seenIds = new Set<string>();

    for (const element of candidates) {
      // Detect duplicate ids once (RFC §7.7). The DOM permits duplicate ids
      // even though it is a markup bug; the spy keeps working but picks the
      // first one deterministically via the topmost-visible rule.
      const id = (element as HTMLElement).id;

      if (id && !duplicateIdWarned) {
        if (seenIds.has(id)) {
          duplicateIdWarned = true;

          console.warn(
            `[real-router] scroll-spy: duplicate id "${id}" observed. ` +
              "Selection picks the topmost visible match deterministically.",
          );
        }

        seenIds.add(id);
      }

      if (observed.has(element)) {
        continue;
      }

      io.observe(element);
      observed.add(element);
    }
  };

  // MutationObserver init — reused when the observer is re-pointed at a new
  // container in `reconcile`. `childList: true, subtree: true` catches
  // structural changes; `attributes: true, attributeFilter: ["id"]` catches
  // anchor id renames (typical for client-rendered docs). The MO targets the
  // scroll container (or document.body for the window viewport).
  const MUTATION_OBSERVE_INIT: MutationObserverInit = {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["id"],
  };

  // Null-then-assigned — the same forward-reference idiom as `flush` in the
  // main scope. `reconcile` re-points it on a container change, so it must be
  // in scope above its assignment; it is non-null by the time any async
  // mutation callback (or `reconcile`) runs.
  let mo: MutationObserver | null = null;

  const reconcile = (): void => {
    // Drop observed elements that left the DOM. Avoids observer holding
    // strong refs to detached nodes. Also drop their accumulated entry so
    // stale "was intersecting" state for a removed node cannot be picked
    // by `pickTopmost` after the node is gone.
    for (const element of observed) {
      if (element.isConnected) {
        continue;
      }

      io.unobserve(element);
      observed.delete(element);
      pending.delete(element);
    }

    // Honour a container that mounted (or changed) after construction (#780).
    // The IntersectionObserver root and MutationObserver target cannot be
    // mutated in place, so rebuild the pair under the new container. Clearing
    // `observed` + `pending` makes the rebuild equivalent to constructing the
    // spy with this container from the start: `observeMatches` below
    // re-populates the tracked set from the new container's scope, and the
    // stale merged snapshot (computed against the old root's geometry) is
    // dropped — one empty debounce window, acceptable for a rare event.
    const nextContainer = getContainer();

    if (nextContainer !== observerContainer) {
      observerContainer = nextContainer;

      io.disconnect();
      io = makeIo(nextContainer);
      observed.clear();
      pending.clear();

      mo?.disconnect();
      mo?.observe(nextContainer ?? document.body, MUTATION_OBSERVE_INIT);
    }

    observeMatches();
  };

  observeMatches();

  mo = new MutationObserver(() => {
    if (mutationTimer !== null) {
      clearTimeout(mutationTimer);
    }

    mutationTimer = setTimeout(() => {
      mutationTimer = null;
      reconcile();
    }, MUTATION_DEBOUNCE_MS);
  });

  mo.observe(observerContainer ?? document.body, MUTATION_OBSERVE_INIT);

  return {
    pending,
    // #1216: the MutationObserver is pointed at the container's OWN subtree, so
    // the container's removal (a mutation of its PARENT) is invisible — reconcile
    // never fires on it and a remounted container is never re-observed. Expose a
    // detach check + reconcile so the router.subscribe callback can re-resolve on
    // navigation (exactly when route-tied containers mount/die). When
    // `observerContainer` is null the MO already watches `document.body`, which
    // sees container mounts directly — so only a resolved-then-detached container
    // needs this nav-time nudge.
    isContainerDetached: (): boolean =>
      observerContainer !== null && !observerContainer.isConnected,
    reconcile,
    destroy(): void {
      io.disconnect();
      mo.disconnect();

      if (mutationTimer !== null) {
        clearTimeout(mutationTimer);
        mutationTimer = null;
      }

      observed.clear();
      pending.clear();
    },
  };
};

// =============================================================================
// Main: compositional wiring
// =============================================================================

export function createScrollSpy(
  router: Router,
  options: ScrollSpyOptions,
): ScrollSpy {
  // SSR guard (RFC §7.5) — return early without warnings.
  if (typeof document === "undefined") {
    return NOOP_INSTANCE;
  }

  // Feature-detect IntersectionObserver — no polyfill ships (RFC §4).
  if (typeof IntersectionObserver === "undefined") {
    return NOOP_INSTANCE;
  }

  const { selector } = options;

  // Empty selector → disabled. Documented opt-out for conditional enabling
  // (RFC §5.4 `scrollSpy={{ selector: enable ? "[id]" : "" }}`).
  if (!selector) {
    return NOOP_INSTANCE;
  }

  const rootMargin = options.rootMargin ?? DEFAULT_ROOT_MARGIN;
  const getContainer = options.scrollContainer;
  const resolveContainer = (): HTMLElement | null => getContainer?.() ?? null;

  // Shared lifecycle flags (Oracle Q1 — `silenced` has multiple unrelated
  // triggers; Oracle Q3 — `selfEmitting` synchronously bracketed around
  // `router.navigate()` cannot cleanly extract). Kept in main scope.
  let destroyed = false;
  let silenced = false;
  let selfEmitting = false;

  const isStopped = (): boolean => silenced || destroyed;

  // Symmetric late-binding (Oracle Q2): declare `flush` as nullable, wire
  // debouncer + observers, then assign the real implementation. Reads as
  // intentional wiring rather than accidental closure capture ordering.
  // The `flush?.()` call below safely no-ops if a callback somehow fires
  // before assignment (impossible in practice — IO/debounce are async).
  let flush: (() => void) | null = null;

  const transitionSource = getTransitionSource(router);

  const detector = createUrlPluginDetector(router, () => {
    silenced = true;
  });

  const cooldown = createCooldown(resolveContainer);

  const debouncer = createDebouncer(() => {
    flush?.();
  }, RAF_DEBOUNCE_MS);

  const observers = createObserverPair(
    selector,
    rootMargin,
    resolveContainer,
    () => {
      debouncer.schedule();
    },
    () => {
      if (silenced) {
        return;
      }

      silenced = true;

      console.warn(
        `[real-router] scroll-spy: invalid selector "${selector}". Disabling.`,
      );
    },
    isStopped,
  );

  flush = (): void => {
    if (destroyed || silenced) {
      observers.pending.clear();

      return;
    }

    // Gate-skipped flushes keep `pendingEntries` populated — the merged
    // state is still the best-known snapshot, and the next non-gated flush
    // consumes it. Clearing under a gate would re-introduce the overwrite
    // bug for any anchor whose intersection state did not change during
    // the gate window.
    if (transitionSource.getSnapshot().isTransitioning) {
      return;
    }

    if (cooldown.active) {
      return;
    }

    // No `if (pending.size === 0) return` fast-path: `pending` is never empty
    // here via any real path (a real IntersectionObserver always delivers ≥1
    // entry, so `handleIntersection` populates `pending` before scheduling; the
    // mutation reconcile that could drop entries runs at MUTATION_DEBOUNCE_MS
    // 250 > RAF_DEBOUNCE_MS 150, i.e. always AFTER the flush). And an empty map
    // is already handled identically below — `pickTopmost(∅)` is `null` → the
    // `if (!picked) return` guard — so the fast-path was both unreachable and
    // redundant.

    // Successful flush consumes the merged snapshot. We clear so that the
    // next debounce window starts fresh; an anchor that is still
    // intersecting will only stay observable if IO emits another event for
    // it (which it does whenever the anchor's intersection state actually
    // changes). Skipping the clear here would leak state from one user-
    // perceived "scroll stop" into the next.
    const picked = pickTopmost(observers.pending.values());

    observers.pending.clear();

    if (!picked) {
      // No anchor visible / above zone — preserve last hash (RFC §10 #5).
      return;
    }

    const newHash = (picked.target as HTMLElement).id;

    if (!newHash) {
      return;
    }

    const state = router.getState();

    if (!state) {
      return;
    }

    // `getUrlContext` is guaranteed present here (the URL-plugin detector
    // silences the spy otherwise), so `?.` only satisfies the `| undefined`
    // slice type. `newHash` is a non-empty id (guarded above), so it can never
    // equal an absent hash — no `?? ""` normalization needed for the compare.
    const currentHash = getUrlContext(state)?.hash;

    if (newHash === currentHash) {
      return;
    }

    // Emit the same-route same-params hash-only transition. URL plugin
    // writes `state.context.url.hash = newHash` + `hashChanged = true` in
    // its `onTransitionSuccess` claim.
    const opts: HashAwareNavigationOptions = {
      hash: newHash,
      replace: true,
      force: true,
      hashChange: true,
    };

    // Self-emit guard (RFC §5.2): set synchronously around our own
    // `router.navigate()` so the `router.subscribe` callback skips the
    // cooldown setup for spy-emitted transitions — otherwise spy would
    // rate-limit itself to ≤ 2 emits/s, contradicting the ≤ 10/s benchmark
    // target. Test coupling (Q8): preserve exact `.catch(noop).finally(reset)`
    // chain — migrating to `try/finally` over `await router.navigate(...)`
    // changes microtask schedule and breaks "spy continues after rejection".
    selfEmitting = true;
    router
      // Slot-shift (RFC-4 M2 / #1548): opts at position 4, query channel unused.
      .navigate(state.name, state.params, undefined, opts)
      .catch(() => {
        // Fire-and-forget — suppress expected rejections (concurrent
        // navigate, router stopped, etc.) consistent with `<Link>` adapter
        // patterns.
      })
      .finally(() => {
        selfEmitting = false;
      });
  };

  // Cooldown setup on user-driven hash transitions. Spy's own emits are
  // distinguished via the synchronous `selfEmitting` flag (see `flush`).
  const unsubscribeRouter = router.subscribe(({ route }) => {
    if (selfEmitting) {
      return;
    }

    // #1216: a route-tied scroll container may have unmounted since the last
    // navigation. The container-scoped MutationObserver can't observe its own
    // removal (a mutation of its parent), so re-resolve + re-observe here —
    // navigation is exactly when such containers mount / die.
    if (observers.isContainerDetached()) {
      observers.reconcile();
    }

    if (getUrlContext(route)?.hashChanged) {
      cooldown.start();
    }
  });

  return {
    destroy(): void {
      // No `if (destroyed) return` idempotency guard: every subsystem teardown
      // below is itself idempotent (null-guarded timers, `set.delete` on the
      // router unsubscribe, spec-idempotent `IntersectionObserver.disconnect`),
      // and `destroy()` is not a hot path — so a redundant guard would only add
      // an unreachable branch. `destroyed = true` is still set to gate any
      // late-arriving IO/router callback via `isStopped()`.
      destroyed = true;

      // Unsubscribe FIRST to prevent late-arriving router transition
      // callback from calling `cooldown.start()` on a half-destroyed
      // instance. Without this ordering, a transition with `hashChanged:
      // true` firing between subsystem teardown and `unsubscribeRouter()`
      // would re-install a 500ms timer that survives `destroy()`. Verified
      // via Oracle review (Q5/Q7).
      unsubscribeRouter();

      observers.destroy();
      debouncer.destroy();
      cooldown.destroy();
      detector.destroy();
    },
  };
}
