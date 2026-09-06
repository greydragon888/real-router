// Census-critic probe 8: two ssr-utils bindings the census does not list.
//
//  a. getStaticPaths·entries / StaticPathEntry·params|search (callback return):
//     the application's async entry function returns bags that ssr-utils reads
//     itself (`{ ...entry.params, ...entry.search }`) AND hands to
//     Router.buildPath — the same caller bag through a spread and a core door.
//  b. hydrateRouter·source (object form): the application's object is placed
//     by identity into RouterInternals.hydrationState for the duration of
//     start() — a parameter-position door merged by the census into the
//     field-position door.
//
// ssr-utils is not a dependency of `benchmarks`, so it is imported by relative
// path; its own `@real-router/core` resolves through packages/ssr-utils/
// node_modules to the same packages/core/src (real path), so the router and
// the helper share one core instance — checked by the identity control below.
//
// Run (from W/benchmarks):
//   NODE_OPTIONS='--conditions=@real-router/internal-source' npx tsx \
//     audit-probes/membrane-globality-2026-09-05/census-critic/probe-ssr-utils-bindings.ts
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";
import { getStaticPaths } from "../../../../packages/ssr-utils/src/getStaticPaths";
import { hydrateRouter } from "../../../../packages/ssr-utils/src/hydrateRouter";

async function main(): Promise<void> {
  const router = createRouter(
    [
      { name: "home", path: "/home" },
      { name: "u", path: "/u/:id?tab" },
    ] as never,
    {} as never,
  );

  // control: one core instance — getInternals from THIS module sees the router
  const oneCore = ((): boolean => {
    try {
      getInternals(router);

      return true;
    } catch {
      return false;
    }
  })();

  // a. getStaticPaths
  const p = countingBag({ id: "1" });
  const s = countingBag({ tab: "x" });
  const paths = await getStaticPaths(router, {
    u: () => Promise.resolve([{ params: p.bag, search: s.bag }]),
  } as never);

  // b. hydrateRouter with an object source
  const source = { path: "/u/2?tab=y", context: { ssr: { loaded: true } } };
  let seenDuringStart: unknown = "interceptor not called";

  getPluginApi(router).addInterceptor("start", (next, path) => {
    seenDuringStart = getInternals(router).hydrationState === source;

    return next(path);
  });

  const state = await hydrateRouter(router, source as never);

  console.log(
    JSON.stringify(
      {
        control_oneCoreInstance: oneCore,
        getStaticPaths: {
          paths,
          readsOfEntryParams: { ...p.reads },
          readsOfEntrySearch: { ...s.reads },
        },
        hydrateRouter_objectSource: {
          hydrationStateIsCallersObjectDuringStart: seenDuringStart,
          restoredAfterStart: getInternals(router).hydrationState,
          startedAt: state.path,
        },
      },
      null,
      2,
    ),
  );
}

void main();
