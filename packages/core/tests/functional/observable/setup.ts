// Common setup for observable tests
import { RouterError } from "@real-router/core";

import { createTestRouter } from "../../helpers";

import type { Router, State } from "@real-router/core";

/**
 * Test constants used across observable tests
 */
export const TEST_STATES = {
  toState: { name: "test-to", path: "/test-to", params: {} } as State,
  fromState: { name: "test-from", path: "/test-from", params: {} } as State,
  home: { name: "home", path: "/home", params: {} } as State,
  about: { name: "about", path: "/about", params: {} } as State,
  contact: { name: "contact", path: "/contact", params: {} } as State,
};

export const TEST_OPTIONS = { replace: false };

export const TEST_ERROR = new RouterError("ERROR_CODE", {
  message: "test error",
});

/**
 * Creates and starts a test router
 */
export async function createObservableTestRouter(): Promise<Router> {
  const router = createTestRouter();

  await router.start();

  return router;
}

/**
 * Re-export events for convenience
 */

export { events } from "@real-router/core";
