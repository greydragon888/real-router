import { createActiveRouteSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { Params } from "@real-router/core";

export function useIsActiveRoute(
  routeName: string,
  params: Params | undefined,
  strict: boolean,
  ignoreQueryParams: boolean,
  hash?: string,
) {
  const router = useRouter();

  // The `hash` argument (#532) participates in the cache key when defined.
  // exactOptionalPropertyTypes forbids `{ hash: undefined }` literally — we
  // conditionally include the key only when a value is provided.
  const source = createActiveRouteSource(
    router,
    routeName,
    params,
    hash === undefined
      ? { strict, ignoreQueryParams }
      : { strict, ignoreQueryParams, hash },
  );

  return createReactiveSource(source);
}
