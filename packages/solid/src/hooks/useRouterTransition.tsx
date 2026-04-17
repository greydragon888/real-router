import { createTransitionSource } from "@real-router/sources";

import { createSignalFromSource } from "../createSignalFromSource";
import { useRouter } from "./useRouter";

import type { Router } from "@real-router/core";
import type {
  RouterSource,
  RouterTransitionSnapshot,
} from "@real-router/sources";
import type { Accessor } from "solid-js";

const cache = new WeakMap<Router, RouterSource<RouterTransitionSnapshot>>();

export function useRouterTransition(): Accessor<RouterTransitionSnapshot> {
  const router = useRouter();

  let source = cache.get(router);

  if (!source) {
    source = createTransitionSource(router);
    cache.set(router, source);
  }

  return createSignalFromSource(source);
}
