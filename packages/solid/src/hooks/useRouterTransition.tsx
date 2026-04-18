import { getTransitionSource } from "@real-router/sources";

import { createSignalFromSource } from "../createSignalFromSource";
import { useRouter } from "./useRouter";

import type { RouterTransitionSnapshot } from "@real-router/sources";
import type { Accessor } from "solid-js";

export function useRouterTransition(): Accessor<RouterTransitionSnapshot> {
  const router = useRouter();
  const source = getTransitionSource(router);

  return createSignalFromSource(source);
}
