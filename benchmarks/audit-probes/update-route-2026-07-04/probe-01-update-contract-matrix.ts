// probe-01: getRoutesApi().update() contract matrix — post-#951/#952/#967/#977/#1035 code.
//
// Baseline 2026-06-04 residuals (#951 multi-field atomicity, #952 origin-blind clear,
// #967 async forwardTo) are ALL CLOSED — commitRouteUpdate is PREPARE→COMMIT
// (routesStore.ts:728-813), clears are definitionOnly, prepareForwardTo runs
// assertForwardToNotAsync. This probe hunts the NEXT layer:
//   Q1  bare-core update("ghost") — test :1506 claims "orphan config write is
//       unreachable", but commitScalarConfig/commitGuardUpdate write UNCONDITIONALLY:
//       does a future add() of that name INHERIT the phantom defaults/guard?
//       Does TREE_CHANGED emit a lying {op:"update"} for the phantom?
//   Q2  (filed #1171) definition canDeactivate one-shot — re-verify via update()
//   Q3  update mid-STARTING (isTransitioning() excludes STARTING → even the
//       logger.error branch is silent) — benign lazy-config?
//   Q4  flat dotted name (#1194 neighborhood) — update by name is walk-free?
//   Q5  update during active navigation — logger.error fires + proceeds
//       (the v8-ignored branch getRoutesApi.ts:667-673 cites a PHANTOM
//       Router.updateRoute — verify the branch behaves as documented)
//
// Structural probe — battery-safe (run on AC 2026-07-04). ALL imports static.
import { createRouter } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

const line = (q: string, verdict: string): void => {
  console.log(`${q}: ${verdict}`);
};

void (async () => {
  // --- Q1: phantom update → inheritance by a future add() of the same name ---
  {
    const r = createRouter([{ name: "home", path: "/" }], {
      allowNotFound: false,
    });
    const api = getRoutesApi(r);
    const events: string[] = [];

    api.subscribeChanges((e) => {
      events.push(e.op === "update" ? `update:${e.name}` : e.op);
    });

    let guardCompiled = 0;

    api.update("ghost", {
      defaultParams: { seeded: "yes" },
      canActivate: () => {
        guardCompiled++;
        return () => false; // blocker
      },
    });

    const phantomPhase =
      `no-throw; has=${api.has("ghost")} events=${JSON.stringify(events)} ` +
      `guardFactoryCompiled=${guardCompiled}x`;

    // Now a future add() of the SAME name — does it inherit the phantom config?
    api.add({ name: "ghost", path: "/ghost" });

    const inherited = api.get("ghost");

    await r.start("/");

    const nav = await r.navigate("ghost").then(
      (s) => `resolved '${s.name}' params=${JSON.stringify(s.params)}`,
      (e) => `rejected ${(e as { code?: string }).code ?? (e as Error).message}`,
    );

    line(
      "Q1 phantom update('ghost') → later add('ghost')",
      `${phantomPhase}; after add: get().defaultParams=${JSON.stringify(inherited?.defaultParams)} ` +
        `get().canActivate=${inherited?.canActivate ? "PRESENT" : "absent"} navigate=${nav} ` +
        `<-- наследование фантомного конфига/гарда, если defaultParams/canActivate не пусты и nav rejected`,
    );
  }

  // --- Q2 (filed #1171): definition canDeactivate one-shot via update() ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "lv", path: "/lv" },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);
    let runs = 0;

    api.update("lv", {
      canDeactivate: () => () => {
        runs++;
        return true;
      },
    });

    await r.start("/lv");
    await r.navigate("home"); // leave #1 — guard should run (runs=1)

    const afterFirstLeave = `runs=${runs} get().canDeactivate=${api.get("lv")?.canDeactivate ? "PRESENT" : "LOST"}`;

    await r.navigate("lv");
    await r.navigate("home"); // leave #2 — one-shot bug → guard does NOT run

    line(
      "Q2 (filed #1171) definition canDeactivate via update — one-shot?",
      `afterLeave1: ${afterFirstLeave}; afterLeave2 runs=${runs} ` +
        `<-- confirmed if runs stays 1 (второй leave без гарда) и/или get() LOST`,
    );
  }

  // --- Q3: update mid-STARTING ---
  {
    const r = createRouter([{ name: "home", path: "/" }], {
      allowNotFound: false,
    });
    const api = getRoutesApi(r);
    const errors: string[] = [];
    const origError = console.error;

    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };

    getPluginApi(r).addInterceptor("start", async (next, path) => {
      api.update("home", { defaultParams: { boot: "1" } });
      return next(path);
    });

    const st = await r.start("/");

    console.error = origError;
    line(
      "Q3 update() mid-STARTING",
      `start resolved '${st.name}'; params=${JSON.stringify(st.params)} loggerErrors=${errors.length} ` +
        `(isTransitioning не покрывает STARTING → даже logger.error молчит; defaults применились к стартовому матчу?)`,
    );
  }

  // --- Q4: flat dotted name update (#1194 neighborhood) ---
  {
    const r = createRouter([{ name: "home", path: "/" }], {
      allowNotFound: false,
    });
    const api = getRoutesApi(r);

    api.add({ name: "flat.leaf", path: "/flat-leaf" });

    try {
      api.update("flat.leaf", { defaultParams: { d: "1" } });
      line(
        "Q4 update flat dotted 'flat.leaf'",
        `NO THROW; get().defaultParams=${JSON.stringify(api.get("flat.leaf")?.defaultParams)} (запись по имени, walk не нужен)`,
      );
    } catch (e) {
      line("Q4 update flat dotted 'flat.leaf'", `THROW: ${(e as Error).message}`);
    }
  }

  // --- Q5: update during active navigation — logger.error + proceeds ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "slow", path: "/slow" },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);
    const lifecycle = getLifecycleApi(r);
    const errors: string[] = [];
    const origError = console.error;

    let release!: (v: boolean) => void;
    const gate = new Promise<boolean>((res) => {
      release = res;
    });

    lifecycle.addActivateGuard("slow", () => () => gate);

    await r.start("/");

    const navP = r.navigate("slow");

    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    };
    api.update("slow", { defaultParams: { mid: "nav" } });
    console.error = origError;

    release(true);
    await navP;

    line(
      "Q5 update() mid-navigation",
      `loggerErrorFired=${errors.length > 0 ? "yes" : "NO"} ` +
        `msgHas'navigation in progress'=${errors.some((e) => e.includes("navigation is in progress"))} ` +
        `applied=${JSON.stringify(api.get("slow")?.defaultParams)} (warning-not-block контракт)`,
    );
  }

  console.log("probe-01 done");
})();
