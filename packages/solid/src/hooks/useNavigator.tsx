import { useRequiredRouterContext } from "../context";

import type { Navigator } from "@real-router/core";

export const useNavigator = (): Navigator =>
  useRequiredRouterContext("useNavigator").navigator;
