import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { createRouteAnnouncer } from "dom-utils";
import {
  defineComponent,
  onMounted,
  onUnmounted,
  provide,
  shallowRef,
  onScopeDispose,
} from "vue";

import { NavigatorKey, RouteKey, RouterKey } from "./context";
import { setDirectiveRouter } from "./directives/vLink";

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
    onMounted(() => {
      if (!props.announceNavigation) {
        return;
      }

      const announcer = createRouteAnnouncer(props.router);

      onUnmounted(() => {
        announcer.destroy();
      });
    });

    const navigator = getNavigator(props.router);

    setDirectiveRouter(props.router);

    const source = createRouteSource(props.router);
    const initialSnapshot = source.getSnapshot();

    const route = shallowRef(initialSnapshot.route);
    const previousRoute = shallowRef(initialSnapshot.previousRoute);

    const unsub = source.subscribe(() => {
      const snapshot = source.getSnapshot();

      route.value = snapshot.route;
      previousRoute.value = snapshot.previousRoute;
    });

    onScopeDispose(unsub);

    provide(RouterKey, props.router);
    provide(NavigatorKey, navigator);
    provide(RouteKey, { navigator, route, previousRoute });

    return () => slots.default?.();
  },
});
