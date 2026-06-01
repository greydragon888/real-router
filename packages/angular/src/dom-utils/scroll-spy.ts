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
   * Lazy getter for the scrollable container. Resolved on every event.
   * `null` (or missing getter) falls back to the window viewport
   * (`root: null` on the `IntersectionObserver`).
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

interface UrlContextSlice {
  hash?: string;
  hashChanged?: boolean;
}

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

  let destroyed = false;
  // Permanent disable after no-URL-plugin detection (RFC §5.5).
  let silenced = false;

  // Self-emit guard (RFC §5.2): set synchronously around our own
  // `router.navigate()` so the `router.subscribe` callback skips the cooldown
  // setup for spy-emitted transitions — otherwise spy would rate-limit
  // itself to ≤ 2 emits/s, contradicting the ≤ 10/s benchmark target.
  let selfEmitting = false;

  // Cooldown state — set on user-driven hash transitions, cleared on
  // `scrollend` or after the safety timeout.
  let coolingDown = false;
  let cooldownTimeout: ReturnType<typeof setTimeout> | null = null;
  let cooldownContainer: HTMLElement | null = null;
  let activeScrollendListener: (() => void) | null = null;

  // rAF + trailing debounce coalescing.
  let rafHandle: number | null = null;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Already-warned set keeps the dev console quiet after the first detection
  // of duplicate ids on a page (RFC §7.7).
  let duplicateIdWarned = false;

  const transitionSource = getTransitionSource(router);

  // Detection guard (RFC §5.5): if `state.context.url` is undefined while
  // the router has started, no URL plugin is installed — warn once and stay
  // silent for the rest of the spy lifetime.
  const verifyUrlPluginPresence = (state: { context?: unknown }): void => {
    const context = state.context as
      | (Record<string, unknown> & { url?: unknown })
      | undefined;

    if (context && context.url === undefined) {
      silenced = true;

      console.warn(
        "[real-router] scroll-spy: state.context.url is not claimed. " +
          "Spy requires browser-plugin or navigation-plugin. Disabling.",
      );
    }
  };

  const peekState = router.getState();

  if (peekState) {
    verifyUrlPluginPresence(peekState);
  }

  // One-shot deferred detection if router not started yet.
  let detectionUnsub: (() => void) | null = null;

  if (!peekState) {
    let detectionConsumed = false;

    detectionUnsub = router.subscribe(({ route }) => {
      if (detectionConsumed) {
        return;
      }

      detectionConsumed = true;
      verifyUrlPluginPresence(route);

      detectionUnsub?.();
      detectionUnsub = null;
    });
  }

  // Resolve scroll container lazily on every operation. Returns `null` when
  // the user didn't pass a getter or the getter returns nothing — that maps
  // to window viewport (`IntersectionObserver.root === null`).
  const resolveContainer = (): HTMLElement | null => {
    const element = getContainer?.();

    return element ?? null;
  };

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

  // Track currently observed elements so we can `unobserve` removed nodes
  // on MutationObserver events.
  const observedElements = new Set<Element>();
  let intersectionObserver: IntersectionObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
  // Latest IO entry per target — accumulated across batches. IO delivers
  // entries only for targets whose intersection state CHANGED (W3C IO
  // §3.2.1), so a fast scroll that lands two callbacks inside the same
  // debounce window must merge by target, not overwrite. Entries are
  // dropped from the map when their target leaves the DOM (see
  // `reconcileObservedSet`) and on `destroy()`.
  const pendingEntries = new Map<Element, IntersectionObserverEntry>();

  const clearCooldown = (): void => {
    if (cooldownTimeout !== null) {
      clearTimeout(cooldownTimeout);
      cooldownTimeout = null;
    }

    if (activeScrollendListener && cooldownContainer) {
      cooldownContainer.removeEventListener(
        "scrollend",
        activeScrollendListener,
      );
    } else if (activeScrollendListener) {
      globalThis.removeEventListener("scrollend", activeScrollendListener);
    }

    activeScrollendListener = null;
    cooldownContainer = null;
    coolingDown = false;
  };

  const startCooldown = (): void => {
    // If a cooldown is already active, reset it instead of stacking timers.
    clearCooldown();

    coolingDown = true;

    const liftCooldown = (): void => {
      clearCooldown();
    };

    activeScrollendListener = liftCooldown;
    cooldownContainer = resolveContainer();

    // `scrollend` event (Baseline 2026): listen on the scroll container if
    // present, otherwise on `window`. Fallback timeout guards against
    // browsers that ship `scrollIntoView({ behavior: "smooth" })` but never
    // fire `scrollend` (older Safari).
    const target: EventTarget = cooldownContainer ?? globalThis;

    target.addEventListener("scrollend", liftCooldown, { once: true });

    cooldownTimeout = setTimeout(liftCooldown, COOLDOWN_TIMEOUT_MS);
  };

  const flush = (): void => {
    if (destroyed || silenced) {
      pendingEntries.clear();

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

    if (coolingDown) {
      return;
    }

    if (pendingEntries.size === 0) {
      return;
    }

    // Successful flush consumes the merged snapshot. We clear so that the
    // next debounce window starts fresh; an anchor that is still
    // intersecting will only stay observable if IO emits another event for
    // it (which it does whenever the anchor's intersection state actually
    // changes). Skipping the clear here would leak state from one user-
    // perceived "scroll stop" into the next.
    const picked = pickTopmost(pendingEntries.values());

    pendingEntries.clear();

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

    const currentHash =
      (state.context as { url?: UrlContextSlice } | undefined)?.url?.hash ?? "";

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

    selfEmitting = true;
    router
      .navigate(state.name, state.params, opts)
      .catch(() => {
        // Fire-and-forget — suppress expected rejections (concurrent
        // navigate, router stopped, etc.) consistent with `<Link>` adapter
        // patterns.
      })
      .finally(() => {
        selfEmitting = false;
      });
  };

  const scheduleFlush = (): void => {
    // Coalesce via rAF then trailing debounce so a burst of IO events
    // produces ≤ 1 emit per debounce window (RFC §5.1 acceptance).
    if (rafHandle !== null) {
      return;
    }

    rafHandle = requestAnimationFrame(() => {
      rafHandle = null;

      if (debounceTimeout !== null) {
        clearTimeout(debounceTimeout);
      }

      debounceTimeout = setTimeout(() => {
        debounceTimeout = null;
        flush();
      }, RAF_DEBOUNCE_MS);
    });
  };

  const handleIntersection: IntersectionObserverCallback = (entries) => {
    if (destroyed || silenced) {
      return;
    }

    for (const entry of entries) {
      pendingEntries.set(entry.target, entry);
    }

    scheduleFlush();
  };

  const buildObserver = (): IntersectionObserver | null => {
    const container = resolveContainer();

    return new IntersectionObserver(handleIntersection, {
      root: container,
      rootMargin,
      threshold: 0,
    });
  };

  const observeMatches = (): void => {
    if (!intersectionObserver) {
      return;
    }

    const scope = resolveContainer() ?? document;
    let candidates: NodeListOf<Element>;

    try {
      candidates = scope.querySelectorAll(selector);
    } catch {
      // Invalid CSS selector — surface once, then stay silent. Same
      // defensive shape as `scroll-restore.ts` around `safeKeyOf`.
      if (!silenced) {
        silenced = true;

        console.warn(
          `[real-router] scroll-spy: invalid selector "${selector}". Disabling.`,
        );
      }

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

      if (observedElements.has(element)) {
        continue;
      }

      intersectionObserver.observe(element);
      observedElements.add(element);
    }
  };

  const reconcileObservedSet = (): void => {
    if (!intersectionObserver) {
      return;
    }

    // Drop observed elements that left the DOM. Avoids observer holding
    // strong refs to detached nodes. Also drop their accumulated entry so
    // stale "was intersecting" state for a removed node cannot be picked
    // by `pickTopmost` after the node is gone.
    for (const element of observedElements) {
      if (!element.isConnected) {
        intersectionObserver.unobserve(element);
        observedElements.delete(element);
        pendingEntries.delete(element);
      }
    }

    observeMatches();
  };

  const scheduleMutationReconcile = (): void => {
    if (mutationDebounce !== null) {
      clearTimeout(mutationDebounce);
    }

    mutationDebounce = setTimeout(() => {
      mutationDebounce = null;
      reconcileObservedSet();
    }, MUTATION_DEBOUNCE_MS);
  };

  intersectionObserver = buildObserver();
  observeMatches();

  // MutationObserver targets the scroll container (or document.body for
  // window viewport). `childList: true, subtree: true` catches structural
  // changes; `attributes: true, attributeFilter: ["id"]` catches anchor
  // id renames (typical for client-rendered docs).
  const mutationTarget = resolveContainer() ?? document.body;

  mutationObserver = new MutationObserver(() => {
    scheduleMutationReconcile();
  });

  mutationObserver.observe(mutationTarget, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["id"],
  });

  // Cooldown setup on user-driven hash transitions. spy's own emits are
  // distinguished via the synchronous `selfEmitting` flag (see flush()).
  const unsubscribeRouter = router.subscribe(({ route }) => {
    if (selfEmitting) {
      return;
    }

    const ctx = route.context as { url?: UrlContextSlice } | undefined;

    if (ctx?.url?.hashChanged) {
      startCooldown();
    }
  });

  return {
    destroy(): void {
      if (destroyed) {
        return;
      }

      destroyed = true;

      if (intersectionObserver) {
        intersectionObserver.disconnect();
        intersectionObserver = null;
      }

      if (mutationObserver) {
        mutationObserver.disconnect();
        mutationObserver = null;
      }

      if (mutationDebounce !== null) {
        clearTimeout(mutationDebounce);
        mutationDebounce = null;
      }

      if (rafHandle !== null) {
        cancelAnimationFrame(rafHandle);
        rafHandle = null;
      }

      if (debounceTimeout !== null) {
        clearTimeout(debounceTimeout);
        debounceTimeout = null;
      }

      clearCooldown();

      unsubscribeRouter();
      detectionUnsub?.();
      detectionUnsub = null;

      observedElements.clear();
      pendingEntries.clear();
    },
  };
}
