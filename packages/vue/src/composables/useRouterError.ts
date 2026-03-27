import { createErrorSource } from "@real-router/sources";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { Router } from "@real-router/core";
import type { RouterErrorSnapshot, RouterSource } from "@real-router/sources";
import type { ShallowRef } from "vue";

const cache = new WeakMap<Router, RouterSource<RouterErrorSnapshot>>();

export function useRouterError(): ShallowRef<RouterErrorSnapshot> {
  const router = useRouter();

  let source = cache.get(router);

  if (!source) {
    source = createErrorSource(router);
    cache.set(router, source);
  }

  return useRefFromSource(source);
}
