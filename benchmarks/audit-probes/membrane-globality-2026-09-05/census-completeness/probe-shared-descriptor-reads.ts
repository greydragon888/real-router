// Census-completeness probe (shared/): two app-object reads on the way to a core
// door that the census does not list —
//  (1) `resolveLinkTarget·to`: the `<Link to={…}>` NavigationTarget descriptor
//      (the shared-layer twin of the censused `Router.navigate·target`);
//  (2) `createPluginBuildUrl·opts` / `createReplaceHistoryState·options`: the
//      caller's `{ hash }` option bag read by name beside the censused
//      params|search doors.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";
import {
  createPluginBuildUrl,
  createReplaceHistoryState,
} from "../../../../shared/browser-env/plugin-utils";
import { buildHref, resolveLinkTarget } from "../../../../shared/dom-utils/link-utils";

const routes = [{ name: "a", path: "/a/:id?q" }];

async function main(): Promise<void> {
  const router = createRouter(routes as never, {} as never);
  const api = getPluginApi(router);

  await router.start("/a/1");

  // (1) descriptor
  const appParams = { id: "1" };
  const to = countingBag({ name: "a", params: appParams, search: { q: "x" } });
  const resolved = resolveLinkTarget(to.bag as never, "", undefined, undefined);
  const readsAfterResolve = { ...to.reads };
  const href = buildHref(router, resolved.name, resolved.params as never, resolved.search);
  const descriptor = {
    readsOfToAfterResolve: readsAfterResolve,
    readsOfToAfterBuildHref: { ...to.reads },
    resolvedParamsIsAppObject: resolved.params === appParams,
    hrefFromCoreDoor: href,
  };

  // (2) option bags on the two plugin-utils closures
  const buildUrl = createPluginBuildUrl(router, "");
  const o1 = countingBag({ hash: "sec" });
  const url = buildUrl("a", { id: "1" }, { q: "x" }, o1.bag as never);
  const browser = {
    replaceState: (_s: unknown, _u: string) => {},
    getHash: () => "#old",
  };
  const replaceHistoryState = createReplaceHistoryState(api, browser as never, (p) => p, true);
  const o2 = countingBag({ hash: "new" });
  replaceHistoryState("a", { id: "1" }, { q: "x" }, o2.bag as never);

  console.log(
    JSON.stringify(
      {
        descriptor,
        createPluginBuildUrl_opts: { url, reads: o1.reads },
        createReplaceHistoryState_options: { reads: o2.reads },
      },
      null,
      1,
    ),
  );
}

void main();
