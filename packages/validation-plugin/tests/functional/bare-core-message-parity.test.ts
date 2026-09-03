import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import {
  validateEventName,
  validateListenerArgs,
} from "../../src/validators/eventBus";

import type { RoutesApi } from "@real-router/core/api";

/**
 * A route-CRUD door must refuse a non-string route name with the SAME message
 * whether or not this plugin is installed (#1896).
 *
 * Core's always-on backstops deliberately mirror this plugin's wording — #1047
 * for the reserved `@@` prefix, #1763 for a dotted name, #1896 for the type —
 * so that the production posture (`__DEV__ && validationPlugin()`) does not
 * change which error a consumer reads. The mirroring is a convention with two
 * copies of the string and nothing holding them together, which is exactly the
 * shape that drifts; this pins it.
 *
 * ⚑ It lives HERE and not in core because core devDepends only on
 * `@real-router/ssr-utils` — the two layers can only be compared from this side.
 */
const ROUTES = [{ name: "home", path: "/home" }];

function bare(): RoutesApi {
  return getRoutesApi(createRouter(ROUTES, {}));
}

function withPlugin(): RoutesApi {
  const router = createRouter(ROUTES, {});

  router.usePlugin(validationPlugin());

  return getRoutesApi(router);
}

function messageOf(run: () => unknown): string {
  try {
    run();

    return "NO THROW";
  } catch (error) {
    return (error as Error).message;
  }
}

const DOORS: readonly [string, (api: RoutesApi, name: unknown) => unknown][] = [
  [
    "add",
    (api, name) => {
      api.add([{ name, path: "/kid" }] as never);
    },
  ],
  [
    "replace",
    (api, name) => {
      api.replace([{ name, path: "/kid" }] as never);
    },
  ],
  [
    "remove",
    (api, name) => {
      api.remove(name as never);
    },
  ],
  [
    "update",
    (api, name) => {
      api.update(name as never, { defaultParams: {} });
    },
  ],
];

describe("bare core matches the validated build, message for message (#1896)", () => {
  it("covers every route-CRUD door that both layers can see", () => {
    // Anti-vacuum: an emptied table would assert nothing and stay green.
    expect(DOORS).toHaveLength(4);
  });

  it.each(DOORS)("%s: a non-string route name", (_door, call) => {
    const nonString = { toString: () => "kid" };

    const withoutPlugin = messageOf(() => call(bare(), nonString));
    const validated = messageOf(() => call(withPlugin(), nonString));

    // CONTROL first: the equality below is true when BOTH sides answer
    // "NO THROW", so it needs a companion that fails in that state. ⚑ One
    // assert, not two — a `not.toBe("NO THROW")` beside this was measured
    // INERT (removing it left 6/6 green, because this line reds on the same
    // state and says more), i.e. a planted equivalent mutant.
    expect(withoutPlugin).toContain("must be a string");
    expect(withoutPlugin).toBe(validated);
    // And the message names the DOOR, not a private local — the whole point of
    // #1896, and the half that a plain equality between the two layers cannot
    // see (both could drift to the same wrong string).
    expect(withoutPlugin).toMatch(/^\[router\.[a-zA-Z]+Route]/);
  });

  it("createRouter: the door no validator can reach, so bare core is the only message", () => {
    // ⚑ Not a parity cell — there is nothing to compare against. The plugin is
    // installed through `usePlugin`, i.e. AFTER construction, so a non-string
    // route name in the initial route array is refused by core or by nothing.
    const nonString = { toString: () => "kid" };

    expect(
      messageOf(() => {
        const router = createRouter([
          { name: nonString, path: "/kid" },
        ] as never);

        router.usePlugin(validationPlugin());
      }),
    ).toBe("[router.addRoute] Route name must be a string, got object");
  });

  it("addEventListener: both layers refuse an unknown event name identically", () => {
    // The fifth door of #1888's shape, one operand over. Core derives the seven
    // from `events` and this plugin now derives its set from the same constant,
    // so only the MESSAGE is still written twice — which is what this pins.
    const nonString = { toString: () => "$$success" };

    const bareMessage = messageOf(() =>
      (
        getPluginApi(createRouter(ROUTES, {})).addEventListener as (
          n: unknown,
          cb: unknown,
        ) => unknown
      )(nonString, () => {}),
    );

    const router = createRouter(ROUTES, {});

    router.usePlugin(validationPlugin());

    // CONTROL — the plugin's own copy is reached only when core lets it through,
    // so this compares the two WORDINGS, not the two code paths.
    expect(bareMessage).toBe(
      "[router.addEventListener] Invalid event name: $$success. Must be one of: $start, $stop, $$start, $$leaveApprove, $$cancel, $$success, $$error",
    );
    expect(
      messageOf(() => {
        validateEventName(nonString);
      }),
    ).toBe(bareMessage);
  });

  it("addEventListener refuses a non-function callback with one wording", () => {
    const bareMessage = messageOf(() =>
      (
        getPluginApi(createRouter(ROUTES, {})).addEventListener as unknown as (
          name: unknown,
          cb: unknown,
        ) => unknown
      )("$$success", "not a function"),
    );

    expect(bareMessage).toBe(
      "[router.addEventListener] callback must be a function, got string",
    );

    // CONTROL — the plugin's own copy is reached only when core lets it through,
    // so this compares the two WORDINGS, not the two code paths.
    expect(
      messageOf(() => {
        validateListenerArgs("$$success", "not a function" as never);
      }),
    ).toBe(bareMessage);
  });
});
