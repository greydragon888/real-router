import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { describe, expect, it } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import { createMockSchema } from "./test-utils";

import type { Params, Router } from "@real-router/core";
import type { StandardSchemaV1 } from "@real-router/search-schema-plugin";

/**
 * The schema governs the QUERY channel — nothing else (#1564).
 *
 * The interceptor used to pick the bag it validates from the call shape
 * (`routeSearch !== undefined`), which is not the same question: on the
 * State→URL direction a v1 single-bag caller's query rides in the params bag
 * TOGETHER with the route's path params, and anything an inner interceptor
 * wrote into `search` was invisible. So a query schema rewrote (and, in strict
 * mode, deleted) path params, and never saw the query channel on a plain
 * `navigate`.
 *
 * Every fixture here declares a PATH param — the whole existing suite uses
 * param-less routes, which is what masked the defect.
 */
describe("Search schema plugin — the query channel is what gets validated (#1564)", () => {
  /** Records what the schema was handed; echoes it back lowercased. */
  const recordingSchema = (seen: Params[]): StandardSchemaV1 =>
    createMockSchema({
      validate: (value) => {
        const bag = value as Params;

        seen.push({ ...bag });

        return {
          value: Object.fromEntries(
            Object.entries(bag).map(([key, val]) => [
              key,
              typeof val === "string" ? val.toLowerCase() : val,
            ]),
          ),
        };
      },
    });

  /** Strict `q`-only schema: returns just `q`, dropping everything else. */
  const qOnlySchema = (seen: Params[]): StandardSchemaV1 =>
    createMockSchema({
      validate: (value) => {
        const bag = value as Params;

        seen.push({ ...bag });

        return { value: bag.q === undefined ? {} : { q: bag.q } };
      },
    });

  it("never hands a path param to the schema", async () => {
    const seen: Params[] = [];
    const router: Router = createRouter([
      { name: "home", path: "/" },
      {
        name: "search",
        path: "/search/:id?q",
        searchSchema: recordingSchema(seen),
      },
    ]);

    router.usePlugin(searchSchemaPlugin({ mode: "production" }));
    await router.start("/");

    const state = await router.navigate("search", { id: "AB", q: "X" });

    expect(seen.at(-1)).toStrictEqual({ q: "X" });
    // The path param keeps the caller's value — a query schema must not
    // rewrite the path channel.
    expect(state.params).toStrictEqual({ id: "AB" });
    expect(state.search).toStrictEqual({ q: "x" });
    expect(state.path).toBe("/search/AB?q=x");

    router.stop();
  });

  it("does not strip a path param in strict mode", async () => {
    const seen: Params[] = [];
    const router: Router = createRouter([
      { name: "home", path: "/" },
      {
        name: "search",
        path: "/search/:id?q",
        searchSchema: qOnlySchema(seen),
      },
    ]);

    router.usePlugin(searchSchemaPlugin({ mode: "production", strict: true }));
    await router.start("/");

    const state = await router.navigate("search", { id: "7", q: "x" });

    expect(seen.at(-1)).toStrictEqual({ q: "x" });
    expect(state.path).toBe("/search/7?q=x");

    router.stop();
  });

  it("validates the query channel an inner interceptor wrote into", async () => {
    const seen: Params[] = [];
    const router: Router = createRouter([
      { name: "home", path: "/" },
      {
        name: "search",
        path: "/search/:id?q&lang",
        searchSchema: recordingSchema(seen),
      },
    ]);

    // Registered BEFORE the plugin ⇒ innermost ⇒ the schema (outermost, the
    // recommended composition order) must observe what it injected.
    getPluginApi(router).addInterceptor(
      "forwardState",
      (next, name, params, search) => {
        const result = next(name, params, search);

        return { ...result, search: { ...result.search, lang: "EN" } };
      },
    );
    router.usePlugin(searchSchemaPlugin({ mode: "production" }));
    await router.start("/");

    const state = await router.navigate("search", { id: "1", q: "X" });

    expect(seen.at(-1)).toStrictEqual({ q: "X", lang: "EN" });
    expect(state.search).toStrictEqual({ q: "x", lang: "en" });

    router.stop();
  });

  it("still strips an unknown QUERY key in strict mode", async () => {
    const seen: Params[] = [];
    const router: Router = createRouter([
      {
        name: "home",
        path: "/",
      },
      {
        name: "search",
        path: "/search/:id?q&extra",
        searchSchema: qOnlySchema(seen),
      },
    ]);

    router.usePlugin(searchSchemaPlugin({ mode: "production", strict: true }));
    await router.start("/");

    const state = await router.navigate("search", {
      id: "7",
      q: "x",
      extra: "gone",
    });

    expect(state.search).toStrictEqual({ q: "x" });
    expect(state.params).toStrictEqual({ id: "7" });

    router.stop();
  });

  it("counts an ANCESTOR's path slot as path, not query", async () => {
    const seen: Params[] = [];
    const router: Router = createRouter([
      { name: "home", path: "/" },
      {
        name: "org",
        path: "/org/:orgId",
        children: [
          {
            name: "search",
            path: "/search/:id?q",
            searchSchema: qOnlySchema(seen),
          },
        ],
      },
    ]);

    router.usePlugin(searchSchemaPlugin({ mode: "production", strict: true }));
    await router.start("/");

    const state = await router.navigate("org.search", {
      orgId: "acme",
      id: "7",
      q: "x",
    });

    expect(seen.at(-1)).toStrictEqual({ q: "x" });
    expect(state.path).toBe("/org/acme/search/7?q=x");

    router.stop();
  });

  it("drops the ancestors' slots for an ABSOLUTE child", async () => {
    const seen: Params[] = [];
    const router: Router = createRouter([
      { name: "home", path: "/" },
      {
        name: "org",
        path: "/org/:orgId",
        children: [
          {
            name: "search",
            path: "~/search/:id?q",
            searchSchema: recordingSchema(seen),
          },
        ],
      },
    ]);

    router.usePlugin(searchSchemaPlugin({ mode: "production" }));
    await router.start("/");

    // `orgId` is not part of an absolute child's URL, so it is not a path slot
    // here — the schema sees it as an ordinary query key and lowercases it.
    const state = await router.navigate("org.search", {
      orgId: "ACME",
      id: "AB",
      q: "X",
    });

    expect(seen.at(-1)).toStrictEqual({ orgId: "ACME", q: "X" });
    expect(state.params.id).toBe("AB");
    expect(state.path).toBe("/search/AB?q=x");

    router.stop();
  });

  it("validates the same query on both directions of the same URL", async () => {
    const seen: Params[] = [];
    const routes = [
      { name: "home", path: "/" },
      {
        name: "search",
        path: "/search/:id?q",
        searchSchema: recordingSchema(seen),
      },
    ];

    const intent: Router = createRouter(routes);

    intent.usePlugin(searchSchemaPlugin({ mode: "production" }));
    await intent.start("/");
    await intent.navigate("search", { id: "9", q: "X" });

    const fromIntent = seen.at(-1);

    intent.stop();

    const parsed: Router = createRouter(routes);

    parsed.usePlugin(searchSchemaPlugin({ mode: "production" }));
    await parsed.start("/search/9?q=X");

    expect(seen.at(-1)).toStrictEqual(fromIntent);

    parsed.stop();
  });
});
