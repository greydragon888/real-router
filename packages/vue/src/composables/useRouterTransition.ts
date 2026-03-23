import { createTransitionSource } from "@real-router/sources";

import { useRefFromSource } from "../useRefFromSource";
import { useRouter } from "./useRouter";

import type { RouterTransitionSnapshot } from "@real-router/sources";
import type { ShallowRef } from "vue";

export function useRouterTransition(): ShallowRef<RouterTransitionSnapshot> {
  const router = useRouter();

  const source = createTransitionSource(router);

  return useRefFromSource(source);
}
