import { useRequiredRouterContext } from "../context";

import type { Router } from "@real-router/core";

export const useRouter = (): Router =>
  useRequiredRouterContext("useRouter").router;
