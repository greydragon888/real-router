// probe-01: do the three cloneRouter bugs filed 2026-07-03 (#1174 guard-order
// inversion, #1175 rootPath loss, #1176 plugin-factory under-initialized
// window) surface through createRequestScope's scope.router exactly as through
// a bare cloneRouter?
//
// Expected: YES for all three — createRequestScope adds only the
// request-lifecycle binding on top of cloneRouter (createRequestScope.ts:161),
// so the Cross-cutting inheritance table gains three "filed #NNN, inherited"
// rows. This probe pins the inheritance so the fixes can be verified at the
// scope level too.
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";
import { createRequestScope } from "@real-router/core/utils";

import type { PluginFactory } from "@real-router/core";

const fakeReq = () => ({
  on: () => {},
  removeListener: () => {},
});

void (async () => {
  // --- (a) #1175: rootPath loss through the scope ---
  {
    const base = createRouter([{ name: "user", path: "/users/:id" }]);

    getPluginApi(base).setRootPath("/app");

    const scope = createRequestScope(fakeReq(), base);
    const basePath = base.buildPath("user", { id: "1" });
    const scopePath = scope.router.buildPath("user", { id: "1" });

    console.log(
      `a. #1175 rootPath: base=${basePath} scope=${scopePath} → ${basePath === scopePath ? "NOT inherited (fixed?)" : "INHERITED (filed #1175)"}`,
    );
    await scope.dispose();
  }

  // --- (b) #1174: guard-order inversion through the scope ---
  {
    const base = createRouter([
      { name: "home", path: "/" },
      { name: "admin", path: "/admin" },
    ]);

    getLifecycleApi(base).addActivateGuard("admin", () => () => false); // ext BLOCKS
    getRoutesApi(base).update("admin", { canActivate: () => () => true }); // def ALLOWS — last add wins on base
    await base.start("/");

    const scope = createRequestScope(fakeReq(), base);

    await scope.router.start("/");

    const baseVerdict = base.canNavigateTo("admin");
    const scopeVerdict = scope.router.canNavigateTo("admin");

    console.log(
      `b. #1174 guard-order: base=${baseVerdict} scope=${scopeVerdict} → ${baseVerdict === scopeVerdict ? "NOT inherited (fixed?)" : "INHERITED (filed #1174)"}`,
    );
    await scope.dispose();
  }

  // --- (c) #1176: plugin-factory under-initialized window through the scope ---
  {
    const snapshots: string[] = [];
    const probePlugin: PluginFactory = (router) => {
      snapshots.push(router.buildPath("user", { id: "1" }));

      return {};
    };

    const base = createRouter([
      {
        name: "user",
        path: "/users/:id?page",
        defaultParams: { page: "1" },
      },
    ]);

    base.usePlugin(probePlugin); // snapshot[0] — base registration (full config)

    const scope = createRequestScope(fakeReq(), base); // snapshot[1] — re-run on the clone

    console.log(
      `c. #1176 factory-window: base-run=${snapshots[0]} scope-run=${snapshots[1]} → ${snapshots[0] === snapshots[1] ? "NOT inherited (fixed?)" : "INHERITED (filed #1176)"}`,
    );
    await scope.dispose();
  }
})();
