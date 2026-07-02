import { getNavigator } from "@real-router/core";
import { createRouteSource, primeErrorSource } from "@real-router/sources";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import { NavigatorContext, RouteContext, RouterContext } from "./context";
import {
  createRouteAnnouncer,
  createScrollRestoration,
  createScrollSpy,
  createViewTransitions,
} from "./dom-utils";

import type {
  RouteAnnouncerOptions,
  ScrollRestorationOptions,
  ScrollSpyOptions,
} from "./dom-utils";
import type { Router } from "@real-router/core";
import type { FC, ReactNode } from "react";

export interface RouteProviderProps {
  router: Router;
  children: ReactNode;
  announceNavigation?: boolean | RouteAnnouncerOptions;
  scrollRestoration?: ScrollRestorationOptions;
  scrollSpy?: ScrollSpyOptions;
  viewTransitions?: boolean;
}

export const RouterProvider: FC<RouteProviderProps> = ({
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
    // scrollRestoration above: getter is invoked lazily inside the utility,
    // identity changes don't affect resolution.
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

  const navigator = useMemo(() => getNavigator(router), [router]);

  // useSyncExternalStore manages the router subscription lifecycle:
  // subscribe connects to router on first listener, unsubscribes on last.
  // This is Strict Mode safe — no useEffect cleanup needed.
  //
  // Caveat (#765): that same first-listener/last-listener contract opens a
  // stale window if THIS Provider is mounted under a React <Activity> /
  // keepAlive boundary — hiding detaches the subscription, a navigation while
  // hidden is missed, and re-show replays createRouteSource's stale snapshot
  // (createRouteSource does not reconcile on re-subscribe). Keep RouterProvider
  // ABOVE any Activity boundary — see the "Keep RouterProvider above any
  // <Activity> / keepAlive boundary" gotcha in CLAUDE.md.
  const store = useMemo(() => createRouteSource(router), [router]);

  // #778 P2: eagerly create the per-router error source so a navigation error
  // that fires BEFORE a RouterErrorBoundary mounts (a lazy app shell, a failed
  // boot navigation) is still captured. The boundary's createDismissableError
  // reuses this cached source and catches up (#765); without it the error source
  // is created lazily on boundary mount — after the error — and never sees it.
  useEffect(() => {
    primeErrorSource(router);
  }, [router]);
  // Use snapshot reference directly. createRouteSource via stabilizeState
  // returns the SAME snapshot reference when route.path is unchanged, so
  // useMemo below sees stable deps for idempotent navigations and
  // RouteContext consumers do not re-render.
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot, // SSR: router returns same state on server and client
  );

  const routeContextValue = useMemo(
    () => ({
      navigator,
      route: snapshot.route,
      previousRoute: snapshot.previousRoute,
    }),
    [navigator, snapshot],
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
