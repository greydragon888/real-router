import { inject } from "vue";

import { RouteKey } from "../context";

import type { RouteContext } from "../types";
import type { Params, State } from "@real-router/core";
import type { Ref } from "vue";

/**
 * Return shape for `useRoute()` — `RouteContext<P>` with `route` narrowed
 * to the non-nullable variant. The composable throws when `route.value`
 * would be `undefined`, so consumers can read `.value.params.x` without a
 * nullable guard. Extracted from inline duplication at two call sites.
 */
export type UseRouteReturn<P extends Params = Params> = Omit<
  RouteContext<P>,
  "route"
> & { route: Readonly<Ref<State<P>>> };

export const useRoute = <P extends Params = Params>(): UseRouteReturn<P> => {
  const routeContext = inject(RouteKey);

  if (!routeContext) {
    throw new Error("useRoute must be used within a RouterProvider");
  }

  if (!routeContext.route.value) {
    throw new Error(
      "useRoute called with no active route. Did you forget to await router.start() before rendering, or is the router stopped/disposed?",
    );
  }

  return routeContext as UseRouteReturn<P>;
};
