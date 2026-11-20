import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type {
  DiagnosticEventMap,
  ParamsSearch,
  Route,
  Router,
  State,
  UrlChannels,
} from "@real-router/core";

/**
 * The codec diagnostic's kind (#2905). `navigate` never runs a route's
 * `decodeParams`, so core raises `CODEC_ROUND_TRIP` with what a round trip
 * needs: the state a committing producer builds, the route's two codecs and
 * the path slots its URL prints. What the round trip finds is the plugin's
 * verdict, and `validation-plugin`'s `codec-round-trip.test.ts` owns it.
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

type CodecReport = DiagnosticEventMap["CODEC_ROUND_TRIP"];

/** Every report `router` raises from here on, as the kind's argument tuple. */
function listen(router: Router): CodecReport[] {
  const reports: CodecReport[] = [];

  getPluginApi(router).subscribeDiagnostic("CODEC_ROUND_TRIP", (...report) => {
    reports.push(report);
  });

  return reports;
}

describe("the codec round-trip kind (#2905)", () => {
  let router: Router;

  beforeEach(async () => {
    router = createRouter(ROUTES);
    await router.start("/home");
  });

  afterEach(() => {
    router.stop();
  });

  it("is absent from the port until the kind has a listener, and once it has none", async () => {
    const port = getInternals(router).port();
    const reports: CodecReport[] = [];

    expect(port.reportCodecRoundTrip).toBeUndefined();

    const remove = getPluginApi(router).subscribeDiagnostic(
      "CODEC_ROUND_TRIP",
      (...report) => {
        reports.push(report);
      },
    );

    expect(typeof port.reportCodecRoundTrip).toBe("function");

    await router.navigate("cars", { slug: "bmw" });

    expect(reports).toHaveLength(1);

    remove();

    expect(port.reportCodecRoundTrip).toBeUndefined();

    await router.navigate("cars", { slug: "audi" });

    expect(reports).toHaveLength(1);
  });

  it("hands over the state navigate builds, the route's codecs and its path slots", async () => {
    const reports = listen(router);

    const state = await router.navigate(
      "cars",
      { slug: "bmw" },
      { sort: "name" },
    );
    const [[reported, codec, slots]] = reports;

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

    const reports = listen(rooted);

    await rooted.navigate("cars", { tenant: "acme", slug: "bmw" });

    expect(reports.map((call) => call[2])).toStrictEqual([["tenant", "slug"]]);

    rooted.stop();
  });

  it("hands over the state buildNavigationState returns", () => {
    const reports = listen(router);

    const built = getPluginApi(router).buildNavigationState("cars", {
      slug: "bmw",
    });

    expect(reports.map(([reported]) => reported)).toStrictEqual([built]);
    expect(reports[0][0]).toBe(built);
  });

  it("hands a codec the route does not have over as undefined", async () => {
    const reports = listen(router);

    await router.navigate("decoded", { slug: "bmw" });
    await router.navigate("encoded", { slug: "bmw" });

    const codecs = reports.map(([, codec]) => [
      typeof codec.encode,
      typeof codec.decode,
    ]);

    expect(codecs).toStrictEqual([
      ["undefined", "function"],
      ["function", "undefined"],
    ]);
  });

  it("raises nothing for a route with no codec", async () => {
    const reports = listen(router);

    await router.navigate("plain");

    expect(reports).toStrictEqual([]);
  });

  it("reports the target of a forward, with the target's codecs", async () => {
    const reports = listen(router);

    await router.navigate("old", { slug: "bmw" });

    const [[reported, codec]] = reports;

    expect(reported.name).toBe("cars");
    expect(codec.decode?.(CHANNELS)).toStrictEqual(kinded(CHANNELS));
  });

  it("raises nothing when the navigation builds no URL", async () => {
    const reports = listen(router);

    await expect(router.navigate("decoded", {})).rejects.toThrow(
      "Missing required param 'slug'",
    );

    expect(reports).toStrictEqual([]);
  });

  it("raises nothing from a predicate or from the URL direction", async () => {
    const reports = listen(router);
    const api = getPluginApi(router);

    router.buildPath("cars", { slug: "bmw" });
    router.isActiveRoute("cars", { slug: "bmw" });
    router.canNavigateTo("cars", { slug: "bmw" });
    api.makeState("cars", { slug: "bmw" });
    api.matchPath("/cars/bmw");

    expect(reports).toStrictEqual([]);

    // The control: the same route is reported from a committing producer.
    await router.navigate("cars", { slug: "bmw" });

    expect(reports).toHaveLength(1);
  });
});
