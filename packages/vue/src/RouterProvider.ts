import { defineComponent, onScopeDispose, provide, watch } from "vue";

import { NavigatorKey, RouteKey, RouterKey } from "./context";
import { pushDirectiveRouter } from "./directives/vLink";
import { createRouteAnnouncer } from "./dom-utils/index.js";
import { setupRouteProvision } from "./setupRouteProvision";

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
