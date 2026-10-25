import { describe, it, expect, vi } from "vitest";

import { createRouter, errorCodes, UNKNOWN_ROUTE } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

import type { GuardFnFactory, Router } from "@real-router/core";

/**
 * #2823 — a guard's answer allows a transition only when it is `true`, and
 * every reader of that answer holds the rule: both halves of `navigate` (a
 * thenable is awaited, and the value it settles on is held to the same rule)
 * and the synchronous ask behind `canNavigateTo`, the leave check of
 * `navigateToNotFound` and the revalidation of `replace()`. `start`,
 * `navigateToDefault` and `navigateToState` start a transition through the
 * same walk as `navigate`, and a row each pins that they reach it.
 *
 * `true` is the CONTROL of every reader: a reader that refuses every answer
 * passes each of the other cells.
 */

type Answer = readonly [label: string, value: unknown];

/** Every answer that is not `true` — the truthy ones first. */
const NOT_TRUE: readonly Answer[] = [
  ['"login"', "login"],
  // What `localStorage` hands back for a stored `true`.
  ['"true"', "true"],
  ["1", 1],
  ["1n", 1n],
  ["a symbol", Symbol("answer")],
  ["{}", {}],
  ["[]", []],
  ["a function", () => true],
  // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers -- a wrapper object is not the primitive it wraps
  ["new Boolean(true)", new Boolean(true)],
  // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers -- the wrapper object is the truthy spelling of `false`
  ["new Boolean(false)", new Boolean(false)],
  ["false", false],
  ['""', ""],
  ["0", 0],
  ["NaN", Number.NaN],
  ["null", null],
  ["undefined", undefined],
];

const ANSWERS: readonly Answer[] = [["true", true], ...NOT_TRUE];

/** A guard factory whose guard answers `value`, or a promise of it. */
const answering =
  (value: unknown, awaited: boolean): GuardFnFactory =>
  () =>
  () =>
    (awaited ? Promise.resolve(value) : value) as boolean;

/** A function that is also a thenable — Promises/A+ admits both — settling on `value`. */
function callableThenable(value: unknown): unknown {
  return Object.assign((): void => {}, {
    // eslint-disable-next-line unicorn/no-thenable -- a callable thenable IS the subject
    then: (resolve: (settled: unknown) => void): void => {
      resolve(value);
    },
  });
}

async function startedAtHome(): Promise<Router> {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "admin", path: "/admin" },
  ]);

  await router.start("/home");

  return router;
}

/** The route a navigation committed, or the code it was refused with. */
async function settled(navigation: Promise<{ name: string }>): Promise<string> {
  try {
    const state = await navigation;

    return state.name;
  } catch (error) {
    return (error as { code: string }).code;
  }
}

interface Reader {
  /** What the reader reports for a guard built by `factory`. */
  readonly read: (factory: GuardFnFactory) => Promise<unknown>;
  /** What it reports when the guard answers `true`. */
  readonly allowed: unknown;
  /** What it reports for every other answer. */
  readonly refused: unknown;
  /** The guard answers through a promise. */
  readonly awaited: boolean;
}

async function navigateWith(
  kind: "activate" | "deactivate",
  factory: GuardFnFactory,
): Promise<string> {
  const router = await startedAtHome();
  const lifecycle = getLifecycleApi(router);

  if (kind === "activate") {
    lifecycle.addActivateGuard("admin", factory);
  } else {
    lifecycle.addDeactivateGuard("home", factory);
  }

  const outcome = await settled(router.navigate("admin"));

  router.stop();

  return outcome;
}

async function askWith(
  kind: "activate" | "deactivate",
  factory: GuardFnFactory,
): Promise<boolean> {
  const router = await startedAtHome();
  const lifecycle = getLifecycleApi(router);

  if (kind === "activate") {
    lifecycle.addActivateGuard("admin", factory);
  } else {
    lifecycle.addDeactivateGuard("home", factory);
  }

  const answer = router.canNavigateTo("admin");

  router.stop();

  return answer;
}

async function leaveForNotFound(factory: GuardFnFactory): Promise<string> {
  const router = await startedAtHome();

  getLifecycleApi(router).addDeactivateGuard("home", factory);

  let outcome: string;

  try {
    outcome = router.navigateToNotFound("/nope").name;
  } catch (error) {
    outcome = (error as { code: string }).code;
  }

  router.stop();

  return outcome;
}

async function startWith(factory: GuardFnFactory): Promise<string> {
  const router = createRouter([
    { name: "home", path: "/home" },
    { name: "admin", path: "/admin" },
  ]);

  getLifecycleApi(router).addActivateGuard("admin", factory);

  const outcome = await settled(router.start("/admin"));

  router.stop();

  return outcome;
}

async function navigateToDefaultWith(factory: GuardFnFactory): Promise<string> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "admin", path: "/admin" },
    ],
    { defaultRoute: "admin" },
  );

  await router.start("/home");
  getLifecycleApi(router).addActivateGuard("admin", factory);

  const outcome = await settled(router.navigateToDefault());

  router.stop();

  return outcome;
}

async function navigateToStateWith(factory: GuardFnFactory): Promise<string> {
  const router = await startedAtHome();
  const api = getPluginApi(router);

  getLifecycleApi(router).addActivateGuard("admin", factory);

  const outcome = await settled(
    api.navigateToState(api.makeState("admin", {}, {}, "/admin")),
  );

  router.stop();

  return outcome;
}

async function revalidateOnReplace(factory: GuardFnFactory): Promise<string> {
  const router = await startedAtHome();

  getRoutesApi(router).replace([
    { name: "landing", path: "/home", canActivate: factory },
    { name: "admin", path: "/admin" },
  ]);

  const outcome = router.getState()?.name ?? "no state";

  router.stop();

  return outcome;
}

const READERS: Readonly<Record<string, Reader>> = {
  "navigate — canActivate": {
    read: (factory) => navigateWith("activate", factory),
    allowed: "admin",
    refused: errorCodes.CANNOT_ACTIVATE,
    awaited: false,
  },
  "navigate — canDeactivate": {
    read: (factory) => navigateWith("deactivate", factory),
    allowed: "admin",
    refused: errorCodes.CANNOT_DEACTIVATE,
    awaited: false,
  },
  "navigate — canActivate, through a promise": {
    read: (factory) => navigateWith("activate", factory),
    allowed: "admin",
    refused: errorCodes.CANNOT_ACTIVATE,
    awaited: true,
  },
  "navigate — canDeactivate, through a promise": {
    read: (factory) => navigateWith("deactivate", factory),
    allowed: "admin",
    refused: errorCodes.CANNOT_DEACTIVATE,
    awaited: true,
  },
  "canNavigateTo — canActivate": {
    read: (factory) => askWith("activate", factory),
    allowed: true,
    refused: false,
    awaited: false,
  },
  "canNavigateTo — canDeactivate": {
    read: (factory) => askWith("deactivate", factory),
    allowed: true,
    refused: false,
    awaited: false,
  },
  "navigateToNotFound — the leave check": {
    read: leaveForNotFound,
    allowed: UNKNOWN_ROUTE,
    refused: errorCodes.CANNOT_DEACTIVATE,
    awaited: false,
  },
  "replace() — the revalidation of the current route": {
    read: revalidateOnReplace,
    allowed: "landing",
    refused: UNKNOWN_ROUTE,
    awaited: false,
  },
  "start — canActivate": {
    read: startWith,
    allowed: "admin",
    refused: errorCodes.CANNOT_ACTIVATE,
    awaited: false,
  },
  "navigateToDefault — canActivate": {
    read: navigateToDefaultWith,
    allowed: "admin",
    refused: errorCodes.CANNOT_ACTIVATE,
    awaited: false,
  },
  "navigateToState — canActivate": {
    read: navigateToStateWith,
    allowed: "admin",
    refused: errorCodes.CANNOT_ACTIVATE,
    awaited: false,
  },
};

const READER_ROWS = Object.entries(READERS);

/** The synchronous ask's doors — the readers that cannot wait for a thenable. */
const ASK_ROWS = READER_ROWS.filter(([name]) =>
  ["canNavigateTo —", "navigateToNotFound —", "replace() —"].some((door) =>
    name.startsWith(door),
  ),
);

/**
 * The readers handed the guard's own answer. A promise of an answer is a
 * native one: `Promise.resolve` reads the answer's `then` itself.
 */
const DIRECT_ROWS = READER_ROWS.filter(([, reader]) => !reader.awaited);

/** The readers handed the answer that start a transition: they await a thenable. */
const TRANSITION_ROWS = DIRECT_ROWS.filter((row) => !ASK_ROWS.includes(row));

/** Every answer that is neither `true` nor `false`. */
const NON_BOOLEAN = NOT_TRUE.filter(([, value]) => value !== false);

/** What a callable thenable settles on: the allowing answer and the refusing one. */
const SETTLED = [true, false] as const;

describe("#2823 — only `true` allows, on every reader of a guard's answer", () => {
  it("CONTROL — every table holds the rows it names", () => {
    expect(ANSWERS).toHaveLength(17);
    expect(READER_ROWS).toHaveLength(11);
    expect(ASK_ROWS).toHaveLength(4);
    expect(DIRECT_ROWS).toHaveLength(9);
    expect(TRANSITION_ROWS).toHaveLength(5);
    expect(NON_BOOLEAN).toHaveLength(15);
    expect(SETTLED).toHaveLength(2);
    // The allowing row: without it, a reader that refuses everything passes.
    expect(ANSWERS.filter(([, value]) => value === true)).toHaveLength(1);
    expect(SETTLED.filter(Boolean)).toHaveLength(1);
    // A reader whose two verdicts coincide passes whatever it reads.
    expect(
      READER_ROWS.filter(([, reader]) =>
        Object.is(reader.allowed, reader.refused),
      ),
    ).toStrictEqual([]);
  });

  describe.each(READER_ROWS)("%s", (_, reader) => {
    it.each(ANSWERS)("answer %s", async (_label, value) => {
      const outcome = await reader.read(answering(value, reader.awaited));

      expect(outcome).toBe(value === true ? reader.allowed : reader.refused);
    });
  });

  // The synchronous ask cannot wait, so a thenable is a refusal there whatever
  // it would settle on — `navigate` above is the reader that awaits it.
  describe.each(ASK_ROWS)("%s — a thenable", (_, reader) => {
    it("is refused even when it would settle on `true`", async () => {
      const outcome = await reader.read(answering(true, true));

      expect(outcome).toBe(reader.refused);
    });
  });

  // A thenable may be a function, and a transition awaits it as it awaits any
  // other: the value it settles on is held to the rule.
  describe.each(TRANSITION_ROWS)("%s — a callable thenable", (_, reader) => {
    it.each(SETTLED)("settling on %s", async (value) => {
      const outcome = await reader.read(
        answering(callableThenable(value), false),
      );

      expect(outcome).toBe(value ? reader.allowed : reader.refused);
    });
  });

  // Every reader handed the answer reads `then` in the guard's own error
  // channel, so a `then` that throws is the guard failing — refused, never an
  // escaping throw.
  describe.each(DIRECT_ROWS)("%s — `then` throws on read", (_, reader) => {
    it("is refused", async () => {
      const answer = {
        // eslint-disable-next-line unicorn/no-thenable -- a hostile `then` accessor IS the subject
        get then(): never {
          throw new Error("`then` threw");
        },
      };

      await expect(reader.read(answering(answer, false))).resolves.toBe(
        reader.refused,
      );
    });
  });
});

describe("#2823 — a non-boolean answer is refused with the error `false` raises", () => {
  async function refusal(value: unknown): Promise<unknown> {
    const router = await startedAtHome();

    getLifecycleApi(router).addActivateGuard("admin", answering(value, false));

    try {
      await router.navigate("admin");

      return "NAVIGATED";
    } catch (error) {
      return (error as { toJSON: () => unknown }).toJSON();
    } finally {
      router.stop();
    }
  }

  it.each(NON_BOOLEAN)("answer %s", async (_label, value) => {
    const control = await refusal(false);

    expect(control).toStrictEqual({
      code: errorCodes.CANNOT_ACTIVATE,
      message: errorCodes.CANNOT_ACTIVATE,
      segment: "admin",
    });
    await expect(refusal(value)).resolves.toStrictEqual(control);
  });
});

describe("#2823 — what bare core logs while a reader reads a guard's answer", () => {
  /** What core wrote to the console while `reader` read `factory`'s guard. */
  async function logged(
    reader: Reader,
    factory: GuardFnFactory,
  ): Promise<unknown[][]> {
    const spies = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];

    try {
      await reader.read(factory);

      return spies.flatMap((spy) => spy.mock.calls);
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  }

  const crash = new Error("the guard crashed");

  const throwing: GuardFnFactory = () => () => {
    throw crash;
  };

  /** A guard whose answer's `then` throws on read. */
  const crashingThen: GuardFnFactory = () => () =>
    ({
      // eslint-disable-next-line unicorn/no-thenable -- a hostile `then` accessor IS the subject
      get then(): never {
        throw crash;
      },
    }) as unknown as boolean;

  /** A guard that writes through core's own logger at each level, then refuses. */
  const loggingThroughCore: GuardFnFactory = (router) => () => {
    const { logger } = getPluginApi(router);

    logger.log("router", "log");
    logger.warn("router", "warn");
    logger.error("router", "error");

    return false;
  };

  describe.each(READER_ROWS)("%s", (_, reader) => {
    // Core's logger reaches the capture on this door at every level, so an
    // empty log below is core's answer rather than a capture that sees nothing.
    it("CONTROL — core's logger reaches the capture at each level", async () => {
      await expect(logged(reader, loggingThroughCore)).resolves.toStrictEqual([
        ["[router] log"],
        ["[router] warn"],
        ["[router] error"],
      ]);
    });

    it.each(NON_BOOLEAN)(
      "answer %s — logged as `false` is",
      async (_label, value) => {
        const control = await logged(reader, answering(false, reader.awaited));

        await expect(
          logged(reader, answering(value, reader.awaited)),
        ).resolves.toStrictEqual(control);
      },
    );
  });

  describe.each(DIRECT_ROWS)("%s", (_, reader) => {
    it("a `then` that throws on read — logged as a guard that throws is", async () => {
      const control = await logged(reader, throwing);

      await expect(logged(reader, crashingThen)).resolves.toStrictEqual(
        control,
      );
    });
  });

  describe.each(ASK_ROWS)("%s", (_, reader) => {
    // The ask logs a crashed guard, so the comparison above is not one between
    // two silences on these doors.
    it("CONTROL — a guard that throws is logged", async () => {
      await expect(logged(reader, throwing)).resolves.not.toHaveLength(0);
    });
  });
});
