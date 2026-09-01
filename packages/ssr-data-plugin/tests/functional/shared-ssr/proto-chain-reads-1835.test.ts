/**
 * `shared/ssr` reads caller-supplied bags by own key (#1835).
 *
 * The factory is generic and symlinked into two packages, and this one is the
 * coverage owner of `shared/ssr` (#809), so the cells live here.
 *
 * ⚠ They exercise the shared code, not a shared SYMPTOM. `rsc-server-plugin`
 * configures no deferred namespaces, so the forged-brand cell short-circuits
 * before `isDeferred` there and its payload resolves — measured. The other cells
 * reproduce on both.
 *
 * ⚑ The class is #1792 / #1798 — a guard that enumerates own keys while its
 * consumer reads through the prototype chain. #1838 closed the one `in`
 * operator in this directory; these are the member-access reads its scanner
 * could not see, plus the two shape gates that let a non-object through.
 */

import { createRouter } from "@real-router/core";
import { hydrateRouter } from "@real-router/ssr-utils";
import { describe, afterEach, it, expect } from "vitest";

import { ssrDataPluginFactory } from "../../../src";

const routes = [{ name: "profile", path: "/users/:id" }];

const POLLUTED = [
  "data",
  "loader",
  "ssr",
  "ssrDataDeferred",
  "ssrDataDeferredKeys",
];

function pollute(key: string, value: unknown): void {
  Object.defineProperty(Object.prototype, key, {
    value,
    writable: true,
    configurable: true,
    enumerable: false,
  });
}

// eslint-disable-next-line vitest/require-top-level-describe -- file-scoped on purpose: every describe below pollutes `Object.prototype`, and a hook inside one of them would leave the others to poison the worker for whatever runs next.
afterEach(() => {
  for (const key of POLLUTED) {
    delete (Object.prototype as Record<string, unknown>)[key];
  }
});

const hydrationSource = (context: string): string =>
  `{"name":"profile","path":"/users/1","params":{"id":"1"},"search":{},"context":${context}}`;

describe("compile() reads the entry's own fields (#1835)", () => {
  it("an inherited `loader` does not become the route's loader", async () => {
    let evilCalls = 0;

    pollute("loader", () => async () => {
      evilCalls += 1;

      return "PWNED";
    });

    const router = createRouter(routes);

    // The entry declares NO loader — only a mode.
    router.usePlugin(ssrDataPluginFactory({ profile: { ssr: true } }));
    await router.start("/users/1");

    expect(evilCalls).toBe(0);
    expect(router.getState()?.context.data).toBeUndefined();
  });

  it("an inherited `ssr` does not decide the short form's mode", async () => {
    let realCalls = 0;

    pollute("ssr", () => "client-only");

    const router = createRouter(routes);

    // SHORT form: compile wraps the function in a FRESH `{ loader: raw }`
    // literal, whose prototype is `Object.prototype` — so this cell is about
    // an object the CALLER never supplied.
    router.usePlugin(
      ssrDataPluginFactory({
        profile: () => async () => {
          realCalls += 1;

          return "REAL";
        },
      }),
    );
    await router.start("/users/1");

    expect(realCalls).toBe(1);
    expect(router.getState()?.context.ssrDataMode).toBe("full");
  });

  it("CONTROL — an OWN `ssr` still decides the mode", async () => {
    let realCalls = 0;

    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        profile: {
          ssr: "client-only",
          loader: () => async () => {
            realCalls += 1;

            return "REAL";
          },
        },
      }),
    );
    await router.start("/users/1");

    expect(realCalls).toBe(0);
    expect(router.getState()?.context.ssrDataMode).toBe("client-only");
  });
});

describe("the hydration scratchpad is read by own key (#1835)", () => {
  it("an inherited deferred-keys array does not reconstruct promises", async () => {
    pollute("ssrDataDeferredKeys", ["ghost"]);

    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({ profile: () => async () => "REAL" }),
    );
    await hydrateRouter(router, hydrationSource('{"data":"server"}'));

    const context = router.getState()?.context as Record<string, unknown>;

    // ⚠ `context.ssrDataDeferredKeys` would read the POLLUTED value straight
    // back off the chain, so the assertion has to be about the own key — the
    // same distinction the fix is about.
    expect(Object.hasOwn(context, "ssrDataDeferredKeys")).toBe(false);
    expect(Object.hasOwn(context, "ssrDataDeferred")).toBe(false);
    // CONTROL: the server's own value still won — the cell above is about the
    // deferred channel, not about hydration being skipped.
    expect(context.data).toBe("server");
  });

  it("CONTROL — an OWN deferred-keys array still reconstructs", async () => {
    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({ profile: () => async () => "REAL" }),
    );
    await hydrateRouter(
      router,
      hydrationSource('{"data":"server","ssrDataDeferredKeys":["slow"]}'),
    );

    const context = router.getState()?.context as Record<string, unknown>;

    expect(context.ssrDataDeferredKeys).toStrictEqual(["slow"]);
    expect(Object.hasOwn(context, "ssrDataDeferred")).toBe(true);
  });
});

describe("a non-object hydration context falls through (#1835)", () => {
  // `#762` guarded `undefined`; `null` and the primitives reach the own-key
  // check. `hasOwn` boxes a primitive and answers `false`, so only `null`
  // throws today — from a POST-COMMIT interceptor, which leaves the router
  // active with a half-populated context while `hydrateRouter` rejects.
  it.each([
    ["null", "null"],
    ["a string", '"x"'],
    ["a number", "42"],
    ["a boolean", "true"],
    ["an array", '["a"]'],
  ])("%s context runs the loader instead of throwing", async (_label, json) => {
    let loaderCalls = 0;

    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        profile: () => async () => {
          loaderCalls += 1;

          return "REAL";
        },
      }),
    );

    await expect(
      hydrateRouter(router, hydrationSource(json)),
    ).resolves.toBeDefined();

    expect(loaderCalls).toBe(1);
    expect(router.getState()?.context.data).toBe("REAL");
  });

  it("CONTROL — an own key in a real object context still wins", async () => {
    let loaderCalls = 0;

    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        profile: () => async () => {
          loaderCalls += 1;

          return "REAL";
        },
      }),
    );
    await hydrateRouter(router, hydrationSource('{"data":"server"}'));

    expect(loaderCalls).toBe(0);
    expect(router.getState()?.context.data).toBe("server");
  });
});

describe("a deferred payload is validated before anything is written (#1835)", () => {
  it("a forged brand writes nothing and names the route", async () => {
    const brand = Symbol.for("@real-router/ssr-data-plugin/defer");

    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        profile: () => async () => ({ [brand]: true, hello: "world" }),
      }),
    );

    await expect(router.start("/users/1")).rejects.toThrow(/profile/u);

    const context = router.getState()?.context as
      Record<string, unknown> | undefined;

    // Atomicity: the rejection must not leave a committed half-write behind.
    // All THREE claims this branch writes, because the test's name says
    // "writes nothing" and two of three would not earn that.
    expect(context && Object.hasOwn(context, "data")).toBe(false);
    expect(context && Object.hasOwn(context, "ssrDataDeferred")).toBe(false);
    expect(context && Object.hasOwn(context, "ssrDataDeferredKeys")).toBe(
      false,
    );
  });

  it("a branded payload whose `deferred` is null is refused, not crashed on", async () => {
    // `typeof null === "object"`, so the type check alone lets this through to
    // `Object.keys(null)` — the same crash one field over.
    const brand = Symbol.for("@real-router/ssr-data-plugin/defer");

    const router = createRouter(routes);

    router.usePlugin(
      ssrDataPluginFactory({
        profile: () => async () => ({
          [brand]: true,
          critical: "C",
          deferred: null,
        }),
      }),
    );

    await expect(router.start("/users/1")).rejects.toThrow(/profile/u);

    const context = router.getState()?.context as
      Record<string, unknown> | undefined;

    expect(context && Object.hasOwn(context, "data")).toBe(false);
  });
});

describe("the validator asks the same question compile does (#1835)", () => {
  // The validator's unexpected-key loop enumerates OWN keys, so an inherited
  // `loader` / `ssr` is never "unexpected" — but its type checks read the field
  // with a member access, so ambient junk on `Object.prototype` was type-checked
  // as if the caller had written it. That is a REFUSAL of a legitimate config:
  // the `plugin ⊇ core` shape, one package over.
  it("an inherited non-function `loader` does not refuse a legal config", () => {
    pollute("loader", 42);

    const router = createRouter(routes);

    expect(() =>
      router.usePlugin(ssrDataPluginFactory({ profile: { ssr: true } })),
    ).not.toThrow();
  });

  it("an inherited invalid `ssr` does not refuse a legal config", () => {
    pollute("ssr", "not-a-mode");

    const router = createRouter(routes);

    expect(() =>
      router.usePlugin(
        ssrDataPluginFactory({ profile: { loader: () => async () => "REAL" } }),
      ),
    ).not.toThrow();
  });

  it("CONTROL — an OWN non-function `loader` is still refused", () => {
    const router = createRouter(routes);

    expect(() =>
      router.usePlugin(
        ssrDataPluginFactory({
          profile: { loader: 42 } as unknown as { loader: never },
        }),
      ),
    ).toThrow(/must be a function/u);
  });
});
