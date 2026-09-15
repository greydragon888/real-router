import { createRouter } from "@real-router/core";
import { describe, it, expect } from "vitest";

import { getStaticPaths } from "@real-router/ssr-utils";

function makeRouter(routes: Parameters<typeof createRouter>[0]) {
  return createRouter(routes, { allowNotFound: true });
}

describe("getStaticPaths", () => {
  it("should return paths for static leaf routes", async () => {
    const router = makeRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
    ]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual(["/", "/about"]);

    router.dispose();
  });

  it("should return paths for nested leaf routes only", async () => {
    const router = makeRouter([
      { name: "home", path: "/" },
      {
        name: "users",
        path: "/users",
        children: [
          { name: "list", path: "/" },
          { name: "profile", path: "/:id" },
        ],
      },
    ]);

    const paths = await getStaticPaths(router, {
      "users.profile": async () => [{ params: { id: "1" } }],
    });

    expect(paths).toStrictEqual(["/", "/users", "/users/1"]);

    router.dispose();
  });

  it("should expand dynamic routes via entries", async () => {
    const router = makeRouter([{ name: "posts", path: "/posts/:slug" }]);

    const paths = await getStaticPaths(router, {
      posts: async () => [
        { params: { slug: "hello" } },
        { params: { slug: "world" } },
      ],
    });

    expect(paths).toStrictEqual(["/posts/hello", "/posts/world"]);

    router.dispose();
  });

  it("should return empty array for router with no routes", async () => {
    const router = makeRouter([]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual([]);

    router.dispose();
  });

  it("should handle entries returning empty array", async () => {
    const router = makeRouter([{ name: "posts", path: "/posts/:slug" }]);

    const paths = await getStaticPaths(router, {
      posts: async () => [],
    });

    expect(paths).toStrictEqual([]);

    router.dispose();
  });

  it("should work without entries parameter", async () => {
    const router = makeRouter([{ name: "home", path: "/" }]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual(["/"]);

    router.dispose();
  });

  it("should skip parent routes and only include leaves", async () => {
    const router = makeRouter([
      {
        name: "a",
        path: "/a",
        children: [
          {
            name: "b",
            path: "/b",
            children: [{ name: "c", path: "/c" }],
          },
        ],
      },
    ]);

    const paths = await getStaticPaths(router);

    expect(paths).toStrictEqual(["/a/b/c"]);

    router.dispose();
  });

  it("should handle mixed static and dynamic routes", async () => {
    const router = makeRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "blog", path: "/blog/:slug" },
    ]);

    const paths = await getStaticPaths(router, {
      blog: async () => [
        { params: { slug: "first" } },
        { params: { slug: "second" } },
      ],
    });

    expect(paths).toStrictEqual(["/", "/about", "/blog/first", "/blog/second"]);

    router.dispose();
  });

  it("should ignore entries for non-existent routes", async () => {
    const router = makeRouter([{ name: "home", path: "/" }]);

    const paths = await getStaticPaths(router, {
      nonexistent: async () => [{ params: { id: "1" } }],
    });

    expect(paths).toStrictEqual(["/"]);

    router.dispose();
  });
});

describe("getStaticPaths — the query channel (#1580)", () => {
  it("expands a route whose entries vary a QUERY param", async () => {
    const router = makeRouter([
      { name: "home", path: "/home" },
      { name: "list", path: "/list?sort&page" },
    ]);

    const paths = await getStaticPaths(router, {
      list: async () => [
        { search: { sort: "asc", page: "1" } },
        { search: { sort: "desc", page: "1" } },
        { search: { sort: "asc", page: "2" } },
      ],
    });

    expect(paths).toStrictEqual([
      "/home",
      "/list?sort=asc&page=1",
      "/list?sort=desc&page=1",
      "/list?sort=asc&page=2",
    ]);

    router.dispose();
  });

  it("expands a route that mixes a path slot with a query param", async () => {
    const router = makeRouter([{ name: "doc", path: "/doc/:id?rev" }]);

    const paths = await getStaticPaths(router, {
      doc: async () => [
        { params: { id: "a" }, search: { rev: "1" } },
        { params: { id: "a" }, search: { rev: "2" } },
      ],
    });

    expect(paths).toStrictEqual(["/doc/a?rev=1", "/doc/a?rev=2"]);

    router.dispose();
  });

  it("rejects a key that does not survive into the URL", async () => {
    // The channel is wrong: `sort` is declared with `?`, so a value in the PATH
    // bag is never printed — the manifest would silently collapse to one page.
    const router = makeRouter([{ name: "list", path: "/list?sort" }]);

    await expect(
      getStaticPaths(router, {
        list: async () => [{ params: { sort: "asc" } }],
      }),
    ).rejects.toThrow(/sort/);

    router.dispose();
  });

  it("rejects a key declared by an ANCESTOR, not the leaf", async () => {
    // The leaf's own paramMeta carries no `?q` — only the registry that PRINTS
    // knows, which is why the check asks the URL rather than the declaration.
    const router = makeRouter([
      {
        name: "users",
        path: "/users?q",
        children: [{ name: "list", path: "/list" }],
      },
    ]);

    await expect(
      getStaticPaths(router, {
        "users.list": async () => [{ params: { q: "a" } }],
      }),
    ).rejects.toThrow(/q/);

    router.dispose();
  });

  it("accepts the /items/:id?id collision — the path slot owns the name", async () => {
    // #843/#1549 carve-out: a name that also occupies a path slot is path-owned,
    // so this is legal and prints. A declaration-based check would reject it.
    const router = makeRouter([{ name: "i", path: "/items/:id?id" }]);

    const paths = await getStaticPaths(router, {
      i: async () => [{ params: { id: "V" } }, { params: { id: "W" } }],
    });

    expect(paths).toStrictEqual(["/items/V", "/items/W"]);

    router.dispose();
  });

  it("accepts an entry that supplies nothing and skips the round trip", async () => {
    // A legitimate way to say "generate this page once" for a route with no
    // parameters. Nothing was supplied, so nothing can be lost.
    const router = makeRouter([{ name: "about", path: "/about" }]);

    const paths = await getStaticPaths(router, {
      about: async () => [{}],
    });

    expect(paths).toStrictEqual(["/about"]);

    router.dispose();
  });

  it("names every lost key when more than one is dropped", async () => {
    const router = makeRouter([{ name: "list", path: "/list?sort&page" }]);

    await expect(
      getStaticPaths(router, {
        list: async () => [{ params: { sort: "asc", page: "1" } }],
      }),
    ).rejects.toThrow(/`sort`, `page`[\s\S]*those keys/);

    router.dispose();
  });

  it("treats an `undefined` value as absence, not as a lost key", async () => {
    // `undefined` means "I said nothing" everywhere else in the router
    // (#1550 / #1551) — a removal marker must not fail the build.
    const router = makeRouter([{ name: "list", path: "/list?sort" }]);

    const paths = await getStaticPaths(router, {
      list: async () => [{ search: { sort: undefined } }],
    });

    expect(paths).toStrictEqual(["/list"]);

    router.dispose();
  });

  it("rejects a search key the route declares nowhere under `default`", async () => {
    // The mode gate (#1575) drops it, so the URL cannot carry it — same silent
    // page loss, reached through the other channel.
    const router = createRouter([{ name: "list", path: "/list?sort" }], {
      allowNotFound: true,
      queryParamsMode: "default",
    });

    await expect(
      getStaticPaths(router, {
        list: async () => [{ search: { nope: "x" } }],
      }),
    ).rejects.toThrow(/nope/);

    router.dispose();
  });

  /**
   * A forwarding leaf's entry names a URL no `<Link>` renders (#2256).
   *
   * Since #2250 an href RESOLVES the chain, so `<Link routeName="old">` renders
   * the TARGET's URL. This function prints the LITERAL form, which answers about
   * the route it was NAMED (INVARIANTS #8) — so an entry supplied for the source
   * produces a file at the source's URL while the href that reaches users names
   * one the manifest never produced. On a static host that is a silent 404, and
   * nothing in the build fails.
   *
   * ⚑ **The check asks `forwardState`, the door `buildHref` asks.** Not
   * `buildNavigationState`, which #2256 proposed: both resolve the whole chain
   * and the URL is identical, but the committing door opts into
   * `reportUndeclaredParamKey`, and enumerating a manifest commits nothing —
   * `shared/dom-utils/link-utils.ts` records that choice for the href and this
   * is the same question one layer up. Asking a different door than the href
   * asks is how the check and the thing it checks drift apart.
   *
   * ⚠ **"Forwarding" is decided by BEHAVIOUR, not by a declaration.** The
   * predicate is `forwardState(name, …).name !== name`, so a dynamic
   * `forwardTo: () => …` is covered and a `forwardTo` that resolves to itself
   * costs nothing — the same reason `findLostKeys` above asks the URL rather
   * than the leaf's `paramMeta`.
   *
   * ⚠ It does NOT emit the missing path. `getStaticPaths` is leaf-only by an
   * explicit contract (#608, closed NOT_PLANNED), so inferring a page the author
   * did not enumerate is exactly what that decision refuses. It reports both
   * URLs and leaves the choice to the author.
   */
  describe("a forwarding leaf whose target is not in the manifest (#2256)", () => {
    it("rejects the measured case — the entry names /old/1, the href names /fresh/1", async () => {
      const router = makeRouter([
        { name: "home", path: "/home" },
        { name: "old", path: "/old/:id", forwardTo: "fresh" },
        { name: "fresh", path: "/fresh/:id" },
      ]);

      await expect(
        getStaticPaths(router, {
          old: async () => [{ params: { id: "1" } }],
          fresh: async () => [{ params: { id: "2" } }],
        }),
      ).rejects.toThrow(/\/fresh\/1/);

      router.dispose();
    });

    it("rejects a target that is not a leaf — the shape that needs no params at all", async () => {
      // ⚑ #2256 framed the risk as a target that TAKES PARAMS with differing
      // entry sets. Measured, the trigger is narrower and the shape wider: a
      // parameterless source forwarding to a route with children lands on
      // `/parent`, which a leaf-only enumerator never emits.
      const router = makeRouter([
        { name: "home", path: "/home" },
        { name: "src", path: "/src", forwardTo: "parent" },
        {
          name: "parent",
          path: "/parent",
          children: [{ name: "kid", path: "/kid" }],
        },
      ]);

      await expect(
        getStaticPaths(router, { src: async () => [{ params: {} }] }),
      ).rejects.toThrow(/\/parent/);

      router.dispose();
    });

    it("CONTROL — a forwarding leaf whose target IS in the manifest passes", async () => {
      // `bare -> home`, where `home` is a parameterless leaf the walk emits
      // anyway. This is the arm that must stay silent, and it is why the check
      // compares against the manifest rather than refusing `forwardTo` outright.
      const router = makeRouter([
        { name: "home", path: "/home" },
        { name: "bare", path: "/bare", forwardTo: "home" },
      ]);

      await expect(
        getStaticPaths(router, { bare: async () => [{ params: {} }] }),
      ).resolves.toStrictEqual(["/home", "/bare"]);

      router.dispose();
    });

    it("CONTROL — a forwarding leaf with NO entry is not checked", async () => {
      // The contract is a consistency check over what the author DID enumerate.
      // Without an entry there is nothing supplied to be inconsistent with, and
      // the leaf walk's own `buildPath(name, {})` already answers for it.
      const router = makeRouter([
        { name: "home", path: "/home" },
        { name: "bare", path: "/bare", forwardTo: "home" },
      ]);

      await expect(getStaticPaths(router)).resolves.toStrictEqual([
        "/home",
        "/bare",
      ]);

      router.dispose();
    });

    it("CONTROL — a non-forwarding leaf costs no resolution", async () => {
      const router = makeRouter([
        { name: "home", path: "/home" },
        { name: "u", path: "/u/:id" },
      ]);

      await expect(
        getStaticPaths(router, { u: async () => [{ params: { id: "7" } }] }),
      ).resolves.toStrictEqual(["/home", "/u/7"]);

      router.dispose();
    });
  });
});
