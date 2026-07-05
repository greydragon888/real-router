/**
 * Probe 11: VERIFY — interceptors registered via addInterceptor leak/migrate?
 *
 * Issue: Router constructor (Router.ts:190) creates `interceptorsMap: Map`.
 * cloneRouter creates a new Router instance (Router.ts:44) — new Map. Good.
 *
 * But interceptors get registered when a plugin calls `api.addInterceptor` in its
 * factory. For clone, plugin is re-instantiated → factory re-runs → addInterceptor
 * called against the NEW router's internals. Good.
 *
 * Edge case: what if interceptors were added OUTSIDE a plugin
 * (via getPluginApi(router).addInterceptor)? Those reference the ORIGINAL router's
 * interceptors Map — clone has empty Map.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }]);

  // Scenario A: interceptor inside plugin factory — re-runs on clone
  let pluginInterceptorCalls = 0;
  base.usePlugin((router) => {
    const api = getPluginApi(router);

    api.addInterceptor("start", (next, path) => {
      pluginInterceptorCalls++;

      return next(path);
    });

    return {};
  });

  // Scenario B: interceptor added OUTSIDE plugin
  let externalInterceptorCalls = 0;
  getPluginApi(base).addInterceptor("start", (next, path) => {
    externalInterceptorCalls++;

    return next(path);
  });

  await base.start("/");
  console.log("--- Original start ---");
  console.log("plugin interceptor fires:", pluginInterceptorCalls);
  console.log("external interceptor fires:", externalInterceptorCalls);

  // Now clone — does plugin interceptor re-run on clone? Does external?
  pluginInterceptorCalls = 0;
  externalInterceptorCalls = 0;
  const clone = cloneRouter(base);
  await clone.start("/");

  console.log("\n--- Clone start ---");
  console.log("plugin interceptor fires in clone:", pluginInterceptorCalls);
  console.log("external interceptor fires in clone:", externalInterceptorCalls);

  console.log("\n--- Verdict ---");
  if (pluginInterceptorCalls === 1 && externalInterceptorCalls === 0) {
    console.log("→ Expected behaviour: plugin interceptor re-applied via plugin re-instantiation.");
    console.log("  External interceptor NOT re-applied — undocumented limit; possibly bug.");
    process.exitCode = 0;
  } else if (externalInterceptorCalls > 0) {
    console.log("→ External interceptor leaks into clone (shared Map?).");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
