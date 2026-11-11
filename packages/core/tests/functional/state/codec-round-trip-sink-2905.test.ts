import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { installSpyValidator } from "../../helpers/spyValidator";

import type {
  ParamsSearch,
  Route,
  Router,
  State,
  UrlChannels,
} from "@real-router/core";

/**
 * The codec diagnostic's sink (#2905). `navigate` never runs a route's
 * `decodeParams`, so core hands the validator what a round trip needs: the
 * state a committing producer builds, the route's two codecs and the path
 * slots its URL prints. What the round trip finds is the plugin's verdict, and
 * `validation-plugin`'s `codec-round-trip.test.ts` owns it.
 */

const lowered = ({ params, search }: ParamsSearch): ParamsSearch => ({
  params: { ...params, slug: (params.slug as string).toLowerCase() },
  search,
});

const kinded = ({ params, search }: ParamsSearch): ParamsSearch => ({
  params: { ...params, kind: "car" },
  search,
});

const ROUTES: Route[] = [
  { name: "home", path: "/home" },
  { name: "plain", path: "/plain" },
  {
    name: "cars",
    path: "/cars/:slug?sort",
    encodeParams: lowered,
    decodeParams: kinded,
  },
  { name: "decoded", path: "/decoded/:slug", decodeParams: kinded },
  { name: "encoded", path: "/encoded/:slug", encodeParams: lowered },
  { name: "old", path: "/old/:slug", forwardTo: "cars" },
];

const CHANNELS: UrlChannels = { params: { slug: "BMW" }, search: {} };

/** What a route is: the commit adds `transition` to a copy of the built state. */
const routingOf = ({ name, params, search, path }: State) => ({
  name,
  params,
  search,
  path,
});

function reportsOf(router: Router) {
  return vi.mocked(getInternals(router).validator!.state.reportCodecRoundTrip)
    .mock.calls;
}

describe("the codec round-trip sink (#2905)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(ROUTES);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("is absent from the port until a validator is installed, and once it is removed", async () => {
    const port = getInternals(router).port();

    expect(port.reportCodecRoundTrip).toBeUndefined();

    const validator = installSpyValidator(router);

    expect(typeof port.reportCodecRoundTrip).toBe("function");

    await router.navigate("cars", { slug: "bmw" });

    expect(validator.state.reportCodecRoundTrip).toHaveBeenCalledTimes(1);

    getInternals(router).validator = null;

    expect(port.reportCodecRoundTrip).toBeUndefined();

    await router.navigate("cars", { slug: "audi" });

    expect(validator.state.reportCodecRoundTrip).toHaveBeenCalledTimes(1);
  });

  it("hands over the state navigate builds, the route's codecs and its path slots", async () => {
    installSpyValidator(router);

    const state = await router.navigate(
      "cars",
      { slug: "bmw" },
      { sort: "name" },
    );
    const [[reported, codec, slots]] = reportsOf(router);

    expect(routingOf(reported)).toStrictEqual(routingOf(state));
    expect(slots).toStrictEqual(["slug"]);
    // Each codec reaches the route's own function.
    expect(codec.encode?.(CHANNELS)).toStrictEqual(lowered(CHANNELS));
    expect(codec.decode?.(CHANNELS)).toStrictEqual(kinded(CHANNELS));
  });

  it("lists the root's path slots before the route's own (#2895)", async () => {
    const rooted = createRouter(ROUTES);

    getPluginApi(rooted).setRootPath("/app/:tenant");
    await rooted.start("/app/acme/home");
    installSpyValidator(rooted);
    await rooted.navigate("cars", { tenant: "acme", slug: "bmw" });

    expect(reportsOf(rooted).map((call) => call[2])).toStrictEqual([
      ["tenant", "slug"],
    ]);

    rooted.stop();
  });

  it("hands over the state buildNavigationState returns", () => {
    installSpyValidator(router);

    const built = getPluginApi(router).buildNavigationState("cars", {
      slug: "bmw",
    });

    expect(reportsOf(router).map(([reported]) => reported)).toStrictEqual([
      built,
    ]);
    expect(reportsOf(router)[0][0]).toBe(built);
  });

  it("hands a codec the route does not have over as undefined", async () => {
    installSpyValidator(router);

    await router.navigate("decoded", { slug: "bmw" });
    await router.navigate("encoded", { slug: "bmw" });

    const codecs = reportsOf(router).map(([, codec]) => [
      typeof codec.encode,
      typeof codec.decode,
    ]);

    expect(codecs).toStrictEqual([
      ["undefined", "function"],
      ["function", "undefined"],
    ]);
  });

  it("asks nothing about a route with no codec", async () => {
    const validator = installSpyValidator(router);

    await router.navigate("plain");

    expect(validator.state.reportCodecRoundTrip).not.toHaveBeenCalled();
  });

  it("asks about the target of a forward, with the target's codecs", async () => {
    installSpyValidator(router);

    await router.navigate("old", { slug: "bmw" });

    const [[reported, codec]] = reportsOf(router);

    expect(reported.name).toBe("cars");
    expect(codec.decode?.(CHANNELS)).toStrictEqual(kinded(CHANNELS));
  });

  it("asks nothing when the navigation builds no URL", async () => {
    const validator = installSpyValidator(router);

    await expect(router.navigate("decoded", {})).rejects.toThrow(
      "Missing required param 'slug'",
    );

    expect(validator.state.reportCodecRoundTrip).not.toHaveBeenCalled();
  });

  it("asks nothing from a predicate or from the URL direction", async () => {
    const validator = installSpyValidator(router);
    const api = getPluginApi(router);

    router.buildPath("cars", { slug: "bmw" });
    router.isActiveRoute("cars", { slug: "bmw" });
    router.canNavigateTo("cars", { slug: "bmw" });
    api.makeState("cars", { slug: "bmw" });
    api.matchPath("/cars/bmw");

    expect(validator.state.reportCodecRoundTrip).not.toHaveBeenCalled();

    // The control: the same route is asked about from a committing producer.
    await router.navigate("cars", { slug: "bmw" });

    expect(validator.state.reportCodecRoundTrip).toHaveBeenCalledTimes(1);
  });
});
