// packages/validation-plugin/src/validators/lifecycle.ts

import { logger } from "@real-router/logger";
import { isBoolean, getTypeDescription } from "type-guards";

import { computeThresholds } from "../helpers";

import type { GuardFnFactory, DefaultDependencies } from "@real-router/core";

const DEFAULT_MAX_LIFECYCLE_HANDLERS = 200;

export function validateHandler<D extends DefaultDependencies>(
  handler: unknown,
  methodName: string,
): asserts handler is GuardFnFactory<D> | boolean {
  if (!isBoolean(handler) && typeof handler !== "function") {
    throw new TypeError(
      `[router.${methodName}] Handler must be a boolean or factory function, ` +
        `got ${getTypeDescription(handler)}`,
    );
  }
}

export function validateNotRegistering(
  isRegistering: boolean,
  name: string,
  methodName: string,
): void {
  if (isRegistering) {
    throw new Error(
      `[router.${methodName}] Cannot modify route "${name}" during its own registration`,
    );
  }
}

export function validateHandlerLimit(
  currentCount: number,
  methodName: string,
  maxLifecycleHandlers: number = DEFAULT_MAX_LIFECYCLE_HANDLERS,
): void {
  if (maxLifecycleHandlers === 0) {
    return;
  }

  if (currentCount >= maxLifecycleHandlers) {
    throw new Error(
      `[router.${methodName}] Lifecycle handler limit exceeded (${maxLifecycleHandlers}). ` +
        `This indicates too many routes with individual handlers. ` +
        `Consider using plugins for cross-cutting concerns.`,
    );
  }
}

export function validateLifecycleCountThresholds(
  count: number,
  methodName: string,
  maxHandlers: number,
): void {
  if (maxHandlers === 0) {
    return;
  }

  const { warn, error } = computeThresholds(maxHandlers);

  if (count >= error) {
    logger.error(
      `router.${methodName}`,
      `${count} lifecycle handlers registered! This is excessive. Hard limit at ${maxHandlers}.`,
    );
  } else if (count >= warn) {
    logger.warn(
      `router.${methodName}`,
      `${count} lifecycle handlers registered. Consider consolidating logic.`,
    );
  }
}

export function warnOverwrite(
  name: string,
  type: string,
  methodName: string,
): void {
  logger.warn(
    `router.${methodName}`,
    `Overwriting existing ${type} handler for route "${name}"`,
  );
}

export function warnAsyncGuardSync(name: string, methodName: string): void {
  logger.warn(
    `router.${methodName}`,
    `Guard for "${name}" returned a Promise. Sync check cannot resolve async guards — returning false.`,
  );
}
