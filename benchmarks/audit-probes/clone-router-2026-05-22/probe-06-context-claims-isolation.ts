/**
 * Probe 06: VERIFY — claimContextNamespace records and plugin re-claim in clone.
 *
 * Issue: PluginsNamespace.use() re-instantiates plugins. Plugins claim a namespace
 * via getPluginApi(router).claimContextNamespace("X"). For the ORIGINAL router,
 * the namespace "X" is in ctx.contextClaimRecords. For the CLONE, it should be
 * empty (Router constructor creates new Set() at Router.ts:274).
 *
 * Question: when clone re-instantiates the plugin, does the claim succeed?
 * If YES — good. If the SAME plugin factory runs again on clone, does it fail
 * because of duplicate claims? Let's verify.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }]);

  let claimCount = 0;

  base.usePlugin((router) => {
    const api = getPluginApi(router);
    const claim = api.claimContextNamespace("myData");

    claimCount++;
    console.log(`  [plugin instantiated, claim #${claimCount}]`);

    return {
      onTransitionSuccess(toState) {
        claim.write(toState, { ns: "myData", instance: claimCount });
      },
      teardown() {
        claim.release();
      },
    };
  });

  await base.start("/");

  console.log("--- Original ---");
  console.log("base.getState().context.myData:", base.getState()?.context.myData);
  console.log("claim count:", claimCount);

  // Now clone — does plugin re-instantiate? Does claim succeed?
  let cloneError: Error | undefined;
  try {
    const clone = cloneRouter(base);

    await clone.start("/");

    console.log("\n--- Clone ---");
    console.log("clone.getState().context.myData:", clone.getState()?.context.myData);
    console.log("claim count after clone:", claimCount);

    if (claimCount === 2) {
      console.log("→ Plugin RE-instantiated on clone, claim succeeded. Good.");
    } else if (claimCount === 1) {
      console.log("→ Plugin NOT re-instantiated on clone. Bug?");
    }
  } catch (e) {
    cloneError = e as Error;
    console.log("\n→ Clone threw:", cloneError.message);
  }

  console.log("\n--- Verdict ---");
  if (cloneError) {
    console.log("→ Bug CONFIRMED: cloneRouter fails with plugin re-instantiation:", cloneError.message);
    process.exitCode = 1;
  } else if (claimCount === 2) {
    console.log("→ No leak: clone re-instantiates plugin, claim acquired in clone's own contextClaimRecords.");
    process.exitCode = 0;
  } else {
    console.log("→ Unexpected.");
    process.exitCode = 3;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
