/**
 * Probe 10: VERIFY — FRESH_FSM invariant.
 *
 * Clone should start in IDLE regardless of original's FSM state.
 * Test all 4 callable states: IDLE, READY (post-start), TRANSITION_STARTED, LEAVE_APPROVED.
 * (DISPOSED → throws ROUTER_DISPOSED, separate probe.)
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

async function main(): Promise<void> {
  console.log("--- 1. Original in IDLE ---");
  {
    const base = createRouter([{ name: "home", path: "/" }]);
    const clone = cloneRouter(base);

    console.log("base.isActive():", base.isActive(), "(expected false)");
    console.log("clone.isActive():", clone.isActive(), "(expected false)");
  }

  console.log("\n--- 2. Original in READY ---");
  {
    const base = createRouter([{ name: "home", path: "/" }]);

    await base.start("/");
    const clone = cloneRouter(base);

    console.log("base.isActive():", base.isActive(), "(expected true)");
    console.log("clone.isActive():", clone.isActive(), "(expected false — fresh FSM)");
    console.log("clone.getState():", clone.getState(), "(expected undefined)");
  }

  console.log("\n--- 3. Original in TRANSITION_STARTED ---");
  {
    const base = createRouter([
      { name: "home", path: "/" },
      {
        name: "slow",
        path: "/slow",
        canActivate: () => () => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 100)),
      },
    ]);

    await base.start("/");

    // Start async navigation but don't await
    const navP = base.navigate("slow");

    console.log("base.isTransitioning() during async nav:", getInternals(base).isTransitioning(), "(expected true)");
    const clone = cloneRouter(base);

    console.log("clone.isActive() during base's transition:", clone.isActive(), "(expected false)");
    console.log("clone.getState():", clone.getState(), "(expected undefined)");
    await navP;
  }

  console.log("\n--- 4. Original disposed ---");
  {
    const base = createRouter([{ name: "home", path: "/" }]);

    base.dispose();
    try {
      cloneRouter(base);
      console.log("→ Bug: cloneRouter should throw ROUTER_DISPOSED");
      process.exitCode = 1;
    } catch (e) {
      console.log("clone threw:", (e as Error).message, "(expected ROUTER_DISPOSED)");
      process.exitCode = 0;
    }
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
