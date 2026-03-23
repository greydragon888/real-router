import { createActiveRouteSource } from "@real-router/sources";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { Params } from "@real-router/core";
import type { ShallowRef } from "vue";

export function useIsActiveRoute(
  routeName: string,
  params?: Params,
  strict = false,
  ignoreQueryParams = true,
): ShallowRef<boolean> {
  const router = useRouter();

  const source = createActiveRouteSource(router, routeName, params, {
    strict,
    ignoreQueryParams,
  });

  return useRefFromSource(source);
}
