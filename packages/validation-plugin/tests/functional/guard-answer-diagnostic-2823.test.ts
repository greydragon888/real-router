import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { GuardFnFactory, Router } from "@real-router/core";

/**
 * #2823 — a guard that answers neither `true` nor `false` is reported by the
 * validator on both paths that read the answer: the transition (`navigate`,
 * whose answer may come through a promise) and the synchronous ask
 * (`canNavigateTo`, the leave check of `navigateToNotFound`, the revalidation
 * of `replace()`). The report names the guard and the answer's type, and
 * `returned a Promise` stays the ask's report for a thenable alone.
 *
 * `true` and `false` are the CONTROLS: a validator that reports every answer
 * passes each of the other cells.
 */

type Answer = readonly [label: string, value: unknown, type: string];

/** Every answer that is not a boolean, with the type the report names. */
const NON_BOOLEAN: readonly Answer[] = [
  ['"login"', "login", "string"],
  ["1", 1, "number"],
  ["1n", 1n, "bigint"],
  ["a symbol", Symbol("answer"), "symbol"],
  ["{}", {}, "object"],
  ["[]", [], "array[0]"],
  ["a function", () => true, "function"],
  // eslint-disable-next-line unicorn/new-for-builtins, sonarjs/no-primitive-wrappers -- the wrapper object is the truthy spelling of `false`
  ["new Boolean(false)", new Boolean(false), "Boolean"],
  ['""', "", "string"],
  ["0", 0, "number"],
  ["NaN", Number.NaN, "number"],
  ["null", null, "null"],
  ["undefined", undefined, "undefined"],
];

const BOOLEANS = [true, false] as const;

/** An object whose constructor's `name` is `name`: it describes the object. */
function withConstructorName(name: unknown): object {
  const constructor = (): void => {};

  Object.defineProperty(constructor, "name", { value: name });

  return { constructor };
}

/**
 * Answers whose description fights back: describing the answer reads it, and
 * the read can throw or hand back what is not a string. Each row names the
 * type the report falls back to.
 */
const HOSTILE = [
  [
    // `then` reads as absent, so the answer is a non-boolean, and describing
    // an array reads its length.
    "an array proxy whose `length` read throws",
    (): unknown =>
      new Proxy([], {
        get(_target, key) {
          if (key === "length") {
            throw new Error("hostile length");
          }

          return;
        },
      }),
    "object",
  ],
  [
    "an object whose constructor's `name` is a Symbol",
    (): unknown => withConstructorName(Symbol("name")),
    "object",
  ],
  [
    // A null-prototype object has no `toString` to be printed by.
    "an object whose constructor's `name` is a null-prototype object",
    (): unknown => withConstructorName(Object.create(null)),
    "object",
  ],
  [
    // Core's read of `then` revokes it, and the report still names it: a
    // function is described by `typeof`, which reads nothing off it.
    "a function proxy that revokes itself when its `then` is read",
    (): unknown => {
      const { proxy, revoke } = Proxy.revocable((): void => {}, {
        get(_target, key) {
          if (key === "then") {
            revoke();
          }

          return;
        },
      });

      return proxy;
    },
    "function",
  ],
] as const;

/** Each guard a transition walks, and the route it guards. */
const TRANSITION_GUARDS = [
  ["canActivate", "admin"],
  ["canDeactivate", "home"],
] as const;

const report = (name: string, type: string): string =>
  `Guard for "${name}" must answer true or false, got ${type} — read as a refusal.`;

const ASYNC_REPORT = (name: string): string =>
  `Guard for "${name}" returned a Promise. Sync check cannot resolve async guards — returning false.`;

/** A guard factory whose guard answers `value`, or a promise of it. */
const answering =
  (value: unknown, awaited = false): GuardFnFactory =>
  () =>
  () =>
    (awaited ? Promise.resolve(value) : value) as boolean;

interface Fixture {
  readonly router: Router;
  /**
   * `[channel, message]` of every entry the router logged. An entry at another
   * level than `warn` carries that level in its channel, so a cell expecting
   * warnings alone sees it.
   */
  readonly warnings: (readonly [string, string])[];
}

async function startedAtHome(): Promise<Fixture> {
  const warnings: (readonly [string, string])[] = [];
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "admin", path: "/admin" },
      { name: "login", path: "/login" },
    ],
    {
      logger: {
        level: "none",
        callbackIgnoresLevel: true,
        callback: (level, channel, message) => {
          warnings.push([
            level === "warn" ? channel : `${level}: ${channel}`,
            message,
          ]);
        },
      },
    },
  );

  router.usePlugin(validationPlugin());
  await router.start("/home");

  return { router, warnings };
}

async function settle(navigation: Promise<unknown>): Promise<unknown> {
  try {
    await navigation;

    return "NAVIGATED";
  } catch (error) {
    return (error as { code?: unknown }).code;
  }
}

/** Each door to the ask, and the warnings it logged for a guard. */
const DOORS = {
  "canNavigateTo — canActivate": async (factory: GuardFnFactory) => {
    const fixture = await startedAtHome();

    getLifecycleApi(fixture.router).addActivateGuard("admin", factory);
    fixture.router.canNavigateTo("admin");
    fixture.router.stop();

    return { warnings: fixture.warnings, guarded: "admin" };
  },
  "canNavigateTo — canDeactivate": async (factory: GuardFnFactory) => {
    const fixture = await startedAtHome();

    getLifecycleApi(fixture.router).addDeactivateGuard("home", factory);
    fixture.router.canNavigateTo("admin");
    fixture.router.stop();

    return { warnings: fixture.warnings, guarded: "home" };
  },
  "navigateToNotFound — the leave check": async (factory: GuardFnFactory) => {
    const fixture = await startedAtHome();

    getLifecycleApi(fixture.router).addDeactivateGuard("home", factory);

    try {
      fixture.router.navigateToNotFound("/nope");
    } catch {
      // A refused leave throws CANNOT_DEACTIVATE; the warnings are the subject.
    }

    fixture.router.stop();

    return { warnings: fixture.warnings, guarded: "home" };
  },
  "replace() — the revalidation of the current route": async (
    factory: GuardFnFactory,
  ) => {
    const fixture = await startedAtHome();

    getRoutesApi(fixture.router).replace([
      { name: "landing", path: "/home", canActivate: factory },
      { name: "admin", path: "/admin" },
    ]);
    fixture.router.stop();

    return { warnings: fixture.warnings, guarded: "landing" };
  },
};

const DOOR_ROWS = Object.entries(DOORS);

describe("#2823 — the tables this file iterates", () => {
  it("CONTROL — every table holds the rows it names", () => {
    expect(NON_BOOLEAN).toHaveLength(13);
    expect(BOOLEANS).toHaveLength(2);
    expect(TRANSITION_GUARDS).toHaveLength(2);
    expect(DOOR_ROWS).toHaveLength(4);
    expect(HOSTILE).toHaveLength(4);
  });
});

describe("#2823 — the transition reports a non-boolean answer", () => {
  describe.each(TRANSITION_GUARDS)("%s", (kind, guarded) => {
    async function navigateWith(factory: GuardFnFactory): Promise<Fixture> {
      const fixture = await startedAtHome();
      const lifecycle = getLifecycleApi(fixture.router);

      if (kind === "canActivate") {
        lifecycle.addActivateGuard("admin", factory);
      } else {
        lifecycle.addDeactivateGuard("home", factory);
      }

      await settle(fixture.router.navigate("admin"));
      fixture.router.stop();

      return fixture;
    }

    it.each(NON_BOOLEAN)(
      "answer %s — under bare `router`, since several calls reach the transition",
      async (_label, value, type) => {
        const { warnings } = await navigateWith(answering(value));

        expect(warnings).toStrictEqual([["router", report(guarded, type)]]);
      },
    );

    it.each(NON_BOOLEAN)(
      "a promise settling on %s — the report names what it settled on",
      async (_label, value, type) => {
        const { warnings } = await navigateWith(answering(value, true));

        expect(warnings).toStrictEqual([["router", report(guarded, type)]]);
      },
    );

    it.each(BOOLEANS)("CONTROL — answer %s reports nothing", async (value) => {
      const direct = await navigateWith(answering(value));
      const awaited = await navigateWith(answering(value, true));

      expect([direct.warnings, awaited.warnings]).toStrictEqual([[], []]);
    });
  });

  // The walk resumes after an awaited guard through a door of its own, and
  // the report has to reach the guards it walks from there.
  it("a non-boolean answer after an awaited guard is reported too", async () => {
    const fixture = await startedAtHome();
    const lifecycle = getLifecycleApi(fixture.router);

    lifecycle.addDeactivateGuard("home", answering(true, true));
    lifecycle.addActivateGuard("admin", answering("login"));

    await settle(fixture.router.navigate("admin"));
    fixture.router.stop();

    expect(fixture.warnings).toStrictEqual([
      ["router", report("admin", "string")],
    ]);
  });

  // The report is about the guard's code: the walk read the answer as a
  // refusal before the cancellation restated it, so a navigation superseded
  // while its guard was pending still reports what the guard settled on.
  it("a non-boolean answer settled after the navigation was superseded is reported too", async () => {
    const fixture = await startedAtHome();
    let answer!: (value: unknown) => void;

    getLifecycleApi(fixture.router).addActivateGuard(
      "admin",
      () => () =>
        new Promise<unknown>((resolve) => {
          answer = resolve;
        }) as Promise<boolean>,
    );

    const superseded = settle(fixture.router.navigate("admin"));

    await fixture.router.navigate("login");
    answer("login");

    await expect(superseded).resolves.toBe(errorCodes.TRANSITION_CANCELLED);

    await new Promise((resolve) => setTimeout(resolve, 0));
    fixture.router.stop();

    // The supersede logs core's concurrent-navigation warning; the guard's
    // reports are the subject.
    expect(
      fixture.warnings.filter(([, message]) => message.startsWith("Guard for")),
    ).toStrictEqual([["router", report("admin", "string")]]);
  });
});

describe("#2823 — the synchronous ask reports a non-boolean answer", () => {
  describe.each(DOOR_ROWS)("%s", (_door, ask) => {
    it.each(NON_BOOLEAN)(
      "answer %s — named as such, under the channel the async-guard report takes",
      async (_label, value, type) => {
        const nonBoolean = await ask(answering(value));
        const thenable = await ask(answering(true, true));

        expect(thenable.warnings).toHaveLength(1);

        const [[channel, message]] = thenable.warnings;

        expect(message).toBe(ASYNC_REPORT(thenable.guarded));
        expect(nonBoolean.warnings).toStrictEqual([
          [channel, report(nonBoolean.guarded, type)],
        ]);
      },
    );

    it.each(BOOLEANS)("CONTROL — answer %s reports nothing", async (value) => {
      const { warnings } = await ask(answering(value));

      expect(warnings).toStrictEqual([]);
    });
  });

  it("the canNavigateTo door names itself", async () => {
    const { warnings } = await DOORS["canNavigateTo — canActivate"](
      answering("login"),
    );

    expect(warnings).toStrictEqual([
      ["router.canNavigateTo", report("admin", "string")],
    ]);
  });
});

describe.each(HOSTILE)(
  "#2823 — the report never becomes the thing that fails: %s",
  (_label, hostile, type) => {
    it("navigate still refuses with CANNOT_ACTIVATE, and the report falls back to the type", async () => {
      const { router, warnings } = await startedAtHome();

      getLifecycleApi(router).addActivateGuard(
        "admin",
        () => () => hostile() as boolean,
      );

      const outcome = await settle(router.navigate("admin"));

      router.stop();

      expect(outcome).toBe(errorCodes.CANNOT_ACTIVATE);
      expect(warnings).toStrictEqual([["router", report("admin", type)]]);
    });

    it("canNavigateTo still answers false, and the report falls back to the type", async () => {
      const { router, warnings } = await startedAtHome();

      getLifecycleApi(router).addActivateGuard(
        "admin",
        () => () => hostile() as boolean,
      );

      const answer = router.canNavigateTo("admin");

      router.stop();

      expect(answer).toBe(false);
      expect(warnings).toStrictEqual([
        ["router.canNavigateTo", report("admin", type)],
      ]);
    });
  },
);
