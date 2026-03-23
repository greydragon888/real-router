import { createRouteSource } from "@real-router/sources";
import { useContext } from "solid-js";

import { RouteContext } from "../context";
import { createStoreFromSource } from "../createStoreFromSource";
import { useRouter } from "./useRouter";

import type { RouteState } from "../types";

export function useRouteStore(): RouteState {
  const ctx = useContext(RouteContext);

  if (!ctx) {
    throw new Error("useRouteStore must be used within a RouterProvider");
  }

  const router = useRouter();

  return createStoreFromSource(createRouteSource(router));
}
