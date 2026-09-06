// Census-completeness probe: `RouterInternals.systemCommit·toState.transition`
// is censused (adoptForeignBag, one level). Its NESTED `segments` container is
// not — does the caller's `segments` object land in the committed state by
// reference, unfrozen, and is it handed back out through `getState()`?
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);
  const ctx = getInternals(router);

  await router.start("/a");

  // POSITIVE CONTROL: core-built meta after an ordinary navigate is frozen all the way down.
  await router.navigate("b");
  const coreMeta = router.getState()!.transition;
  const control = {
    frozenTransition: Object.isFrozen(coreMeta),
    frozenSegments: Object.isFrozen(coreMeta.segments),
    frozenActivated: Object.isFrozen(coreMeta.segments.activated),
  };

  const appSegments = { deactivated: ["b"], activated: ["a"], intersection: "" };
  const appTransition = {
    phase: "activating",
    reason: "success",
    segments: appSegments,
  };
  const toState = {
    name: "a",
    params: {},
    search: {},
    path: "/a",
    transition: appTransition,
    context: {},
  };

  const committed = ctx.systemCommit(toState as never, router.getState(), { replace: true });
  const live = router.getState()!;

  const after = {
    committedIsGetState: committed === live,
    transitionIsAppObject: live.transition === appTransition,
    transitionFrozen: Object.isFrozen(live.transition),
    segmentsIsAppObject: live.transition.segments === appSegments,
    segmentsFrozen: Object.isFrozen(live.transition.segments),
    activatedFrozen: Object.isFrozen(live.transition.segments.activated),
  };

  // The caller keeps the handle and writes after the commit.
  appSegments.activated.push("injected-after-commit");
  (appSegments as Record<string, unknown>).intersection = "rewritten";
  const afterWrite = {
    activatedSeenThroughGetState: router.getState()!.transition.segments.activated,
    intersectionSeenThroughGetState: router.getState()!.transition.segments.intersection,
  };

  console.log(JSON.stringify({ control, after, afterWrite }, null, 1));
}

void main();
