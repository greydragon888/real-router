import { createTestRouter as createTestRouterHelper } from "../../../helpers";

import type { Router } from "@real-router/core";

/**
 * No-op function used for mocking console methods in tests
 */
export const noop = (): void => undefined;

/**
 * Re-export commonly used helpers
 */

export { createTestRouter, omitMeta } from "../../../helpers";

/**
 * Re-export Router type
 */

/**
 * Creates and starts a test router for route lifecycle tests
 *
 * @returns Started router instance
 */
export async function createLifecycleTestRouter(): Promise<Router> {
  const router = createTestRouterHelper();

  await router.start("/home");

  return router;
}

export { errorCodes, type Router } from "@real-router/core";
