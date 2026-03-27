import { createErrorSource } from "@real-router/sources";

import { createSignalFromSource } from "../createSignalFromSource";
import { useRouter } from "./useRouter";

import type { Router } from "@real-router/core";
import type { RouterErrorSnapshot, RouterSource } from "@real-router/sources";
import type { Accessor } from "solid-js";

const cache = new WeakMap<Router, RouterSource<RouterErrorSnapshot>>();

export function useRouterError(): Accessor<RouterErrorSnapshot> {
  const router = useRouter();

  let source = cache.get(router);

  if (!source) {
    source = createErrorSource(router);
    cache.set(router, source);
  }

  return createSignalFromSource(source);
}
