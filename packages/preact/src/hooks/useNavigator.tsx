import { createUseContextOrThrow, NavigatorContext } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator: () => Navigator = createUseContextOrThrow(
  NavigatorContext,
  "useNavigator",
);
