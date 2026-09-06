// Census-completeness probe (shared/ssr): the census lists only
// `hydrationState.context[namespace]` and `hydrated[deferredKeysNamespace]` as
// reads of the app's hydration payload. The start interceptor also reads
// `hydrationState.name`, `.params`, `.search` (enumerated + compared by
// `channelAgrees`) — nested app-owned bags, read by shared code, gating the
// `claim.write`. Object-form `hydrateRouter` stores the app's object by
// reference, so every read here is a call into the caller's object.
import { createRouter } from "@real-router/core";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";
import { hydrateRouter } from "../../../../packages/ssr-utils/src/hydrateRouter";
import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";

const routes = [{ name: "a", path: "/a/:id?q" }];

function makeRouter() {
  const router = createRouter(routes as never, {} as never);
  const plugin = createSsrLoaderPlugin(
    { a: () => () => "loaded-by-loader" } as never,
    { namespace: "data", modeNamespace: "dataMode", errorPrefix: "[probe]" },
  );

  router.usePlugin(plugin as never);

  return router;
}

async function main(): Promise<void> {
  // Matching payload: hydration branch taken → loader skipped.
  const params = countingProxy({ id: "1" });
  const search = countingProxy({ q: "x" });
  const context = countingProxy({ data: "from-server" });
  const payload = countingProxy({
    name: "a",
    params: params.bag,
    search: search.bag,
    path: "/a/1?q=x",
    context: context.bag,
  });

  const router = makeRouter();

  await hydrateRouter(router, payload.bag as never);

  const matching = {
    committedData: router.getState()!.context.data,
    payloadReads: payload.reads,
    paramsReads: params.reads,
    searchReads: search.reads,
    contextReads: context.reads,
  };

  // NEGATIVE CONTROL: disagreeing params → loader runs (branch not taken).
  const params2 = countingProxy({ id: "OTHER" });
  const payload2 = countingProxy({
    name: "a",
    params: params2.bag,
    search: { q: "x" },
    path: "/a/1?q=x",
    context: { data: "from-server" },
  });
  const router2 = makeRouter();

  await hydrateRouter(router2, payload2.bag as never);

  const mismatching = {
    committedData: router2.getState()!.context.data,
    payloadReads: payload2.reads,
    paramsReads: params2.reads,
  };

  console.log(JSON.stringify({ matching, mismatching }, null, 1));
}

void main();
