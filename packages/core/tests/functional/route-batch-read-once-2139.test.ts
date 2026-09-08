import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

import type { Router } from "@real-router/core";

/**
 * Registration judges and copies a route batch in ONE walk (#2139).
 *
 * The structural guard has to see the CALLER's value — a spread answers "plain
 * object?" and "any accessors?" the same way whatever it was made from — while
 * every reader below it has to see a snapshot. That put two walks over one
 * container, and the container is the caller's: an element read once by the
 * guard and again by the snapshot is two questions, so a drifting array
 * REGISTERED what the guard REFUSED.
 *
 * ⚑ The lying-`Proxy` half is out of scope by the owner decision of 2026-08-18
 * (`packages/core/CLAUDE.md`, "Supported Input Shapes"). This is the other half:
 * a Proxy that reports an ordinary data descriptor and simply answers twice.
 *
 * ⚠ Every cell carries its own control, because the drift arm and a plain
 * refusal look identical from outside — the control is the same element with NO
 * drift, which registration must refuse.
 */
describe("a route batch is judged and copied in one walk (#2139)", () => {
  type AnyRoute = Record<string, unknown>;
  type Door = "createRouter" | "add" | "replace";

  const DOORS: readonly Door[] = ["createRouter", "add", "replace"];

  const open = (door: Door, batch: unknown[]): Router => {
    if (door === "createRouter") {
      return createRouter(batch as never);
    }

    const router = createRouter([{ name: "seed", path: "/seed" }] as never);

    if (door === "add") {
      getRoutesApi(router).add(batch as never);
    } else {
      getRoutesApi(router).replace(batch as never);
    }

    return router;
  };

  /** What a door did with a batch, in one string per cell. */
  const outcome = (door: Door, batch: unknown[], probe: string[]): string => {
    let router: Router | undefined;

    try {
      router = open(door, batch);

      const api = getRoutesApi(router);

      return probe.map((name) => `${name}=${String(api.has(name))}`).join(" ");
    } catch (error) {
      return `throws:${(error as Error).message.slice(0, 60)}`;
    } finally {
      router?.dispose();
    }
  };

  it("an element that drifts between guard and snapshot is not registered", () => {
    const table: Record<string, unknown> = {};

    for (const door of DOORS) {
      const legal: AnyRoute = { name: "kid", path: "/kid" };
      // Refused outright by `validateRouteType` — a definition may not carry
      // accessors, because an accessor is what answers differently per read.
      const banned: AnyRoute = {
        get name(): string {
          return "evil";
        },
        path: "/evil",
      };
      let reads = 0;
      const drifting = new Proxy([legal] as unknown[], {
        get(target, key, receiver): unknown {
          if (key === "0") {
            reads += 1;

            return reads === 1 ? legal : banned;
          }

          return Reflect.get(target, key, receiver) as unknown;
        },
      });

      table[door] = {
        indexReads: ((): number => {
          const result = outcome(door, drifting, ["kid", "evil"]);

          table[`${door} · drifted`] = result;

          return reads;
        })(),
        // CONTROL: the same element with no drift at all. Registration must
        // refuse it — without this the row above passes on a fixture that
        // stopped reaching the accessor.
        control: outcome(door, [banned], ["evil"]),
      };
    }

    expect(table).toStrictEqual({
      createRouter: {
        indexReads: 1,
        control:
          "throws:[router.addRoute] Route must not have getters or setters",
      },
      "createRouter · drifted": "kid=true evil=false",
      add: {
        indexReads: 1,
        control:
          "throws:[router.addRoute] Route must not have getters or setters",
      },
      "add · drifted": "kid=true evil=false",
      replace: {
        indexReads: 1,
        control:
          "throws:[router.addRoute] Route must not have getters or setters",
      },
      "replace · drifted": "kid=true evil=false",
    });
  });

  it("a CHILDREN array that drifts is not registered either", () => {
    // The same container one level down: `children` is walked by the guard and
    // then by the snapshot, so the nested array had the identical window.
    const legal: AnyRoute = { name: "kid", path: "/kid" };
    const banned: AnyRoute = {
      get name(): string {
        return "evil";
      },
      path: "/evil",
    };
    let reads = 0;
    const driftingChildren = new Proxy([legal] as unknown[], {
      get(target, key, receiver): unknown {
        if (key === "0") {
          reads += 1;

          return reads === 1 ? legal : banned;
        }

        return Reflect.get(target, key, receiver) as unknown;
      },
    });

    const drifted = outcome(
      "createRouter",
      [{ name: "u", path: "/u", children: driftingChildren }],
      ["u.kid", "u.evil"],
    );
    const control = outcome(
      "createRouter",
      [{ name: "u", path: "/u", children: [banned] }],
      ["u.evil"],
    );

    expect({ reads, drifted, control }).toStrictEqual({
      reads: 1,
      drifted: "u.kid=true u.evil=false",
      control:
        "throws:[router.addRoute] Route must not have getters or setters",
    });
  });

  it("the snapshot's `children` is DEFINED, so an ambient setter never sees it", () => {
    // ⚑ The write half (#1852), and it needs no drift at all. `children` is the
    // primitive's only write under a key the caller's config chose, and the
    // snapshot has no own `children` when the route inherits one — so a plain
    // assignment reached an inherited accessor: the setter swallowed the batch
    // under one, and under a getter-only accessor the assignment THREW in strict
    // mode, turning a legal registration into an error.
    const table: Record<string, unknown> = {};

    for (const withSetter of [true, false]) {
      const injected: AnyRoute[] = [{ name: "evil", path: "/evil" }];
      let setterCalls = 0;
      // Addressed at the route named `u` and its snapshot, so unrelated readers
      // of `.children` do not spend the experiment — the accessor's RECEIVER is
      // the only thing that can tell them apart.
      /* eslint-disable unicorn/no-this-outside-of-class -- an accessor's receiver is the addressing mechanism */
      const descriptor: PropertyDescriptor = {
        configurable: true,
        get(this: unknown): unknown {
          return this !== null &&
            typeof this === "object" &&
            (this as AnyRoute).name === "u"
            ? injected
            : undefined;
        },
      };
      /* eslint-enable unicorn/no-this-outside-of-class */

      if (withSetter) {
        descriptor.set = function (): void {
          setterCalls += 1;
        };
      }

      Object.defineProperty(Object.prototype, "children", descriptor);

      try {
        table[`setter=${String(withSetter)}`] = {
          outcome: outcome("createRouter", [{ name: "u", path: "/u" }], ["u"]),
          setterCalls,
        };
      } finally {
        delete (Object.prototype as AnyRoute).children;
      }
    }

    expect(table).toStrictEqual({
      "setter=true": { outcome: "u=true", setterCalls: 0 },
      "setter=false": { outcome: "u=true", setterCalls: 0 },
    });
  });

  it("the READ-BACK doors define `children` too, not only registration", () => {
    // ⚠ Registration is not the only place core builds a `{ name, path }`
    // literal and then hangs children off it. `nodeToDefinition` and
    // `enrichRoute` do the same on the way OUT, and both were live: under an
    // ambient setter `get(name)` answered a route whose children had gone into
    // the setter, and under a getter-only accessor it threw instead of
    // answering. Same key, same class (#1852), one function away — pinned here
    // rather than left to be found again.
    const table: Record<string, unknown> = {};

    for (const withSetter of [true, false]) {
      const router = createRouter(
        [
          { name: "u", path: "/u", children: [{ name: "kid", path: "/kid" }] },
        ] as never,
        {},
      );
      let setterCalls = 0;
      const descriptor: PropertyDescriptor = {
        configurable: true,
        get: (): unknown => undefined,
      };

      if (withSetter) {
        descriptor.set = function (): void {
          setterCalls += 1;
        };
      }

      Object.defineProperty(Object.prototype, "children", descriptor);

      try {
        const got = getRoutesApi(router).get("u") as unknown as AnyRoute;

        table[`setter=${String(withSetter)}`] = {
          setterCalls,
          childrenOwn: Object.hasOwn(got, "children"),
        };
      } catch (error) {
        table[`setter=${String(withSetter)}`] =
          `throws:${(error as Error).message.slice(0, 70)}`;
      } finally {
        delete (Object.prototype as AnyRoute).children;
        router.dispose();
      }
    }

    expect(table).toStrictEqual({
      "setter=true": { setterCalls: 0, childrenOwn: true },
      "setter=false": { setterCalls: 0, childrenOwn: true },
    });
  });
});
