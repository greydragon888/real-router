import { useContext } from "solid-js";

import { RouterContext } from "../context";

import type { Router } from "@real-router/core";

export const useRouter = (): Router => {
  const ctx = useContext(RouterContext);

  if (!ctx) {
    throw new Error("useRouter must be used within a RouterProvider");
  }

  return ctx.router;
};
