import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import type {
  LogCallback,
  LoggerConfig,
  Route,
  Router,
} from "@real-router/core";
import type {
  StandardSchemaV1,
  StandardSchemaV1Result,
} from "@real-router/search-schema-plugin";

/**
 * The plugin's own errors and warnings go to the router's logger (#2975), so
 * the router's `logger` option — its `level` and its `callback` — applies to
 * them. Core's logger prints `[context] message`, so a message carries no
 * `[search-schema-plugin]` head of its own: the anchored patterns below fail on
 * one.
 */
const CONTEXT = "search-schema-plugin";

const ISSUES = [{ message: "invalid", path: ["q"] }];

/** What zod answers with when a transform or a refinement throws. */
const THROWN = new SyntaxError("Unexpected token in JSON");

/** A schema whose every run answers what `answer` returns. */
function answering(answer: () => unknown): StandardSchemaV1 {
  return {
    "~standard": {
      version: 1,
      vendor: "test",
      validate: () => answer() as StandardSchemaV1Result,
    },
  };
}

/** A route whose `defaultSearch` its schema rejects with issues. */
const DEFAULTS_REJECTED: Route = {
  name: "d",
  path: "/d?q",
  defaultSearch: { q: "x" },
  searchSchema: answering(() => ({ issues: ISSUES })),
};

/** One row per call site that writes a message of the plugin's own. */
const MESSAGES: readonly {
  readonly site: string;
  readonly route: Route;
  /** What raises the message once the plugin is registered. */
  readonly act: (router: Router) => Promise<void>;
  readonly level: "error" | "warn";
  readonly message: RegExp;
  readonly args: readonly unknown[];
}[] = [
  {
    site: "#validateState",
    route: {
      name: "s",
      path: "/s?q",
      searchSchema: answering(() => ({ issues: ISSUES })),
    },
    act: async (router) => {
      await router.start("/");
      await router.navigate("s", {}, { q: "x" });
    },
    level: "error",
    message: /^Route "s": the schema rejected these search params/,
    args: [ISSUES],
  },
  {
    site: "#runSchema, in the handler of the rejected answer",
    route: {
      name: "s",
      path: "/s?q",
      searchSchema: answering(() => Promise.reject(THROWN)),
    },
    act: async (router) => {
      await router.start("/");

      await expect(router.navigate("s", {}, { q: "x" })).rejects.toThrow(
        "Async schema validation is not supported",
      );
    },
    level: "error",
    message: /^Route "s": the schema threw on the query /,
    args: [THROWN],
  },
  {
    site: "#validateSingleRouteDefaultSearch, in the handler of the rejected answer",
    route: {
      name: "d",
      path: "/d?q",
      defaultSearch: { q: "x" },
      searchSchema: answering(() => Promise.reject(THROWN)),
    },
    act: async () => {},
    level: "warn",
    message: /^Route "d": the schema threw on defaultSearch /,
    args: [THROWN],
  },
  {
    site: "#validateSingleRouteDefaultSearch, issues",
    route: DEFAULTS_REJECTED,
    act: async () => {},
    level: "warn",
    message: /^Route "d": defaultSearch does not pass searchSchema /,
    args: [ISSUES],
  },
];

/** The router's `logger` option: the console off, every message to `callback`. */
const recording = (callback: LogCallback): Partial<LoggerConfig> => ({
  level: "none",
  callbackIgnoresLevel: true,
  callback,
});

/** The messages of the plugin's context `callback` received — core logs some failures too. */
const pluginCalls = (callback: { mock: { calls: unknown[][] } }): unknown[][] =>
  callback.mock.calls.filter(([, context]) => context === CONTEXT);

/** Waits a macrotask, so the plugin's handler of a rejected answer has run. */
async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

let consoleError: ReturnType<typeof vi.spyOn>;
let consoleWarn: ReturnType<typeof vi.spyOn>;

describe("search-schema-plugin — its messages go to the router's logger (#2975)", () => {
  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    consoleWarn.mockRestore();
  });

  it.each(MESSAGES)(
    '$site: the message reaches the logger\'s callback, and level "none" keeps it off the console',
    async ({ route, act, level, message, args }) => {
      const callback = vi.fn<LogCallback>();
      const router = createRouter([{ name: "home", path: "/" }, route], {
        logger: recording(callback),
      });

      router.usePlugin(searchSchemaPlugin());
      await act(router);
      // Two of the sites log from the handler of a rejected answer, so the
      // callback and the console are read after it has run.
      await flush();

      expect(pluginCalls(callback)).toStrictEqual([
        [level, CONTEXT, expect.stringMatching(message), ...args],
      ]);
      expect(consoleError).not.toHaveBeenCalled();
      expect(consoleWarn).not.toHaveBeenCalled();

      router.dispose();
    },
  );

  it("a clone logs through a logger with the base router's settings", () => {
    const callback = vi.fn<LogCallback>();
    const base = createRouter(
      [{ name: "home", path: "/" }, DEFAULTS_REJECTED],
      { logger: recording(callback) },
    );

    base.usePlugin(searchSchemaPlugin());
    callback.mockClear();

    // The clone runs the plugin's factory, and with it the defaultSearch check.
    const clone = cloneRouter(base);

    expect(pluginCalls(callback)).toStrictEqual([
      [
        "warn",
        CONTEXT,
        expect.stringMatching(/^Route "d": defaultSearch does not pass /),
        ISSUES,
      ],
    ]);
    expect(consoleWarn).not.toHaveBeenCalled();

    clone.dispose();
    base.dispose();
  });
});
