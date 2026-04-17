import { ROUTER_KEY, getContextOrThrow } from "../context";

import type { Router } from "@real-router/core";

export const useRouter = (): Router =>
  getContextOrThrow<Router>(ROUTER_KEY, "useRouter");
