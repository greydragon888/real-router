// packages/react/modules/hooks/useNavigator.tsx

import { useContext } from "react";

import { NavigatorContext } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator = (): Navigator => {
  const navigator = useContext(NavigatorContext);

  if (!navigator) {
    throw new Error("useNavigator must be used within a RouterProvider");
  }

  return navigator;
};
