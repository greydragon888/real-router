/**
 * Probe 05: batch atomicity WITHOUT validation-plugin.
 *
 * Documented contract (wiki addRoute.md:317-331 "Atomicity"): on error in a
 * batch, NO routes are added; router state unchanged.
 *
 * But duplicate detection lives in `validateRoutes` (plugin-only). Without the
 * plugin, `addRoutes` (getRoutesApi.ts:208) pushes ALL routes into
 * `store.definitions` BEFORE `commitTreeChanges` rebuilds the tree. If the
 * rebuild throws on a duplicate path, the definitions array is left mutated →
 * atomicity violated (partial add / corrupted store).
 *
 * Checks several malformed batches and reports: did it throw? is the store
 * corrupted afterward (good route leaked, or router unusable)?
 */

import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

function scenario(label: string, run: (api: ReturnType<typeof getRoutesApi>) => void): void {
  const router = createRouter([{ name: "home", path: "/home" }]);
  const routesApi = getRoutesApi(router);

  let threw: string | false = false;
  try {
    run(routesApi);
  } catch (e) {
    threw = (e as Error).message;
  }

  // After a failed batch, "good" must be absent (atomicity) AND the router must
  // still match its original route.
  const goodLeaked = routesApi.has("good");
  let homeStillWorks = false;
  try {
    homeStillWorks = router.buildPath("home") === "/home";
  } catch (e) {
    homeStillWorks = `BROKEN: ${(e as Error).message}` as never;
  }

  console.log(`[${label}]`);
  console.log("  threw         :", threw);
  console.log("  good leaked   :", goodLeaked, goodLeaked ? "<-- ATOMICITY VIOLATED" : "");
  console.log("  home intact   :", homeStillWorks, homeStillWorks === true ? "" : "<-- STORE CORRUPTED");
}

// duplicate NAME within batch (good first, then a name clash with "home")
scenario("dup-name-vs-existing", (api) => {
  api.add([
    { name: "good", path: "/good" },
    { name: "home", path: "/home-2" }, // name already exists
  ]);
});

// duplicate PATH within batch
scenario("dup-path-in-batch", (api) => {
  api.add([
    { name: "good", path: "/good" },
    { name: "other", path: "/good" }, // same path
  ]);
});

// duplicate name inside the same batch
scenario("dup-name-in-batch", (api) => {
  api.add([
    { name: "good", path: "/good" },
    { name: "good", path: "/good-2" },
  ]);
});
