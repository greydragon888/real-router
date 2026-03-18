import { useContext } from "preact/hooks";

import { RouterContext } from "../context";

import type { Router } from "@real-router/core";

export const useRouter = (): Router => {
  const router = useContext(RouterContext);

  if (!router) {
    throw new Error("useRouter must be used within a RouterProvider");
  }

  return router;
};
