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
    async ({ build }) => {
      const loader = vi.fn(() => "FRESH");

      router.usePlugin(ssrDataPluginFactory({ "users.profile": () => loader }));

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
