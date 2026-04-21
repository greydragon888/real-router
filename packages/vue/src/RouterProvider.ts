import { defineComponent, onScopeDispose, provide, watch } from "vue";

import { NavigatorKey, RouteKey, RouterKey } from "./context";
import { pushDirectiveRouter } from "./directives/vLink";
import { createRouteAnnouncer, createScrollRestoration } from "./dom-utils";
import { setupRouteProvision } from "./setupRouteProvision";

import type { ScrollRestorationOptions } from "./dom-utils";
import type { Router } from "@real-router/core";
import type { PropType } from "vue";

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
  },
  setup(props, { slots }) {
    // Reactive announceNavigation: setting prop true/false at runtime now
    // creates/destroys the announcer accordingly. Prior implementation read
    // the prop only inside onMounted, so toggling it post-mount silently no-op'd.
    watch(
      () => [props.router, props.announceNavigation] as const,
      ([router, enabled], _prev, onCleanup) => {
        if (!enabled) {
          return;
        }

        const announcer = createRouteAnnouncer(router);

        onCleanup(() => {
          announcer.destroy();
        });
      },
      { immediate: true },
    );

    // Watch by primitives so inline `{ mode: "restore" }` doesn't thrash.
    // scrollContainer is a getter invoked lazily on every event inside the
    // utility — swapping its reference doesn't change the resolved element,
    // so we intentionally omit it from watched sources.
    watch(
      () =>
        [
          props.router,
          props.scrollRestoration !== undefined,
          props.scrollRestoration?.mode,
          props.scrollRestoration?.anchorScrolling,
        ] as const,
      ([router, enabled, mode, anchorScrolling], _prev, onCleanup) => {
        if (!enabled) {
          return;
        }

        const sr = createScrollRestoration(router, {
          mode,
          anchorScrolling,
          scrollContainer: props.scrollRestoration?.scrollContainer,
        });

        onCleanup(() => {
          sr.destroy();
        });
      },
      { immediate: true },
    );

    // Push this provider's router on the v-link directive stack so nested
    // RouterProviders behave like nested DI scopes (LIFO). Release on unmount
    // restores the outer router for any v-link still mounted in the parent.
    const releaseDirective = pushDirectiveRouter(props.router);

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
