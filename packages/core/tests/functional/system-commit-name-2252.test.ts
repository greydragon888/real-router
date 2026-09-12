import { beforeEach, describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { Router, State } from "@real-router/core/types";

/**
 * `systemCommit` refuses a name the table does not hold, as its sibling does
 * (#2252).
 *
 * Both members take a caller-supplied `State` and the door register groups them
 * as one mechanism, but only `navigateToState` asked. `getInternals` ships from
 * `@real-router/core/validation`, and `systemCommit` is how a URL plugin
 * publishes a state built from the address bar — so a `history.state` entry
 * deserialised from an older build, or written by another app on the same
 * origin, is exactly the shape that arrives.
 *
 * ⚠ **The predicate is EXISTENCE, not "the name is a string".** The issue
 * reported an object; a number, an absent slot and an unknown string were all
 * committed too, and one check refuses the four of them.
 *
 * ⚠ **It THROWS where the sibling rejects**, and that is not the asymmetry
 * `internals.ts` records: this member returns a `State` synchronously and has no
 * promise to reject.
 */
let router: Router;

const foreign = (name: unknown): State =>
  ({ name, params: {}, search: {}, path: "/home" }) as unknown as State;

const commit = (state: State): State =>
  getInternals(router).systemCommit(state, router.getState(), {});

/**
 * ⚑ Named and counted, not inline: an `it.each([])` registers no cells in
 * silence, so the length assertion below is the only thing that tells a table
 * which shrank to nothing from one that passed (`table-vacuity-authority`).
 */
const BAD_NAMES: readonly { label: string; name: unknown }[] = [
  { label: "an object", name: { evil: true } },
  { label: "a number", name: 42 },
  { label: "absent", name: undefined },
  { label: "a string the table never held", name: "nope" },
];

describe("systemCommit refuses a name the table does not hold (#2252)", () => {
  beforeEach(async () => {
    router = createRouter([
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id" },
    ]);
    await router.start("/home");
  });

  it("covers every shape the issue and the matrix found", () => {
    expect(BAD_NAMES).toHaveLength(4);
  });

  it.each(BAD_NAMES)(
    "refuses $label, and the committed state is untouched",
    ({ name }) => {
      expect(() => commit(foreign(name))).toThrow();

      // ⚑ The second half, and the one that matters: a throw the caller
      // swallows must still leave `getState()` alone. Without it the cell
      // passes on a door that threw AFTER publishing.
      expect(router.getState()?.name).toBe("home");
    },
  );

  it("CONTROL — a well-formed state still commits", () => {
    const built = getInternals(router).makeState("u", { id: "7" }, {}, "/u/7");

    commit(built);

    expect(router.getState()?.name).toBe("u");
  });

  it("UNKNOWN_ROUTE stays legal THROUGH THIS DOOR, not merely through its own", () => {
    // ⚠ The carve-out has to be exercised where it lives. Calling
    // `router.navigateToNotFound` reaches `systemCommit` through the wiring
    // port, NOT through the `RouterInternals` adapter — measured: that cell
    // passed with the carve-out deleted, so it pinned nothing.
    router.navigateToNotFound("/gone");

    const notFound = router.getState()!;

    expect(notFound.name).toBe("@@router/UNKNOWN_ROUTE");

    // Re-commit the SAME state through the internal door. A guard without the
    // carve-out refuses it, because the table holds no such route.
    expect(() => commit(notFound)).not.toThrow();
    expect(router.getState()?.name).toBe("@@router/UNKNOWN_ROUTE");
  });

  it("CONTROL — core's own replace() revalidation still commits through it", () => {
    // ⚠ The internal caller. `systemCommit` is reached from `getRoutesApi`'s
    // revalidation, so a guard here is not only a boundary check — this cell is
    // what says the guard did not close core's own path.
    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id" },
    ]);

    expect(router.getState()?.name).toBe("home");
  });
});
