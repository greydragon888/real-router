import { createErrorSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { Router } from "@real-router/core";
import type { RouterErrorSnapshot, RouterSource } from "@real-router/sources";

const cache = new WeakMap<Router, RouterSource<RouterErrorSnapshot>>();

export function useRouterError(): { readonly current: RouterErrorSnapshot } {
  const router = useRouter();

  let source = cache.get(router);
  if (!source) {
    source = createErrorSource(router);
    cache.set(router, source);
  }

  return createReactiveSource(source);
}
