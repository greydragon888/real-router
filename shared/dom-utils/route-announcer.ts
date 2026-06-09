import type { Router, State } from "@real-router/core";

const CLEAR_DELAY = 7000;
const SAFARI_READY_DELAY = 100;
const ANNOUNCER_ATTR = "data-real-router-announcer";
const INTERNAL_ROUTE_PREFIX = "@@";
const VISUALLY_HIDDEN =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;border:0";

export interface RouteAnnouncerOptions {
  prefix?: string;
  getAnnouncementText?: (route: State) => string;
}

const NOOP_INSTANCE: { destroy: () => void } = Object.freeze({
  destroy: () => {
    /* no-op */
  },
});

export function createRouteAnnouncer(
  router: Router,
  options?: RouteAnnouncerOptions,
): { destroy: () => void } {
  // Defensive SSR / non-browser guard: in SSR (Node.js) or non-DOM
  // environments, `document` is undefined and the announcer cannot
  // attach its aria-live region. Return a frozen NOOP_INSTANCE — same
  // pattern as `createDirectionTracker`, `createScrollRestoration`, and
  // `createViewTransitions`. Without this guard, `NavigationAnnouncer`
  // component construction would throw `ReferenceError: document is not
  // defined` under `@angular/ssr` rendering, tearing down the whole SSR
  // bootstrap. Closes review-2026-05-10 §5.10 ⛔ "NavigationAnnouncer
  // SSR mode" MED.
  if (typeof document === "undefined") {
    return NOOP_INSTANCE;
  }

  const prefix = options?.prefix ?? "Navigated to ";
  const getCustomText = options?.getAnnouncementText;

  let isInitialNavigation = true;
  let isReady = false;
  let isDestroyed = false;
  let lastAnnouncedText = "";
  let pendingText: string | null = null;
  let clearTimeoutId: ReturnType<typeof setTimeout> | undefined;

  const announcer = getOrCreateAnnouncer();

  const doAnnounce = (text: string, h1: HTMLElement | null): void => {
    lastAnnouncedText = text;
    clearTimeout(clearTimeoutId);
    announcer.textContent = text;
    clearTimeoutId = setTimeout(() => {
      announcer.textContent = "";
      lastAnnouncedText = "";
    }, CLEAR_DELAY);

    manageFocus(h1);
  };

  // Safari-ready delay: announcing before VoiceOver wires up the aria-live region
  // causes the first announcement to be silently dropped. Wait SAFARI_READY_DELAY ms
  // before marking the announcer "ready" — any navigation during that window is
  // buffered in pendingText and flushed once the delay expires.
  const safariTimeoutId = setTimeout(() => {
    isReady = true;

    if (pendingText !== null && !isDestroyed) {
      const text = pendingText;

      pendingText = null;
      doAnnounce(text, document.querySelector<HTMLElement>("h1"));
    }
  }, SAFARI_READY_DELAY);

  const unsubscribe = router.subscribe(({ route }) => {
    if (isInitialNavigation) {
      isInitialNavigation = false;

      return;
    }

    // Double rAF: waits for two paint frames so the incoming route's DOM
    // (including the new <h1>) is fully rendered before resolveText reads it.
    // Single rAF fires before the new route's template has been attached,
    // which would cause resolveText to pick up the OLD h1 or fall back to
    // document.title / route.name prematurely.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (isDestroyed) {
          return;
        }

        const h1 = document.querySelector<HTMLElement>("h1");
        const text = resolveText(route, prefix, getCustomText, h1);

        if (!text || text === lastAnnouncedText) {
          return;
        }

        if (!isReady) {
          // Defer announcement until Safari-ready window elapses (see safariTimeoutId).
          pendingText = text;

          return;
        }

        doAnnounce(text, h1);
      });
    });
  });

  return {
    destroy() {
      isDestroyed = true;
      unsubscribe();
      clearTimeout(clearTimeoutId);
      clearTimeout(safariTimeoutId);
      removeAnnouncer();
    },
  };
}

function getOrCreateAnnouncer(): HTMLElement {
  const existing = document.querySelector<HTMLElement>(
    `[${CSS.escape(ANNOUNCER_ATTR)}]`,
  );

  if (existing) {
    return existing;
  }

  const element = document.createElement("div");

  element.setAttribute("style", VISUALLY_HIDDEN);
  element.setAttribute("aria-live", "assertive");
  element.setAttribute("aria-atomic", "true");
  element.setAttribute(ANNOUNCER_ATTR, "");

  // Defensive SSR / pre-`<body>` guard: in some environments (early
  // injection, deferred-body documents, certain SSR rehydration paths)
  // `document.body` can be null when the announcer is constructed.
  // `document.body.prepend(...)` would throw `TypeError: Cannot read
  // properties of null`, tearing down the consumer's RouterProvider /
  // NavigationAnnouncer mount. Fallback to `documentElement` keeps the
  // announcer working for SR users; visual-hidden styling means there is
  // no visible artifact regardless of mount point.
  //
  // TS dom lib types `document.body` as `HTMLElement` (non-null), but
  // runtime can return null per spec. The `as` cast narrows the type to
  // include null so the `??` short-circuit is type-safe.
  ((document.body as HTMLElement | null) ?? document.documentElement).prepend(
    element,
  );

  return element;
}

function removeAnnouncer(): void {
  document.querySelector(`[${CSS.escape(ANNOUNCER_ATTR)}]`)?.remove();
}

function resolveText(
  route: State,
  prefix: string,
  getCustomText: ((route: State) => string) | undefined,
  h1: HTMLElement | null,
): string {
  if (getCustomText) {
    try {
      const customText = getCustomText(route);

      // Mini-sprint E.4 (audit-5 §4.2 #4) — empty-string fallback.
      // A consumer pattern like
      //   getAnnouncementText: (route) => myMap[route.name] ?? ""
      // returns `""` for routes outside the map. The subscribe loop
      // then sees an empty text and silently no-announces — screen
      // readers stay quiet without any signal to the developer. Treat
      // a falsy custom result (`""` / `null` / `undefined`) as
      // "consumer doesn't have a name for this route" and fall through
      // to the default resolution chain (h1 → title → route name).
      if (customText) {
        return customText;
      }
    } catch (error) {
      // A throwing consumer callback inside the router's subscribe loop
      // would tear down sibling listeners — log and fall through to the
      // built-in resolution chain so the announcer keeps working.
      console.error(
        "[real-router] getAnnouncementText threw; falling back to default resolution.",
        error,
      );
    }
  }

  const h1Text = (h1?.textContent ?? "").trim();
  const routeName = route.name.startsWith(INTERNAL_ROUTE_PREFIX)
    ? ""
    : route.name;
  const rawText =
    h1Text || document.title || routeName || globalThis.location.pathname;

  return `${prefix}${rawText}`;
}

function manageFocus(h1: HTMLElement | null): void {
  if (!h1) {
    return;
  }

  if (!h1.hasAttribute("tabindex")) {
    h1.setAttribute("tabindex", "-1");
  }

  h1.focus({ preventScroll: true });
}
