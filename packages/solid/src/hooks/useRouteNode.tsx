import { createRouteNodeSource } from "@real-router/sources";

import { createSignalFromSource } from "../createSignalFromSource";
import { useRouter } from "./useRouter";

import type { RouteState } from "../types";
import type { Accessor } from "solid-js";

export function useRouteNode(nodeName: string): Accessor<RouteState> {
  const router = useRouter();
  const store = createRouteNodeSource(router, nodeName);

  return createSignalFromSource(store);
}
