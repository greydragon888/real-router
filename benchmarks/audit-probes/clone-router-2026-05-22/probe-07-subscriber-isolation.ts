/**
 * Probe 07: VERIFY — subscribers on original are NOT copied to clone.
 *
 * This is a core invariant: NO_SUBSCRIBER_LEAK.
 * If subscribers leak to clone, callbacks from previous SSR request fire on new request.
 */
import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";

async function main(): Promise<void> {
  const base = createRouter([{ name: "home", path: "/" }, { name: "other", path: "/other" }]);

  let baseSubscribeCalls = 0;
  let baseSubscribeLeaveCalls = 0;
  base.subscribe(() => {
    baseSubscribeCalls++;
  });
  base.subscribeLeave(() => {
    baseSubscribeLeaveCalls++;
  });

  const clone = cloneRouter(base);
  await clone.start("/");
  await clone.navigate("other");

  console.log("--- After clone start+navigate ---");
  console.log("base.subscribe fire count (should be 0):", baseSubscribeCalls);
  console.log("base.subscribeLeave fire count (should be 0):", baseSubscribeLeaveCalls);

  if (baseSubscribeCalls === 0 && baseSubscribeLeaveCalls === 0) {
    console.log("\n→ No leak: subscribers stay on base, do not fire on clone activity.");
    process.exitCode = 0;
  } else {
    console.log("\n→ Bug CONFIRMED: subscribers from base fire on clone activity.");
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("PROBE CRASHED:", e);
  process.exit(99);
});
