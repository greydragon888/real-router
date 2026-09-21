import { describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

/**
 * A truthy `forwardTo` is a target name or a callback, and every registration
 * door refuses any other truthy value (#2394).
 *
 * ⚑ The refusal belongs at registration because the failure otherwise waits for
 * the first read of the route — `navigate`, `matchPath`, `start` on that URL — and
 * reports `startFn is not a function`, naming neither the route nor the field.
 * #967 put the async half of the same check on every door; this is its other half.
 *
 * ⚠ A FALSY value is not refused: every door drops it before anything is
 * stored. The controls below pin that, so the refusal cannot widen into it
 * unnoticed.
 */

type Router = ReturnType<typeof createRouter>;

const NOT_A_FORWARD: [label: string, value: unknown, type: string][] = [
  ["a number", 42, "number"],
  ["an object", { x: 1 }, "object"],
  ["true", true, "boolean"],
  ["an array", ["home"], "object"],
  ["a symbol", Symbol("target"), "symbol"],
];

/** Falsy values: every door drops them before anything is stored. */
const DROPPED: unknown[] = [0, false, Number.NaN, ""];

const messageFor = (route: string, type: string): string =>
  `[router] forwardTo must be a string or function for route "${route}", got ${type}`;

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }

  return undefined;
}

const base = (): Route[] => [
  { name: "home", path: "/" },
  { name: "other", path: "/o" },
  { name: "r", path: "/r" },
];

const withForward = (forwardTo: unknown): Route[] => [
  { name: "home", path: "/" },
  { name: "other", path: "/o" },
  { name: "r", path: "/r", forwardTo } as Route,
];

/**
 * A door, and the forward route `r` carries before the door is asked. `update`
 * runs on a route that already forwards to `home`, so a refused or dropped value
 * shows up as that forward surviving.
 */
type Door = [
  name: string,
  register: (forwardTo: unknown) => Router,
  prior: string | undefined,
];

const DOORS: Door[] = [
  [
    "createRouter",
    (forwardTo) => createRouter(withForward(forwardTo)),
    undefined,
  ],
  [
    "add",
    (forwardTo) => {
      const router = createRouter(base().slice(0, 2));

      getRoutesApi(router).add(withForward(forwardTo)[2]);

      return router;
    },
    undefined,
  ],
  [
    "replace",
    (forwardTo) => {
      const router = createRouter(base());

      getRoutesApi(router).replace(withForward(forwardTo));

      return router;
    },
    undefined,
  ],
  [
    "update",
    (forwardTo) => {
      const router = createRouter(withForward("home"));

      getRoutesApi(router).update("r", { forwardTo } as never);

      return router;
    },
    "home",
  ],
];

describe("forwardTo is a string or a function at every registration door (#2394)", () => {
  describe.each(DOORS)("%s", (_door, register, prior) => {
    it.each(NOT_A_FORWARD)("refuses %s", (_label, value, type) => {
      const error = thrown(() => register(value));

      expect(error).toBeInstanceOf(TypeError);
      expect((error as Error).message).toBe(messageFor("r", type));
    });

    it("CONTROL — admits a target name and a callback, and the forward resolves", () => {
      for (const forwardTo of ["other", () => "other"]) {
        expect(
          getPluginApi(register(forwardTo)).forwardState("r", {}).name,
        ).toBe("other");
      }
    });

    it.each(DROPPED)(
      "CONTROL — drops the falsy %s instead of refusing it",
      (value) => {
        const router = register(value);

        expect(getRoutesApi(router).get("r")?.forwardTo).toBe(prior);
        expect(getPluginApi(router).forwardState("r", {}).name).toBe(
          prior ?? "r",
        );
      },
    );
  });

  it("the table reaches every door and every value", () => {
    // Anti-vacuum: an emptied table registers no cell and passes silently.
    expect(DOORS).toHaveLength(4);
    expect(DROPPED).toHaveLength(4);
    expect(DOORS.map(([name]) => name)).toStrictEqual([
      "createRouter",
      "add",
      "replace",
      "update",
    ]);
    expect(NOT_A_FORWARD).toHaveLength(5);
  });

  it("names the full dotted route of a nested definition", () => {
    const expected = messageFor("p.c", "number");
    const child = { name: "c", path: "/c", forwardTo: 42 } as unknown as Route;

    expect(
      (
        thrown(() =>
          createRouter([{ name: "p", path: "/p", children: [child] }]),
        ) as Error
      ).message,
    ).toBe(expected);
    expect(
      (
        thrown(() => {
          getRoutesApi(createRouter([{ name: "p", path: "/p" }])).add([child], {
            parent: "p",
          });
        }) as Error
      ).message,
    ).toBe(expected);
    expect(
      (
        thrown(() => {
          getRoutesApi(
            createRouter([
              { name: "p", path: "/p", children: [{ name: "c", path: "/c" }] },
            ]),
          ).update("p.c", { forwardTo: 42 } as never);
        }) as Error
      ).message,
    ).toBe(expected);
  });

  it("refuses before warning that the forward overrides the route's guard", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const guarded = (forwardTo: unknown): Route[] => [
      { name: "home", path: "/" },
      {
        name: "r",
        path: "/r",
        forwardTo,
        canActivate: () => () => true,
      } as Route,
    ];

    try {
      // CONTROL — the warning reaches this spy for a forward that registers.
      createRouter(guarded("home"));

      expect(warn).toHaveBeenCalledTimes(1);

      warn.mockClear();

      expect(thrown(() => createRouter(guarded(42)))).toBeInstanceOf(TypeError);
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it.each(NOT_A_FORWARD)(
    "a refused update of %s leaves the route as it was",
    (_label, value) => {
      const router = createRouter(withForward("home"));
      const routes = getRoutesApi(router);

      routes.update("r", { label: "before" } as never);

      expect(
        thrown(() => {
          routes.update("r", { forwardTo: value, label: "after" } as never);
        }),
      ).toBeInstanceOf(TypeError);

      expect(getPluginApi(router).forwardState("r", {}).name).toBe("home");
      expect(routes.get("r")?.forwardTo).toBe("home");
      expect(getPluginApi(router).getRouteConfig("r")).toStrictEqual({
        label: "before",
      });
    },
  );

  it("CONTROL — a null forwardTo on update still removes the forward", () => {
    const router = createRouter(withForward("home"));

    expect(getPluginApi(router).forwardState("r", {}).name).toBe("home");

    getRoutesApi(router).update("r", { forwardTo: null });

    expect(getPluginApi(router).forwardState("r", {}).name).toBe("r");
  });
});
