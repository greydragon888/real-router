import { inject } from "vue";

import { NavigatorKey } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator = (): Navigator => {
  const navigator = inject(NavigatorKey);

  if (!navigator) {
    throw new Error("useNavigator must be used within a RouterProvider");
  }

  return navigator;
};
