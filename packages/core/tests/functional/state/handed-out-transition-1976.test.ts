import { readFileSync } from "node:fs";
import path from "node:path";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import type { State } from "@real-router/core/types";

const SRC_DIR = path.resolve(__dirname, "../../../src");

/**
 * The doors this file exercises, by the member name the scan below reports.
 *
 * ⚠ Hand-enumerated ONCE, and then checked against the compiler — because the
 * hand list was wrong. The first version of this file called itself "every door"
 * and had never heard of THREE: `navigateToDefault`, `revalidateToNotFound`,
 * and `navigateToState` — the last of them the door whose producer this very fix
 * changed. The cell below is what found them, and it is what keeps this list
 * honest; no total is written down, because the list IS the total.
 */
const DOORS = [
  "buildNavigationState",
  "getPreviousState",
  "getState",
  "makeState",
  "matchPath",
  "navigate",
  "navigateToDefault",
  "navigateToNotFound",
  "navigateToState",
  "revalidateToNotFound",
  "start",
  "systemCommit",
] as const;

/**
 * Members of the public surface whose return type mentions `State` but which
 * hand nothing BACK — each named, with why, so the set below stays a closed
 * claim rather than a filter that quietly grows.
 *
 * These are payload FIELDS of `subscribe` / `subscribeLeave`, i.e. states the
 * router passes IN. They are `pending-target-authority`'s subject, and covering
 * them here would duplicate that matrix rather than extend this one.
 */
const NOT_DOORS = new Set(["route", "previousRoute", "nextRoute"]);

/** Every public member whose declared return type mentions a `State`. */
function stateReturningMembers(): string[] {
  const files = [
    "Router.ts",
    "internals.ts",
    "types/api.ts",
    "types/router.ts",
  ].map((f) => path.join(SRC_DIR, f));

  const names = new Set<string>();

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      /* setParentNodes */ true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node): void => {
      const named =
        ts.isMethodDeclaration(node) ||
        ts.isMethodSignature(node) ||
        ts.isPropertySignature(node);

      if (named && node.type !== undefined && node.name !== undefined) {
        const returns = node.type.getText(source).replaceAll(/\s+/g, " ");
        const name = node.name.getText(source);

        // A DOOR returns a state. A listener parameter list mentions one too,
        // and so does a callback typed `=> void` / `=> boolean`; neither hands
        // anything back to the caller of the member.
        if (
          /\bState\b/.test(returns) &&
          !/=>\s*(void|boolean)/.test(returns) &&
          !name.startsWith("#")
        ) {
          names.add(name);
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return [...names].toSorted((a, b) => a.localeCompare(b));
}

/**
 * The RETURN side of #1976: every door that hands a `State` back to a caller
 * hands back one that carries `transition`.
 *
 * `pending-target-authority` is the complement — it walks the surfaces a state
 * is passed INTO (guards, plugin hooks, event listeners, `subscribeLeave`).
 * This file closes the other half of the circle, because the entry points that
 * RETURN a state are a different set: `matchPath`, `makeState`,
 * `buildNavigationState`, `navigateToState`, `revalidateToNotFound` and
 * `systemCommit` reach no listener at all.
 *
 * ⚠ "Every door" is a claim, and the hand-written version of it was FALSE —
 * three doors were missing. The list is checked against the compiler now: see
 * `DOORS` and the cell that derives it.
 *
 * ⚑ Written as one table rather than a cell per door, on purpose. The failure
 * this guards is a producer added or changed WITHOUT its door being thought of,
 * so what has to be cheap is adding the next door to the list — and what has to
 * be impossible is a door drifting out of it unnoticed.
 *
 * ⚠ **This table and the matrix are complementary BY MEASUREMENT.** Deleting
 * the field from each writable producer in turn:
 *
 * | producer                            | reds here | reds the matrix |
 * | ----------------------------------- | --------- | --------------- |
 * | `pipeline/materializePending`       | yes       | yes             |
 * | `NavigationNamespace.#copyChannels` | **no**    | yes             |
 *
 * The second row is why both files exist: `completeTransition` overwrites the
 * slot before any door here returns, so a `start()`-path shell built without the
 * field is INVISIBLE from the return side — that gap lives only while the state
 * is pending, which is where the matrix looks. Re-measured after this table grew
 * a direct `navigateToState` call, `#copyChannels`'s own door and the obvious
 * way for the answer to flip; it does not.
 *
 * ⚠ **`systemCommit` is the one door whose row is `ABSENT`, and that is pinned,
 * not fixed.** It is the only place a state enters core from OUTSIDE
 * (`getInternals` is published), and it preserves a caller's missing
 * `transition` rather than substituting one — so `getState().transition` can be
 * `undefined` there, which `State.transition` declares impossible.
 * `RoutesNamespace.shouldUpdateNode` reads that slot through `?.` for exactly
 * this reason. Whether the door should fill the default instead is a decision
 * about a published surface, and this cell exists so the current answer is
 * visible rather than assumed.
 */
describe("every door hands back a State carrying transition (#1976)", () => {
  function mk() {
    return createRouter([
      { name: "home", path: "/home" },
      { name: "next", path: "/next" },
      { name: "q", path: "/q?filter" },
    ]);
  }

  const shape = (state: unknown): string => {
    const value = (state as { transition?: unknown } | null | undefined)
      ?.transition;

    if (value === undefined) {
      return "ABSENT";
    }

    return typeof (value as { reason?: unknown }).reason === "string"
      ? "TransitionMeta"
      : "NOT-A-TRANSITION";
  };

  it("the whole set of doors, in one assertion", async () => {
    const router = mk();
    const table: Record<string, string> = {};

    const started = await router.start("/home");

    table["start() resolves"] = shape(started);
    table["getState() after start"] = shape(router.getState());

    const navigated = await router.navigate("next");

    table["navigate() resolves"] = shape(navigated);
    table["getState() after navigate"] = shape(router.getState());
    table["getPreviousState()"] = shape(router.getPreviousState());

    // ⚠ `matchPath` is on the PLUGIN surface, not the facade.
    table["matchPath()"] = shape(getPluginApi(router).matchPath("/q?filter=a"));
    table["makeState()"] = shape(
      getPluginApi(router).makeState("next", {}, {}, "/next"),
    );
    table["buildNavigationState()"] = shape(
      getPluginApi(router).buildNavigationState("q", {}, { filter: "a" }),
    );

    // The published commit door, handed a state a caller built by hand with no
    // `transition` at all — the one shape core cannot prevent from ARRIVING.
    const foreign = {
      name: "next",
      params: {},
      search: {},
      path: "/next",
      context: {},
    } as unknown as State;

    table["systemCommit(foreign) returns"] = shape(
      getInternals(router).systemCommit(foreign, router.getState(), {}),
    );
    table["getState() after that commit"] = shape(router.getState());

    // ⚑ The three the hand-written list had never heard of. `navigateToState`
    // is the sharpest of them: it is the door whose producer THIS fix changed,
    // and the table that exists to guard the fix did not call it.
    table["navigateToState(foreign) resolves"] = shape(
      await getInternals(router).navigateToState({
        name: "home",
        params: {},
        search: {},
        path: "/home",
        context: {},
      } as unknown as State),
    );
    table["revalidateToNotFound() returns"] = shape(
      getInternals(router).revalidateToNotFound("/nope"),
    );

    expect(table).toStrictEqual({
      "start() resolves": "TransitionMeta",
      "getState() after start": "TransitionMeta",
      "navigate() resolves": "TransitionMeta",
      "getState() after navigate": "TransitionMeta",
      "getPreviousState()": "TransitionMeta",
      "matchPath()": "TransitionMeta",
      "makeState()": "TransitionMeta",
      "buildNavigationState()": "TransitionMeta",
      // ⚠ The ONE door where the answer is not `TransitionMeta`, and it is
      // pinned rather than fixed here — see the ⚠ in this file's banner.
      "systemCommit(foreign) returns": "ABSENT",
      "getState() after that commit": "ABSENT",
      "navigateToState(foreign) resolves": "TransitionMeta",
      "revalidateToNotFound() returns": "TransitionMeta",
    });

    router.dispose();
  });

  it("navigateToNotFound's hand-built state too", async () => {
    // Its own door, and its own producer: it wraps a URL instead of building
    // from an intent, so it never passes through the pipeline. It has always
    // carried `transition` — this is here so that "every door" means every one,
    // not "every one the fix touched".
    const router = createRouter([{ name: "home", path: "/home" }], {
      allowNotFound: true,
    });

    await router.start("/home");

    expect(shape(router.navigateToNotFound("/nope"))).toBe("TransitionMeta");

    router.dispose();
  });

  it("and replace()'s revalidation state, which no listener sees", async () => {
    // The two spread-derived producers in `getRoutesApi`. They inherit the
    // field rather than writing it, so they are the arm of the guarantee that
    // depends on the producers UPSTREAM being right — which is exactly why they
    // belong in a table about doors rather than in one about producers.
    const router = createRouter([
      { name: "home", path: "/home" },
      { name: "x", path: "/a" },
    ]);

    await router.start("/a");

    let seen = "guard never ran";

    getRoutesApi(router).replace([
      { name: "home", path: "/home" },
      {
        name: "y",
        path: "/a",
        canActivate: () => (toState: State) => {
          seen = shape(toState);

          return true;
        },
      },
    ] as never);

    expect(seen).toBe("TransitionMeta");

    router.dispose();
  });

  it("navigateToDefault, which needs a router the table's does not", async () => {
    // The third door the hand-written list missed. It is not in the table above
    // only because it needs `defaultRoute` configured, and giving the shared
    // router one would change what every other row is measuring.
    const router = createRouter(
      [
        { name: "home", path: "/home" },
        { name: "next", path: "/next" },
      ],
      { defaultRoute: "home" },
    );

    await router.start("/next");

    expect(shape(await router.navigateToDefault())).toBe("TransitionMeta");

    router.dispose();
  });

  it("the door list is DERIVED, not remembered", () => {
    // The closing check this file was missing, and the reason it was missing
    // three doors. `DOORS` is checked against every public member whose declared
    // return type mentions a `State`; anything new has to be added to the table
    // above or named in `NOT_DOORS` with a reason, and nothing can be forgotten
    // in silence.
    //
    // ⚠ This is the same failure the fix itself hit one layer down: the issue
    // named one producer and there were three, found by a matrix rather than by
    // review. A hand-written list of surfaces is exactly what keeps being wrong,
    // so this one is not hand-written any more.
    expect(
      stateReturningMembers().filter((name) => !NOT_DOORS.has(name)),
    ).toStrictEqual([...DOORS]);
  });

  it("CONTROL — the probe can tell the three answers apart", () => {
    // Non-vacuity: if `shape` collapsed to "TransitionMeta" the table above
    // would agree for the wrong reason, and the defect it exists for produces
    // exactly the ABSENT answer.
    expect(shape(undefined), "no state at all").toBe("ABSENT");
    expect(shape({ name: "a" }), "a state with no transition").toBe("ABSENT");
    expect(shape({ transition: {} }), "the borrowed empty object").toBe(
      "NOT-A-TRANSITION",
    );
    expect(shape({ transition: { reason: "success" } }), "and a real one").toBe(
      "TransitionMeta",
    );
  });
});
