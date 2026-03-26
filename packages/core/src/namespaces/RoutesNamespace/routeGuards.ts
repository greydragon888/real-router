import { logger } from "@real-router/logger";

/**
 * Validates removeRoute constraints.
 * Returns false if removal should be blocked (route is active).
 * Logs warnings for edge cases.
 *
 * @param name - Route name to remove
 * @param currentStateName - Current active route name (or undefined)
 * @param isNavigating - Whether navigation is in progress
 * @returns true if removal can proceed, false if blocked
 */
export function validateRemoveRoute(
  name: string,
  currentStateName: string | undefined,
  isNavigating: boolean,
): boolean {
  if (currentStateName) {
    const isExactMatch = currentStateName === name;
    const isParentOfCurrent = currentStateName.startsWith(`${name}.`);

    if (isExactMatch || isParentOfCurrent) {
      const suffix = isExactMatch ? "" : ` (current: "${currentStateName}")`;

      logger.warn(
        "router.removeRoute",
        `Cannot remove route "${name}" — it is currently active${suffix}. Navigate away first.`,
      );

      return false;
    }
  }

  if (isNavigating) {
    logger.warn(
      "router.removeRoute",
      `Route "${name}" removed while navigation is in progress. This may cause unexpected behavior.`,
    );
  }

  return true;
}

/**
 * Validates clearRoutes operation.
 * Returns false if operation should be blocked (navigation in progress).
 *
 * @param isNavigating - Whether navigation is in progress
 * @returns true if clearRoutes can proceed, false if blocked
 */
export function validateClearRoutes(isNavigating: boolean): boolean {
  if (isNavigating) {
    logger.error(
      "router.clearRoutes",
      "Cannot clear routes while navigation is in progress. Wait for navigation to complete.",
    );

    return false;
  }

  return true;
}
