import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router } from "@real-router/core";
import type { DependenciesApi } from "@real-router/core/api";

/**
 * No argument core hands the dependency validators is REACHABLE from the
 * dependencies store (#2382).
 *
 * ⚑ **Reachability, not identity, and the difference is the whole test.** An
 * identity check against the store object passes every NARROWED form — handing
 * `store.dependencies`, or a `{ dependencies }` wrapper — so it cannot tell this
 * design from the one it replaced. The universe below is built by walking FROM
 * the store, which is why a descendant like `store.dependencies` is caught and a
 * copy of it is not.
 *
 * ⚠ **`store.limits` is deliberately subtracted.** It is the frozen object
 * `createLimits` resolves, `plugins.validatePluginLimit` already receives it by
 * design, and `PluginApi` is planned to publish it. Subtracting it keeps this
 * gate about the CONTAINER channel rather than about every object core and the
 * plugin share.
 *
 * ⚠ The rejected forms run through the same gate as negative controls, so a gate
 * that stopped catching anything would fail rather than pass quietly.
 */

interface Call {
  method: string;
  args: unknown[];
}

interface DepsInternals {
  validator: unknown;
  dependenciesGetStore: () => Record<string, unknown>;
}

/** What one object leads to: own values, plus Map / Set / array members. */
function edgesOf(value: object): unknown[] {
  const out: unknown[] = [];

  if (value instanceof Map) {
    out.push(...value.values());
  } else if (value instanceof Set || Array.isArray(value)) {
    out.push(...value);
  }

  for (const key of Object.keys(value)) {
    out.push((value as Record<string, unknown>)[key]);
  }

  return out;
}

/** Every object reachable from `root` within `maxDepth` edges. */
function reachable(root: unknown, maxDepth: number): Set<object> {
  const seen = new Set<object>();
  let frontier: unknown[] = [root];

  for (let depth = 0; depth <= maxDepth; depth++) {
    const next: unknown[] = [];

    for (const value of frontier) {
      const isObject = typeof value === "object" || typeof value === "function";

      if (!isObject || value === null || seen.has(value)) {
        continue;
      }

      seen.add(value);
      next.push(...edgesOf(value));
    }

    frontier = next;
  }

  return seen;
}

/** "Does this value reach the store?", with the published exception subtracted. */
function buildGate(
  store: Record<string, unknown>,
): (value: unknown) => boolean {
  const universe = reachable(store, 3);

  for (const published of reachable(store.limits, 2)) {
    universe.delete(published);
  }

  return (value: unknown) => {
    for (const object of reachable(value, 2)) {
      if (universe.has(object)) {
        return true;
      }
    }

    return false;
  };
}

function recordingRouter(calls: Call[]): Router {
  const router = createRouter([{ name: "home", path: "/" }]);
  const ctx = getInternals(router) as unknown as DepsInternals;

  ctx.validator = new Proxy(
    {},
    {
      get: (_target, namespace: string) =>
        new Proxy(
          {},
          {
            get:
              (_t, method: string) =>
              (...args: unknown[]) => {
                if (namespace === "dependencies") {
                  calls.push({ method, args });
                }
              },
          },
        ),
    },
  );

  return router;
}

describe("the dependency validators take facts, not containers (#2382)", () => {
  it("no argument core passes is reachable from the dependencies store", () => {
    const calls: Call[] = [];
    const router = recordingRouter(calls);
    const deps = getDependenciesApi(router) as unknown as DependenciesApi<
      Record<string, unknown>
    >;

    deps.set("a", 1);
    deps.setAll({ b: 2, c: 3 });
    deps.get("a");
    deps.remove("a");
    deps.has("b");

    const ctx = getInternals(router) as unknown as DepsInternals;
    const reaches = buildGate(ctx.dependenciesGetStore());
    const offenders = calls
      .filter((call) => call.args.some((argument) => reaches(argument)))
      .map((call) => call.method);

    expect(offenders).toStrictEqual([]);
    // Anti-vacuum: the doors really were exercised.
    expect(calls.length).toBeGreaterThan(5);
  });

  it("CONTROL — the rejected forms are all caught by the same gate", () => {
    const router = createRouter([{ name: "home", path: "/" }]);
    const ctx = getInternals(router) as unknown as DepsInternals;
    const store = ctx.dependenciesGetStore();
    const reaches = buildGate(store);
    const record = store.dependencies as Record<string, unknown>;
    const limits = store.limits as { maxDependencies: number };

    expect({
      "the store itself": reaches(store),
      "store.dependencies": reaches(record),
      "a { dependencies } wrapper": reaches({ dependencies: record }),
      "a COPY of the record": reaches({ ...record }),
      "the count": reaches(Object.keys(record).length),
      "the resolved limit": reaches(limits.maxDependencies),
    }).toStrictEqual({
      "the store itself": true,
      "store.dependencies": true,
      "a { dependencies } wrapper": true,
      "a COPY of the record": false,
      "the count": false,
      "the resolved limit": false,
    });
  });
});
