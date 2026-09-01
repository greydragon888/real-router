import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

/**
 * A door that takes BOTH channels validates both (#1972).
 *
 * The path bag has had a shape check since the beginning; the query bag had
 * none anywhere, so a string spread character by character into `state.search`
 * and into the URL — with this plugin installed, which is the point.
 *
 * ⚑ The door set is CLASSIFIED against a snapshot of the two public surfaces,
 * so a new member reds this file until someone says which side it is on. It is
 * not a hand-list: three of the seven are missing from the issue's own count,
 * which enumerated `validateParams` call sites and therefore could not see the
 * doors that validate the path bag through a different validator.
 *
 * ⚠ A signature SCAN cannot answer this question, and the reason is three
 * spellings no single text predicate sees together: `navigate` spells its path
 * slot `paramsOrOptions`, `getPluginApi.ts` writes its members as untyped
 * arrows, and the interface types them through `P extends Params` generics. The
 * surface snapshot asks something the source text cannot misspell.
 */
describe("every door taking both channels validates both (#1972)", () => {
  /** Every public member, and which side of the question it is on. */
  const CLASSIFIED: Record<string, "both-channels" | "not-a-channel-door"> = {
    // facade
    areStatesEqual: "not-a-channel-door",
    buildPath: "both-channels",
    canNavigateTo: "both-channels",
    dispose: "not-a-channel-door",
    getPreviousState: "not-a-channel-door",
    getState: "not-a-channel-door",
    isActive: "not-a-channel-door",
    isActiveRoute: "both-channels",
    isLeaveApproved: "not-a-channel-door",
    navigate: "both-channels",
    navigateToDefault: "not-a-channel-door",
    navigateToNotFound: "not-a-channel-door",
    shouldUpdateNode: "not-a-channel-door",
    start: "not-a-channel-door",
    stop: "not-a-channel-door",
    subscribe: "not-a-channel-door",
    subscribeLeave: "not-a-channel-door",
    usePlugin: "not-a-channel-door",
    // plugin API
    addEventListener: "not-a-channel-door",
    addInterceptor: "not-a-channel-door",
    buildNavigationState: "both-channels",
    claimContextNamespace: "not-a-channel-door",
    emitTransitionError: "not-a-channel-door",
    extendRouter: "not-a-channel-door",
    forwardState: "both-channels",
    getOptions: "not-a-channel-door",
    getRootPath: "not-a-channel-door",
    getRouteConfig: "not-a-channel-door",
    getTree: "not-a-channel-door",
    makeState: "both-channels",
    matchPath: "not-a-channel-door",
    navigateToState: "not-a-channel-door",
    setRootPath: "not-a-channel-door",
  };

  const routes = () => [{ name: "h", path: "/h/:id?page" }];

  const surfaces = () => {
    const router = createRouter(routes() as never);
    const facade = Object.getOwnPropertyNames(
      Object.getPrototypeOf(router) as object,
    ).filter((m) => m !== "constructor");
    const plugin = Object.keys(getPluginApi(router));

    router.dispose();

    return { facade, plugin };
  };

  const DOORS = Object.entries(CLASSIFIED)
    .filter(([, side]) => side === "both-channels")
    .map(([member]) => member)
    .toSorted((a, b) => a.localeCompare(b));

  const withPlugin = () => {
    const router = createRouter(routes() as never);

    router.usePlugin(validationPlugin());

    return router;
  };

  const call = (door: string, junkChannel: "params" | "search"): void => {
    const router = withPlugin();
    const params: unknown = junkChannel === "params" ? "str" : { id: "1" };
    const search: unknown = junkChannel === "search" ? "str" : { page: "1" };
    const api = getPluginApi(router) as never as Record<
      string,
      (...a: unknown[]) => unknown
    >;
    const facade = router as never as Record<
      string,
      (...a: unknown[]) => unknown
    >;

    try {
      if (door === "makeState") {
        api.makeState("h", params, search, "/h/1");
      } else if (door in api) {
        api[door]("h", params, search);
      } else {
        facade[door]("h", params, search);
      }
    } finally {
      router.dispose();
    }
  };

  const refuses = (door: string, junkChannel: "params" | "search"): boolean => {
    try {
      call(door, junkChannel);

      return false;
    } catch {
      return true;
    }
  };

  it("CONTROL — every public member is classified, and the tables are not empty", () => {
    const { facade, plugin } = surfaces();

    expect(
      [...facade, ...plugin].toSorted((a, b) => a.localeCompare(b)),
    ).toStrictEqual(
      Object.keys(CLASSIFIED).toSorted((a, b) => a.localeCompare(b)),
    );
    expect(facade.length).toBeGreaterThan(0);
    expect(plugin.length).toBeGreaterThan(0);
    expect(DOORS).toStrictEqual([
      "buildNavigationState",
      "buildPath",
      "canNavigateTo",
      "forwardState",
      "isActiveRoute",
      "makeState",
      "navigate",
    ]);
  });

  it.each(DOORS)("%s refuses junk in the QUERY channel", (door) => {
    expect(refuses(door, "search")).toBe(true);
  });

  it.each(DOORS)(
    "CONTROL — %s refuses junk in the PATH channel, as it always has",
    (door) => {
      expect(refuses(door, "params")).toBe(true);
    },
  );
});
