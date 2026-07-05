/**
 * Probe 06 (wave 2, 2026-07-03): when does subscribeLeave fire — the wiki
 * "When It Fires" table (leave.md), plus the tentative-departure contract (#932)
 * and the isLeaveApproved() window.
 *
 * Matrix:
 *  (a) canDeactivate false → NOT fired
 *  (b) SAME_STATES sync reject → NOT fired
 *  (c) navigateToNotFound() → NOT fired
 *  (d) first navigation via start() (fromState undefined) → NOT fired
 *  (e) zero-guard navigation → fired
 *  (f) isLeaveApproved() === true inside listener, false after commit
 *  (g) unknown-route navigate (ROUTE_NOT_FOUND) → NOT fired
 *  (h) subscribeLeave(undefined) → TypeError invariant guard
 *  (i) pre-bound subscribeLeave after dispose() → ROUTER_DISPOSED (#946)
 */

import { createRouter, errorCodes } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

import type { RouterError } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "target", path: "/target" },
];

function report(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? "OK " : "FAIL"} | ${label} | ${detail}`);
  if (!ok) process.exitCode = 1;
}

void (async () => {
  // ===== (a) canDeactivate false =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    getLifecycleApi(router).addDeactivateGuard("home", () => () => false);
    let fired = false;
    router.subscribeLeave(() => {
      fired = true;
    });
    const err = (await router
      .navigate("target")
      .catch((e: unknown) => e)) as RouterError;
    report(
      "(a) deactivation guard false → leave NOT fired",
      !fired && err.code === errorCodes.CANNOT_DEACTIVATE,
      `fired=${String(fired)} code=${String(err.code)}`,
    );
  }

  // ===== (b) SAME_STATES =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let fired = false;
    router.subscribeLeave(() => {
      fired = true;
    });
    const err = (await router
      .navigate("home")
      .catch((e: unknown) => e)) as RouterError;
    report(
      "(b) SAME_STATES reject → leave NOT fired",
      !fired && err.code === errorCodes.SAME_STATES,
      `fired=${String(fired)} code=${String(err.code)}`,
    );
  }

  // ===== (c) navigateToNotFound =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let fired = false;
    router.subscribeLeave(() => {
      fired = true;
    });
    router.navigateToNotFound("/nope");
    report(
      "(c) navigateToNotFound → leave NOT fired (bypasses pipeline)",
      !fired && router.getState()?.path === "/nope",
      `fired=${String(fired)} path=${String(router.getState()?.path)}`,
    );
  }

  // ===== (d) first navigation via start() =====
  {
    const router = createRouter(ROUTES);
    let fired = false;
    router.subscribeLeave(() => {
      fired = true;
    });
    await router.start("/");
    report(
      "(d) start() (fromState undefined) → leave NOT fired",
      !fired && router.getState()?.name === "home",
      `fired=${String(fired)}`,
    );
  }

  // ===== (e) zero-guard navigation fires =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let fired = false;
    router.subscribeLeave(() => {
      fired = true;
    });
    await router.navigate("target");
    report(
      "(e) zero-guard navigation → leave fired",
      fired,
      `fired=${String(fired)}`,
    );
  }

  // ===== (f) isLeaveApproved() window =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let insideListener: boolean | undefined;
    router.subscribeLeave(() => {
      insideListener = router.isLeaveApproved();
    });
    await router.navigate("target");
    report(
      "(f) isLeaveApproved(): true inside listener, false after commit",
      insideListener === true && !router.isLeaveApproved(),
      `inside=${String(insideListener)} after=${String(router.isLeaveApproved())}`,
    );
  }

  // ===== (g) ROUTE_NOT_FOUND =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    let fired = false;
    router.subscribeLeave(() => {
      fired = true;
    });
    const err = (await router
      .navigate("ghost")
      .catch((e: unknown) => e)) as RouterError;
    report(
      "(g) ROUTE_NOT_FOUND → leave NOT fired",
      !fired && err.code === errorCodes.ROUTE_NOT_FOUND,
      `fired=${String(fired)} code=${String(err.code)}`,
    );
  }

  // ===== (h) subscribeLeave(undefined) invariant guard =====
  {
    const router = createRouter(ROUTES);
    let threw: unknown;
    try {
      router.subscribeLeave(undefined as never);
    } catch (error) {
      threw = error;
    }
    report(
      "(h) subscribeLeave(undefined) → TypeError (invariant guard)",
      threw instanceof TypeError &&
        (threw as TypeError).message.includes("subscribeLeave"),
      `threw=${String(threw)}`,
    );
  }

  // ===== (i) pre-bound reference after dispose (#946) =====
  {
    const router = createRouter(ROUTES);
    await router.start("/");
    const preBound = router.subscribeLeave.bind(router);
    router.dispose();
    let threw: unknown;
    try {
      preBound(() => {});
    } catch (error) {
      threw = error;
    }
    report(
      "(i) pre-bound subscribeLeave after dispose → ROUTER_DISPOSED (#946)",
      (threw as RouterError | undefined)?.code === errorCodes.ROUTER_DISPOSED,
      `code=${String((threw as RouterError | undefined)?.code)}`,
    );
  }

  console.log("\nprobe-06 done");
})();
