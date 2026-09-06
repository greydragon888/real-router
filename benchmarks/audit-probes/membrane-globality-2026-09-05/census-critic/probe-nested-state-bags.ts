// Census-critic probe 3: the nested bags of a foreign State at the two commit
// doors — `navigateToState·state.{params,search}` and
// `systemCommit·toState.{params,search,transition.segments}`. The census lists
// `.context` and `.transition` as nested doors but not `.params` / `.search`
// (same position, same mechanism — adoptForeignBag), and nothing below
// `.transition` although adoptForeignBag copies ONE level: `segments` is the
// caller's object, retained by reference inside the committed State.
//
// Positive control: `.context` (listed) — copied container, leaf by reference.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-nested-state-bags.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    {} as never,
  );
  const ctx = getInternals(router);
  const api = getPluginApi(router);

  await router.start("/home");

  // ---- navigateToState: params / search / context / transition
  const p = countingBag({ id: "1" });
  const s = countingBag({ tab: "x" });
  const leaf = { leaf: true };
  const foreignTransition = {
    phase: "activating",
    reason: "success",
    segments: { deactivated: [], activated: ["app"], intersection: "" },
  };
  const foreign = {
    name: "u",
    params: p.bag,
    search: s.bag,
    path: "/u/1?tab=x",
    context: { c: leaf },
    transition: foreignTransition,
  };
  const committed = await api.navigateToState(foreign as never);
  const state = router.getState()!;

  const navigateToState = {
    committedIsGetState: committed === state,
    params: {
      copied: state.params !== p.bag,
      frozen: Object.isFrozen(state.params),
      readsPerKey: { ...p.reads },
      value: state.params,
    },
    search: {
      copied: state.search !== s.bag,
      frozen: Object.isFrozen(state.search),
      readsPerKey: { ...s.reads },
      value: state.search,
    },
    control_context: {
      containerCopied: state.context !== foreign.context,
      leafByReference: (state.context as { c: unknown }).c === leaf,
    },
    transition: {
      callersTransitionRetained: state.transition === foreignTransition,
      callersSegmentsRetained:
        state.transition.segments === foreignTransition.segments,
      phaseSeen: state.transition.phase,
    },
  };

  // ---- systemCommit: params / search / transition / transition.segments
  const p2 = countingBag({ id: "2" });
  const s2 = countingBag({ tab: "y" });
  const appSegments = {
    deactivated: [] as string[],
    activated: ["app"],
    intersection: "",
  };
  const appTransition = {
    phase: "activating",
    reason: "success",
    segments: appSegments,
  };
  const foreign2 = {
    name: "u",
    params: p2.bag,
    search: s2.bag,
    path: "/u/2?tab=y",
    context: { c: leaf },
    transition: appTransition,
  };
  let systemCommit: unknown;

  try {
    const out = ctx.systemCommit(foreign2 as never, router.getState(), {});
    const st2 = router.getState()!;

    // mutate the caller's inner object AFTER the commit — visible through core?
    appSegments.activated.push("mutated-after-commit");

    systemCommit = {
      returnedIsGetState: out === st2,
      params: {
        copied: st2.params !== p2.bag,
        frozen: Object.isFrozen(st2.params),
        readsPerKey: { ...p2.reads },
      },
      search: {
        copied: st2.search !== s2.bag,
        frozen: Object.isFrozen(st2.search),
        readsPerKey: { ...s2.reads },
      },
      transition: {
        containerCopied: st2.transition !== appTransition,
        containerFrozen: Object.isFrozen(st2.transition),
        segmentsIsCallersObject: st2.transition.segments === appSegments,
        segmentsFrozen: Object.isFrozen(st2.transition.segments),
        mutationAfterCommitVisibleViaGetState:
          router.getState()!.transition.segments.activated.includes(
            "mutated-after-commit",
          ),
      },
      control_context: {
        containerCopied: st2.context !== foreign2.context,
        leafByReference: (st2.context as { c: unknown }).c === leaf,
      },
    };
  } catch (error) {
    systemCommit = `threw: ${String(error)}`;
  }

  console.log(JSON.stringify({ navigateToState, systemCommit }, null, 2));
}

void main();
