import { createSignalFromSource } from "../createSignalFromSource";
import { getOrCreateNodeSource } from "./sharedNodeSource";
import { useRouter } from "./useRouter";

import type { RouteState } from "../types";
import type { Accessor } from "solid-js";

export function useRouteNode(nodeName: string): Accessor<RouteState> {
  const router = useRouter();

  return createSignalFromSource(getOrCreateNodeSource(router, nodeName));
}
