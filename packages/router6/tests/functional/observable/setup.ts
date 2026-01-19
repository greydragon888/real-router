// Common setup for observable tests
import { RouterError } from "router6";

import { createTestRouter } from "../../helpers";

import type { Router, State } from "router6";

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
export function createObservableTestRouter(): Router {
  return createTestRouter().start();
}

/**
 * Re-export events for convenience
 */

export { events } from "router6";
