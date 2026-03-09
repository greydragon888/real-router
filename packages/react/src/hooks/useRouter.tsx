// packages/react/modules/hooks/useRouter.tsx

import { use } from "react";

import { RouterContext } from "../context";

import type { Router } from "@real-router/core";

export const useRouter = (): Router => {
  const router = use(RouterContext);

  if (!router) {
    throw new Error("useRouter must be used within a RouterProvider");
  }

  return router;
};
