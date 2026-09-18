import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "../../src/validationPlugin";

/**
 * The first refusal to leave `RouterValidator` for the check channel (#2388):
 * `buildPath`'s path-bag VALUE walk, registered at `buildPath:params`.
 *
 * ⚑ **Why this one first.** Core hands that position `ownParams` — the copy it
 * will print the path from (#2134) — so the check judges the object that ships
 * rather than the one the caller still holds. No interceptor can express it: at
 * the call boundary the copy does not exist yet.
 *
 * ⚠ The SHAPE half stays on `ctx.validator`, and the asymmetry is the point:
 * `validateNavigateParamsShape` must run on the caller's bag, before core copies,
 * because a copy launders every shape it exists to refuse. Only the value half
 * belongs to core's copy, so only the value half moved.
 */
describe("the validation plugin refuses through the check channel (#2388)", () => {
  const routes = [{ name: "items", path: "/items/:id" }];

  it("the value walk refuses, and the message is the door's own", () => {
    const router = createRouter(routes);

    router.usePlugin(validationPlugin());

    expect(() =>
      router.buildPath("items", { id: Symbol("x") } as never),
    ).toThrow(
      '[router.buildPath] param "id" cannot be a symbol — it does not round-trip through the URL path. Use a string, number, or boolean.',
    );
  });

  it("CONTROL — bare core admits the same value, so the refusal is the plugin's", () => {
    // Without this the cell above would agree with a core that refuses on its
    // own, and would keep agreeing if the registration were deleted.
    const router = createRouter(routes);

    expect(() =>
      router.buildPath("items", { id: Symbol("x") } as never),
    ).not.toThrow();
  });

  it("teardown removes the registration, and the door stops refusing", () => {
    // ⚠ The check outlives the validator slot unless teardown says otherwise:
    // nulling `ctx.validator` is what silences every OTHER door, and it does
    // nothing to a channel registration. A leak here leaves a torn-down plugin
    // still refusing.
    const router = createRouter(routes);
    const remove = router.usePlugin(validationPlugin());

    expect(() =>
      router.buildPath("items", { id: Symbol("x") } as never),
    ).toThrow("cannot be a symbol");

    remove();

    expect(() =>
      router.buildPath("items", { id: Symbol("x") } as never),
    ).not.toThrow();
  });

  it("the RESOLVED printer refuses too, and its message names ITS OWN door", () => {
    // ⚑ Why the two printers hold separate positions rather than sharing one:
    // the refusal names the door the caller actually called, and the href path
    // reaches this one having run the forward chain itself.
    const router = createRouter(routes);

    router.usePlugin(validationPlugin());

    expect(() =>
      getPluginApi(router).buildPathResolved("items", {
        id: Symbol("x"),
      } as never),
    ).toThrow(
      new TypeError(
        '[router.buildPathResolved] param "id" cannot be a symbol — it does not round-trip through the URL path. Use a string, number, or boolean.',
      ),
    );
  });

  it("CONTROL — bare core admits it at the resolved printer as well", () => {
    const router = createRouter(routes);

    expect(() =>
      getPluginApi(router).buildPathResolved("items", {
        id: Symbol("x"),
      } as never),
    ).not.toThrow();
  });

  it("teardown removes BOTH registrations", () => {
    const router = createRouter(routes);
    const remove = router.usePlugin(validationPlugin());

    remove();

    expect(() =>
      router.buildPath("items", { id: Symbol("x") } as never),
    ).not.toThrow();
    expect(() =>
      getPluginApi(router).buildPathResolved("items", {
        id: Symbol("x"),
      } as never),
    ).not.toThrow();
  });

  it("ANTI-VACUUM: the door still builds a path with the plugin installed", () => {
    const router = createRouter(routes);

    router.usePlugin(validationPlugin());

    expect(router.buildPath("items", { id: "7" })).toBe("/items/7");
  });
});
