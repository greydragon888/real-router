import { getNavigator } from "@real-router/core";
import { createRouteSource } from "@real-router/sources";
import { defineComponent, shallowRef, provide, onScopeDispose } from "vue";

import { NavigatorKey, RouteKey, RouterKey } from "./context";

import type { Router } from "@real-router/core";
import type { PropType } from "vue";

export const RouterProvider = defineComponent({
  name: "RouterProvider",
  props: {
    router: {
      type: Object as PropType<Router>,
      required: true,
    },
  },
  setup(props, { slots }) {
    const navigator = getNavigator(props.router);

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
