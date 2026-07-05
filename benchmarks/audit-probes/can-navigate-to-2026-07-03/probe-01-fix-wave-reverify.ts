/**
 * Probe 01 (2026-07-03): re-verify the #970/#958/#959 fix wave (landed
 * d160e0b1, two days AFTER the 2026-06-25 baseline audit that found them) +
 * probe the post-#1035 and post-#1192 surfaces the baseline could not see.
 *
 *   Q1 PARITY intra-subtree (#970 core scenario, twin routers): canDeactivate
 *      on shared ancestor `users` + move users.view{1} → users.list.
 *      Pre-fix: can=false / navigate=RESOLVED (drift). Post-fix: both agree
 *      (ancestor stays mounted, guard not consulted).
 *   Q2 normalizeParams drift (#3 of baseline): guard-observed param keys for
 *      `{x: undefined}` input — canNavigateTo vs navigate must both strip.
 *   Q3 #958: async guard → SYNC false, bare core stays silent (no warn).
 *   Q4 #959: throwing sync guard → false + logger.warn fired (operational
 *      signal, always-on — intercepted via console).
 *   Q5 #1b of baseline: deactivate consult order is innermost-first post-fix.
 *   Q6 post-#1035: canNavigateTo INSIDE a transition listener (dispatch window,
 *      isProcessing > 0) — read-only predicate is NOT banned, returns verdict.
 *   Q7 post-#1192 interplay: in the zombie-compiled state (ext-block →
 *      def-allow(update) → replace) PARITY still holds — both canNavigateTo
 *      and navigate consult the same compiled Map (both report the stale
 *      verdict until #1192 is fixed; equality is what THIS audit pins).
 *
 * Structural probe — valid on battery power. Twin routers per the
 * parity-repro rule (mutating navigate would mask predicate drift).
 */

import { createRouter } from "@real-router/core";
import { getLifecycleApi, getRoutesApi } from "@real-router/core/api";

import type { Route, Router } from "@real-router/core";

/* eslint-disable @typescript-eslint/no-explicit-any */
const code = (e: unknown) => (e as any)?.code ?? String(e);

function makeRoutes(): Route[] {
  return [
    { name: "home", path: "/" },
    {
      name: "users",
      path: "/users",
      children: [
        { name: "list", path: "/list" },
        { name: "view", path: "/view/:id" },
      ],
    },
    { name: "admin", path: "/admin" },
  ];
}

async function twinPair(): Promise<[Router, Router]> {
  const a = createRouter(makeRoutes());
  const b = createRouter(makeRoutes());

  await a.start("/");
  await b.start("/");

  return [a, b];
}

void (async () => {
  // ---------- Q1: PARITY intra-subtree (#970) ----------
  {
    const [predicateRouter, navRouter] = await twinPair();

    for (const r of [predicateRouter, navRouter]) {
      getLifecycleApi(r).addDeactivateGuard("users", () => () => false); // block LEAVING the section
      await r.navigate("users.view", { id: "1" });
    }

    const can = predicateRouter.canNavigateTo("users.list");
    const nav = await navRouter.navigate("users.list").then(
      () => true,
      () => false,
    );

    console.log(
      `Q1 PARITY intra-subtree → can=${can} navigate=${nav}  ${
        can === nav && can === true
          ? "OK (#970 fixed — ancestor guard not consulted, parity holds)"
          : can === nav
            ? "PARITY holds but both blocked (unexpected)"
            : "DRIFT (#970 regressed)"
      }`,
    );
    predicateRouter.dispose();
    navRouter.dispose();
  }

  // ---------- Q2: normalizeParams — guard-observed keys ----------
  {
    const [predicateRouter, navRouter] = await twinPair();
    const seen: Record<string, string[]> = {};

    getLifecycleApi(predicateRouter).addActivateGuard(
      "admin",
      () => (toState) => {
        seen.can = Object.keys(toState.params);

        return true;
      },
    );
    getLifecycleApi(navRouter).addActivateGuard("admin", () => (toState) => {
      seen.nav = Object.keys(toState.params);

      return true;
    });

    predicateRouter.canNavigateTo("admin", { x: undefined } as any);
    await navRouter.navigate("admin", { x: undefined } as any);

    console.log(
      `Q2 normalizeParams      → can keys=[${seen.can}] nav keys=[${seen.nav}]  ${
        JSON.stringify(seen.can) === JSON.stringify(seen.nav)
          ? "OK (drift #3 fixed)"
          : "DRIFT"
      }`,
    );
    predicateRouter.dispose();
    navRouter.dispose();
  }

  // ---------- Q3: async guard → sync false, silent bare core (#958) ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    getLifecycleApi(router).addActivateGuard(
      "admin",
      () => () => Promise.resolve(true),
    );

    let warns = 0;
    const origWarn = console.warn;

    console.warn = () => {
      warns++;
    };

    const result: unknown = router.canNavigateTo("admin");

    console.warn = origWarn;
    console.log(
      `Q3 async guard (#958)   → typeof=${typeof result} value=${String(
        result,
      )} bareCoreWarns=${warns}  ${
        result === false && warns === 0
          ? "OK (sync false, DX-warn is validator-opt-in)"
          : "FAIL"
      }`,
    );
    router.dispose();
  }

  // ---------- Q4: throwing guard → false + logger.warn (#959) ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");
    getLifecycleApi(router).addActivateGuard("admin", () => () => {
      throw new Error("guard crashed");
    });

    let warns: string[] = [];
    const origWarn = console.warn;

    console.warn = (...args: unknown[]) => {
      warns.push(args.map(String).join(" "));
    };

    const result = router.canNavigateTo("admin");

    console.warn = origWarn;

    const logged = warns.some((w) => w.includes("canNavigateTo"));

    console.log(
      `Q4 throwing guard (#959)→ value=${String(result)} loggerWarned=${logged}  ${
        result === false && logged
          ? "OK (false + operational warn, always-on)"
          : "FAIL"
      }`,
    );
    router.dispose();
  }

  // ---------- Q5: deactivate order innermost-first (#1b) ----------
  {
    const router = createRouter(makeRoutes());
    const order: string[] = [];

    await router.start("/");
    getLifecycleApi(router).addDeactivateGuard("users", () => () => {
      order.push("users");

      return true;
    });
    getLifecycleApi(router).addDeactivateGuard("users.view", () => () => {
      order.push("users.view");

      return true;
    });
    await router.navigate("users.view", { id: "1" });

    router.canNavigateTo("admin"); // cross-tree: both deactivate guards consulted

    console.log(
      `Q5 deactivate order     → [${order.join(",")}]  ${
        order.join(",") === "users.view,users"
          ? "OK (innermost-first, #1b fixed)"
          : "WRONG ORDER"
      }`,
    );
    router.dispose();
  }

  // ---------- Q6: canNavigateTo inside a transition listener (#1035 boundary) ----------
  {
    const router = createRouter(makeRoutes());

    await router.start("/");

    let insideVerdict: unknown = "not-run";
    let threw: string | undefined;

    router.usePlugin(() => ({
      onTransitionStart: () => {
        try {
          insideVerdict = router.canNavigateTo("admin");
        } catch (e) {
          threw = code(e);
        }
      },
    }));

    await router.navigate("users.list");

    console.log(
      `Q6 inside listener      → verdict=${String(insideVerdict)} threw=${String(
        threw,
      )}  ${
        insideVerdict === true && threw === undefined
          ? "OK (read-only predicate not banned in dispatch window)"
          : "UNEXPECTED"
      }`,
    );
    router.dispose();
  }

  // ---------- Q7: PARITY inside the #1192 zombie state ----------
  {
    const [predicateRouter, navRouter] = await twinPair();

    for (const r of [predicateRouter, navRouter]) {
      getLifecycleApi(r).addActivateGuard("admin", () => () => false); // ext BLOCK
      getRoutesApi(r).update("admin", { canActivate: () => () => true }); // def ALLOW (last add)
      getRoutesApi(r).replace(makeRoutes()); // zombie: compiled = erased def-allow (#1192)
    }

    const can = predicateRouter.canNavigateTo("admin");
    const nav = await navRouter.navigate("admin").then(
      () => true,
      () => false,
    );

    console.log(
      `Q7 zombie parity (#1192)→ can=${can} navigate=${nav}  ${
        can === nav
          ? "OK (parity preserved — both read the same compiled Map; verdict itself is #1192's bug)"
          : "DRIFT (predicate diverged from navigate inside the zombie state)"
      }`,
    );
    predicateRouter.dispose();
    navRouter.dispose();
  }

  console.log("probe-01 done");
})();
