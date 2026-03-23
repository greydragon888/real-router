import { useContext } from "solid-js";

import { RouterContext } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator = (): Navigator => {
  const ctx = useContext(RouterContext);

  if (!ctx) {
    throw new Error("useNavigator must be used within a RouterProvider");
  }

  return ctx.navigator;
};
