import { createActiveRouteSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
): { readonly current: boolean } {
  const router = useRouter();

  const source = createActiveRouteSource(router, routeName, params, {
    strict,
    ignoreQueryParams,
  });

  return createReactiveSource(source);
}
