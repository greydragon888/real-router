import { NAVIGATOR_KEY, getContextOrThrow } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator = (): Navigator =>
  getContextOrThrow<Navigator>(NAVIGATOR_KEY, "useNavigator");
