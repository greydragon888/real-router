// Doors: Router.areStatesEqual · state1/state2 and Router.shouldUpdateNode(...) · (toState, fromState).
// Question: are the caller's State objects copied, held, or read by name? And does anything
// downstream key on their IDENTITY (getTransitionPath's 2-entry cache compares to/from by ===)?
import { createRouter } from "@real-router/core";

import type { State } from "@real-router/core/types";

const countingState = (
  source: Record<string, unknown>,
): { state: State; reads: Record<string, number> } => {
  const reads: Record<string, number> = {};
  const s: Record<string, unknown> = {};

  for (const key of Object.keys(source)) {
    reads[key] = 0;
    Object.defineProperty(s, key, {
      enumerable: true,
      get(): unknown {
        reads[key] += 1;

        return source[key];
      },
    });
  }

  return { state: s as unknown as State, reads };
};

const routes = [
  { name: "a", path: "/a/:id", children: [{ name: "b", path: "/b" }] },
  { name: "home", path: "/home" },
];
const router = createRouter(routes as never);

// ── areStatesEqual ────────────────────────────────────────────────────────
const s1 = countingState({
  name: "a.b",
  params: { id: "1" },
  search: { q: "x" },
  path: "/a/1/b",
  context: {},
});
const s2 = countingState({
  name: "a.b",
  params: { id: "1" },
  search: { q: "x" },
  path: "/a/1/b",
  context: {},
});
const equalDefaultArm = router.areStatesEqual(s1.state, s2.state);
const readsDefaultArm = { s1: { ...s1.reads }, s2: { ...s2.reads } };
const equalFullArm = router.areStatesEqual(s1.state, s2.state, false);
const readsFullArm = { s1: { ...s1.reads }, s2: { ...s2.reads } };
// POSITIVE CONTROL: a differing id is unequal.
const s3 = countingState({
  name: "a.b",
  params: { id: "2" },
  search: {},
  path: "/a/2/b",
  context: {},
});
const controlUnequal = router.areStatesEqual(s1.state, s3.state);

// ── shouldUpdateNode ──────────────────────────────────────────────────────
const shouldUpdateA = router.shouldUpdateNode("a");
const to = {
  name: "a.b",
  params: { id: "1" },
  search: {},
  path: "/a/1/b",
  context: {},
} as unknown as State;
const from = {
  name: "a.b",
  params: { id: "2" },
  search: {},
  path: "/a/2/b",
  context: {},
} as unknown as State;
const firstAnswer = shouldUpdateA(to, from);

// Mutate the SAME object so its content now equals `from`'s params …
(to.params as Record<string, unknown>).id = "2";

const sameObjectsAfterMutation = shouldUpdateA(to, from);
const freshObjectSameContent = shouldUpdateA(
  { ...to, params: { ...to.params } } as State,
  from,
);

// Reads by name on shouldUpdateNode:
const cTo = countingState({
  name: "a.b",
  params: { id: "1" },
  search: {},
  path: "/a/1/b",
  context: {},
});
const cFrom = countingState({
  name: "a.b",
  params: { id: "2" },
  search: {},
  path: "/a/2/b",
  context: {},
});
const countedAnswer = shouldUpdateA(cTo.state, cFrom.state);

router.dispose();

console.log(
  JSON.stringify(
    {
      areStatesEqual: {
        equalDefaultArm,
        readsDefaultArm,
        equalFullArm,
        readsFullArm,
        controlUnequal,
      },
      shouldUpdateNode: {
        firstAnswer,
        sameObjectsAfterMutation,
        freshObjectSameContent,
        identityCacheServedStaleAnswer:
          sameObjectsAfterMutation !== freshObjectSameContent,
        countedAnswer,
        readsTo: cTo.reads,
        readsFrom: cFrom.reads,
      },
    },
    null,
    2,
  ),
);
