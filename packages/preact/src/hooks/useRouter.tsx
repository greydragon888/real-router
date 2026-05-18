import { createUseContextOrThrow, RouterContext } from "../context";

import type { Router } from "@real-router/core";

export const useRouter: () => Router = createUseContextOrThrow(
  RouterContext,
  "useRouter",
);
