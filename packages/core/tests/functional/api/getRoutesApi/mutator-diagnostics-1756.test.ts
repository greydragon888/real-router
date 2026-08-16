import { describe, it, expect, vi } from "vitest";

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

/**
 * A route-CRUD diagnostic must not assert an action the call did not perform
 * (#1756).
 *
 * Both defects had the same shape: the in-flight message named the operation
 * ("Route X removed", "Updating route X") and was emitted ABOVE the check that
 * decides whether the operation happens at all. So a name that is not a route
 * was told its removal / update was under way — `remove()` then contradicted
 * itself one line later with "not found. No changes made.", and `update()` said
 * nothing at all, which is worse.
 *
 * ⚑ The class is closed at TWO members, and the first assertion is what keeps
 * it closed: only a mutator that takes a route NAME can be handed one that does
 * not exist. `clear` / `replace` / `setRootPath` take none, and `add` creates
 * the name it is given. So the surface pin below is the class-guard — a new
 * member forces whoever adds it to classify it here, which is the step both of
 * these sites skipped.
 */
describe("route-CRUD diagnostics do not announce what did not happen (#1756)", () => {
  const routes = [
    { name: "home", path: "/home" },
    { name: "other", path: "/other" },
    {
      name: "admin",
      path: "/admin",
      children: [{ name: "panel", path: "/panel" }],
    },
  ];

  /** Runs `act` from inside an activation guard — i.e. mid-navigation. */
  const logsFrom = async (
    act: (api: ReturnType<typeof getRoutesApi>) => void,
  ): Promise<string> => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = createRouter(routes, { allowNotFound: true });

    await r.start("/home");

    getLifecycleApi(r).addActivateGuard("admin.panel", () => () => {
      act(getRoutesApi(r));

      return true;
    });

    await r.navigate("admin.panel");

    const logged = [...warnSpy.mock.calls, ...errorSpy.mock.calls]
      .map((call) => String(call[0]))
      .join("\n");

    warnSpy.mockRestore();
    errorSpy.mockRestore();
    r.dispose();

    return logged;
  };

  it("the name-taking mutators are exactly the two classified below", () => {
    // A new member here is not a failure — it is a question: can it be handed a
    // route name that does not exist? If yes, it belongs in the table below.
    expect(
      Object.keys(getRoutesApi(createRouter(routes))).toSorted((a, b) =>
        a.localeCompare(b),
      ),
    ).toStrictEqual([
      "add",
      "clear",
      "get",
      "has",
      "remove",
      "replace",
      "subscribeChanges",
      "update",
    ]);
  });

  const CELLS = [
    {
      op: "remove",
      claim: 'Route "nope" removed',
      liveClaim: 'Route "other" removed',
      run: (api: ReturnType<typeof getRoutesApi>, name: string) => {
        api.remove(name);
      },
    },
    {
      op: "update",
      claim: 'Updating route "nope"',
      liveClaim: 'Updating route "other"',
      run: (api: ReturnType<typeof getRoutesApi>, name: string) => {
        api.update(name, { defaultParams: { a: "1" } });
      },
    },
  ] as const;

  describe.each(CELLS)("$op", (cell) => {
    it(`${cell.op}() says nothing about a name that is not a route`, async () => {
      const logged = await logsFrom((api) => {
        cell.run(api, "nope");
      });

      expect(logged).not.toContain(cell.claim);
      expect(logged).not.toContain("navigation is in progress");
    });

    it(`CONTROL — ${cell.op}() still reports when the route really is there`, async () => {
      const logged = await logsFrom((api) => {
        cell.run(api, "other");
      });

      expect(logged).toContain(cell.liveClaim);
      expect(logged).toContain("navigation is in progress");
    });

    it(`${cell.op}() reports nothing on an IDLE router`, async () => {
      // ⚠ The other half of the same condition, and it was NOT pinned for
      // `remove`: dropping its `isTransitioning()` term left all 4173 tests
      // green, so an idle removal could have started announcing a navigation
      // that does not exist. Found by mutating the term rather than by reading
      // it — the CONTROL above passes either way, because it navigates.
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const r = createRouter(routes, { allowNotFound: true });

      await r.start("/home");

      cell.run(getRoutesApi(r), "other");

      const logged = [...warnSpy.mock.calls, ...errorSpy.mock.calls]
        .map((call) => String(call[0]))
        .join("\n");

      expect(logged).not.toContain("navigation is in progress");

      warnSpy.mockRestore();
      errorSpy.mockRestore();
      r.dispose();
    });
  });
});
