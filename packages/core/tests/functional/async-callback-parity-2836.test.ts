import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import { captureUnhandledRejections } from "../helpers";
import { countingBag, throwingBag } from "../helpers/hostileBags";

import type { Router } from "@real-router/core";
import type { LogCallback } from "@real-router/core/types";

/**
 * A callback core calls in a `void` slot may still return a thenable (#2836).
 * Core consumes it: a rejection lands where a synchronous throw at the same
 * place lands, and a check that returns one refuses its door. The synchronous
 * throw of each place is the CONTROL that the place is reached.
 *
 * A `then` the emitter cannot `.call` — one with its own `call`, or a `null`
 * prototype — is unsupported at the handler doors; IMPLEMENTATION_NOTES
 * records it.
 */

type Callback = () => void;

type Form =
  "sync" | "async" | "thenable" | "plain" | "resolving" | "not-thenable";

// eslint-disable-next-line unicorn/no-thenable -- a value carrying `then` is the shape under test
const thenableOf = (then: unknown): object => ({ then });

const callableThenableOf = (then: unknown): object =>
  // eslint-disable-next-line unicorn/no-thenable -- a function carrying `then` is the shape under test
  Object.assign(() => undefined, { then });

const rejectingThen =
  (message: string) =>
  (_resolve: unknown, reject: (reason: unknown) => void): void => {
    reject(new Error(message));
  };

const throwingThen = (): never => {
  throw new Error("then failed");
};

/**
 * A callback in one form: failing with `message` by a throw, a rejected promise
 * or a thenable that is not a promise; or succeeding by returning nothing, a
 * promise that resolves to a value, or an object whose `then` is not a function.
 */
function callbackOf(form: Form, message = "failed"): Callback {
  switch (form) {
    case "sync": {
      return () => {
        throw new Error(message);
      };
    }
    case "async": {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- the defect under test: an async function in a void slot
      return async () => {
        await Promise.resolve();

        throw new Error(message);
      };
    }
    case "thenable": {
      return () => thenableOf(rejectingThen(message));
    }
    case "plain": {
      return () => undefined;
    }
    case "resolving": {
      // A value rather than `undefined`, so a report of the fulfilment would
      // carry something a log line shows.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- an async function in a void slot, whose promise resolves
      return async () => {
        await Promise.resolve();

        return "resolved";
      };
    }
    case "not-thenable": {
      return () => thenableOf(42);
    }
  }
}

/** One `logger.warn` or `logger.error` call: channel, message, what it carried. */
type LogLine = readonly [context: string, message: string, reason: string];

/** Readable whatever was reported, so an `undefined` reason still leaves a line. */
const reasonOf = (value: unknown): string =>
  value instanceof Error ? value.message : `<${String(value)}>`;

type RouterOptions = Parameters<typeof createRouter>[1];

function loggingRouter(options?: RouterOptions): {
  router: Router;
  errors: LogLine[];
  warnings: LogLine[];
} {
  const errors: LogLine[] = [];
  const warnings: LogLine[] = [];
  const callback: LogCallback = (level, context, message, ...args) => {
    if (level === "error") {
      errors.push([context, message, reasonOf(args[0])]);
    } else if (level === "warn") {
      warnings.push([context, message, reasonOf(args[0])]);
    }
  };
  const router = createRouter(
    [
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ],
    { ...options, logger: { level: "all", callback } },
  );

  return { router, errors, warnings };
}

interface Observed {
  /** What the act returned or threw. */
  readonly outcome: string;
  readonly unhandled: readonly string[];
  readonly errors: readonly LogLine[];
  readonly warnings: readonly LogLine[];
  /** What `after` read once the rejections had settled. */
  readonly after: string;
}

const describeValue = (value: unknown): string =>
  typeof value === "string" ? value : typeof value;

async function observe(
  arrange: (router: Router) => unknown,
  act: (router: Router, arranged: unknown) => unknown,
  after: (router: Router) => string = () => "",
  options?: RouterOptions,
): Promise<Observed> {
  const { router, errors, warnings } = loggingRouter(options);
  const arranged = await arrange(router);
  let outcome = "";

  const unhandled = await captureUnhandledRejections(() => {
    try {
      outcome = `returned ${describeValue(act(router, arranged))}`;
    } catch (error) {
      outcome = `threw ${(error as Error).name}: ${(error as Error).message}`;
    }
  });
  const observed = {
    outcome,
    unhandled: unhandled.map((reason) => reasonOf(reason)),
    errors: [...errors],
    warnings: [...warnings],
    after: after(router),
  };

  router.dispose();

  return observed;
}

/**
 * What one call does to the error log: the lines present when it returned, and
 * the lines and unhandled rejections once its promises have settled.
 */
async function watchCall(
  router: Router,
  errors: readonly LogLine[],
  call: () => void,
): Promise<{
  atReturn: readonly LogLine[];
  settled: readonly LogLine[];
  unhandled: readonly string[];
}> {
  let atReturn: readonly LogLine[] = [];

  const unhandled = await captureUnhandledRejections(() => {
    call();
    atReturn = [...errors];
  });
  const watched = {
    atReturn,
    settled: [...errors],
    unhandled: unhandled.map((reason) => reasonOf(reason)),
  };

  router.dispose();

  return watched;
}

interface Place {
  readonly name: string;
  /** The line a synchronous throw of the callback gets here. */
  readonly report: readonly [context: string, message: string];
  /** Installs `callback` where core calls it; returns what `act` needs. */
  readonly arrange: (router: Router, callback: Callback) => unknown;
  /** Makes core call it. */
  readonly act: (router: Router, arranged: unknown) => unknown;
}

const withTeardown = (callback: Callback) => () => ({ teardown: callback });

const unsubscribe = (_router: Router, off: unknown): void => {
  (off as () => void)();
};

const dispose = (router: Router): void => {
  router.dispose();
};

const CLEANUP = ["router", "Error during cleanup:"] as const;

const INSTALL_CLEANUP = ["router.usePlugin", "Cleanup error:"] as const;

/**
 * Every path a plugin's `teardown` is called on. The last two log under
 * `router.usePlugin`: they run inside the `usePlugin` call.
 */
const TEARDOWN: readonly Place[] = [
  {
    name: "unsubscribe of one plugin",
    report: CLEANUP,
    arrange: (router, callback) => router.usePlugin(withTeardown(callback)),
    act: unsubscribe,
  },
  {
    name: "dispose() of one plugin",
    report: CLEANUP,
    arrange: (router, callback) => router.usePlugin(withTeardown(callback)),
    act: dispose,
  },
  {
    name: "unsubscribe of a batch",
    report: CLEANUP,
    arrange: (router, callback) =>
      router.usePlugin(withTeardown(callback), () => ({})),
    act: unsubscribe,
  },
  {
    name: "dispose() of a batch",
    report: CLEANUP,
    arrange: (router, callback) =>
      router.usePlugin(withTeardown(callback), () => ({})),
    act: dispose,
  },
  {
    name: "the rollback of a batch whose next factory throws",
    report: INSTALL_CLEANUP,
    arrange: (_router, callback) => callback,
    act: (router, callback) =>
      router.usePlugin(withTeardown(callback as Callback), () => {
        throw new Error("next factory failed");
      }),
  },
  {
    name: "dispose() from inside the plugin's factory",
    report: INSTALL_CLEANUP,
    arrange: (_router, callback) => callback,
    act: (router, callback) =>
      router.usePlugin((inner) => {
        inner.dispose();

        return { teardown: callback as Callback };
      }),
  },
];

const LISTENERS: readonly Place[] = [
  {
    name: "getRoutesApi().subscribeChanges",
    report: ["router", "Error in listener for TREE_CHANGED:"],
    arrange: (router, callback) =>
      getRoutesApi(router).subscribeChanges(callback),
    act: (router) => {
      getRoutesApi(router).add({ name: "x", path: "/x" });
    },
  },
  {
    name: "getPluginApi().subscribeDiagnostic",
    report: ["router", "Error in listener for PLUGIN_AFTER_START:"],
    arrange: async (router, callback) => {
      await router.start("/");
      getPluginApi(router).subscribeDiagnostic("PLUGIN_AFTER_START", callback);
    },
    act: (router) => router.usePlugin(() => ({ onStart: () => undefined })),
  },
];

const PLACES = [...TEARDOWN, ...LISTENERS];

const PARITY = PLACES.flatMap((place) =>
  (["async", "thenable"] as const).map((form) => ({ ...place, form })),
);

const QUIET = PLACES.flatMap((place) =>
  (["resolving", "not-thenable"] as const).map((form) => ({ ...place, form })),
);

type Position =
  | "navigate:entry"
  | "buildPath:params"
  | "addRoute:batch"
  | "navigateToDefault:route";

interface CheckPlace {
  readonly position: Position;
  readonly act: (router: Router) => unknown;
  /** What the door left behind. */
  readonly after: (router: Router) => string;
  /** The outcome and the `after` of the door when its check passes. */
  readonly passes: { readonly outcome: string; readonly after: string };
}

const CHECKS: readonly CheckPlace[] = [
  {
    position: "navigate:entry",
    act: (router) => router.navigate("a"),
    after: (router) => router.getState()?.name ?? "no state",
    passes: { outcome: "returned object", after: "a" },
  },
  {
    position: "buildPath:params",
    act: (router) => router.buildPath("a"),
    after: () => "",
    passes: { outcome: "returned /a", after: "" },
  },
  {
    position: "addRoute:batch",
    act: (router) => {
      getRoutesApi(router).add({ name: "y", path: "/y" });
    },
    after: (router) => `has y: ${String(getRoutesApi(router).has("y"))}`,
    passes: { outcome: "returned undefined", after: "has y: true" },
  },
];

const REFUSING = CHECKS.flatMap((check) =>
  (["async", "thenable", "resolving"] as const).map((form) => ({
    ...check,
    form,
  })),
);

const PASSING = CHECKS.map((check) => ({
  ...check,
  form: "not-thenable" as const,
}));

/** `navigateToDefault` refuses by rejecting: the check runs inside its promise. */
const DEFAULT_ROUTE = (["async", "thenable", "resolving"] as const).map(
  (form) => ({ form }),
);

const arrangeCheck =
  (position: Position, callback: Callback) =>
  async (router: Router): Promise<void> => {
    await router.start("/");
    getPluginApi(router).addCheck(position, callback);
  };

const refusalMessage = (position: Position): string =>
  `[router] Async checks are not supported: the check at "${position}" returned a thenable. A check refuses by throwing synchronously.`;

const refusal = (position: Position): string =>
  `threw TypeError: ${refusalMessage(position)}`;

/** The check under test, then one that records being called. */
const twoChecks =
  (first: Callback, calls: string[]) =>
  async (router: Router): Promise<void> => {
    await router.start("/");

    const api = getPluginApi(router);

    api.addCheck("buildPath:params", first);
    api.addCheck("buildPath:params", () => {
      calls.push("second");
    });
  };

const checksAfter = async (
  form: Form,
): Promise<{ outcome: string; calls: string[] }> => {
  const calls: string[] = [];
  const { outcome } = await observe(
    twoChecks(callbackOf(form, "check"), calls),
    (router) => router.buildPath("a"),
  );

  return { outcome, calls };
};

describe("a callback core calls in a void slot (#2836)", () => {
  it("every table holds its cells", () => {
    expect(PARITY).toHaveLength(16);
    expect(QUIET).toHaveLength(16);
    expect(REFUSING).toHaveLength(9);
    expect(PASSING).toHaveLength(3);
    expect(DEFAULT_ROUTE).toHaveLength(3);
  });

  it.each(PARITY)(
    "$name: a $form failure lands where a synchronous throw does",
    async ({ arrange, act, report, form }) => {
      const control = await observe(
        (router) => arrange(router, callbackOf("sync")),
        act,
      );

      expect(control.errors).toStrictEqual([[...report, "failed"]]);

      const subject = await observe(
        (router) => arrange(router, callbackOf(form)),
        act,
      );

      expect(subject).toStrictEqual(control);
    },
  );

  it.each(QUIET)(
    "$name: a $form result reports nothing",
    async ({ arrange, act, report, form }) => {
      const reached = await observe(
        (router) => arrange(router, callbackOf("sync")),
        act,
      );

      expect(reached.errors).toStrictEqual([[...report, "failed"]]);

      const control = await observe(
        (router) => arrange(router, callbackOf("plain")),
        act,
      );
      const subject = await observe(
        (router) => arrange(router, callbackOf(form)),
        act,
      );

      expect(control.errors).toStrictEqual([]);
      expect(subject).toStrictEqual(control);
    },
  );

  describe("addCheck", () => {
    it.each(REFUSING)(
      "$position: a $form check refuses at the call and leaves nothing unhandled",
      async ({ position, act, after, form }) => {
        const control = await observe(
          arrangeCheck(position, callbackOf("sync", "check")),
          act,
          after,
        );

        expect(control.outcome).toBe("threw Error: check");

        const subject = await observe(
          arrangeCheck(position, callbackOf(form, "check")),
          act,
          after,
        );

        expect(subject).toStrictEqual({
          ...control,
          outcome: refusal(position),
        });
      },
    );

    it.each(PASSING)(
      "$position: a check returning a $form value passes",
      async ({ position, act, after, passes, form }) => {
        const reached = await observe(
          arrangeCheck(position, callbackOf("sync", "check")),
          act,
          after,
        );

        expect(reached.outcome).toBe("threw Error: check");

        const control = await observe(
          arrangeCheck(position, callbackOf("plain")),
          act,
          after,
        );

        expect({
          outcome: control.outcome,
          after: control.after,
        }).toStrictEqual(passes);

        const subject = await observe(
          arrangeCheck(position, callbackOf(form)),
          act,
          after,
        );

        expect(subject).toStrictEqual(control);
      },
    );

    it.each(DEFAULT_ROUTE)(
      "navigateToDefault:route: a $form check rejects the call, as a throwing check does",
      async ({ form }) => {
        const position = "navigateToDefault:route";
        const options = { defaultRoute: () => "a" };
        const act = (router: Router): unknown => router.navigateToDefault();
        const after = (router: Router): string =>
          router.getState()?.name ?? "no state";

        const control = await observe(
          arrangeCheck(position, callbackOf("sync", "check")),
          act,
          after,
          options,
        );

        expect(control.errors).toStrictEqual([
          ["router", "Unexpected navigation error", "check"],
        ]);

        const subject = await observe(
          arrangeCheck(position, callbackOf(form, "check")),
          act,
          after,
          options,
        );

        expect(subject).toStrictEqual({
          ...control,
          errors: [
            ["router", "Unexpected navigation error", refusalMessage(position)],
          ],
        });
      },
    );

    it("an async check stops the checks after it, as a throwing one does", async () => {
      expect({
        plain: await checksAfter("plain"),
        sync: await checksAfter("sync"),
        async: await checksAfter("async"),
      }).toStrictEqual({
        plain: { outcome: "returned /a", calls: ["second"] },
        sync: { outcome: "threw Error: check", calls: [] },
        async: { outcome: refusal("buildPath:params"), calls: [] },
      });
    });
  });

  describe("what core does with the returned thenable", () => {
    const [teardownPlace] = TEARDOWN;

    it("reads its `then` once in a plugin's cleanup", async () => {
      const { bag, reads } = countingBag(thenableOf(rejectingThen("td")));
      const observed = await observe(
        (router) => teardownPlace.arrange(router, () => bag),
        teardownPlace.act,
      );

      expect(Object.entries(reads)).toStrictEqual([["then", 1]]);
      expect(observed.errors).toStrictEqual([[...CLEANUP, "td"]]);
    });

    it("reads its `then` once in a check", async () => {
      const { bag, reads } = countingBag(thenableOf(rejectingThen("check")));
      const observed = await observe(
        arrangeCheck("buildPath:params", () => bag),
        (router) => router.buildPath("a"),
      );

      expect(Object.entries(reads)).toStrictEqual([["then", 1]]);
      expect(observed.outcome).toBe(refusal("buildPath:params"));
    });

    it("reports a `then` that throws on read as the cleanup's failure, before the call returns", async () => {
      const { router, errors } = loggingRouter();
      const bag = throwingBag(
        thenableOf(rejectingThen("td")),
        new Error("then getter failed"),
      );
      const off = router.usePlugin(() => ({ teardown: () => bag }));
      const line = [...CLEANUP, "then getter failed"];

      await expect(watchCall(router, errors, off)).resolves.toStrictEqual({
        atReturn: [line],
        settled: [line],
        unhandled: [],
      });
    });

    it("throws a `then` that throws on read out of the check's door", async () => {
      const bag = throwingBag(
        thenableOf(rejectingThen("check")),
        new Error("then getter failed"),
      );
      const observed = await observe(
        arrangeCheck("buildPath:params", () => bag),
        (router) => router.buildPath("a"),
      );

      expect(observed.outcome).toBe("threw Error: then getter failed");
      expect(observed.unhandled).toStrictEqual([]);
    });

    it("reports a rejection once, after the call returns", async () => {
      const { router, errors } = loggingRouter();
      const off = router.usePlugin(() => ({
        teardown: () =>
          thenableOf(
            (_resolve: unknown, reject: (reason: unknown) => void): void => {
              reject(new Error("one"));
              reject(new Error("two"));
            },
          ),
      }));

      await expect(watchCall(router, errors, off)).resolves.toStrictEqual({
        atReturn: [],
        settled: [[...CLEANUP, "one"]],
        unhandled: [],
      });
    });

    it("reports a `then` that throws when called as a rejection, after the call returns", async () => {
      const { router, errors } = loggingRouter();
      const off = router.usePlugin(() => ({
        teardown: () => thenableOf(throwingThen),
      }));

      await expect(watchCall(router, errors, off)).resolves.toStrictEqual({
        atReturn: [],
        settled: [[...CLEANUP, "then failed"]],
        unhandled: [],
      });
    });

    it("refuses a check whose `then` throws when called", async () => {
      const observed = await observe(
        arrangeCheck("buildPath:params", () => thenableOf(throwingThen)),
        (router) => router.buildPath("a"),
      );

      expect(observed).toStrictEqual({
        outcome: refusal("buildPath:params"),
        unhandled: [],
        errors: [],
        warnings: [],
        after: "",
      });
    });

    it("takes a function carrying a callable `then` for a thenable", async () => {
      const cleanup = await observe(
        (router) =>
          teardownPlace.arrange(router, () =>
            callableThenableOf(rejectingThen("td")),
          ),
        teardownPlace.act,
      );
      const check = await observe(
        arrangeCheck("buildPath:params", () =>
          callableThenableOf(rejectingThen("check")),
        ),
        (router) => router.buildPath("a"),
      );

      expect({ cleanup: cleanup.errors, check: check.outcome }).toStrictEqual({
        cleanup: [[...CLEANUP, "td"]],
        check: refusal("buildPath:params"),
      });
    });
  });
});
