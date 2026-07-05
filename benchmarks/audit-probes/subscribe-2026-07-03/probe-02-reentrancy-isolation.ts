// probe-02: post-#1030/#1033/#944 reentrancy + isolation semantics of
// subscribe listeners.
//
// Contracts: CLAUDE.md "subscribe(listener)" — sync reentrant navigate is
// BANNED (REENTRANT_NAVIGATION, surfaced non-fatally via onListenerError);
// deferred navigate allowed; async listener rejection isolated (#944, same
// onListenerError sink — no Node unhandledRejection); per-listener error
// isolation (other listeners still run).
//
// Structural probe — battery-safe.
import { createRouter } from "@real-router/core";

const unhandled: unknown[] = [];

process.on("unhandledRejection", (reason) => {
  unhandled.push(reason);
});

void (async () => {
  const mk = () =>
    createRouter([
      { name: "home", path: "/" },
      { name: "about", path: "/about" },
      { name: "third", path: "/third" },
    ]);

  // --- 1. sync reentrant navigate from a listener: banned, isolated, others run ---
  {
    const r = mk();

    await r.start("/");

    const seen: string[] = [];
    let reentrantError: string | undefined;

    r.subscribe(() => {
      seen.push("L1");
      try {
        void r.navigate("third"); // sync reentrant — must throw synchronously
      } catch (e) {
        reentrantError = (e as { code?: string }).code;
        throw e; // rethrow → per-listener isolation must swallow, L2 still runs
      }
    });
    r.subscribe(() => {
      seen.push("L2");
    });

    const nav = await r.navigate("about").then(
      (s) => `resolved:${s.name}`,
      (e: { code?: string }) => `rejected:${e.code}`,
    );

    console.log(
      `1. sync reentrant: navigate=${nav} listenerCaught=${reentrantError} seen=${JSON.stringify(seen)} state=${r.getState()?.name}`,
    );
  }

  // --- 2. deferred (microtask) navigate from a listener: allowed ---
  {
    const r = mk();

    await r.start("/");

    let deferredResult = "not-run";
    const done = new Promise<void>((resolve) => {
      r.subscribe(({ route }) => {
        if (route.name !== "about") {
          return;
        }

        queueMicrotask(() => {
          r.navigate("third").then(
            (s) => {
              deferredResult = `resolved:${s.name}`;
              resolve();
            },
            (e: { code?: string }) => {
              deferredResult = `rejected:${e.code}`;
              resolve();
            },
          );
        });
      });
    });

    await r.navigate("about");
    await done;
    console.log(`2. deferred navigate: ${deferredResult} state=${r.getState()?.name}`);
  }

  // --- 3. async listener rejection → isolated (no unhandledRejection) ---
  {
    const r = mk();

    await r.start("/");

    r.subscribe(async () => {
      await Promise.resolve();
      throw new Error("async listener boom");
    });

    await r.navigate("about");
    // give the microtask queue two turns for the rejection to be routed
    await new Promise((res) => setTimeout(res, 20));
    console.log(
      `3. async rejection isolated: unhandledRejection count=${unhandled.length} (expect 0)`,
    );
  }

  // --- 4. mid-emit subscribe/unsubscribe semantics (snapshot, size>1) ---
  {
    const r = mk();

    await r.start("/");

    const seen: string[] = [];
    let unsubB: (() => void) | undefined;

    r.subscribe(() => {
      seen.push("A");
      // add a new listener mid-emit — must NOT run in the current cycle
      r.subscribe(() => {
        seen.push("C-added-mid-emit");
      });
      // remove B mid-emit — snapshot iteration → B still runs in this cycle
      unsubB?.();
    });
    unsubB = r.subscribe(() => {
      seen.push("B");
    });

    await r.navigate("about");
    console.log(
      `4. mid-emit (size>1): first cycle seen=${JSON.stringify(seen)} (expect A,B — no C)`,
    );

    seen.length = 0;
    await r.navigate("third");
    console.log(
      `   second cycle seen=${JSON.stringify(seen)} (C fires now; B gone)`,
    );
  }

  // --- 5. dispose() from a listener mid-emit ---
  {
    const r = mk();

    await r.start("/");

    const seen: string[] = [];

    r.subscribe(() => {
      seen.push("D1");
      r.dispose();
    });
    r.subscribe(() => {
      seen.push("D2");
    });

    const nav = await r.navigate("about").then(
      (s) => `resolved:${s.name}`,
      (e: { code?: string }) => `rejected:${e.code}`,
    );

    console.log(
      `5. dispose mid-emit: navigate=${nav} seen=${JSON.stringify(seen)} disposed-now=${(() => {
        try {
          r.subscribe(() => {});

          return false;
        } catch {
          return true;
        }
      })()}`,
    );
  }
})();
