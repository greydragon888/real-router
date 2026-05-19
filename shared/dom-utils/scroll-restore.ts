import type { Router, State } from "@real-router/core";

const DEFAULT_STORAGE_KEY = "real-router:scroll";

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
    // pre-refresh position was already persisted via pagehide.
    if (previousRoute) {
      const prevKey = safeKeyOf(previousRoute);

      if (prevKey !== null) {
        putPos(prevKey, readPos());
      }
    }

    // Single rAF so DOM is committed before we read anchors / write scroll.
    // Guard against destroy() racing with the callback.
    requestAnimationFrame(() => {
      if (destroyed) {
        return;
      }

      if (mode === "top" || !nav) {
        scrollToHashOrTop(route);

        return;
      }

      if (nav.navigationType === "replace") {
        return;
      }

      if (
        nav.direction === "back" ||
        nav.navigationType === "traverse" ||
        nav.navigationType === "reload"
      ) {
        const key = safeKeyOf(route);

        writePos(key === null ? 0 : (loadStore()[key] ?? 0));

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
      if (destroyed) {
        return;
      }

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

  const key = `${state.name}:${canonicalJson(state.params)}`;

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
