/**
 * Probe 01 (2026-07-03): RoutesNamespace known-risk sweep — the prompt rows no
 * June fix-wave test pins (behavior records for the audit's §5/§9).
 *
 *   Q1 DANGLING FORWARD after removeRoute of the TARGET (risk #2):
 *      a --forwardTo--> b, then remove("b"). Pin: forwardState("a"),
 *      navigate("a"), matchPath("/a") — does matchPath return a State whose
 *      `name` no longer exists in the tree?
 *   Q2 CHAINED dynamic forwardTo returning a NON-STRING (code read:
 *      #resolveDynamicForward type-checks only the FIRST callback, :560-564;
 *      chained calls at :584 are unchecked) — pin the actual error shape.
 *   Q3 trailingSlash:"preserve" edges (risk #5): matchPath("/"), matchPath(""),
 *      matchPath("/about/") vs "/about".
 *   Q4 TREE_CHANGED payload nested-config ALIASING (documented contract:
 *      "nested config is by reference and aliases the live store") — verify the
 *      aliasing fact empirically (event.added defaultParams === live object
 *      the router reads).
 *
 * Structural probe — valid on battery power.
 */

import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

/* eslint-disable @typescript-eslint/no-explicit-any */
const code = (e: unknown) => (e as any)?.code ?? (e as any)?.message ?? String(e);

void (async () => {
  // ---------- Q1: dangling forward after removing the target ----------
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a", forwardTo: "b" },
      { name: "b", path: "/b" },
    ]);

    await router.start("/");
    getRoutesApi(router).remove("b");

    // matchPath is not on the Router facade — the public reach is the plugin
    // API (getPluginApi(router).matchPath), the same path browser plugins use.
    const matched = getPluginApi(router).matchPath("/a");
    const matchedExists =
      matched === undefined ? "n/a" : String(getRoutesApi(router).has(matched.name));
    const nav = await router.navigate("a").then(
      (s) => `RESOLVED(${s.name})`,
      (e) => `rejected:${code(e)}`,
    );

    console.log(
      `Q1 dangling forward → matchPath("/a")=${
        matched ? `State(name=${matched.name})` : "undefined"
      } has(matched.name)=${matchedExists} navigate("a")=${nav}`,
    );
    console.log(
      `   observation: ${
        matched && matchedExists === "false"
          ? "matchPath returns a State for a NONEXISTENT route name (dangling resolvedForwardMap)"
          : matched
            ? "forward map self-healed"
            : "matchPath undefined (match rejected)"
      }`,
    );
    router.dispose();
  }

  // ---------- Q2: chained dynamic forwardTo returns non-string ----------
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a", forwardTo: () => "b" },
      { name: "b", path: "/b", forwardTo: (() => 42) as unknown as () => string },
      { name: "c", path: "/c", forwardTo: (() => 42) as unknown as () => string },
    ] as Route[]);

    await router.start("/");

    const direct = await router.navigate("c").then(
      (s) => `RESOLVED(${s.name})`,
      (e) => `rejected: ${code(e)}`,
    );
    const chained = await router.navigate("a").then(
      (s) => `RESOLVED(${s.name})`,
      (e) => `rejected: ${code(e)}`,
    );

    console.log(`Q2 non-string dynamic → direct(first fn)=${direct}`);
    console.log(`                        chained(second fn)=${chained}`);
    console.log(
      `   observation: ${
        String(direct).includes("must return a string") &&
        !String(chained).includes("must return a string")
          ? "ASYMMETRY confirmed — first callback type-checked, chained one surfaces a misleading error"
          : "symmetric handling"
      }`,
    );
    router.dispose();
  }

  // ---------- Q3: trailingSlash "preserve" edges ----------
  {
    const router = createRouter(
      [
        { name: "home", path: "/" },
        { name: "about", path: "/about" },
      ],
      { trailingSlash: "preserve", rewritePathOnMatch: true },
    );

    await router.start("/");

    const api = getPluginApi(router);
    const cases: [string, string][] = [
      ["/", String(api.matchPath("/")?.path)],
      ["", String(api.matchPath("")?.path)],
      ["/about", String(api.matchPath("/about")?.path)],
      ["/about/", String(api.matchPath("/about/")?.path)],
    ];

    console.log(
      `Q3 preserve edges → ${cases.map(([i, o]) => `${JSON.stringify(i)}→${o}`).join("  ")}`,
    );
    console.log(
      `   verdict: ${
        cases[2][1] === "/about" && cases[3][1] === "/about/"
          ? "OK (source trailing preserved both ways)"
          : "check preserve semantics"
      }`,
    );
    router.dispose();
  }

  // ---------- Q4: TREE_CHANGED payload nested aliasing ----------
  {
    const router = createRouter([{ name: "home", path: "/" }]);

    await router.start("/");

    const routes = getRoutesApi(router);
    let payloadDefaults: Record<string, unknown> | undefined;

    routes.subscribeChanges((event) => {
      if (event.op === "add") {
        payloadDefaults = event.added[0]?.defaultParams as Record<
          string,
          unknown
        >;
      }
    });

    const liveDefaults = { page: "1" };

    routes.add([{ name: "list", path: "/list", defaultParams: liveDefaults }]);

    const aliasesInput = payloadDefaults === liveDefaults;

    // The router reads defaultParams on buildPath — mutate via the payload ref
    // and observe whether the built path changes (aliasing the LIVE store).
    const before = router.buildPath("list");

    if (payloadDefaults) {
      payloadDefaults.page = "999";
    }

    const after = router.buildPath("list");

    console.log(
      `Q4 payload aliasing → payload===input:${aliasesInput} buildPath before=${before} afterPayloadMutation=${after}`,
    );
    console.log(
      `   observation: ${
        before !== after
          ? "CONFIRMED — payload nested config aliases the live store (documented read-only contract; mutation corrupts router config)"
          : "payload isolated (doc overstates aliasing?)"
      }`,
    );
    router.dispose();
  }

  console.log("probe-01 done");
})();
