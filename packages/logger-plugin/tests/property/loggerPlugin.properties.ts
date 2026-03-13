import { test } from "@fast-check/vitest";
import { describe, expect, vi, afterEach } from "vitest";

import {
  arbNavigableTarget,
  arbLoggerConfig,
  arbContext,
  arbDistinctIdPair,
  createLoggerRouter,
  createFixtureRouter,
  NUM_RUNS,
} from "./helpers";
import { loggerPluginFactory } from "../../src";

const noop = () => {};

describe("completeness: each transition generates log entries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.prop([arbNavigableTarget], { numRuns: NUM_RUNS.fast })(
    "navigate() with level:all produces Transition: log entry",
    async (targetRoute) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter({ level: "all" });

      logSpy.mockClear();

      await router.navigate(targetRoute);

      const messages = logSpy.mock.calls.map((call) => call[0] as string);
      const hasTransitionStart = messages.some((msg) =>
        msg.includes("Transition:"),
      );

      expect(hasTransitionStart).toBe(true);

      router.stop();
    },
  );

  test.prop([arbNavigableTarget], { numRuns: NUM_RUNS.fast })(
    "navigate() with level:all produces Transition success log entry",
    async (targetRoute) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter({ level: "all" });

      logSpy.mockClear();

      await router.navigate(targetRoute);

      const messages = logSpy.mock.calls.map((call) => call[0] as string);
      const hasTransitionSuccess = messages.some((msg) =>
        msg.includes("Transition success"),
      );

      expect(hasTransitionSuccess).toBe(true);

      router.stop();
    },
  );

  test.prop([arbNavigableTarget], { numRuns: NUM_RUNS.fast })(
    "navigate() with level:none produces no log entries",
    async (targetRoute) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);
      const errorSpy = vi.spyOn(console, "error").mockImplementation(noop);

      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter({ level: "none" });

      logSpy.mockClear();
      warnSpy.mockClear();
      errorSpy.mockClear();

      await router.navigate(targetRoute);

      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();
      expect(errorSpy).not.toHaveBeenCalled();

      router.stop();
    },
  );
});

describe("no-throw: plugin never breaks navigation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.prop([arbLoggerConfig, arbNavigableTarget], { numRuns: NUM_RUNS.fast })(
    "navigate() resolves for any valid config combination",
    async (config, targetRoute) => {
      vi.spyOn(console, "log").mockImplementation(noop);
      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter(config);

      const state = await router.navigate(targetRoute);

      expect(state.name).toBe(targetRoute);

      router.stop();
    },
  );

  test.prop([arbLoggerConfig, arbNavigableTarget], { numRuns: NUM_RUNS.fast })(
    "router.getState() remains consistent after navigate() with any config",
    async (config, targetRoute) => {
      vi.spyOn(console, "log").mockImplementation(noop);
      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter(config);

      await router.navigate(targetRoute);

      const currentState = router.getState();

      expect(currentState).toBeDefined();
      expect(currentState!.name).toBe(targetRoute);

      router.stop();
    },
  );

  test.prop([arbLoggerConfig], { numRuns: NUM_RUNS.fast })(
    "router.start() + stop() with any config does not throw",
    async (config) => {
      vi.spyOn(console, "log").mockImplementation(noop);
      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = createFixtureRouter();

      router.usePlugin(loggerPluginFactory(config));

      await expect(router.start("/")).resolves.toBeDefined();

      expect(() => router.stop()).not.toThrowError();
    },
  );
});

describe("format: log prefix always reflects the configured context", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.prop([arbContext, arbNavigableTarget], { numRuns: NUM_RUNS.standard })(
    "all transition log entries start with [context]",
    async (ctx, targetRoute) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter({
        level: "all",
        context: ctx,
      });

      logSpy.mockClear();

      await router.navigate(targetRoute);

      const expectedPrefix = `[${ctx}]`;
      const transitionMessages = logSpy.mock.calls
        .map((call) => call[0] as string)
        .filter((msg) => msg.includes("Transition"));

      expect(transitionMessages.length).toBeGreaterThan(0);

      for (const msg of transitionMessages) {
        expect(msg.startsWith(expectedPrefix)).toBe(true);
      }

      router.stop();
    },
  );

  test.prop([arbContext], { numRuns: NUM_RUNS.standard })(
    "onStart log uses [context] prefix",
    async (ctx) => {
      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      logSpy.mockClear();

      const router = createFixtureRouter();

      router.usePlugin(loggerPluginFactory({ level: "all", context: ctx }));

      await router.start("/");

      const expectedPrefix = `[${ctx}]`;
      const startMessages = logSpy.mock.calls
        .map((call) => call[0] as string)
        .filter((msg) => msg.includes("Router started"));

      expect(startMessages).toHaveLength(1);
      expect(startMessages[0].startsWith(expectedPrefix)).toBe(true);

      router.stop();
    },
  );

  test.prop([arbContext], { numRuns: NUM_RUNS.standard })(
    "onStop log uses [context] prefix",
    async (ctx) => {
      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      const router = createFixtureRouter();

      router.usePlugin(loggerPluginFactory({ level: "all", context: ctx }));

      await router.start("/");

      logSpy.mockClear();

      router.stop();

      const expectedPrefix = `[${ctx}]`;
      const stopMessages = logSpy.mock.calls
        .map((call) => call[0] as string)
        .filter((msg) => msg.includes("Router stopped"));

      expect(stopMessages).toHaveLength(1);
      expect(stopMessages[0].startsWith(expectedPrefix)).toBe(true);
    },
  );
});

// ====================================================================
// Level filtering — each level suppresses the correct output
// ====================================================================

describe("level filtering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.prop([arbNavigableTarget], { numRuns: NUM_RUNS.fast })(
    "level:transitions suppresses lifecycle logs but retains transition logs",
    async (targetRoute) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = createFixtureRouter();

      router.usePlugin(loggerPluginFactory({ level: "transitions" }));

      await router.start("/");

      // Lifecycle "Router started" must NOT appear
      const startMessages = logSpy.mock.calls
        .map((call) => call[0] as string)
        .filter((msg) => msg.includes("Router started"));

      expect(startMessages).toHaveLength(0);

      logSpy.mockClear();

      await router.navigate(targetRoute);

      // Transition logs MUST appear
      const transitionMessages = logSpy.mock.calls
        .map((call) => call[0] as string)
        .filter((msg) => msg.includes("Transition"));

      expect(transitionMessages.length).toBeGreaterThan(0);

      logSpy.mockClear();

      router.stop();

      // Lifecycle "Router stopped" must NOT appear
      const stopMessages = logSpy.mock.calls
        .map((call) => call[0] as string)
        .filter((msg) => msg.includes("Router stopped"));

      expect(stopMessages).toHaveLength(0);
    },
  );

  test.prop([arbNavigableTarget], { numRuns: NUM_RUNS.fast })(
    "level:errors suppresses transition logs",
    async (targetRoute) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(noop);

      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter({ level: "errors" });

      logSpy.mockClear();
      warnSpy.mockClear();

      await router.navigate(targetRoute);

      // No transition logs at all
      expect(logSpy).not.toHaveBeenCalled();
      expect(warnSpy).not.toHaveBeenCalled();

      router.stop();
    },
  );
});

// ====================================================================
// Params diff — same-route navigation logs parameter changes
// ====================================================================

describe("params diff", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "showParamsDiff:true logs param changes on same-route navigation",
    async ([idA, idB]) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter({
        level: "all",
        showParamsDiff: true,
      });

      await router.navigate("users.view", { id: idA });

      logSpy.mockClear();

      await router.navigate("users.view", { id: idB });

      const messages = logSpy.mock.calls.map((call) => call[0] as string);
      const diffMessages = messages.filter((msg) => msg.includes("Changed:"));

      expect(diffMessages).toHaveLength(1);
      expect(diffMessages[0]).toContain(JSON.stringify(idA));
      expect(diffMessages[0]).toContain(JSON.stringify(idB));

      router.stop();
    },
  );

  test.prop([arbDistinctIdPair], { numRuns: NUM_RUNS.standard })(
    "showParamsDiff:false suppresses param diff output",
    async ([idA, idB]) => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(noop);

      vi.spyOn(console, "warn").mockImplementation(noop);
      vi.spyOn(console, "error").mockImplementation(noop);
      vi.spyOn(console, "group").mockImplementation(noop);
      vi.spyOn(console, "groupEnd").mockImplementation(noop);

      const router = await createLoggerRouter({
        level: "all",
        showParamsDiff: false,
      });

      await router.navigate("users.view", { id: idA });

      logSpy.mockClear();

      await router.navigate("users.view", { id: idB });

      const messages = logSpy.mock.calls.map((call) => call[0] as string);
      const diffMessages = messages.filter((msg) => msg.includes("Changed:"));

      expect(diffMessages).toHaveLength(0);

      router.stop();
    },
  );
});
