/**
 * Probe 05: VERIFY — Router extensions (extendRouter) — what happens in clone?
 *
 * Hypothesis (mixed):
 *  - If extension is added BY a plugin in its factory, cloneRouter re-instantiates
 *    plugins → plugin factory re-runs → extendRouter(extensions) re-applied on clone.
 *    Clone has the extension. Good.
 *  - If extension is added EXTERNALLY (outside a plugin), via getPluginApi(router).extendRouter({...}),
 *    the closure captures `router` (the original). The clone has NO knowledge of the
 *    extension. Clone does NOT have it. Maybe-bug (depends on intent).
 *
 * Worse: if the plugin's factory has a closure over external state (counter etc.),
 * its plugin's extendRouter callback ALSO captures the original router. When the
 * plugin is re-instantiated for the clone, the callback runs with `newRouter`
 * passed as `router` arg to the factory — but extendRouter uses the captured router
 * via getPluginApi. We need to test this.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }]);

  // Add extension via plugin
  base.usePlugin((router) => {
    const api = getPluginApi(router);

    api.extendRouter({
      myMethod: () => `from plugin on ${router.constructor.name}`,
    });

    return {};
  });

  await base.start("/");

  console.log("--- Original router ---");
  console.log("base.myMethod exists:", "myMethod" in base);
  console.log("base.myMethod():", (base as unknown as { myMethod?: () => string }).myMethod?.());

  const clone = cloneRouter(base);

  console.log("\n--- Clone ---");
  console.log("clone.myMethod exists:", "myMethod" in clone);
  console.log("clone.myMethod():", (clone as unknown as { myMethod?: () => string }).myMethod?.());

  console.log("\n--- Cross-check: are they the same function reference? ---");
  const baseMethod = (base as unknown as { myMethod?: () => string }).myMethod;
  const cloneMethod = (clone as unknown as { myMethod?: () => string }).myMethod;

  console.log("base.myMethod === clone.myMethod:", baseMethod === cloneMethod);

  // SCENARIO 2: extendRouter called EXTERNALLY (not from plugin factory)
  // Closure captures original router
  const base2 = createRouter([{ name: "home", path: "/" }]);

  getPluginApi(base2).extendRouter({
    externalMethod: () => "external",
  });

  console.log("\n--- External extendRouter (scenario 2) ---");
  console.log("base2.externalMethod exists:", "externalMethod" in base2);

  const clone2 = cloneRouter(base2);

  console.log("clone2.externalMethod exists:", "externalMethod" in clone2);

  // Verdict
  console.log("\n--- Verdict ---");

  if (!("externalMethod" in clone2)) {
    console.log("→ External extendRouter NOT re-applied on clone.");
    console.log("  CONSEQUENCE: app-code that does extendRouter outside plugin → clone is silently missing methods.");
    console.log("  This is a Bug-or-doc-gap depending on whether contract is documented.");
  }

  if ("myMethod" in clone && baseMethod !== cloneMethod) {
    console.log("→ Plugin-based extendRouter correctly re-runs in clone (different fn refs).");
  } else if (!("myMethod" in clone)) {
    console.log("→ Plugin-based extendRouter does NOT run in clone — Bug confirmed.");
  } else if (baseMethod === cloneMethod) {
    console.log("→ Plugin-based extendRouter — clone shares SAME fn ref as base (suspect)?");
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
