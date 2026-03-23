import { getContext } from "svelte";

import { ROUTER_KEY } from "../context";

import type { Router } from "@real-router/core";

export const useRouter = (): Router => {
  const router = getContext<Router | undefined>(ROUTER_KEY);

  if (!router) {
    throw new Error("useRouter must be used within a RouterProvider");
  }

  return router;
};
