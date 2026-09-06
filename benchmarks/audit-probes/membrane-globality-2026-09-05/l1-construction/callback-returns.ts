// L1-construction · objects the APPLICATION RETURNS from callbacks declared on
// the construction surface, and how core consumes them:
//   Options.defaultParams / Options.defaultSearch callbacks → Params / SearchParams
//   Route.encodeParams → ParamsSearch   (consumed by buildPath / matchPath rewrite)
//   Route.decodeParams → ParamsSearch   (consumed by matchPath)
// For each: how often is the callback invoked, which traps fire on the RETURNED
// container and on its `params` / `search` slots, and is the committed state the
// returned object (handle held) or a copy?
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { censused, compact, show } from "./census";

async function main(): Promise<void> {
// ── Options.defaultParams / defaultSearch as callbacks ──────────────────────
{
  let paramsCalls = 0;
  let searchCalls = 0;
  const returnedParams = censused({ id: "9" });
  const returnedSearch = censused({ tab: "q" });
  const router = createRouter(
    [{ name: "u", path: "/u/:id?tab" }, { name: "home", path: "/home" }] as never,
    {
      defaultRoute: "u",
      defaultParams: () => {
        paramsCalls += 1;

        return returnedParams.proxy;
      },
      defaultSearch: () => {
        searchCalls += 1;

        return returnedSearch.proxy;
      },
    } as never,
  );

  await router.start("/home");
  show("options.defaultParams cb calls after start('/home'):", paramsCalls);
  await router.navigateToDefault();
  show("options.defaultParams cb calls after navigateToDefault():", paramsCalls);
  show("options.defaultSearch cb calls:", searchCalls);
  show("traps on returned Params container:", compact(returnedParams.snap()));
  show("traps on returned SearchParams container:", compact(returnedSearch.snap()));
  show("state.params === returned container (handle held?):", router.getState()?.params === returnedParams.proxy);
  show("state.search === returned container (handle held?):", router.getState()?.search === returnedSearch.proxy);
  show("state:", { params: router.getState()?.params, search: router.getState()?.search, path: router.getState()?.path });
  await router.navigateToDefault({ reload: true } as never);
  show("cb calls after a 2nd navigateToDefault (re-invoked per call?):", [paramsCalls, searchCalls]);
  router.dispose();
}

// ── Route.encodeParams return ───────────────────────────────────────────────
{
  let encodeCalls = 0;
  const encParams = censused({ id: "E" });
  const encSearch = censused({ tab: "S" });
  const encReturn = censused({ params: encParams.proxy, search: encSearch.proxy });
  let argParams: unknown;
  let argSearch: unknown;
  const callerParams = { id: "1" };
  const router = createRouter(
    [
      {
        name: "u",
        path: "/u/:id?tab",
        encodeParams: (ch: { params: unknown; search: unknown }) => {
          encodeCalls += 1;
          argParams = ch.params;
          argSearch = ch.search;

          return encReturn.proxy;
        },
      },
    ] as never,
  );

  show("\nbuildPath('u', callerParams) →", router.buildPath("u", callerParams));
  show("encodeParams calls:", encodeCalls);
  show("encodeParams received caller's params by identity? (must be false — spread copy):", argParams === callerParams);
  show("traps on encodeParams RETURN container:", compact(encReturn.snap()));
  show("traps on returned .params:", compact(encParams.snap()));
  show("traps on returned .search:", compact(encSearch.snap()));
  router.dispose();
}

// ── Route.decodeParams return ───────────────────────────────────────────────
{
  let decodeCalls = 0;
  const decParams = censused({ id: "D" });
  const decSearch = censused({ tab: "T" });
  const decReturn = censused({ params: decParams.proxy, search: decSearch.proxy });
  const router = createRouter(
    [
      {
        name: "u",
        path: "/u/:id?tab",
        decodeParams: () => {
          decodeCalls += 1;

          return decReturn.proxy;
        },
      },
      { name: "home", path: "/home" },
    ] as never,
  );

  const matched = getPluginApi(router).matchPath("/u/1?tab=x");

  show("\nmatchPath('/u/1?tab=x') →", { name: matched?.name, params: matched?.params, search: matched?.search, path: matched?.path });
  show("decodeParams calls:", decodeCalls);
  show("traps on decodeParams RETURN container (slot reads = P1 on the container):", compact(decReturn.snap()));
  show("traps on returned .params:", compact(decParams.snap()));
  show("traps on returned .search:", compact(decSearch.snap()));
  show("matched.params === returned .params (handle held?):", matched?.params === decParams.proxy);
  show("matched.search === returned .search (handle held?):", matched?.search === decSearch.proxy);

  await router.start("/u/2?tab=y");
  show("after start('/u/2?tab=y'): decode calls, state:", [decodeCalls, router.getState()?.params, router.getState()?.search]);
  show("traps on RETURN container after start (cumulative):", compact(decReturn.snap()));
  router.dispose();
}
}

void main();
