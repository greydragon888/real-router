/**
 * Probe 06: hot-path overhead measurement for subscribeLeave.
 *
 * AC power assumed (audit-prompt indicates AC).
 *
 * Variants:
 *   N=0  baseline navigate (hasLeaveListeners() === false)
 *   N=1  sync listener returns undefined
 *   N=1  async listener resolves immediately
 *   N=5  async listeners parallel
 *   N=1  listener with 10ms artificial delay (total ~ max delay, not sum)
 *
 * Output: ns per navigate (averaged).
 *
 * NOT a benchmark; this is a verification probe for relative orders of magnitude.
 */

import { createRouter } from "@real-router/core";

const ROUTES = [
  { name: "home", path: "/" },
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
] as const;
const TARGETS = ["a", "b", "a", "b"] as const;

const ITERATIONS = 5000;

function ns(t: bigint): number {
  return Number(t);
}

async function bench(
  label: string,
  setup: (r: ReturnType<typeof createRouter>) => void,
): Promise<void> {
  const router = createRouter([...ROUTES]);
  await router.start("/");
  setup(router);

  // warmup
  for (let i = 0; i < 200; i++) {
    await router.navigate(TARGETS[i % TARGETS.length]);
  }

  const start = process.hrtime.bigint();
  for (let i = 0; i < ITERATIONS; i++) {
    await router.navigate(TARGETS[i % TARGETS.length]);
  }
  const end = process.hrtime.bigint();
  const avg = ns(end - start) / ITERATIONS;
  console.log(`${label.padEnd(40)} ${avg.toFixed(0).padStart(8)} ns/navigate`);
  router.stop();
}

async function main() {
  await bench("N=0 (no leave listeners)", () => {});

  await bench("N=1 sync listener", (r) => {
    r.subscribeLeave(() => {});
  });

  await bench("N=1 async listener (immediate)", (r) => {
    r.subscribeLeave(async () => {});
  });

  await bench("N=5 sync listeners", (r) => {
    for (let i = 0; i < 5; i++) r.subscribeLeave(() => {});
  });

  await bench("N=5 async listeners (immediate)", (r) => {
    for (let i = 0; i < 5; i++) r.subscribeLeave(async () => {});
  });

  await bench("N=1 async listener (Promise.resolve)", (r) => {
    r.subscribeLeave(() => Promise.resolve());
  });

  // 10ms delay sample
  await bench("N=1 async listener (10ms delay)", (r) => {
    r.subscribeLeave(
      () => new Promise<void>((res) => setTimeout(res, 10)),
    );
  });
}

main().catch((e) => {
  console.error("PROBE FAILED:", e);
  process.exit(99);
});
