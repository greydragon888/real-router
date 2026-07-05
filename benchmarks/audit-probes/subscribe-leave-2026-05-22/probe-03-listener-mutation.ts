/**
 * Probe 03: listener-set mutation during awaitLeaveListeners.
 *
 * Hypothesis: #leaveListeners is iterated with `for (const x of arr)` directly
 * (no snapshot). If a listener calls subscribeLeave(another) or unsub(other)
 * mid-iteration:
 *   - subscribe(new): does the new listener fire in current iteration?
 *   - unsubscribe(other) at index > current: does `other` STILL run?
 *
 * Compare with subscribe (EventEmitter): set.size === 1 fast-path violates
 * snapshot. Array iteration MAY or MAY NOT.
 */

import { createRouter } from "@real-router/core";

async function main() {
  // ===== Case A: subscribeLeave inside a listener =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    await router.start("/");

    const calls: string[] = [];

    router.subscribeLeave(() => {
      calls.push("outer");
      router.subscribeLeave(() => {
        calls.push("added-during");
      });
    });

    await router.navigate("a");

    console.log("[A subscribe-during-emit]:", JSON.stringify(calls));
    if (calls.includes("added-during")) {
      console.log("  → newly registered listener FIRED in current cycle");
    } else {
      console.log("  → snapshot honored (new listener did NOT fire)");
    }
  }

  // ===== Case B: unsubscribe(other) inside a listener =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    await router.start("/");

    const calls: string[] = [];
    let unsubOther: (() => void) | undefined;

    router.subscribeLeave(() => {
      calls.push("first");
      unsubOther?.();
    });
    unsubOther = router.subscribeLeave(() => {
      calls.push("second");
    });

    await router.navigate("a");

    console.log("[B unsubscribe-other]:", JSON.stringify(calls));
    if (calls.includes("second")) {
      console.log("  → 'second' STILL ran despite unsub during 'first'");
    } else {
      console.log("  → 'second' was skipped (live iteration)");
    }
  }

  // ===== Case C: array iteration with splice ahead =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    await router.start("/");

    const calls: string[] = [];
    let unsubSelf: (() => void) | undefined;

    unsubSelf = router.subscribeLeave(() => {
      calls.push("self");
      unsubSelf?.(); // removes self at index 0; for-of advances; second listener may shift left
    });
    router.subscribeLeave(() => {
      calls.push("after-self");
    });
    router.subscribeLeave(() => {
      calls.push("third");
    });

    await router.navigate("a");

    console.log("[C unsubscribe-self-then-iterate]:", JSON.stringify(calls));
    if (calls.length === 3) {
      console.log("  → all listeners executed despite splice in 'self'");
    } else {
      console.log("  → splice skipped listeners; length =", calls.length);
    }
  }

  // ===== Case D: double-unsubscribe race (Bug visible in subscribe audit Drift #5) =====
  {
    const router = createRouter([
      { name: "home", path: "/" },
      { name: "a", path: "/a" },
    ]);
    await router.start("/");

    let count = 0;
    const cb = () => {
      count++;
    };
    const u1 = router.subscribeLeave(cb);
    const u2 = router.subscribeLeave(cb); // SAME listener twice

    await router.navigate("a");
    console.log("[D duplicate-listener] after 1 nav:", count);

    u1();
    await router.navigate("home", undefined, { reload: true }).catch(() => {});
    console.log("[D] after u1() + reload:", count);

    u2(); // should clean up the second registration
    await router.navigate("home", undefined, { reload: true }).catch(() => {});
    console.log("[D] after u2() + reload:", count);
  }
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});
