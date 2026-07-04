// probe-01: getRoutesApi().replace() contract matrix — post-#950/#977/#1035/#1046 code.
//
// Baseline 2026-06-04 residuals are CLOSED (#950 revalidation emit implemented,
// #968 fixed by #977). This probe re-verifies bugs FILED by the 2026-07-03 parallel
// waves against the live code (Q1 #1193, Q2 #1192, Q3 #1170) and hunts seams the
// waves did not cover:
//   Q4  guard-bypass via revalidation: after replace(), the current URL can map to
//       a DIFFERENT (guarded) route — setState commits it without running guards
//   Q4b forwardTo applied during revalidation (rewritePathOnMatch semantics)
//   Q5  replace during the STARTING window (isTransitioning() is false there)
//   Q6  О-5 ordering: subscribeChanges handler sees new tree + still-old state
//   Q7  идемпотентный replace ×3 — сколько TRANSITION_SUCCESS/TREE_CHANGED эмитов
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
  // --- Q1 (filed #1193): failed replace with compile-throwing factory erases OLD definition guards ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "sec", path: "/sec", canActivate: () => () => false }, // definition, blocks
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);

    await r.start("/");

    const blockedBefore = r.canNavigateTo("sec"); // false — definition guard live

    let threw = "no-throw";

    try {
      api.replace([
        { name: "home", path: "/" },
        {
          name: "bad",
          path: "/bad",
          canActivate: (() => {
            throw new Error("boom-compile");
          }) as never,
        },
      ]);
    } catch (e) {
      threw = (e as Error).message;
    }

    line(
      "Q1 (filed #1193) failed replace erases old definition guards",
      `blockedBefore=${String(!blockedBefore)} throw='${threw}' treeIntact(has sec)=${api.has("sec")} ` +
        `guardStillBlocks=${String(!r.canNavigateTo("sec"))} <-- confirmed if treeIntact=true but guardStillBlocks=false`,
    );
  }

  // --- Q2 (filed #1192): both-slot route — erased definition stays COMPILED after replace ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "dual", path: "/dual" },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);
    const lifecycle = getLifecycleApi(r);

    await r.start("/");

    // external FIRST (allows), definition SECOND via update (blocks; last add wins)
    lifecycle.addActivateGuard("dual", () => () => true);
    api.update("dual", { canActivate: () => () => false });

    const blockedByDefinition = !r.canNavigateTo("dual"); // true — definition compiled last

    // new set keeps "dual" WITHOUT a definition guard → clearDefinitionGuards hits both-slot
    api.replace([
      { name: "home", path: "/" },
      { name: "dual", path: "/dual" },
    ]);

    line(
      "Q2 (filed #1192) both-slot: erased definition stays compiled",
      `blockedByDefinitionBefore=${String(blockedByDefinition)} ` +
        `afterReplace canNavigateTo('dual')=${String(r.canNavigateTo("dual"))} ` +
        `<-- confirmed (bug) if false: compiled slot still runs the ERASED definition guard, ` +
        `factories-wise only the allowing external remains`,
    );
  }

  // --- Q3 (filed #1170): revalidation loses route-meta → ancestor guards re-run ---
  {
    const mkRoutes = () => [
      { name: "home", path: "/" },
      {
        name: "a",
        path: "/a",
        children: [
          { name: "b", path: "/b" },
          { name: "c", path: "/c" },
        ],
      },
    ];
    const r = createRouter(mkRoutes(), { allowNotFound: false });
    const api = getRoutesApi(r);
    const lifecycle = getLifecycleApi(r);
    const log: string[] = [];

    lifecycle.addActivateGuard("a", () => () => {
      log.push("guard-a");
      return true;
    });

    await r.start("/a/b"); // guard-a runs once (initial activation)

    log.length = 0;
    await r.navigate("a.c"); // sibling hop — "a" stays mounted
    const controlHop = log.length; // expect 0 — ancestor not re-checked

    api.replace(mkRoutes()); // same tree, revalidation commits state
    log.length = 0;
    await r.navigate("a.b"); // sibling hop AFTER replace
    line(
      "Q3 (filed #1170) ancestor guard re-runs after replace revalidation",
      `siblingHopBeforeReplace guard-a runs=${controlHop} (expect 0), ` +
        `siblingHopAfterReplace guard-a runs=${log.length} <-- confirmed if >0 (meta lost → full re-activation)`,
    );
  }

  // --- Q3b (filed #1170, param variant): ancestor with :id — does the sibling hop degrade? ---
  {
    const mkRoutes = () => [
      { name: "home", path: "/" },
      {
        name: "a",
        path: "/a/:id",
        children: [
          { name: "b", path: "/b" },
          { name: "c", path: "/c" },
        ],
      },
    ];
    const r = createRouter(mkRoutes(), { allowNotFound: false });
    const api = getRoutesApi(r);
    const lifecycle = getLifecycleApi(r);
    const log: string[] = [];

    lifecycle.addActivateGuard("a", () => () => {
      log.push("guard-a");
      return true;
    });

    await r.start("/a/1/b");
    log.length = 0;
    await r.navigate("a.c", { id: "1" }); // sibling hop, same :id
    const controlHop = log.length;

    api.replace(mkRoutes());
    log.length = 0;
    await r.navigate("a.b", { id: "1" }); // sibling hop AFTER replace, same :id
    line(
      "Q3b (filed #1170) param-ancestor sibling hop after replace",
      `beforeReplace guard-a=${controlHop} (expect 0), afterReplace guard-a=${log.length} ` +
        `<-- >0 means revalidated state lost its meta → ancestor re-activation`,
    );
  }

  // --- Q4: guard-bypass — revalidation maps current URL to a DIFFERENT guarded route ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "open", path: "/x" },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);

    await r.start("/x"); // state: open

    api.replace([
      { name: "home", path: "/" },
      { name: "locked", path: "/x", canActivate: () => () => false },
    ]);

    line(
      "Q4 revalidation guard-bypass (URL now belongs to a guarded route)",
      `state.name='${String(r.getState()?.name)}' canNavigateTo('locked')=${String(r.canNavigateTo("locked"))} ` +
        `<-- 'locked' committed WITHOUT its canActivate running (guard says false); ` +
        `canNavigateTo=true — это same-state-правило (current route → true), не guard-вердикт`,
    );

    // Q4c: гард жив для ОБЫЧНОЙ навигации — bypass только на revalidation-пути
    await r.navigate("home");

    const back = await r.navigate("locked").then(
      () => "resolved (guard bypassed?!)",
      (e) => `rejected ${(e as { code?: string }).code ?? ""}`,
    );

    line(
      "Q4c обычный navigate('locked') после bypass",
      `${back} <-- ожидаем rejected CANNOT_ACTIVATE: дыра только в revalidation`,
    );
  }

  // --- Q4b: forwardTo of the current route applied during revalidation? ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "cur", path: "/c" },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);

    await r.start("/c");

    api.replace([
      { name: "home", path: "/" },
      { name: "cur", path: "/c", forwardTo: "tgt" },
      { name: "tgt", path: "/t" },
    ]);

    line(
      "Q4b revalidation applies forwardTo of current route",
      `state.name='${String(r.getState()?.name)}' state.path='${String(r.getState()?.path)}' ` +
        `(was cur@/c; forwarded state means rewritePathOnMatch resolved the redirect)`,
    );
  }

  // --- Q8: контроль порядка для #1192 — definition FIRST, external SECOND (test 459 покрывает этот) ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "dual2", path: "/dual2" },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);
    const lifecycle = getLifecycleApi(r);

    await r.start("/");

    api.update("dual2", { canActivate: () => () => false }); // definition first
    lifecycle.addActivateGuard("dual2", () => () => true); // external second — wins compile

    const allowedBefore = r.canNavigateTo("dual2"); // true — external compiled last

    api.replace([
      { name: "home", path: "/" },
      { name: "dual2", path: "/dual2" },
    ]);

    line(
      "Q8 контроль порядка (definition-first, external-second)",
      `allowedBefore=${String(allowedBefore)} afterReplace canNavigateTo('dual2')=${String(r.canNavigateTo("dual2"))} ` +
        `(expect true/true — этот порядок здоров; #1192 бьёт только external-first)`,
    );
  }

  // --- Q5: replace during the STARTING window (async start interceptor) ---
  {
    const r = createRouter([{ name: "home", path: "/" }], {
      allowNotFound: false,
    });
    const api = getRoutesApi(r);
    let inWindow = "";

    getPluginApi(r).addInterceptor("start", async (next, path) => {
      try {
        api.replace([
          { name: "home", path: "/" },
          { name: "lazy", path: "/lazy" },
        ]);
        inWindow = "replace OK";
      } catch (e) {
        inWindow = `replace THREW: ${(e as Error).message}`;
      }

      return next(path);
    });

    try {
      const st = await r.start("/lazy");

      line(
        "Q5 replace() mid-STARTING",
        `${inWindow}; start resolved to '${st.name}' (isTransitioning() не покрывает STARTING → блока нет)`,
      );
    } catch (e) {
      line(
        "Q5 replace() mid-STARTING",
        `${inWindow}; start REJECTED: ${(e as { code?: string }).code ?? (e as Error).message}`,
      );
    }
  }

  // --- Q6: О-5 ordering — handler sees new tree + still-old state ---
  {
    const r = createRouter(
      [
        { name: "home", path: "/" },
        { name: "old", path: "/old" },
      ],
      { allowNotFound: false },
    );
    const api = getRoutesApi(r);

    await r.start("/old");

    let observed = "";

    api.subscribeChanges((e) => {
      if (e.op === "replace") {
        observed = `hasNew=${api.has("brand")} stateName=${String(r.getState()?.name)}`;
      }
    });
    api.replace([
      { name: "home", path: "/" },
      { name: "brand", path: "/old" },
    ]);
    line(
      "Q6 О-5 ordering in subscribeChanges handler",
      `${observed} (expect hasNew=true + stateName='old' — new tree, pre-revalidation state); ` +
        `after: state.name='${String(r.getState()?.name)}'`,
    );
  }

  // --- Q7: идемпотентный replace ×3 — сколько эмитов ---
  {
    const mkRoutes = () => [
      { name: "home", path: "/" },
      { name: "p", path: "/p" },
    ];
    const r = createRouter(mkRoutes(), { allowNotFound: false });
    const api = getRoutesApi(r);

    await r.start("/p");

    let success = 0;
    let treeChanged = 0;

    r.subscribe(() => {
      success++;
    });
    api.subscribeChanges(() => {
      treeChanged++;
    });

    api.replace(mkRoutes());
    api.replace(mkRoutes());
    api.replace(mkRoutes());

    line(
      "Q7 идемпотентный replace ×3 (started, state matches)",
      `TRANSITION_SUCCESS=${success} TREE_CHANGED=${treeChanged} (по #950 каждый replace ре-эмитит — адаптеры ре-рендерят 3×)`,
    );
  }

  console.log("probe-01 done");
})();
