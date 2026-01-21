import { createRouter } from "@real-router/core";

import { withDependencies } from "../../../src/core/dependencies";

import type { Router } from "@real-router/core";

/**
 * Test dependency interface used across all dependency tests
 */
export interface TestDependencies {
  foo?: number;
  bar?: string;
  baz?: boolean;
  qux?: object;
}

/**
 * Default initial dependencies for tests
 */
export const DEFAULT_DEPENDENCIES: Partial<TestDependencies> = {
  foo: 1,
};

/**
 * Creates a test router with dependency management enabled
 *
 * @param initialDeps - Optional initial dependencies (defaults to { foo: 1 })
 * @returns Started router instance with dependency management
 */
export function createDependenciesTestRouter(
  initialDeps: Partial<TestDependencies> = DEFAULT_DEPENDENCIES,
): Router<TestDependencies> {
  const baseRouter = createRouter();
  const routerWithDeps =
    withDependencies<TestDependencies>(initialDeps)(baseRouter);

  return routerWithDeps.start();
}
