/**
 * Probe 02 (2026-07-03): pin the two untested behavioral corners the test
 * inventory surfaced (both are Test-gaps — this probe records ACTUAL behavior
 * so the future tests pin reality, not guesses).
 *
 *   Q1 canNavigateTo DURING an in-flight async navigation (adapter <Link>
 *      re-render while a transition is parked on an async guard):
 *      predicate must answer synchronously against the COMMITTED (old) state,
 *      not interfere with the parked navigation, and the navigation must
 *      complete unaffected.
 *   Q2 impure guard calling router.navigate() from inside a canNavigateTo run
 *      (documented misuse — guards must not mutate): post-#1035 the ban only
 *      covers dispatch windows (isProcessing>0); a predicate run is not one.
 *      Record: does the inner navigate commit? what verdict does the outer
 *      predicate return? is the router consistent afterwards?
 *
 * Structural probe — valid on battery power.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

function makeRoutes(): Route[] {
  return [
    { name: "home", path: "/" },
    { name: "about", path: "/about" },
    { name: "admin", path: "/admin" },
  ];
}

void (async () => {
  // ---------- Q1: predicate mid-async-navigation ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");

    let release!: (v: boolean) => void;

    getLifecycleApi(router).addActivateGuard(
      "about",
      () => () => new Promise<boolean>((r) => (release = r)),
    );
    getLifecycleApi(router).addActivateGuard("admin", () => () => false);

    const inFlight = router.navigate("about"); // parks on the async guard

    await new Promise((r) => setTimeout(r, 5));

    const verdictBlocked = router.canNavigateTo("admin"); // blocked target
    const verdictOpen = router.canNavigateTo("home"); // same-state vs committed → true
    const stateDuring = router.getState()?.name;

    release(true);

    const finalState = (await inFlight).name;

    console.log(
      `Q1 mid-nav predicate → during: can(admin)=${verdictBlocked} can(home)=${verdictOpen} committed=${stateDuring} | after: nav=${finalState}`,
    );
    console.log(
      `   verdict: ${
        verdictBlocked === false &&
        verdictOpen === true &&
        stateDuring === "home" &&
        finalState === "about"
          ? "OK (sync answer vs committed state; parked navigation unaffected)"
          : "UNEXPECTED"
      }`,
    );
    router.dispose();
  }

  // ---------- Q2: impure guard calls navigate() inside the predicate ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");

    let innerOutcome = "not-run";

    getLifecycleApi(router).addActivateGuard("admin", () => () => {
      // Documented misuse: guards are pure predicates. Record what happens.
      try {
        void router
          .navigate("about")
          .then(() => (innerOutcome = "committed"))
          .catch((e: unknown) => {
            innerOutcome = `rejected:${(e as { code?: string })?.code}`;
          });
      } catch (e) {
        innerOutcome = `threw:${(e as { code?: string })?.code}`;
      }

      return true;
    });

    const verdict = router.canNavigateTo("admin");

    await new Promise((r) => setTimeout(r, 10)); // let the inner nav settle

    console.log(
      `Q2 impure guard (navigate inside predicate) → verdict=${verdict} inner=${innerOutcome} state=${router.getState()?.name} isActive=${router.isActive()}`,
    );
    console.log(
      "   observation: predicate run is NOT a dispatch window (isProcessing=0) — the #1035 ban does not apply; the inner navigate proceeds as a normal navigation (documented misuse, pure-guard contract)",
    );
    router.dispose();
  }

  console.log("probe-02 done");
})();
