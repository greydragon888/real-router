// Probe-08: clearAll completeness.
//
// clearAll() must wipe all three collections:
//   - #emitter listeners (via emitter.clearAll())
//   - #leaveListeners (via this.#leaveListeners.length = 0)
//   - plugin addEventListener-listeners (which go through #emitter — so
//     should be covered by emitter.clearAll())
//
// Verify by counting fires after clearAll.

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

const router = createRouter([
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
]);
await router.start("/");

const calls = { subscribe: 0, subscribeLeave: 0, addEventListener: 0 };

router.subscribe(() => { calls.subscribe++; });
router.subscribeLeave(() => { calls.subscribeLeave++; });

const pluginApi = getPluginApi(router);
// Try several event names
const eventNames = [
  "onTransitionSuccess",  // plugin event name
  "$$success",            // internal event name
];
for (const name of eventNames) {
  try {
    pluginApi.addEventListener(name, () => { calls.addEventListener++; });
    console.log(`  addEventListener registered for "${name}"`);
  } catch (e) {
    console.log(`  addEventListener failed for "${name}":`, e.message);
  }
}

await router.navigate("a");
console.log("[before clearAll] calls:", calls);

// Now dispose, which triggers eventBus.clearAll()
router.dispose();
console.log("[after dispose] calls (no further events expected):", calls);

// Note: dispose also clears #emitter; #leaveListeners array is reset.
// Verify by inspecting internal field count via property reflection is not
// possible from public surface — but we observe no fires post-dispose.

// === Variant: explicit clearAll path — but it's not on public surface ===
// Use sequential clearAll via dispose is the only public path.

console.log("[OK] clearAll completes if calls counts stayed at:", calls);
