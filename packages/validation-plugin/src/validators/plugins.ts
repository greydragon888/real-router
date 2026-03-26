// packages/validation-plugin/src/validators/plugins.ts

import { logger } from "@real-router/logger";

import { computeThresholds } from "../helpers";

const DEFAULT_MAX_PLUGINS = 50;

const LOGGER_CTX = "router.usePlugin";

const PLUGIN_EVENTS_MAP: Record<string, true> = {
  onStart: true,
  onStop: true,
  onTransitionStart: true,
  onTransitionSuccess: true,
  onTransitionError: true,
  onTransitionCancel: true,
};

export function validatePluginLimit(
  currentCount: number,
  newCount: number,
  maxPlugins: number = DEFAULT_MAX_PLUGINS,
): void {
  if (maxPlugins === 0) {
    return;
  }

  const totalCount = currentCount + newCount;

  if (totalCount > maxPlugins) {
    throw new RangeError(
      `[router.usePlugin] Plugin limit exceeded (${maxPlugins}). ` +
        `Current: ${currentCount}, Attempting to add: ${newCount}. ` +
        `This indicates an architectural problem. Consider consolidating plugins.`,
    );
  }
}

export function validateCountThresholds(
  count: number,
  maxPlugins: number,
): void {
  if (maxPlugins === 0) {
    return;
  }

  const { warn, error } = computeThresholds(maxPlugins);

  if (count >= error) {
    logger.error(
      LOGGER_CTX,
      `${count} plugins registered! This is excessive. Hard limit at ${maxPlugins}.`,
    );
  } else if (count >= warn) {
    logger.warn(
      LOGGER_CTX,
      `${count} plugins registered. Consider if all are necessary.`,
    );
  }
}

export function validatePluginKeys(plugin: unknown): void {
  for (const key in plugin as Record<string, unknown>) {
    if (!(key === "teardown" || key in PLUGIN_EVENTS_MAP)) {
      throw new TypeError(
        `[router.usePlugin] Unknown property '${key}'. Plugin must only contain event handlers and optional teardown.`,
      );
    }
  }
}

export function warnBatchDuplicates(): void {
  logger.warn(
    LOGGER_CTX,
    "Duplicate factory in batch, will be registered once",
  );
}

export function warnPluginMethodType(methodName: string): void {
  logger.warn(
    LOGGER_CTX,
    `Property '${methodName}' is not a function, skipping`,
  );
}

export function warnPluginAfterStart(methodName: string): void {
  if (methodName === "onStart") {
    logger.warn(
      LOGGER_CTX,
      "Router already started, onStart will not be called",
    );
  }
}

export function validateAddInterceptorArgs(method: unknown, fn: unknown): void {
  const validMethods = ["start", "buildPath", "forwardState"];

  if (typeof method !== "string" || !validMethods.includes(method)) {
    throw new TypeError(
      `[router.addInterceptor] Invalid method: "${String(method)}". Must be one of: ${validMethods.join(", ")}`,
    );
  }
  if (typeof fn !== "function") {
    throw new TypeError(
      `[router.addInterceptor] interceptor must be a function, got ${typeof fn}`,
    );
  }
}
