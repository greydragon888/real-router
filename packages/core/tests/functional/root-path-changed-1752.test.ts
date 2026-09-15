import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Route, TreeChangedEvent } from "@real-router/core";

/**
 * `setRootPath` announces itself on the tree-change channel (#1752 gap A).
 *
 * It rebuilds the tree AND the matcher in place, so every path in the tree
 * resolves somewhere new — and it did so silently. A consumer holding anything
 * keyed by URL therefore kept entries that resolve to nothing.
 *
 * ⚑ **This reverses a recorded decision, and the reason is dated.** The
 * tree-mutation RFC closed О-6 with "no emission", on the ground that
 * `TREE_CHANGED` consumers want to know WHICH routes changed rather than where
 * the base moved. That was true of every consumer on 2026-06-06. On 2026-06-28
 * #805 shipped `preload-plugin`'s `default` branch, whose contract is the
 * opposite — *any* structural mutation restales its href-keyed cache — and it is
 * the measured victim here. The RFC itself named the reopening condition ("если
 * real use case появится"); this is it.
 *
 * ⚠ **A member, not a separate event** — О-6 prescribed `ROOT_PATH_CHANGED` on
 * its own channel. Measured against that: `preload-plugin`'s `default` already
 * absorbs a new `op` and needs no edit, while a second channel means a second
 * subscription for one consumer plus a new public door. The union's own docblock
 * instructs consumers to `switch` with an exhaustive `default` and not to rely
 * on "absence of future fields", so a member is the channel's documented
 * extension path; `clear`'s payload is already *what was* rather than a route
 * delta, so the union is not purely route-shaped either.
 */
const ROUTES: readonly Route[] = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

const collect = (
  router: ReturnType<typeof createRouter>,
): TreeChangedEvent[] => {
  const seen: TreeChangedEvent[] = [];

  getRoutesApi(router).subscribeChanges((event) => {
    seen.push(event);
  });

  return seen;
};

describe("setRootPath announces the move (#1752)", () => {
  it("emits, and carries both roots", () => {
    const router = createRouter([...ROUTES]);
    const seen = collect(router);

    getPluginApi(router).setRootPath("/app");

    expect(seen.map((event) => event.op)).toStrictEqual(["rootPath"]);
    expect(seen[0]).toStrictEqual({
      op: "rootPath",
      previous: "",
      next: "/app",
    });
    expect(router.buildPath("a")).toBe("/app/a");

    router.dispose();
  });

  it("CONTROL — the channel still carries the route ops, in order", () => {
    // Without this the cell above passes on a channel that emits nothing else,
    // which is what "a new op" must NOT turn it into.
    const router = createRouter([...ROUTES]);
    const seen = collect(router);

    getRoutesApi(router).add([{ name: "c", path: "/c" }]);
    getPluginApi(router).setRootPath("/app");
    getRoutesApi(router).clear();

    expect(seen.map((event) => event.op)).toStrictEqual([
      "add",
      "rootPath",
      "clear",
    ]);

    router.dispose();
  });

  it("CONTROL — a root that does not move announces nothing", () => {
    // The emit is about a CHANGE. Re-declaring the same root rebuilds nothing a
    // consumer can observe, so announcing it would train consumers to ignore the
    // op — the failure mode a chatty channel has.
    const router = createRouter([...ROUTES]);

    getPluginApi(router).setRootPath("/app");

    const seen = collect(router);

    getPluginApi(router).setRootPath("/app");

    expect(seen).toStrictEqual([]);

    router.dispose();
  });

  it("CONTROL — a refused change announces nothing", async () => {
    // The in-flight gate (#1755) returns `false` and leaves the root alone. An
    // event there would say a move happened that did not.
    const router = createRouter([...ROUTES]);

    await router.start("/a");

    const seen = collect(router);
    let applied: boolean | undefined;

    router.subscribeLeave(() => {
      applied = getPluginApi(router).setRootPath("/app");
    });

    await router.navigate("b");

    expect(applied).toBe(false);
    expect(seen.filter((event) => event.op === "rootPath")).toStrictEqual([]);

    router.dispose();
  });
});
