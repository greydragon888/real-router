import type { Router, State } from "@real-router/core";

/** Captured like the deciding seven, but this one BUILDS the guarantee (#2072). */
const objectCreate = Object.create;

const DEFAULT_STORAGE_KEY = "real-router:scroll";

// Bounded retry budget on the restore path. The restored route — a per-route
// container (e.g. an `overflow:auto` div rendered only on one route), or the
// content that makes the document tall enough — can be committed to the DOM a
// few frames after the navigation settles: heavier routes paint later than
// the subscribe's rAF.
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
   * sessionStorage key for persisting saved scroll positions. Default:
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

/**
 * What plugins publish about the navigation that produced a state, each in a
 * namespace of its own. Read by name, so this file imports no plugin.
 */
interface PluginContext {
  navigation?: NavigationContext;
  browser?: { source?: "popstate" | "navigate" };
  memory?: { direction?: "back" | "forward" | "navigate" };
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

    // ⚑ A PROTOTYPE-LESS record, and here that is the cheap fix rather than the
    // expensive one (#1852). The key is `${route}:${json}`, so both the
    // skip-same-value READ and the write below consult a chain under a name the
    // page never chose; with no chain there is nothing to consult. Core pays for
    // the same guarantee with `putField` because its bags are read on every
    // render and V8 keeps a prototype-less object in dictionary mode — this one
    // is a small per-mount cache read a few times per navigation, so the tax is
    // expected to be negligible and no primitive needs importing.
    //
    // ⚠ "Expected", not measured, and the word is chosen: nothing benches this
    // cache. Its sibling in `putField`'s docblock is the reason to be careful —
    // "not measurable" there turned out to be a statement about the instrument,
    // not the cost. Measure before repeating the word.
    //
    // ⚠ `JSON.parse` DEFINES, so a stored `"__proto__"` key arrives as ordinary
    // data either way; what this closes is the ambient half.
    try {
      const raw = sessionStorage.getItem(storageKey);
      const parsed = raw
        ? (JSON.parse(raw) as Record<string, number>)
        : undefined;

      store = Object.assign(
        objectCreate(null) as Record<string, number>,
        parsed,
      );
    } catch {
      store = objectCreate(null) as Record<string, number>;
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

  // ⚑ A restore loop stops once a later commit has taken a new token: without
  // it a loop whose target is unreachable writes the previous route's offset
  // onto the current page the moment that page's layout grows (#1924).
  //
  // Every commit takes one except a replace on the same route that neither
  // steps through history nor reloads — a scroll-spy hash update, a query
  // synced into the URL — which leaves the restore running. It is taken at the
  // commit rather than in the frame, so a second commit in the same frame
  // retires a restore before its first write.
  // `view-transitions.ts` carries the same idea as `scheduledVT` (#781).
  let restoreToken = 0;

  // Restore path (back / traverse / reload). Unlike `writePos`, this tolerates a
  // target route that MOUNTS and LAYS OUT a few frames AFTER the navigation
  // settles: the view layer can commit it after the subscribe's frame. Two
  // failures follow, each losing the saved position:
  //
  //   1. Container not mounted yet → `getContainer()` is `null`, the scroll
  //      silently falls back to `window`, which on a container-only route has
  //      nothing to scroll.
  //   2. Content not laid out yet, in the container or in the document → a
  //      single `scrollTo({ top })` clamps short of the saved position and
  //      never re-applies once layout grows.
  //
  // Scenario 6 of the scroll-restoration example's e2e reproduces both in a
  // container.
  //
  // So the scroll is re-applied on every frame until the target can hold the
  // position — its content is tall enough, and one scroll then lands it,
  // instant or smooth — or until the budget, the backstop against an
  // unreachable target, runs out. A smooth scroll re-applied on every frame
  // arrives later in WebKit, which is why the loop stops at the first frame
  // that can hold it rather than at the first that shows it. With no getter
  // the target is `window`. With one we cannot tell "this route uses window"
  // from "the container is still mounting": window takes the scroll as a
  // fallback while the container is absent (a harmless clamp on container
  // routes), and only the container, once it appears, ends the loop early.
  const restorePos = (route: State, token: number): void => {
    const top = loadStore()[keyOf(route)] ?? 0;
    let frames = 0;
    const holds = (scroller: Element): boolean =>
      scroller.scrollHeight - scroller.clientHeight >= top - 1;

    const attempt = (): void => {
      if (destroyed || token !== restoreToken) {
        return;
      }

      const element = getContainer?.();

      if (element) {
        element.scrollTo({ top, left: 0, behavior });

        if (holds(element)) {
          return;
        }
      } else {
        globalThis.scrollTo({ top, left: 0, behavior });

        if (
          !getContainer &&
          holds(document.scrollingElement ?? document.documentElement)
        ) {
          return;
        }
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
  // Capture/effect seam guard (#782). previousRoute's position is captured
  // synchronously in `subscribe`, but the snap/restore effect runs a frame
  // later in rAF. Across that window the viewport still shows the route BEFORE
  // previousRoute, so a second navigation landing in the same frame would
  // capture that foreign position under previousRoute's key. `scrollSettled` is
  // false across the window — capture is skipped (previousRoute's own stored
  // value survives the transit). A real user scroll in this <16ms window is
  // physically impossible.
  let scrollSettled = true;
  // browser-plugin writes state into every entry it commits, so a popstate onto
  // an entry without state lands on one it did not commit — a fragment
  // navigation (an in-page anchor, `location.hash = …`) or an entry other code
  // pushed — rather than stepping through history. An entry whose state other
  // code has cleared reads the same. The location cannot tell a fragment
  // navigation from a step: after a URL rewritten without a commit
  // (`replaceHistoryState`) the router's location is stale, and an anchor click
  // seems to change it. `event.state` is read rather than `history.state`,
  // which the plugin has stamped by the frame; the flag is read in the frame
  // rather than in `subscribe`, because the plugin's listener can commit before
  // this one runs.
  //
  // ⚠ The flag is the last popstate's: one that arrives between a commit and
  // its frame decides that frame.
  let landedOnNewEntry = false;

  const onPopState = (event: PopStateEvent): void => {
    // `null` in a browser; `undefined` under jsdom.
    landedOnNewEntry = event.state === null || event.state === undefined;
  };

  const unsubscribe = router.subscribe(({ route, previousRoute }) => {
    const context = route.context as PluginContext;
    const nav = context.navigation;
    const memory = context.memory?.direction;
    const fromPopState = context.browser?.source === "popstate";
    // A step through history, from the namespace of the URL plugin that
    // publishes one. browser-plugin marks every popstate, a fragment
    // navigation's included; the frame below tells the two apart.
    const historyStep =
      fromPopState ||
      nav?.direction === "back" ||
      nav?.navigationType === "traverse" ||
      memory === "back" ||
      memory === "forward";
    // Optional although the type requires it: core commits a foreign State's
    // ABSENT `transition` rather than fabricating one (#1792 / #1976), and this
    // runs on whatever `subscribe` hands over. Absent falls through to the
    // plugin arm. A flag is read for truthiness: core commits a JS caller's
    // non-boolean flag unchanged.
    const transition = route.transition as State["transition"] | undefined;
    const reload =
      (transition?.reload ?? false) || nav?.navigationType === "reload";
    const replace =
      (transition?.replace ?? false) || nav?.navigationType === "replace";
    const settled = scrollSettled;

    // Browsers dispatch reload as the initial navigation after refresh, so
    // previousRoute is undefined and capture is naturally skipped. The
    // pre-refresh position was already persisted via pagehide. Capture is also
    // skipped while the scroll is unsettled — a second navigation in the same
    // frame, before the prior nav's rAF snap (see `scrollSettled`, #782).
    if (previousRoute && settled) {
      putPos(keyOf(previousRoute), readPos());
    }

    // This navigation's scroll effect is now pending: the viewport position no
    // longer belongs to `route` until the rAF below runs and settles it.
    scrollSettled = false;

    if (
      !replace ||
      historyStep ||
      reload ||
      previousRoute?.name !== route.name
    ) {
      restoreToken += 1;
    }

    const token = restoreToken;

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
      // replace-skip below: a history TRAVERSAL reuses an existing entry, which
      // is replace-shaped at the history level, so browser-plugin and
      // memory-plugin commit every one with `transition.replace === true`, and
      // navigation-plugin every one the browser starts. The skip would swallow
      // them. Genuine in-place replaces (`router.navigate({ replace: true })`,
      // navigateToNotFound) are not traversals and fall through to the skip
      // below.
      //
      // Both arms of the reload check are required: `transition.reload` only
      // fires for programmatic `router.navigate({reload:true})`. F5 under
      // navigation-plugin primes `nav.navigationType === "reload"` via #531
      // getActivationType but leaves opts.reload undefined, so dropping the
      // plugin arm would regress F5 scroll-restore. Browser-plugin's F5 is not
      // covered (no priming, out of scope).
      if (reload) {
        restorePos(route, token);

        return;
      }

      // A fragment navigation lands on an entry the plugin did not commit
      // (`landedOnNewEntry`). A popstate that keeps the location has nothing
      // to restore either: a restore would write back the position just
      // captured. Unsettled, the page still shows an older location, the
      // capture was skipped, and the popstate restores.
      const keepsLocation =
        settled &&
        previousRoute !== undefined &&
        keyOf(previousRoute) === keyOf(route);

      if (
        historyStep &&
        !(fromPopState && (landedOnNewEntry || keepsLocation))
      ) {
        restorePos(route, token);

        return;
      }

      // Genuine in-place replace (not a traversal) — leave scroll untouched.
      if (replace) {
        return;
      }

      scrollToHashOrTop(route);
    });
  });

  const onPageHide = (): void => {
    const current = router.getState();

    if (current) {
      putPos(keyOf(current), readPos());
    }
  };

  globalThis.addEventListener("pagehide", onPageHide);
  globalThis.addEventListener("popstate", onPopState);

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
      globalThis.removeEventListener("popstate", onPopState);

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
 * excluded from `index.ts` barrel). Adapter property tests import it rather
 * than replicating it (§8b H20 / audit-2026-05-16 #S3): a replica drifts
 * silently the moment the key changes. A change to the key format loses saved
 * positions across an upgrade, so the test set is the contract.
 *
 * ## Not memoized
 *
 * The key is a string property read, which is cheaper than the `WeakMap`
 * lookup any cache would need — so there is nothing here to cache.
 */
export function keyOf(state: State): string {
  // The key is the LOCATION, and `state.path` is the form core prints it in
  // (#1923). Deriving it from the bags instead makes this a SECOND place that
  // has to know how a value prints — and the two domains disagree there: the
  // URL direction parses `?page=2` into the number `2`, an intent keeps `"2"`,
  // and `packages/core/src/helpers.ts` says comparison is the single place that
  // knows they describe one location. Reading the printed form asks core rather
  // than re-deriving it, so a route's query, its `?id` carve-out twin and the
  // order its params were written in are all already settled here.
  return state.path;
}
