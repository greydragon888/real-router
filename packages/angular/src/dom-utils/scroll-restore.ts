import type { Router, State } from "@real-router/core";

const DEFAULT_STORAGE_KEY = "real-router:scroll";

// Bounded retry budget for resolving a late-mounting scroll container on the
// restore path. A per-route container (e.g. an `overflow:auto` div rendered
// only on one route) can be committed to the DOM a few frames after the
// navigation settles — heavier routes paint later than the subscribe's rAF.
// ~10 frames (≈160ms at 60fps) comfortably covers a React commit of a large
// route without being perceptible. See the doc-block on `restorePos`.
const RESTORE_RETRY_FRAMES = 10;

const NOOP_INSTANCE: { destroy: () => void } = Object.freeze({
  destroy: () => {
    /* no-op */
  },
});

export type ScrollRestorationMode = "restore" | "top" | "native";

export interface ScrollRestorationOptions {
  mode?: ScrollRestorationMode | undefined;
  anchorScrolling?: boolean | undefined;
  scrollContainer?: (() => HTMLElement | null) | undefined;
  /**
   * Scroll behavior passed to `scrollTo({ behavior })` and
   * `scrollIntoView({ behavior })`.
   *
   * - `"auto"` (default) — browser-defined, usually instant.
   * - `"instant"` — explicit instant jump (no animation).
   * - `"smooth"` — animated transition. Note: smooth restore on back/traverse
   *   can feel disorienting if the user expects to land at the saved position
   *   immediately. Recommended for `mode: "top"` or anchor scroll only.
   *
   * See [MDN](https://developer.mozilla.org/en-US/docs/Web/API/ScrollToOptions/behavior).
   */
  behavior?: ScrollBehavior | undefined;
  /**
   * sessionStorage key used to persist saved scroll positions. Default:
   * `"real-router:scroll"`. Override only when multiple independent
   * `RouterProvider` instances share the same document and you need to
   * isolate their scroll stores (e.g. micro-frontends, embedded widgets,
   * or testing). For a single app with one provider the default is fine.
   */
  storageKey?: string | undefined;
}

interface NavigationContext {
  direction?: "forward" | "back" | "unknown";
  navigationType?: "push" | "replace" | "traverse" | "reload";
}

export function createScrollRestoration(
  router: Router,
  options?: ScrollRestorationOptions,
): { destroy: () => void } {
  if (typeof globalThis.window === "undefined") {
    return NOOP_INSTANCE;
  }

  const mode = options?.mode ?? "restore";

  // mode "native" = utility does nothing. Don't flip history.scrollRestoration,
  // don't subscribe, don't register pagehide — `history.scrollRestoration`
  // stays at the browser default ("auto") so the browser handles scroll
  // restore natively. (Note: this is the OPPOSITE of `history.scrollRestoration
  // === "manual"` — utility's "native" leaves the DOM property at "auto" so
  // the browser is in charge.)
  if (mode === "native") {
    return NOOP_INSTANCE;
  }

  const anchorEnabled = options?.anchorScrolling ?? true;
  const getContainer = options?.scrollContainer;
  const behavior: ScrollBehavior = options?.behavior ?? "auto";
  const storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;

  // Write-through in-memory cache: parse sessionStorage once per provider
  // mount, then mutate in-memory. Avoids a JSON.parse + JSON.stringify pair
  // on every subscribeLeave / pagehide event.
  let store: Record<string, number> | undefined;

  const loadStore = (): Record<string, number> => {
    if (store !== undefined) {
      return store;
    }

    try {
      const raw = sessionStorage.getItem(storageKey);

      store = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    } catch {
      store = {};
    }

    return store;
  };

  const putPos = (key: string, pos: number): void => {
    try {
      const cached = loadStore();

      // Skip-same-value: when a route is left at the same scroll position it
      // already holds in the cache (e.g. tab-switching without scrolling),
      // both the in-memory write and the JSON.stringify + setItem pair are
      // no-ops. Eliminates redundant serialization on the navigation hot
      // path for the common "click tabs without scrolling" case.
      if (cached[key] === pos) {
        return;
      }

      cached[key] = pos;
      sessionStorage.setItem(storageKey, JSON.stringify(cached));
    } catch {
      // Ignore quota / security errors.
    }
  };

  const prevScrollRestoration = history.scrollRestoration;

  try {
    history.scrollRestoration = "manual";
  } catch {
    // Ignore — some embedded contexts may reject the assignment.
  }

  // Resolve the container lazily on every event so containers mounted AFTER
  // the provider still get correct scroll handling. Falls back to window when
  // the getter is absent or returns null (pre-mount).
  const readPos = (): number => {
    const element = getContainer?.();

    return element ? element.scrollTop : globalThis.scrollY;
  };

  const writePos = (top: number): void => {
    const element = getContainer?.();

    if (element) {
      element.scrollTo({ top, left: 0, behavior });
    } else {
      globalThis.scrollTo({ top, left: 0, behavior });
    }
  };

  // Restore path (back / traverse / reload). Unlike `writePos`, this tolerates a
  // scroll container that both MOUNTS and LAYS OUT a few frames AFTER the
  // navigation settles.
  //
  // The capture-side `readPos` always runs against an already-mounted DOM (the
  // route being left). On restore the target route — and its container — is
  // still being committed by the view layer. The subscribe callback schedules a
  // single rAF; for a heavy route (e.g. a long virtual list) the framework's
  // commit can land AFTER that frame. Two distinct failures follow, each losing
  // the saved position (Scenario 6 e2e, reproduced under CI's slower runner):
  //
  //   1. Container not mounted yet → `getContainer()` is `null`, the scroll
  //      silently falls back to `window`, which on a container-only route has
  //      nothing to scroll.
  //   2. Container mounted but its content not laid out yet → `scrollHeight`
  //      is still small, so a single `scrollTo({ top })` clamps short of the
  //      saved position and never re-applies once layout grows.
  //
  // With no `scrollContainer` getter the target is always `window`, present
  // from the first frame — restore in a single shot (unchanged behaviour). When
  // a getter is configured we cannot tell "this route legitimately uses window"
  // from "the container is still mounting", so re-apply the scroll on every
  // frame for a bounded budget: window as a fallback while the container is
  // absent (harmless clamp on container routes), the container itself once it
  // appears. For instant restores we stop early the moment the position sticks;
  // smooth restores animate asynchronously, so they run the full budget. The
  // frame budget is the hard backstop against an unreachable target (saved
  // position taller than the restored content).
  const restorePos = (top: number): void => {
    if (!getContainer) {
      globalThis.scrollTo({ top, left: 0, behavior });

      return;
    }

    let frames = 0;

    const attempt = (): void => {
      if (destroyed) {
        return;
      }

      const element = getContainer();

      if (element) {
        element.scrollTo({ top, left: 0, behavior });

        // Instant restore landed within rounding tolerance → done; no point
        // re-applying. Smooth restore never matches synchronously, so let it
        // ride the budget.
        if (behavior !== "smooth" && Math.abs(element.scrollTop - top) <= 1) {
          return;
        }
      } else {
        globalThis.scrollTo({ top, left: 0, behavior });
      }

      if (frames >= RESTORE_RETRY_FRAMES) {
        return;
      }

      frames += 1;
      requestAnimationFrame(attempt);
    };

    attempt();
  };

  const scrollToHashOrTop = (route: State): void => {
    // URL plugin path (#532): `state.context.url.hash` is the source of truth
    // when one of the URL plugins (browser-plugin / navigation-plugin) is
    // installed. The value is already DECODED — feeding it through
    // `decodeURIComponent` again would throw on a bare `%`.
    const ctxHash = (route.context as { url?: { hash?: string } } | undefined)
      ?.url?.hash;

    if (ctxHash !== undefined) {
      if (anchorEnabled && ctxHash.length > 0) {
        // eslint-disable-next-line unicorn/prefer-query-selector -- ids may contain CSS-unsafe chars
        const element = document.getElementById(ctxHash);

        if (element) {
          element.scrollIntoView({ behavior });

          return;
        }
      }

      writePos(0);

      return;
    }

    // Fallback path: no URL plugin, read the DOM. `location.hash` is
    // percent-encoded; ids in the DOM are the raw string, so decode for the
    // match. Fall back to the raw slice if the hash contains a malformed
    // escape sequence (decodeURIComponent throws on those).
    const hash = globalThis.location.hash;

    if (anchorEnabled && hash.length > 1) {
      let id: string;

      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        id = hash.slice(1);
      }

      // eslint-disable-next-line unicorn/prefer-query-selector -- ids may contain CSS-unsafe chars
      const element = document.getElementById(id);

      if (element) {
        element.scrollIntoView({ behavior });

        return;
      }
    }

    writePos(0);
  };

  let destroyed = false;
  let unserializableWarned = false;
  // Capture/effect seam guard (#782). previousRoute's position is captured
  // synchronously in `subscribe`, but the snap/restore effect runs a frame
  // later in rAF. Across that window the viewport still shows the route BEFORE
  // previousRoute, so a second navigation landing in the same frame would
  // capture that foreign position under previousRoute's key. `scrollSettled` is
  // false across the window — capture is skipped (previousRoute's own stored
  // value survives the transit). A real user scroll in this <16ms window is
  // physically impossible.
  let scrollSettled = true;

  // `keyOf` defers to `canonicalJson` which calls `JSON.stringify`. Two
  // realistic inputs blow up the serializer and would otherwise crash the
  // subscribe callback (taking scroll-restore offline for the whole session):
  //   - `BigInt` params → `TypeError: Do not know how to serialize a BigInt`
  //   - cyclic params (reactive proxies, DOM-ref back-pointers) → stack
  //     overflow.
  // The defensive wrapper drops capture/restore for that specific navigation
  // and warns once per provider — the rest of the cache stays usable.
  const safeKeyOf = (state: State): string | null => {
    try {
      return keyOf(state);
    } catch {
      if (!unserializableWarned) {
        unserializableWarned = true;
        console.error(
          `[real-router] scroll-restore: route "${state.name}" has params that cannot be canonicalized (e.g. BigInt or cyclic structure). Scroll position will not be captured or restored for this route.`,
        );
      }

      return null;
    }
  };

  const unsubscribe = router.subscribe(({ route, previousRoute }) => {
    const nav = (route.context as { navigation?: NavigationContext })
      .navigation;

    // Browsers dispatch reload as the initial navigation after refresh, so
    // previousRoute is undefined and capture is naturally skipped. The
    // pre-refresh position was already persisted via pagehide. Capture is also
    // skipped while the scroll is unsettled — a second navigation in the same
    // frame, before the prior nav's rAF snap (see `scrollSettled`, #782).
    if (previousRoute && scrollSettled) {
      const prevKey = safeKeyOf(previousRoute);

      if (prevKey !== null) {
        putPos(prevKey, readPos());
      }
    }

    // This navigation's scroll effect is now pending: the viewport position no
    // longer belongs to `route` until the rAF below runs and settles it.
    scrollSettled = false;

    requestAnimationFrame(() => {
      if (destroyed) {
        return;
      }

      // Effect running — the position now belongs to `route`, so the next
      // capture is honest again.
      scrollSettled = true;

      if (mode === "top") {
        scrollToHashOrTop(route);

        return;
      }

      // Restore branches (reload, back/traverse) MUST be evaluated before the
      // replace-skip below. Since #657 lifted `replace` into TransitionMeta, a
      // history TRAVERSAL (back/forward) under navigation-plugin carries
      // `transition.replace === true` — a traversal reuses an existing history
      // entry, which is replace-shaped at the history level. If the replace-skip
      // ran first it would swallow every back/forward navigation and restore
      // would never fire (the Scenario 6 e2e regression). Genuine in-place
      // replaces (`router.navigate({ replace: true })`, navigateToNotFound) are
      // not traversals and fall through to the skip below.
      //
      // Both arms of each check are required: `transition.reload` only fires for
      // programmatic `router.navigate({reload:true})`. F5 under navigation-plugin
      // primes `nav.navigationType === "reload"` via #531 getActivationType but
      // leaves opts.reload undefined, so dropping the plugin arm would regress F5
      // scroll-restore. Browser-plugin's F5 is not covered (no priming, out of
      // scope).
      if (route.transition.reload || nav?.navigationType === "reload") {
        const key = safeKeyOf(route);

        restorePos(key === null ? 0 : (loadStore()[key] ?? 0));

        return;
      }

      if (nav?.direction === "back" || nav?.navigationType === "traverse") {
        const key = safeKeyOf(route);

        restorePos(key === null ? 0 : (loadStore()[key] ?? 0));

        return;
      }

      // Genuine in-place replace (not a traversal) — leave scroll untouched.
      if (route.transition.replace || nav?.navigationType === "replace") {
        return;
      }

      scrollToHashOrTop(route);
    });
  });

  const onPageHide = (): void => {
    const current = router.getState();

    if (current) {
      const key = safeKeyOf(current);

      if (key !== null) {
        putPos(key, readPos());
      }
    }
  };

  globalThis.addEventListener("pagehide", onPageHide);

  return {
    destroy: () => {
      // No `if (destroyed) return` guard: every teardown below is idempotent —
      // `unsubscribe()` is a `set.delete` in the core EventEmitter, DOM
      // `removeEventListener` is spec-idempotent, and the history assignment is
      // a plain re-set. There is no ref-count to protect (unlike
      // route-announcer's shared announcer element), so a double `destroy()` is
      // harmless. `destroyed = true` still gates any pending restore rAF / retry.
      destroyed = true;
      unsubscribe();
      globalThis.removeEventListener("pagehide", onPageHide);

      try {
        history.scrollRestoration = prevScrollRestoration;
      } catch {
        // Ignore.
      }
    },
  };
}

/**
 * Internal cache-key builder for scroll-position storage.
 *
 * **Exported for testing only — not part of the public API** (intentionally
 * excluded from `index.ts` barrel). Adapter property tests import it via
 * the direct path to lock the `(name, canonicalJson(params))` key shape
 * as a regression guard (§8b H20 / audit-2026-05-16 #S3). A change to
 * key format would silently lose scroll positions across an upgrade —
 * the test set is the contract.
 *
 * ## Identity-based memoization (audit-2026-05-17 §8b #2)
 *
 * `State` objects emitted by core are frozen per-navigation: their
 * `name` / `params` are immutable for the lifetime of the snapshot, and
 * any change produces a new `State` reference. A `WeakMap<State, string>`
 * therefore safely caches the canonicalised key by identity — repeat
 * `keyOf(state)` calls on the same snapshot (typical on
 * back/forward/traverse where the same prior `State` is re-emitted)
 * skip the recursive `canonicalJson` pass entirely.
 *
 * The cache key is the `State` reference, so entries auto-release when
 * the snapshot is GC'd — no eviction needed.
 */
const KEY_CACHE = new WeakMap<State, string>();

export function keyOf(state: State): string {
  const cached = KEY_CACHE.get(state);

  if (cached !== undefined) {
    return cached;
  }

  // Key over BOTH channels — path params AND query (RFC-4 M2 / #1548). Merged
  // (not `params:search`) so a query-less route keeps its v1 key shape
  // (`name:{}`), and an unserializable value (BigInt / cyclic) in EITHER channel
  // still throws in `canonicalJson` → `safeKeyOf` drops+warns.
  const key = `${state.name}:${canonicalJson({ ...state.params, ...state.search })}`;

  KEY_CACHE.set(state, key);

  return key;
}

/**
 * Stable JSON serializer with sorted object keys.
 *
 * **Exported for testing only — not part of the public API** (intentionally
 * excluded from `index.ts` barrel). Adapter property tests import it via
 * the direct path to lock the key-order-insensitive property
 * (`canonicalJson({a:1,b:2}) === canonicalJson({b:2,a:1})`).
 *
 * ## Divergence from `@real-router/sources/canonicalJson` — by design
 *
 * Two independent implementations live in the monorepo:
 *
 * - **`shared/dom-utils/scroll-restore.canonicalJson`** (this file) — scroll
 *   cache key builder. Uses `localeCompare` and a plain-object accumulator;
 *   tolerates `__proto__`-keyed inputs only insofar as `JSON.stringify`'s
 *   replacer happens to sort them; relies on `JSON.stringify`'s native cycle
 *   detector. Designed to be cheap on the navigation hot path. The
 *   surrounding [[safeKeyOf]] wrapper catches the two crash inputs (`BigInt`,
 *   cyclic) and skips the offending capture/restore.
 *
 * - **`@real-router/sources/canonicalJson`** — sources cache key builder.
 *   Uses byte-order compare (`< / >`) for locale-independence, a
 *   `Object.create(null)` accumulator to prevent prototype pollution, and a
 *   bespoke path-based cycle detector (the native one cannot see the cloned
 *   graph). Throws eagerly on `Map`/`Set`/`RegExp`/cycles — the caller falls
 *   back to a non-cached source.
 *
 * **They are intentionally NOT interchangeable.** Aligning them would either
 * regress scroll-restore performance (byte-order + recursive clone is heavier
 * per call) or weaken the sources cache (locale dependence breaks
 * deterministic cache keys across machines). No cross-package equivalence
 * test exists or should be added; the relationship is "different invariants,
 * different costs, different consumers." Audit-2 / audit-2026-05-17 §2
 * documents the choice.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, canonicalReplacer);
}

function canonicalReplacer(_key: string, val: unknown): unknown {
  // audit-2026-05-17 §5 MEDIUM (Sprint A.3) — function/Symbol marker.
  // `JSON.stringify` silently drops function and symbol values from
  // object output. Two routes that differ ONLY in a function/Symbol
  // value would canonicalize to the same string → silent scroll-cache
  // key collision (positions clobber each other). Replacing the value
  // with a sentinel string breaks the collision while keeping the
  // canonical form deterministic. The sentinels are intentionally
  // ASCII-only and lexically distinct from valid JSON-stringified
  // values; consumers will see `"<fn>"` / `"<sym>"` if they ever
  // round-trip the cache key, signalling the substitution clearly.
  if (typeof val === "function") {
    return "<fn>";
  }
  if (typeof val === "symbol") {
    return "<sym>";
  }

  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    // Null-prototype accumulator: a plain `{}` would interpret
    // `sorted["__proto__"] = x` as a prototype assignment (silently dropped
    // from JSON.stringify output AND a prototype-pollution vector). Mirrors
    // the same guard in `@real-router/sources/canonicalJson`. The two
    // implementations are still intentionally divergent (see the doc-block
    // on [[canonicalJson]] above), but prototype-safety is non-negotiable
    // on both. Lock-test: scrollRestoreKey.properties.ts Invariant 11.
    const sorted = Object.create(null) as Record<string, unknown>;
    // eslint-disable-next-line unicorn/no-array-sort -- ng-packagr uses pre-ES2023 lib; toSorted unavailable
    const keys = Object.keys(val).sort((left: string, right: string) =>
      left.localeCompare(right),
    );

    for (const key of keys) {
      sorted[key] = (val as Record<string, unknown>)[key];
    }

    return sorted;
  }

  return val;
}
