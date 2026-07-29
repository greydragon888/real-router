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
});
