// packages/react/modules/hooks/useNavigator.tsx

import { use } from "react";

import { NavigatorContext } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator = (): Navigator => {
  const navigator = use(NavigatorContext);

  if (!navigator) {
    throw new Error("useNavigator must be used within a RouterProvider");
  }

  return navigator;
};
