import { createRouteSource } from "@real-router/sources";

import { createStoreFromSource } from "../createStoreFromSource";
import { useRouter } from "./useRouter";

import type { RouteState } from "../types";

export function useRouteStore(): RouteState {
  const router = useRouter();

  return createStoreFromSource(createRouteSource(router));
}
