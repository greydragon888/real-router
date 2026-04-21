import type { Router, State } from "@real-router/core";

const STORAGE_KEY = "real-router:scroll";

const NOOP_INSTANCE: { destroy: () => void } = Object.freeze({
  destroy: () => {
    /* no-op */
  },
});

export type ScrollRestorationMode = "restore" | "top" | "manual";

export interface ScrollRestorationOptions {
  mode?: ScrollRestorationMode | undefined;
  anchorScrolling?: boolean | undefined;
  scrollContainer?: (() => HTMLElement | null) | undefined;
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

  // mode "manual" = utility does nothing. Don't flip history.scrollRestoration,
  // don't subscribe, don't register pagehide — leave the browser's native
  // auto-restore intact for the app to override if it wants to.
  if (mode === "manual") {
    return NOOP_INSTANCE;
  }

  const anchorEnabled = options?.anchorScrolling ?? true;
  const getContainer = options?.scrollContainer;

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
      element.scrollTop = top;
    } else {
      globalThis.scrollTo(0, top);
    }
  };

  const scrollToHashOrTop = (): void => {
    const hash = globalThis.location.hash;

    if (anchorEnabled && hash.length > 1) {
      // location.hash is percent-encoded; ids in the DOM are the raw string.
      // Decode for the match. Fall back to the raw slice if the hash contains
      // a malformed escape sequence (decodeURIComponent throws on those).
      let id: string;

      try {
        id = decodeURIComponent(hash.slice(1));
      } catch {
        id = hash.slice(1);
      }

      // eslint-disable-next-line unicorn/prefer-query-selector -- ids may contain CSS-unsafe chars
      const element = document.getElementById(id);

      if (element) {
        element.scrollIntoView();

        return;
      }
    }

    writePos(0);
  };

  let destroyed = false;

  const unsubscribe = router.subscribe(({ route, previousRoute }) => {
    const nav = (route.context as { navigation?: NavigationContext })
      .navigation;

    // Browsers dispatch reload as the initial navigation after refresh, so
    // previousRoute is undefined and capture is naturally skipped. The
    // pre-refresh position was already persisted via pagehide.
    if (previousRoute) {
      putPos(keyOf(previousRoute), readPos());
    }

    // Single rAF so DOM is committed before we read anchors / write scroll.
    // Guard against destroy() racing with the callback.
    requestAnimationFrame(() => {
      if (destroyed) {
        return;
      }

      if (mode === "top" || !nav) {
        scrollToHashOrTop();

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
        writePos(loadStore()[keyOf(route)] ?? 0);

        return;
      }

      scrollToHashOrTop();
    });
  });

  const onPageHide = (): void => {
    const current = router.getState();

    if (current) {
      putPos(keyOf(current), readPos());
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

function keyOf(state: State): string {
  return `${state.name}:${canonicalJson(state.params)}`;
}

function loadStore(): Record<string, number> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);

    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

function putPos(key: string, pos: number): void {
  try {
    const store = loadStore();

    store[key] = pos;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore quota / security errors.
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, canonicalReplacer);
}

function canonicalReplacer(_key: string, val: unknown): unknown {
  if (val !== null && typeof val === "object" && !Array.isArray(val)) {
    const sorted: Record<string, unknown> = {};
    // eslint-disable-next-line unicorn/no-array-sort -- ng-packagr uses pre-ES2023 lib; toSorted unavailable
    const keys = Object.keys(val as Record<string, unknown>).sort(
      (left: string, right: string) => left.localeCompare(right),
    );

    for (const key of keys) {
      sorted[key] = (val as Record<string, unknown>)[key];
    }

    return sorted;
  }

  return val;
}
