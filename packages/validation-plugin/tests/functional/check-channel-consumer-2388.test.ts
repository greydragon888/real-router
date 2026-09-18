import { createRouter } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
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

  it("navigate refuses at BOTH of its positions", async () => {
    const router = createRouter(routes);

    router.usePlugin(validationPlugin());

    await router.start("/items/1");

    // ⚑ ENTRY refuses SYNCHRONOUSLY, from a method whose declared return is a
    // promise — the facade's own shape for programmer error, pinned by #1572
    // and unchanged by the conversion. `validateNavigateArgs` is the member
    // that left `RouterValidator` with this slice: this was its only caller.
    expect(() => router.navigate(42 as never)).toThrow(
      "[router.navigate] Invalid route name: expected string, got number",
    );

    // ⚠ PARAMS refuses the same way, and the asymmetry with the REJECTION one
    // line above it in core is deliberate: a throwing accessor on the caller's
    // bag rejects, a bad value refuses.
    expect(() =>
      router.navigate("items", { id: Symbol("x") } as never),
    ).toThrow("cannot be a symbol");

    router.stop();
  });

  it("canNavigateTo refuses through the channel, and the message names IT", () => {
    // ⚠ This door is TOTAL in bare core, and refusing here is the analyser's
    // documented divergence rather than a regression — the same shape it had
    // when the validator answered at this position.
    const router = createRouter(routes);

    router.usePlugin(validationPlugin());

    expect(() =>
      router.canNavigateTo("items", { id: Symbol("x") } as never),
    ).toThrow('[router.canNavigateTo] param "id" cannot be a symbol');
  });

  it("CONTROL — bare core answers at the predicate instead of refusing", () => {
    const router = createRouter(routes);

    expect(() =>
      router.canNavigateTo("items", { id: Symbol("x") } as never),
    ).not.toThrow();
  });

  it("teardown removes every registration this plugin made", () => {
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
    expect(() =>
      router.canNavigateTo("items", { id: Symbol("x") } as never),
    ).not.toThrow();
  });

  it("the batch check WALKS INTO CHILDREN, which core no longer does for it", () => {
    // ⚑ The walk moved here with #2388 — core hands the whole snapshot to
    // `addRoute:batch` and the plugin recurses. Without this cell the walk is
    // held up by COVERAGE alone, and a check that stopped at the top level
    // would keep every behavioural test green.
    //
    // ⚠ An async `decodeParams`, and the choice is what makes the cell
    // discriminate: bare core admits it, and no always-on guard refuses it, so
    // the ONLY thing that can throw here is this plugin's per-route walk
    // reaching the child. A `canActivate` was tried first and was useless —
    // core's own factory-shape guard refuses that whether the walk runs or not.
    const router = createRouter([]);

    router.usePlugin(validationPlugin());

    expect(() => {
      getRoutesApi(router).add([
        {
          name: "parent",
          path: "/parent",
          children: [
            {
              name: "child",
              path: "/child",
              decodeParams: async () => ({}),
            },
          ],
        },
      ] as never);
    }).toThrow('decodeParams cannot be async for route "child"');
  });

  it("the lifecycle doors refuse a bad route name, add and remove alike", () => {
    // ⚠ The REMOVE doors matter as much as the add ones: their only
    // consultation was `validateRouteName`, so without a cell here their checks
    // are registered and never run.
    const router = createRouter(routes);
    const lifecycle = getLifecycleApi(router);

    router.usePlugin(validationPlugin());

    // ⚠ A WHITESPACE name, not a number and not an empty string. Core's own
    // `assertRouteNameIsString` stands above the check and refuses a non-string
    // first, so a number never reaches the registration; and an empty name is
    // VALID here — it is the root node.
    expect(() => {
      lifecycle.addActivateGuard("  ", () => () => true);
    }) //
      .toThrow("[router.addActivateGuard]");
    expect(() => {
      lifecycle.addDeactivateGuard("  ", () => () => true);
    }) //
      .toThrow("[router.addDeactivateGuard]");
    expect(() => {
      lifecycle.removeActivateGuard("  ");
    }) //
      .toThrow("[router.removeActivateGuard]");
    expect(() => {
      lifecycle.removeDeactivateGuard("  ");
    }) //
      .toThrow("[router.removeDeactivateGuard]");
  });

  it("ANTI-VACUUM: the door still builds a path with the plugin installed", () => {
    const router = createRouter(routes);

    router.usePlugin(validationPlugin());

    expect(router.buildPath("items", { id: "7" })).toBe("/items/7");
  });
});
