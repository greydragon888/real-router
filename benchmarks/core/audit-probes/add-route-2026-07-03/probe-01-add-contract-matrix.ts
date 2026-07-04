// probe-01: getRoutesApi().add() contract matrix against the post-#977/#992/#1035/#1053 code.
//
// Baseline 2026-06-04 residuals #953/#954/#955 are FIXED (commit 13f621ed) — this
// probe re-verifies the fixes hold AND hunts the NEW seams the fixes did not cover:
//   Q1/Q2  flat dotted names in add(): matcher-namespace vs definitions-walk seam
//          (assertAddable checks matcher.hasRoute; insertAddedDefinitions walks
//          definitions by parentSegments — routesStore.ts:532 vs :597-601)
//   Q4     cross-batch dup path (assertNoDuplicatePathsInBatch is batch-scoped
//          per #955 — routesStore.ts:480-515; what happens vs EXISTING tree?)
//   Q5     forwardTo → nonexistent target in bare core (resolveForwardChain never
//          checks existence — forwardChain.ts:12; wiki claims add-time Error)
//   Q6     empty batch + subscribeChanges listener (getRoutesApi.ts:603-611)
//   Q7     add during the STARTING window (async start interceptor)
//   Q8     route named "__proto__" (null-proto config containers)
//   Q9     bare-core non-string route name (wiki error table vs reality)
//   Q10    parent is the currently-active route
//   Q11    add from a subscribeLeave listener (mid-transition CRUD)
//   Q12    TREE_CHANGED handler runs synchronously inside add()
//   Q14    self-parent add
//   Q15    parent = "@@router/UNKNOWN_ROUTE" (internal state name, not a tree node)
//
// Structural probe — battery-safe. Prototype-hazard checks use Object.hasOwn only.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

import type { Route } from "@real-router/core";

const line = (q: string, verdict: string): void => {
  console.log(`${q}: ${verdict}`);
};

void (async () => {
  const mk = (routes: Route[] = [{ name: "home", path: "/" }]) =>
    createRouter(routes, { allowNotFound: false });

  // --- Q1: flat dotted name via add() — accepted? what does the tree see? ---
  {
    const r = mk();
    const api = getRoutesApi(r);

    try {
      api.add({ name: "flat.leaf", path: "/flat-leaf" });
      line(
        "Q1 add({name:'flat.leaf'})",
        `NO THROW; has('flat.leaf')=${api.has("flat.leaf")} has('flat')=${api.has("flat")} ` +
          `matchPath('/flat-leaf')=${String(getPluginApi(r).matchPath("/flat-leaf")?.name)} ` +
          `buildPath=${(() => {
            try {
              return r.buildPath("flat.leaf");
            } catch (e) {
              return `THROW ${(e as Error).message}`;
            }
          })()}`,
      );
    } catch (e) {
      line("Q1 add({name:'flat.leaf'})", `THROW: ${(e as Error).message}`);
    }
  }

  // --- Q2: parent that only exists as a FLAT dotted definition ---
  {
    const r = mk();
    const api = getRoutesApi(r);

    try {
      api.add({ name: "flat.leaf", path: "/flat-leaf" });
    } catch {
      line("Q2 parent='flat.leaf' (flat def)", "SKIPPED — Q1 threw");
    }

    if (api.has("flat.leaf")) {
      try {
        api.add({ name: "kid", path: "/kid" }, { parent: "flat.leaf" });
        line(
          "Q2 add(kid,{parent:'flat.leaf'})",
          `NO THROW; has('flat.leaf.kid')=${api.has("flat.leaf.kid")} ` +
            `matchPath('/flat-leaf/kid')=${String(getPluginApi(r).matchPath("/flat-leaf/kid")?.name)} ` +
            `<-- if has()=false: SILENT DROP (assertAddable passed, definitions-walk missed)`,
        );
      } catch (e) {
        line("Q2 add(kid,{parent:'flat.leaf'})", `THROW: ${(e as Error).message}`);
      }
    }
  }

  // --- Q3 control: nested parent works ---
  {
    const r = mk([
      { name: "home", path: "/" },
      { name: "a", path: "/a", children: [{ name: "b", path: "/b" }] },
    ]);
    const api = getRoutesApi(r);

    api.add({ name: "kid", path: "/kid" }, { parent: "a.b" });
    line(
      "Q3 control add(kid,{parent:'a.b' nested})",
      `has('a.b.kid')=${api.has("a.b.kid")} matchPath('/a/b/kid')=${String(getPluginApi(r).matchPath("/a/b/kid")?.name)}`,
    );
  }

  // --- Q4: dup path vs EXISTING route (cross-batch) ---
  {
    const r = mk([
      { name: "home", path: "/" },
      { name: "first", path: "/dup" },
    ]);
    const api = getRoutesApi(r);

    try {
      api.add({ name: "second", path: "/dup" });
      line(
        "Q4 add second route with EXISTING path '/dup'",
        `NO THROW; matchPath('/dup')=${String(getPluginApi(r).matchPath("/dup")?.name)} ` +
          `buildPath(first)=${r.buildPath("first")} buildPath(second)=${r.buildPath("second")} ` +
          `<-- silent URL shadow if matchPath != 'first'`,
      );
    } catch (e) {
      line("Q4 add second route with EXISTING path '/dup'", `THROW: ${(e as Error).message}`);
    }
  }

  // --- Q5: forwardTo → nonexistent target, bare core ---
  {
    const r = mk();
    const api = getRoutesApi(r);

    try {
      api.add({ name: "a", path: "/a", forwardTo: "ghost" });
      let navOutcome: string;

      try {
        await r.start("/");
        await r.navigate("a");
        navOutcome = "navigate RESOLVED (?)";
      } catch (e) {
        navOutcome = `navigate rejected: ${(e as { code?: string }).code ?? (e as Error).message}`;
      }

      line(
        "Q5 add(forwardTo:'ghost') bare core",
        `add NO THROW (wiki says add-time Error); ${navOutcome}`,
      );
    } catch (e) {
      line("Q5 add(forwardTo:'ghost') bare core", `add THROW: ${(e as Error).message}`);
    }
  }

  // --- Q6: empty batch with a subscribeChanges listener ---
  {
    const r = mk();
    const api = getRoutesApi(r);
    const events: string[] = [];

    api.subscribeChanges((e) => {
      events.push(`${e.op}:${e.op === "add" ? e.added.length : "?"}`);
    });
    api.add([]);
    line(
      "Q6 add([]) with listener",
      `events=${JSON.stringify(events)} <-- emits an op:'add' with added:[] for a no-op mutation?`,
    );
  }

  // --- Q7: add during the STARTING window (async start interceptor) ---
  {
    const r = mk(); // allowNotFound: false — explicit, so a miss REJECTS
    const api = getRoutesApi(r);

    getPluginApi(r).addInterceptor("start", async (next, path) => {
      api.add({ name: "lazy", path: "/lazy" }); // FSM is STARTING here
      return next(path);
    });

    try {
      const st = await r.start("/lazy");

      line(
        "Q7 add() mid-STARTING (before next())",
        `start resolved to '${st.name}'; has('lazy')=${api.has("lazy")} (lazy registration works)`,
      );
    } catch (e) {
      line(
        "Q7 add() mid-STARTING (before next())",
        `start REJECTED: ${(e as { code?: string }).code ?? (e as Error).message}`,
      );
    }
  }

  // --- Q8: route literally named "__proto__" ---
  {
    const r = mk();
    const api = getRoutesApi(r);

    try {
      api.add({ name: "__proto__", path: "/proto", defaultParams: { x: "1" } });

      const cfg = getPluginApi(r).getRouteConfig("__proto__");

      line(
        "Q8 add({name:'__proto__'})",
        `NO THROW; has=${api.has("__proto__")} matchPath('/proto')=${String(getPluginApi(r).matchPath("/proto")?.name)} ` +
          `getRouteConfig ownProps=${cfg === undefined ? "undefined" : JSON.stringify(Object.getOwnPropertyNames(cfg))} ` +
          `otherRoutesIntact=${api.has("home")}`,
      );
    } catch (e) {
      line("Q8 add({name:'__proto__'})", `THROW: ${(e as Error).message}`);
    }
  }

  // --- Q9: bare-core non-string name ---
  {
    const r = mk();
    const api = getRoutesApi(r);

    try {
      api.add({ name: 42 as unknown as string, path: "/n" });
      line("Q9 add({name:42}) bare core", `NO THROW; has(42-as-string)=${api.has("42")}`);
    } catch (e) {
      line(
        "Q9 add({name:42}) bare core",
        `THROW ${(e as Error).constructor.name}: ${(e as Error).message}`,
      );
    }
  }

  // --- Q10: parent is the currently-active route ---
  {
    const r = mk([
      { name: "home", path: "/" },
      { name: "sec", path: "/sec" },
    ]);
    const api = getRoutesApi(r);

    await r.start("/sec");

    const before = r.getState()?.name;

    api.add({ name: "child", path: "/child" }, { parent: "sec" });
    line(
      "Q10 add under ACTIVE parent",
      `stateBefore='${String(before)}' stateAfter='${String(r.getState()?.name)}' has('sec.child')=${api.has("sec.child")}`,
    );
  }

  // --- Q11: add from a subscribeLeave listener (mid-transition) ---
  {
    const r = mk([
      { name: "home", path: "/" },
      { name: "away", path: "/away" },
    ]);
    const api = getRoutesApi(r);

    await r.start("/");

    let leaveAddOutcome = "not-fired";

    r.subscribeLeave(() => {
      try {
        api.add({ name: "fromLeave", path: "/from-leave" });
        leaveAddOutcome = "add OK";
      } catch (e) {
        leaveAddOutcome = `add THREW: ${(e as { code?: string }).code ?? (e as Error).message}`;
      }
    });

    const nav = await r.navigate("away");

    line(
      "Q11 add() inside subscribeLeave listener",
      `${leaveAddOutcome}; nav landed '${nav.name}'; has('fromLeave')=${api.has("fromLeave")}`,
    );
  }

  // --- Q12: TREE_CHANGED handler timing relative to add() return ---
  {
    const r = mk();
    const api = getRoutesApi(r);
    const orderLog: string[] = [];

    api.subscribeChanges(() => orderLog.push("handler"));
    api.add({ name: "t", path: "/t" });
    orderLog.push("after-add-returns");
    line("Q12 TREE_CHANGED timing", JSON.stringify(orderLog));
  }

  // --- Q14: self-parent ---
  {
    const r = mk();
    const api = getRoutesApi(r);

    try {
      api.add({ name: "self", path: "/self" }, { parent: "self" });
      line("Q14 self-parent add", `NO THROW; has('self.self')=${api.has("self.self")}`);
    } catch (e) {
      line("Q14 self-parent add", `THROW: ${(e as Error).message}`);
    }
  }

  // --- Q15: parent = "@@router/UNKNOWN_ROUTE" ---
  {
    const r = mk();
    const api = getRoutesApi(r);

    try {
      api.add({ name: "x", path: "/x" }, { parent: "@@router/UNKNOWN_ROUTE" });
      line("Q15 parent=@@router/UNKNOWN_ROUTE", "NO THROW (!)");
    } catch (e) {
      line("Q15 parent=@@router/UNKNOWN_ROUTE", `THROW: ${(e as Error).message}`);
    }
  }

  console.log("probe-01 done");
})();
