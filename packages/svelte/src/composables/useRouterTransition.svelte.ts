import { createTransitionSource } from "@real-router/sources";

import { createReactiveSource } from "../createReactiveSource.svelte";
import { useRouter } from "./useRouter.svelte";

import type { RouterTransitionSnapshot } from "@real-router/sources";

export function useRouterTransition(): {
  readonly current: RouterTransitionSnapshot;
} {
  const router = useRouter();

  const source = createTransitionSource(router);

  return createReactiveSource(source);
}
