/**
 * Probe 02 (2026-07-03): re-verify filed #1171 (definition canDeactivate is
 * one-shot) from the namespace side, and pin the DOCUMENTED external
 * auto-cleanup contract next to it (the two must stay distinguishable).
 *
 *   Q1  definition canDeactivate: enter→leave→re-enter→leave — guard should
 *       fire twice; #1171 says calls stays 1 after the first leave
 *   Q2  getRoutesApi().get(name).canDeactivate after first leave — #1171 says
 *       undefined (config field evaporates from the read API)
 *   Q3  external deactivate guard: one-shot by DESIGN (router5 heritage,
 *       auto-cleanup) — fires once, then gone; re-register fires again
 *
 * Structural probe — valid on battery power.
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

void (async () => {
  // ---------- Q1 + Q2: definition canDeactivate one-shot (#1171) ----------
  {
    let calls = 0;
    const routes: Route[] = [
      { name: "a", path: "/a" },
      {
        name: "form",
        path: "/form",
        canDeactivate: () => () => {
          calls++;

          return true;
        },
      },
    ];
    const router = createRouter(routes);

    await router.start("/a");
    await router.navigate("form");
    await router.navigate("a"); // leave #1
    const afterFirstLeave = calls;

    await router.navigate("form");
    await router.navigate("a"); // leave #2
    const afterSecondLeave = calls;

    const configField = getRoutesApi(router).get("form")?.canDeactivate;

    console.log(
      `Q1 def one-shot   → leave#1 calls=${afterFirstLeave}, leave#2 calls=${afterSecondLeave}  ${
        afterSecondLeave === 2
          ? "OK (guard persists)"
          : "CONFIRMED #1171 (definition guard erased after first leave)"
      }`,
    );
    console.log(
      `Q2 get().canDeactivate after leave → ${typeof configField}  ${
        typeof configField === "function"
          ? "OK (config field intact)"
          : "CONFIRMED #1171 (config field evaporated)"
      }`,
    );
    router.dispose();
  }

  // ---------- Q3: external deactivate auto-cleanup is the documented contract ----------
  {
    let calls = 0;
    const router = createRouter([
      { name: "a", path: "/a" },
      { name: "form", path: "/form" },
    ]);

    await router.start("/a");

    const arm = () =>
      getLifecycleApi(router).addDeactivateGuard("form", () => () => {
        calls++;

        return true;
      });

    arm();
    await router.navigate("form");
    await router.navigate("a"); // leave #1 — fires, then auto-cleaned
    const afterFirst = calls;

    await router.navigate("form");
    await router.navigate("a"); // leave #2 — no guard (cleaned)
    const afterSecondNoRearm = calls;

    arm(); // component re-mounted → re-registered (heritage pattern)
    await router.navigate("form");
    await router.navigate("a"); // leave #3 — fires again
    const afterRearm = calls;

    console.log(
      `Q3 ext auto-clean → leave#1=${afterFirst} leave#2(no rearm)=${afterSecondNoRearm} leave#3(rearmed)=${afterRearm}  ${
        afterFirst === 1 && afterSecondNoRearm === 1 && afterRearm === 2
          ? "OK (documented one-shot external contract)"
          : "unexpected"
      }`,
    );
    router.dispose();
  }

  console.log("probe-02 done");
})();
