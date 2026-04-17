import { getNavigator } from "@real-router/core";
import { createRouteNodeSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { createRouteContext } from "../createRouteContext.svelte";
import { useRouter } from "./useRouter.svelte";

import type { RouteContext } from "../types";

export function useRouteNode(nodeName: string): RouteContext {
  const router = useRouter();
  const navigator = getNavigator(router);

  const source = createRouteNodeSource(router, nodeName);
  const reactive = createReactiveSource(source);

  return createRouteContext(navigator, reactive);
}
