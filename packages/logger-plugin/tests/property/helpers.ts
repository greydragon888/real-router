import { fc } from "@fast-check/vitest";
import { createRouter } from "@real-router/core";

import { loggerPluginFactory } from "../../src";

import type { LogLevel, LoggerPluginConfig } from "../../src";
import type { Route, Router } from "@real-router/core";

export const ROUTES: Route[] = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [{ name: "view", path: "/:id" }],
  },
  { name: "admin", path: "/admin" },
];

export const NAVIGABLE_TARGETS = ["users", "admin"] as const;

export function getParamsForRoute(name: string): Record<string, string> {
  if (name === "users.view") {
    return { id: "abc" };
  }

  return {};
}

export const arbNavigableTarget = fc.constantFrom(
  ...(NAVIGABLE_TARGETS as unknown as [string, ...string[]]),
);

const LOG_LEVELS: LogLevel[] = ["all", "transitions", "errors", "none"];

export const arbLogLevel = fc.constantFrom(
  ...(LOG_LEVELS as [LogLevel, ...LogLevel[]]),
);

export const arbLoggerConfig: fc.Arbitrary<Partial<LoggerPluginConfig>> =
  fc.record({
    level: arbLogLevel,
    showTiming: fc.boolean(),
    showParamsDiff: fc.boolean(),
    usePerformanceMarks: fc.boolean(),
  });

export const arbContext = fc
  .stringMatching(/^[a-zA-Z][a-zA-Z0-9_-]{0,20}$/)
  .filter((s) => s.length > 0);

export function createFixtureRouter(): Router {
  return createRouter(ROUTES);
}

export async function createLoggerRouter(
  config?: Partial<LoggerPluginConfig>,
): Promise<Router> {
  const router = createRouter(ROUTES);

  router.usePlugin(loggerPluginFactory(config));

  await router.start("/");

  return router;
}

export const arbDistinctIdPair: fc.Arbitrary<[string, string]> = fc
  .tuple(
    fc.stringMatching(/^[a-z0-9]{1,5}$/),
    fc.stringMatching(/^[a-z0-9]{1,5}$/),
  )
  .filter(([a, b]) => a !== b);

export const NUM_RUNS = {
  fast: 100,
  standard: 200,
} as const;
