import { afterEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getDependenciesApi, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

/**
 * `Object.create` is captured, so a record core builds with NO prototype keeps
 * having none (#2072).
 *
 * ⚑ **The doctrine's scope was the defect, not its enforcement.** #1971 swept
 * the intrinsics that ANSWER a question (`hasOwn` / `keys` / `entries` and four
 * more) and put `create` / `freeze` / `assign` out of scope on the ground that
 * they *"decide nothing"*. True, and beside the point: `Object.create` builds
 * the object every one of those decisions is taken against, so re-pointing it
 * removes the guarantee rather than one verdict.
 *
 * ⚠ Not a security boundary — re-pointing `Object.create` already requires
 * script execution. It is robustness against polyfills, RUM/APM instrumentation,
 * browser extensions and test doubles, and it does NOT close a shim evaluated
 * BEFORE core loads (`guards.ts:17-21`, #1798).
 *
 * The shim keeps the two-argument form native, because `Object.create(proto,
 * descriptors)` is load-bearing for the test framework itself; only the
 * one-argument `Object.create(null)` that core uses is neutralised.
 */
describe("core's BUILD intrinsic Object.create is captured — behaviour (#2072)", () => {
  const realCreate = Object.create;

  /** Neutralises `Object.create(null)` and nothing else. */
  const dropTheNullPrototype = (): void => {
    Object.create = ((proto: object | null, props?: PropertyDescriptorMap) =>
      props === undefined
        ? {}
        : realCreate(proto, props)) as typeof Object.create;
  };

  afterEach(() => {
    Object.create = realCreate;
    delete (Object.prototype as Record<string, unknown>).apiClient;
  });

  it("CONTROL — the shim is genuinely installed and does remove the prototype", () => {
    // Without this every cell below passes when the shim quietly fails to take
    // effect, which is indistinguishable from a capture that works.
    dropTheNullPrototype();

    expect(Object.getPrototypeOf(Object.create(null))).toBe(Object.prototype);
    expect(
      Object.getPrototypeOf(Object.create(null, { a: { value: 1 } })),
      "the two-argument form must stay native, or the shim breaks the harness",
    ).toBe(null);
  });

  it("a declared `__proto__` param survives registration (#1825)", () => {
    const routes = [{ name: "a", path: "/a/:__proto__/:keep" }];

    const paramKeys = (router: ReturnType<typeof createRouter>): string[] => {
      const root = getPluginApi(router).getTree() as {
        children: ReadonlyMap<string, { paramTypeMap: Record<string, string> }>;
      };

      return Object.getOwnPropertyNames(
        root.children.get("a")?.paramTypeMap ?? {},
      ).toSorted((left, right) => left.localeCompare(right));
    };

    // CONTROL — the key is there before any shim, so the cell below measures the
    // intrinsic and not a route that never registered its params.
    const healthy = createRouter(structuredClone(routes) as never);

    expect(paramKeys(healthy)).toStrictEqual(["__proto__", "keep"]);

    healthy.dispose();

    // Measured before the capture: `["keep"]`. `emptyRecord()` handed back a
    // `{}` inheriting from `Object.prototype`, so `paramTypeMap["__proto__"] =
    // "url"` became a `[[Set]]` on the magic accessor and the entry was lost —
    // silently, which is #1825 restored.
    dropTheNullPrototype();

    const shimmed = createRouter(structuredClone(routes) as never);

    Object.create = realCreate;

    expect(paramKeys(shimmed)).toStrictEqual(["__proto__", "keep"]);

    shimmed.dispose();
  });

  it("the dependency store keeps its null prototype, and get() stays own-only", () => {
    const routes = [{ name: "u", path: "/u" }];

    // CONTROL — clean on the native intrinsic, so the cell below is a swap and
    // not a store that was never prototype-less.
    const healthy = createRouter(structuredClone(routes) as never);

    expect(
      Object.getPrototypeOf(
        getInternals(healthy).dependenciesGetStore().dependencies,
      ),
    ).toBeNull();

    healthy.dispose();

    dropTheNullPrototype();

    const shimmed = createRouter(structuredClone(routes) as never);

    Object.create = realCreate;

    // ⚑ The two published doors must agree. Measured before the capture:
    // `get("apiClient")` answered `"AMBIENT"` while `has("apiClient")` — reading
    // through the captured `hasOwn` — answered `false`, so a name core does not
    // hold was resolvable through one door and denied by the other. That
    // disagreement is the shape #1829 closed for `RouterError` field access.
    (Object.prototype as Record<string, unknown>).apiClient = "AMBIENT";

    const api = getDependenciesApi(shimmed);

    expect({
      get: api.get("apiClient" as never),
      has: api.has("apiClient" as never),
      inGetAll: Object.hasOwn(api.getAll(), "apiClient"),
      storeProto: Object.getPrototypeOf(
        getInternals(shimmed).dependenciesGetStore().dependencies,
      ),
    }).toStrictEqual({
      get: undefined,
      has: false,
      inGetAll: false,
      storeProto: null,
    });

    shimmed.dispose();
  });
});
