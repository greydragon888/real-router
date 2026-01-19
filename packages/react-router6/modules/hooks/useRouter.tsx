// packages/react-real-router/modules/hooks/useRouter.tsx

import { useContext } from "react";

import { RouterContext } from "../context";

import type { Router } from "router6";

export const useRouter = (): Router => {
  const router = useContext(RouterContext);

  if (!router) {
    throw new Error("useRouter must be used within a RouterProvider");
  }

  return router;
};
