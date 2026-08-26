import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

/**
 * A route definition is read ONCE per own key (#1899).
 *
 * Registration used to read each definition many times — `route.name` seven
 * times for one `add` — and every read is an independent question. So a
 * definition whose `name` is an accessor was VALIDATED under one answer and
 * REGISTERED under another, which walked past the two always-on name rules
 * whose literal spelling is refused: the reserved `@@` prefix (#1047) and the
 * dotted name (#1763).
 *
 * ⚑ The discriminating input is a DRIFTING accessor. A stable one answers the
 * same thing on every read, so a stable-getter cell is vacuous — it passes on
 * the defect and on the fix alike.
 */
const SMUGGLED = ["@@router/UNKNOWN_ROUTE", "a.b"] as const;

function driftingName(smuggled: string): {
  route: object;
  readonly reads: number;
} {
  let reads = 0;

  return {
    route: {
      get name(): string {
        reads += 1;

        return reads <= 4 ? "safe" : smuggled;
      },
      path: "/x",
    },
    get reads(): number {
      return reads;
    },
  };
}

describe("a route definition is read once per own key (#1899)", () => {
  it("covers both names whose literal spelling core refuses", () => {
    // Anti-vacuum: an emptied `SMUGGLED` would silently register ZERO cells for
    // the two `it.each` blocks below and the file would still be green.
    expect(SMUGGLED).toHaveLength(2);
  });

  it.each(SMUGGLED)(
    "a drifting name cannot register %s past the guard that validated it",
    (smuggled) => {
      const api = getRoutesApi(createRouter([{ name: "home", path: "/home" }]));
      const probe = driftingName(smuggled);

      api.add([probe.route] as never);

      expect({
        reads: probe.reads,
        registeredAsValidated: api.has("safe"),
        smuggled: api.has(smuggled),
      }).toStrictEqual({
        reads: 1,
        registeredAsValidated: true,
        smuggled: false,
      });
    },
  );

  it.each(SMUGGLED)(
    "CONTROL — %s written literally is still refused",
    (smuggled) => {
      const api = getRoutesApi(createRouter([{ name: "home", path: "/home" }]));

      expect(() => {
        api.add([{ name: smuggled, path: "/x" }]);
      }).toThrow();
      expect(api.has(smuggled)).toBe(false);
    },
  );

  it("CONTROL — an ordinary batch still registers, nesting included", () => {
    // Without this the whole file passes on a snapshot that drops everything.
    const api = getRoutesApi(createRouter([{ name: "home", path: "/home" }]));

    api.add([
      {
        name: "users",
        path: "/users",
        defaultParams: { via: "a" },
        children: [{ name: "list", path: "/list" }],
      },
    ]);

    expect({
      parent: api.has("users"),
      child: api.has("users.list"),
      // The snapshot must carry config through, not only the structural fields.
      defaults: api.get("users")?.defaultParams,
    }).toStrictEqual({ parent: true, child: true, defaults: { via: "a" } });
  });

  it("a custom field named __proto__ survives the snapshot as data", () => {
    // ⚑ The spread DEFINES, so the key lands as an ordinary own property. A
    // key-by-key copy loop would have dispatched it into the inherited setter
    // and lost it — the #1856 trade, one layer up from where #1825 met it.
    const router = createRouter([{ name: "home", path: "/home" }]);

    getRoutesApi(router).add([
      JSON.parse(
        '{"name":"p","path":"/p","__proto__":"custom","plain":"ok"}',
      ) as never,
    ]);

    // ⚠ Asked of `getRouteConfig`, not `get()` — measured, `get()` returns the
    // definition and config fields and carries no custom fields at all (a plain
    // `custom: "ok"` is absent from it too), so a `get()` assertion here would
    // have been red for a reason that has nothing to do with this fix.
    //
    // ⚑ Through a descriptor rather than `config["__proto__"]`: `eslint --fix`
    // rewrites the bracket form to `.__proto__`, which reads the PROTOTYPE
    // instead of the own key and inverts the assertion. The descriptor form
    // also says the stronger thing — that it is an OWN property.
    const config = getPluginApi(router).getRouteConfig("p") ?? {};

    expect({
      smuggledKey: Object.getOwnPropertyDescriptor(config, "__proto__")?.value,
      // CONTROL: an ordinary custom field, so the cell cannot pass on a config
      // that carries nothing.
      ordinary: Object.getOwnPropertyDescriptor(config, "plain")?.value,
    }).toStrictEqual({ smuggledKey: "custom", ordinary: "ok" });
  });

  it("the snapshot reaches the constructor and replace(), not only add()", () => {
    // All three population entry points, since a fix wired to one of them looks
    // identical from the other two until someone measures.
    const ctorProbe = driftingName("@@router/UNKNOWN_ROUTE");
    const router = createRouter([ctorProbe.route] as never);
    const api = getRoutesApi(router);

    const replaceProbe = driftingName("a.b");

    api.replace([replaceProbe.route] as never);

    // ⚠ NOT keyed `constructor` — `toStrictEqual` compares `a.constructor ===
    // b.constructor` to decide the two operands are the same type, so an own
    // key of that name makes every comparison fail with "no visual difference".
    expect({
      viaConstructor: [ctorProbe.reads, router.buildPath("safe")],
      viaReplace: [replaceProbe.reads, api.has("safe"), api.has("a.b")],
    }).toStrictEqual({
      viaConstructor: [1, "/x"],
      viaReplace: [1, true, false],
    });

    router.dispose();
  });
});
