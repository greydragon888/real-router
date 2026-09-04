import { createRouter } from "@real-router/core";
import { hydrateRouter, serializeRouterState } from "@real-router/ssr-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ssrDataPluginFactory } from "../../../src";

import type { Router } from "@real-router/core";

/**
 * #2060 — the post-hydration scratchpad skip must be keyed by the STATE the
 * payload was built for, not by its route name alone.
 *
 * `hydrateRouter` starts the router at `parsed.path`, so the committed state is
 * derived from that one field. A payload whose `params` / `search` disagree
 * with its own `path` therefore describes a different state than the one being
 * committed — and was served for it anyway, with the loader skipped.
 *
 * ⚠ What this does NOT close, and cannot: a payload whose envelope is
 * self-consistent while its `context` was built for another state. The
 * disagreement is then entirely in opaque data. That residual is a contract,
 * stated in this package's CLAUDE.md.
 *
 * ⚑ The payloads are ROUND-TRIPPED through `serializeRouterState`, not
 * hand-written, and the mismatch rows tweak one field of a real one. A
 * hand-written control here first read `{ tab: "9" }` where core commits the
 * coerced `{ tab: 9 }`, and passed for the wrong reason until the comparison
 * landed.
 */

const routes = [
  { name: "home", path: "/" },
  {
    name: "users",
    path: "/users",
    children: [
      { name: "list", path: "/" },
      { name: "profile", path: "/:id?tab&tag" },
    ],
  },
];

type Payload = Record<string, unknown>;

/** Renders `path` on a "server" and returns the payload it would ship. */
async function serverPayload(path: string, data: unknown): Promise<Payload> {
  const server = createRouter(routes, { defaultRoute: "home" });

  await server.start(path);

  const parsed = JSON.parse(
    serializeRouterState(server.getState()!),
  ) as Payload;

  server.stop();

  return {
    ...parsed,
    context: { ...(parsed.context as Payload), data },
  };
}

/**
 * Each row hands the client a payload that does NOT describe the state the
 * `path` commits. Every one must fall through to the loader.
 */
const MISMATCHES: {
  readonly name: string;
  /** Route whose loader must run; defaults to the param-bearing one. */
  readonly route?: string;
  readonly build: () => Promise<Payload>;
}[] = [
  {
    name: "params name another id",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      path: "/users/7",
    }),
  },
  {
    name: "a search value differs",
    build: async () => ({
      ...(await serverPayload("/users/42?tab=1", "STALE")),
      path: "/users/42?tab=9",
    }),
  },
  {
    name: "an array element differs",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a&tag=b", "STALE")),
      path: "/users/42?tag=a&tag=c",
    }),
  },
  {
    name: "an array is shorter",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a", "STALE")),
      path: "/users/42?tag=a&tag=b",
    }),
  },
  {
    name: "the payload carries a key the state has not",
    build: async () => ({
      ...(await serverPayload("/users/42?tab=1&tag=a", "STALE")),
      path: "/users/42?tab=1",
    }),
  },
  {
    name: "a key is spelled differently",
    build: async () => {
      const payload = await serverPayload("/users/42?tab=1", "STALE");

      return { ...payload, search: { tag: 1 } };
    },
  },
  {
    name: "a channel is a primitive",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      params: "id=42",
    }),
  },
  {
    name: "a channel is an array",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      params: [],
    }),
  },
  {
    name: "a channel is null while the route declares one",
    build: async () => ({
      ...(await serverPayload("/users/42", "STALE")),
      params: null,
    }),
  },
  {
    // ⚑ The row that pins the `Array.isArray` term, and the only one that
    // does. Every other array row is caught first by the key-count check;
    // measured — removing the term left all of them green. Here the committed
    // bag is empty and `Object.keys([])` is empty too, so without the term an
    // empty array would AGREE with a route that declares nothing.
    name: "an empty array stands in for a route that declares no channel",
    route: "users.list",
    build: async () => ({
      ...(await serverPayload("/users/", "STALE")),
      params: [],
    }),
  },
  {
    // ⚑ Pins `Array.isArray(payload)` inside `valuesAgree`. A string is
    // index-addressable and has a `length`, so without that term `"ab"` walks
    // the committed `["a", "b"]` element by element and agrees.
    name: "a string impersonates the repeated-key array it indexes like",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a&tag=b", "STALE")),
      search: { tag: "ab" },
    }),
  },
  {
    // ⚑ Pins the length equality. `committed.every` walks the COMMITTED side,
    // so a LONGER payload is never visited past its prefix — the shorter
    // direction is caught by the element check, this one is not.
    name: "an array is longer than the one the state committed",
    build: async () => ({
      ...(await serverPayload("/users/42?tag=a&tag=b", "STALE")),
      search: { tag: ["a", "b", "c"] },
    }),
  },
  {
    // ⚑ #2064's class, reached through the payload. `channelAgrees` counts the
    // payload channel with `objectKeys` — own AND enumerable — and then asks
    // `hasOwn`, which is own ONLY. A channel whose visible surface is disjoint
    // from the committed one, with the matching key CONCEALED behind
    // `enumerable: false`, satisfies both: the counts agree at one and the
    // membership test vouches for a key the count refused to see.
    name: "a channel conceals its matching key behind enumerable: false",
    build: async () => {
      const payload = await serverPayload("/users/42?tab=1", "STALE");
      const search: Record<string, unknown> = { other: "x" };

      // ⚠ The COERCED value core commits (`{ tab: 1 }`), not the string the
      // URL spells — the trap this file's header records. With the string the
      // row passes for the wrong reason: the values disagree and the concealed
      // key is never what refused it.
      Object.defineProperty(search, "tab", { value: 1, enumerable: false });

      return { ...payload, search };
    },
  },
  {
    // ⚑ Pins `typeof payloadChannel !== "object"`. Same shape as the empty
    // array above: `Object.keys("")` is empty, so a primitive whose key count
    // happens to match would otherwise agree.
    name: "an empty string stands in for a route that declares no channel",
    route: "users.list",
    build: async () => ({
      ...(await serverPayload("/users/", "STALE")),
      params: "",
    }),
  },
  {
    // ⚑ Pins `hasOwn(bag, key)` — the #1835 rule, on this branch's own reader.
    // The key COUNT matches, so nothing upstream refuses it; only the own-key
    // gate does. Without it the inherited `id` answers for the committed one.
    name: "the payload inherits the key it is missing",
    build: async () => {
      const payload = await serverPayload("/users/42", "STALE");

      return {
        ...payload,
        params: Object.create(
          { id: "42" },
          { other: { value: "x", enumerable: true } },
        ) as Record<string, unknown>,
      };
    },
  },
];

let router: Router;

describe("the hydration scratchpad is keyed by state, not route name (#2060)", () => {
  beforeEach(() => {
    router = createRouter(routes, { defaultRoute: "home" });
  });

  afterEach(() => {
    router.stop();
  });

  it.each(MISMATCHES)(
    "$name → the loader runs instead of serving the payload",
    async ({ route, build }) => {
      const loader = vi.fn(() => "FRESH");

      router.usePlugin(
        ssrDataPluginFactory({ [route ?? "users.profile"]: () => loader }),
      );

      const state = await hydrateRouter(
        router,
        (await build()) as unknown as { path: string },
      );

      expect(loader).toHaveBeenCalledTimes(1);
      expect(state.context.data).toBe("FRESH");
    },
  );

  it.each([
    ["/users/42", "plain"],
    ["/users/42?tab=9", "with a query"],
    ["/users/42?tag=a&tag=b", "with a repeated query key"],
  ])(
    "CONTROL — an untouched server payload for %s (%s) still skips the loader",
    async (path) => {
      const loader = vi.fn(() => "FRESH");
      const payload = await serverPayload(path, "FROM-SERVER");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

      const state = await hydrateRouter(
        router,
        payload as unknown as { path: string },
      );

      expect(loader).not.toHaveBeenCalled();
      expect(state.context.data).toBe("FROM-SERVER");
    },
  );

  it("CONTROL — a hand-built payload that omits both channels still skips the loader", async () => {
    const loader = vi.fn(() => "FRESH");

    router.usePlugin(ssrDataPluginFactory({ "users.list": () => loader }));

    // A route with no params and no query: an absent channel is "no keys",
    // which is what `hydrateRouter`'s `{ path }` object source carries.
    const state = await hydrateRouter(router, {
      name: "users.list",
      path: "/users/",
      context: { data: "BUILT-BY-HAND" },
    } as unknown as { path: string });

    expect(loader).not.toHaveBeenCalled();
    expect(state.context.data).toBe("BUILT-BY-HAND");
  });

  it("CONTROL — a payload for a different ROUTE was already refused", async () => {
    const loader = vi.fn(() => "FRESH");
    const payload = await serverPayload("/users/42", "STALE");

    router.usePlugin(ssrDataPluginFactory({ "users.list": () => loader }));

    const state = await hydrateRouter(router, {
      ...payload,
      path: "/users/",
    });

    expect(loader).toHaveBeenCalledTimes(1);
    expect(state.context.data).toBe("FRESH");
  });
});
