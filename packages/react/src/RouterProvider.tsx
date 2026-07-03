import { useEffect } from "react";

import {
  createRouteAnnouncer,
  createScrollRestoration,
  createScrollSpy,
  createViewTransitions,
} from "./dom-utils";
import { RouterProviderCore } from "./RouterProviderCore";

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

/**
 * DOM-aware router provider: wraps {@link RouterProviderCore} (contexts +
 * subscription wiring) and layers the opt-in DOM-feature effects — announcer,
 * scroll restoration, scroll spy, view transitions — on top. The factory
 * imports live here (not in the core) so terminal targets that compose only the
 * core never pull the dom-utils implementation into their chunk (#800).
 */
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

  return <RouterProviderCore router={router}>{children}</RouterProviderCore>;
};
