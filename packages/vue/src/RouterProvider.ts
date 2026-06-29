import { primeErrorSource } from "@real-router/sources";
import { defineComponent, onScopeDispose, provide, watch } from "vue";

import { NavigatorKey, RouteKey, RouterKey } from "./context";
import { pushDirectiveRouter } from "./directives/vLink";
import {
  createRouteAnnouncer,
  createScrollRestoration,
  createScrollSpy,
  createViewTransitions,
} from "./dom-utils";
import { setupRouteProvision } from "./setupRouteProvision";

import type { ScrollRestorationOptions, ScrollSpyOptions } from "./dom-utils";
import type { Router } from "@real-router/core";
import type { PropType } from "vue";

interface Disposable {
  destroy: () => void;
}

/**
 * Watch a dependency tuple and (re)create a toggleable utility (announcer /
 * scroll-restorer / view-transitions). The factory returns `undefined` to
 * mean "feature disabled" — no utility is created and no cleanup is wired.
 * When a utility IS returned, its `destroy()` is registered via `onCleanup`,
 * so flipping any dep (incl. the feature flag) tears down the previous
 * instance before constructing the next.
 *
 * Extracted from three near-identical `watch(... { immediate: true })` blocks
 * (announceNavigation / scrollRestoration / viewTransitions) — DRY without
 * losing the per-utility dep tuple shape.
 */
function watchToggleableUtility<D extends readonly unknown[]>(
  deps: () => D,
  factory: (current: D) => Disposable | undefined,
): void {
  watch(
    deps,
    (current, _prev, onCleanup) => {
      const utility = factory(current);

      if (utility) {
        onCleanup(() => {
          utility.destroy();
        });
      }
    },
    { immediate: true },
  );
}

export const RouterProvider = defineComponent({
  name: "RouterProvider",
  props: {
    router: {
      type: Object as PropType<Router>,
      required: true,
    },
    announceNavigation: {
      type: Boolean,
      default: false,
    },
    scrollRestoration: {
      type: Object as PropType<ScrollRestorationOptions>,
    },
    scrollSpy: {
      type: Object as PropType<ScrollSpyOptions>,
    },
    viewTransitions: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    // Reactive announceNavigation: setting prop true/false at runtime
    // creates/destroys the announcer accordingly. Prior implementation read
    // the prop only inside onMounted, so toggling it post-mount silently no-op'd.
    watchToggleableUtility(
      () => [props.router, props.announceNavigation] as const,
      ([router, enabled]) =>
        enabled ? createRouteAnnouncer(router) : undefined,
    );

    // Watch by primitives so inline `{ mode: "restore" }` doesn't thrash.
    // scrollContainer is a getter invoked lazily on every event inside the
    // utility — swapping its reference doesn't change the resolved element,
    // so we intentionally omit it from watched sources.
    watchToggleableUtility(
      () =>
        [
          props.router,
          props.scrollRestoration !== undefined,
          props.scrollRestoration?.mode,
          props.scrollRestoration?.anchorScrolling,
          props.scrollRestoration?.behavior,
          props.scrollRestoration?.storageKey,
        ] as const,
      ([router, enabled, mode, anchorScrolling, behavior, storageKey]) => {
        if (!enabled) {
          return;
        }

        return createScrollRestoration(router, {
          mode,
          anchorScrolling,
          behavior,
          storageKey,
          scrollContainer: props.scrollRestoration?.scrollContainer,
        });
      },
    );

    // Reactive scrollSpy: watch by primitives, omit scrollContainer getter
    // identity for the same reason scrollRestoration does — the utility
    // consults the getter lazily (re-consulted on reconcile, so a
    // late-mounted/changed container is honoured — #780).
    watchToggleableUtility(
      () =>
        [
          props.router,
          props.scrollSpy !== undefined && props.scrollSpy.selector !== "",
          props.scrollSpy?.selector,
          props.scrollSpy?.rootMargin,
        ] as const,
      ([router, enabled, selector, rootMargin]) => {
        if (!enabled || !selector) {
          return;
        }

        return createScrollSpy(router, {
          selector,
          rootMargin,
          scrollContainer: props.scrollSpy?.scrollContainer,
        });
      },
    );

    // Reactive viewTransitions: toggling prop creates/destroys the utility.
    watchToggleableUtility(
      () => [props.router, props.viewTransitions] as const,
      ([router, enabled]) =>
        enabled ? createViewTransitions(router) : undefined,
    );

    // Push this provider's router on the v-link directive stack so nested
    // RouterProviders behave like nested DI scopes (LIFO). Release on unmount
    // restores the outer router for any v-link still mounted in the parent.
    const releaseDirective = pushDirectiveRouter(props.router);

    // #778 P2: eagerly create the per-router error source at Provider mount so a
    // navigation error that fires BEFORE a RouterErrorBoundary mounts (a lazy app
    // shell, a failed boot navigation) is still captured. The boundary's
    // createDismissableError reuses this cached source and catches up (#765);
    // without it the error source is created lazily on boundary mount — after the
    // error — and never sees it.
    primeErrorSource(props.router);

    const { navigator, route, previousRoute, unsubscribe } =
      setupRouteProvision(props.router);

    onScopeDispose(() => {
      releaseDirective();
      unsubscribe();
    });

    provide(RouterKey, props.router);
    provide(NavigatorKey, navigator);
    provide(RouteKey, { navigator, route, previousRoute });

    return () => slots.default?.();
  },
});
