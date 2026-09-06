// D7 cost arm: the per-navigation door (`router.navigate` -> wireNamespaces ·
// buildNavigateState). Async, so measured with an explicit alternating loop
// rather than mitata's sync bench: N real navigations per sample, two pre-built
// bags alternated so every navigation is a genuine state change.
//
// Arm A = the caller's bags as today. Arm B = `{...bag}` on both channels at the
// boundary. A/A floor = arm A run as both arms.
import { createRouter } from "@real-router/core";
import { validationPlugin } from "@real-router/validation-plugin";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
];

const P7 = { id: "7" };
const P8 = { id: "8" };
const SA = { tab: "a" };
const SB = { tab: "b" };

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);

  return s.length % 2 === 1
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function sample(copy: boolean, navs: number): Promise<number> {
  const router = createRouter(ROUTES as never, {} as never);

  router.usePlugin(validationPlugin() as never);
  await router.start("/home");

  // warmup
  for (let i = 0; i < 200; i++) {
    const p = i % 2 === 0 ? P7 : P8;
    const s = i % 2 === 0 ? SA : SB;

    await router.navigate("u", (copy ? { ...p } : p) as never, (copy ? { ...s } : s) as never);
  }

  const t0 = process.hrtime.bigint();

  for (let i = 0; i < navs; i++) {
    const p = i % 2 === 0 ? P7 : P8;
    const s = i % 2 === 0 ? SA : SB;

    await router.navigate("u", (copy ? { ...p } : p) as never, (copy ? { ...s } : s) as never);
  }

  const t1 = process.hrtime.bigint();

  router.dispose();

  return Number(t1 - t0) / navs;
}

async function ab(label: string, copyA: boolean, copyB: boolean): Promise<void> {
  const a: number[] = [];
  const b: number[] = [];

  for (let round = 0; round < 9; round++) {
    a.push(await sample(copyA, 3000));
    b.push(await sample(copyB, 3000));
  }

  const ma = median(a);
  const mb = median(b);

  console.log(
    `COSTNAV ${JSON.stringify({
      door: label,
      baselineNs: Number(ma.toFixed(1)),
      withCopyNs: Number(mb.toFixed(1)),
      deltaPct: Number((((mb - ma) / ma) * 100).toFixed(2)),
      roundsA: a.map((x) => Number(x.toFixed(1))),
      roundsB: b.map((x) => Number(x.toFixed(1))),
      harness: "hrtime, 3000 navs/sample, 9 alternating rounds, median",
    })}`,
  );
}

void (async () => {
  await ab("A/A floor · navigate", false, false);
  await ab("D7 navigate → buildNavigateState", false, true);
})();
