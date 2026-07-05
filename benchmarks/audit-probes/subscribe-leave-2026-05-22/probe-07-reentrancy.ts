/**
 * Probe 07: reentrancy boundaries inside listener.
 *
 *  - router.stop() inside listener — what happens to navigate Promise?
 *  - router.dispose() inside listener — pending allSettled?
 *  - subscribe(other) inside listener — fires in same TRANSITION_SUCCESS?
 *  - listener throws sync × N — first error wins; remaining listeners run?
 */

import { createRouter, errorCodes } from "@real-router/core";

async function caseA() {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await router.start("/");

  router.subscribeLeave(() => {
    router.stop();
  });

  const result = await router.navigate("a").catch((e) => e);
  console.log("[A] stop() inside listener →",
    result instanceof Error
      ? `error code=${(result as { code?: string }).code}`
      : `state=${(result as { name: string }).name}`,
  );
  console.log("    isActive:", router.isActive());
}

async function caseB() {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await router.start("/");

  router.subscribeLeave(() => {
    router.dispose();
  });

  const result = await router.navigate("a").catch((e) => e);
  console.log("[B] dispose() inside listener →",
    result instanceof Error
      ? `error code=${(result as { code?: string }).code}`
      : `state=${(result as { name: string }).name}`,
  );
}

async function caseC() {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await router.start("/");

  let postFireCount = 0;
  router.subscribeLeave(() => {
    router.subscribe(() => {
      postFireCount++;
    });
  });

  await router.navigate("a");
  console.log("[C] subscribe(post) inside leave: post fires =", postFireCount);
}

async function caseD() {
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await router.start("/");

  const calls: number[] = [];
  router.subscribeLeave(() => {
    calls.push(1);
    throw new Error("first");
  });
  router.subscribeLeave(() => {
    calls.push(2);
    throw new Error("second");
  });
  router.subscribeLeave(() => {
    calls.push(3);
  });

  const result = await router.navigate("a").catch((e) => e);
  const err = result as Error;
  console.log("[D] sync throws ×N: calls =", calls, "err.message =", err.message);
}

async function caseE() {
  // never-settling Promise + concurrent navigate
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ]);
  await router.start("/");

  let aSignal: AbortSignal | undefined;
  router.subscribeLeave(({ signal }) => {
    aSignal = signal;
    return new Promise<void>(() => {});
  });

  const navA = router.navigate("a");
  await new Promise((r) => setTimeout(r, 30));
  const navB = router.navigate("b");

  await Promise.race([
    navB,
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => {});

  console.log("[E] never-settle + concurrent: signal.aborted =", aSignal?.aborted);
  console.log("    final state:", router.getState()?.name);
}

async function caseF() {
  // start fires? (first navigate has no fromState)
  const router = createRouter([{ name: "home", path: "/" }]);
  let fired = 0;
  router.subscribeLeave(() => {
    fired++;
  });
  await router.start("/");
  console.log("[F] start: subscribeLeave fired =", fired, "(expected 0)");
}

async function caseG() {
  // navigateToNotFound bypasses pipeline
  const router = createRouter([
    { name: "home", path: "/" },
  ]);
  await router.start("/");

  let fired = 0;
  router.subscribeLeave(() => {
    fired++;
  });

  router.navigateToNotFound("/missing");
  console.log("[G] navigateToNotFound: fired =", fired, "(expected 0)");
}

async function caseH() {
  // SAME_STATES — no fire
  const router = createRouter([
    { name: "home", path: "/" },
    { name: "a", path: "/a" },
  ]);
  await router.start("/");

  let fired = 0;
  await router.navigate("a");
  router.subscribeLeave(() => {
    fired++;
  });
  await router.navigate("a").catch(() => {});
  console.log("[H] SAME_STATES: fired =", fired, "(expected 0)");
}

async function caseI() {
  // typeof guard
  const router = createRouter([{ name: "home", path: "/" }]);
  await router.start("/");

  for (const bad of [null, undefined, 0, "", {}, [], Symbol("x")]) {
    try {
      router.subscribeLeave(bad as unknown as () => void);
      console.log("[I] subscribeLeave(", bad, ") did NOT throw");
    } catch (e: unknown) {
      const err = e as Error;
      console.log(
        `[I] subscribeLeave(${String(bad)}) → ${err.name}: ${err.message}`,
      );
    }
  }

  // subscribe hint check for symmetry
  try {
    router.subscribe(null as unknown as () => void);
  } catch (e: unknown) {
    console.log(
      "    [hint comparison] subscribe(null) message:",
      (e as Error).message,
    );
  }
  try {
    router.subscribeLeave(null as unknown as () => void);
  } catch (e: unknown) {
    console.log(
      "    [hint comparison] subscribeLeave(null) message:",
      (e as Error).message,
    );
  }
}

async function main() {
  await caseA();
  await caseB();
  await caseC();
  await caseD();
  await caseE();
  await caseF();
  await caseG();
  await caseH();
  await caseI();
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});
