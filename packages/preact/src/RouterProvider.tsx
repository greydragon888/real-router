import { getNavigator } from "@real-router/core";
import { createRouteSource, primeErrorSource } from "@real-router/sources";
import { useEffect, useMemo } from "preact/hooks";

import { NavigatorContext, RouteContext, RouterContext } from "./context";
import {
  createRouteAnnouncer,
  createScrollRestoration,
  createScrollSpy,
  createViewTransitions,
} from "./dom-utils";
import { useSyncExternalStore } from "./useSyncExternalStore";

import type {
  RouteAnnouncerOptions,
  ScrollRestorationOptions,
  ScrollSpyOptions,
} from "./dom-utils";
import type { Router } from "@real-router/core";
import type { FunctionComponent, ComponentChildren } from "preact";

export interface RouteProviderProps {
  router: Router;
  children: ComponentChildren;
  announceNavigation?: boolean | RouteAnnouncerOptions;
  scrollRestoration?: ScrollRestorationOptions;
  scrollSpy?: ScrollSpyOptions;
  viewTransitions?: boolean;
}

export const RouterProvider: FunctionComponent<RouteProviderProps> = ({
  router,
  children,
  announceNavigation,
  scrollRestoration,
  scrollSpy,
  viewTransitions,
}) => {
  // `announceNavigation` accepts `true` (default announcer) or a
  // `RouteAnnouncerOptions` object (`{ prefix, getAnnouncementText }`) for
  // custom announcement text. `false` / `undefined` disables it.
  const announceEnabled =
    announceNavigation !== undefined && announceNavigation !== false;
  const announceOptions =
    typeof announceNavigation === "object" ? announceNavigation : undefined;
  const announcePrefix = announceOptions?.prefix;

  useEffect(() => {
    if (!announceEnabled) {
      return;
    }

    const announcer = createRouteAnnouncer(router, announceOptions);

    return () => {
      announcer.destroy();
    };
    // announceOptions (for getAnnouncementText) omitted — inline-object identity
    // churn shouldn't re-create the announcer; the callback is captured once by
    // the utility (same rationale as scrollContainer below).
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [router, announceEnabled, announcePrefix]);

  // Primitive deps so inline `{ mode: "restore" }` doesn't thrash on every
  // render. scrollContainer is a getter invoked lazily on every event inside
  // the utility — swapping its reference doesn't change the resolved element,
  // so we intentionally omit it from deps to keep inline getters stable.
  const srMode = scrollRestoration?.mode;
  const srAnchor = scrollRestoration?.anchorScrolling;
  const srBehavior = scrollRestoration?.behavior;
  const srStorageKey = scrollRestoration?.storageKey;
  const srEnabled = scrollRestoration !== undefined;

  useEffect(() => {
    if (!srEnabled) {
      return;
    }

    const sr = createScrollRestoration(router, {
      mode: srMode,
      anchorScrolling: srAnchor,
      behavior: srBehavior,
      storageKey: srStorageKey,
      // srEnabled check above guarantees scrollRestoration is defined.
      scrollContainer: scrollRestoration.scrollContainer,
    });

    return () => {
      sr.destroy();
    };
    // scrollRestoration (for scrollContainer) omitted — see comment above.
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [router, srEnabled, srMode, srAnchor, srBehavior, srStorageKey]);

  const spySelector = scrollSpy?.selector;
  const spyRootMargin = scrollSpy?.rootMargin;
  const spyEnabled =
    scrollSpy !== undefined && spySelector !== undefined && spySelector !== "";

  useEffect(() => {
    if (!spyEnabled) {
      return;
    }

    const spy = createScrollSpy(router, {
      selector: spySelector,
      rootMargin: spyRootMargin,
      scrollContainer: scrollSpy.scrollContainer,
    });

    return () => {
      spy.destroy();
    };
    // scrollSpy (for scrollContainer) omitted — same rationale as
    // scrollRestoration above: getter is invoked lazily inside the utility.
    // eslint-disable-next-line @eslint-react/exhaustive-deps
  }, [router, spyEnabled, spySelector, spyRootMargin]);

  useEffect(() => {
    if (!viewTransitions) {
      return;
    }

    const vt = createViewTransitions(router);

    return () => {
      vt.destroy();
    };
  }, [router, viewTransitions]);

  // `getNavigator` is cached per-router in `@real-router/core` (WeakMap) —
  // same router always returns the same Navigator ref. No `useMemo` needed.
  const navigator = getNavigator(router);

  // `createRouteSource` is NOT cached (per packages/sources/CLAUDE.md table).
  // It must be stable across renders so `useSyncExternalStore`'s deps don't
  // change identity and trigger an unsubscribe/resubscribe loop on every
  // render. `useMemo([router])` gives one source per router-instance lifetime.
  const store = useMemo(() => createRouteSource(router), [router]);

  // #778 P2: eagerly create the per-router error source so a navigation error
  // that fires BEFORE a RouterErrorBoundary mounts (a lazy app shell, a failed
  // boot navigation) is still captured. The boundary's createDismissableError
  // reuses this cached source and catches up (#765); without it the error source
  // is created lazily on boundary mount — after the error — and never sees it.
  useEffect(() => {
    primeErrorSource(router);
  }, [router]);

  // useSyncExternalStore manages the router subscription lifecycle:
  // subscribe connects to router on first listener, unsubscribes on last.
  const { route, previousRoute } = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );

  // Stable-ref against parent re-renders: when parent re-renders RouterProvider
  // without a route change (e.g. consumer re-renders the root), navigator /
  // route / previousRoute references stay identical (useSyncExternalStore +
  // Object.is bail-out). Without `useMemo` the object literal is fresh every
  // render, propagating spurious re-renders to every `useRoute()` consumer.
  // The memo bails out whenever the three deps are referentially equal.
  const routeContextValue = useMemo(
    () => ({ navigator, route, previousRoute }),
    [navigator, route, previousRoute],
  );

  return (
    <RouterContext.Provider value={router}>
      <NavigatorContext.Provider value={navigator}>
        <RouteContext.Provider value={routeContextValue}>
          {children}
        </RouteContext.Provider>
      </NavigatorContext.Provider>
    </RouterContext.Provider>
  );
};
