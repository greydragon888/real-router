import { inject } from "vue";

import { RouterKey } from "../context";

import type { Router } from "@real-router/core";

export const useRouter = (): Router => {
  const router = inject(RouterKey);

  if (!router) {
    throw new Error("useRouter must be used within a RouterProvider");
  }

  return router;
};
