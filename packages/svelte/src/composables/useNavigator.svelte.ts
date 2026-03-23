import { getContext } from "svelte";

import { NAVIGATOR_KEY } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator = (): Navigator => {
  const navigator = getContext<Navigator | undefined>(NAVIGATOR_KEY);

  if (!navigator) {
    throw new Error("useNavigator must be used within a RouterProvider");
  }

  return navigator;
};
