/**
 * Probe 17: VERIFY — dispose(original) → clone still works.
 *
 * Clone should be independent. Dispose of base should NOT break clone.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([
    { name: "home", path: "/" },
    { name: "other", path: "/other" },
  ]);

  await base.start("/");

  const clone = cloneRouter(base);

  // Dispose base
  base.dispose();
  console.log("base disposed. base.isActive():", base.isActive());

  // Can clone still start?
  try {
    await clone.start("/");
    console.log("clone.start succeeded. clone.isActive():", clone.isActive());

    await clone.navigate("other");
    console.log("clone.navigate('other'):", clone.getState()?.name);

    console.log("\n→ No leak: clone unaffected by base.dispose().");
    process.exitCode = 0;
  } catch (e) {
    console.log("clone failed:", (e as Error).message);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
