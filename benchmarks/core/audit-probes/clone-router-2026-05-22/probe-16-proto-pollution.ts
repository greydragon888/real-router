/**
 * Probe 16: VERIFY — prototype pollution via dependencies argument.
 *
 * Issue: cloneRouter.ts:39-42 does `{...sourceDeps, ...dependencies}` — uses
 * shorthand spread. Spread does NOT process `__proto__` specially for plain
 * objects in modern V8, so passing `{ __proto__: { polluted: 1 }}` won't pollute
 * Object.prototype. But what about Map/Set with __proto__-named property in deps?
 *
 * Also test: passing __proto__ as a literal Property key — does it leak to
 * Object.prototype globally? (No, normal spread doesn't trigger setter.)
 *
 * Then test the DependenciesStore behaviour with __proto__ key.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter, getDependenciesApi } from "@real-router/core/api";

async function main(): Promise<void> {
  // Before: check Object.prototype is clean
  const baseline = (Object.prototype as unknown as { polluted?: number }).polluted;

  console.log("Object.prototype.polluted baseline:", baseline);

  const base = createRouter([{ name: "home", path: "/" }]);

  // Attempt 1: pass deps object with __proto__ literal key
  const evilDeps = JSON.parse('{"__proto__":{"polluted":42}}');

  try {
    cloneRouter(base, evilDeps);
  } catch (e) {
    console.log("Threw on evil deps:", (e as Error).message);
  }

  console.log("Object.prototype.polluted after __proto__-deps:",
    (Object.prototype as unknown as { polluted?: number }).polluted);

  // Attempt 2: pass deps with constructor-pollution
  const ctorPolluted = JSON.parse('{"constructor":{"prototype":{"polluted":99}}}');

  try {
    cloneRouter(base, ctorPolluted);
  } catch (e) {
    console.log("Threw on ctor-deps:", (e as Error).message);
  }

  console.log("Object.prototype.polluted after ctor-deps:",
    (Object.prototype as unknown as { polluted?: number }).polluted);

  // Attempt 3: regular property "polluted" — should land in deps, not on prototype
  const cloneWithPolluted = cloneRouter(base, { polluted: 1 } as never);

  console.log("clone.deps.polluted:", getDependenciesApi(cloneWithPolluted).get("polluted" as never));
  console.log("Object.prototype.polluted (should be unchanged):",
    (Object.prototype as unknown as { polluted?: number }).polluted);

  // Verdict
  if ((Object.prototype as unknown as { polluted?: number }).polluted !== baseline) {
    console.log("\n→ Bug CONFIRMED: Object.prototype was polluted.");
    process.exitCode = 1;
  } else {
    console.log("\n→ No prototype pollution.");
    process.exitCode = 0;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
