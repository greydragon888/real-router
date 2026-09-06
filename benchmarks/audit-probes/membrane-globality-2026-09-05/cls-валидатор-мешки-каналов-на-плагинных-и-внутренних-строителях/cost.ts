// Cost of strategy (a) on this family's hot doors: what one container copy at
// the boundary costs, on the REAL bag shape (1 path key + 1 query key).
//
// Arm A (baseline) = door called with the caller's bag, exactly as today.
// Arm B (withCopy) = door called with `{...bag}` on BOTH channels — the copy a
//   boundary horn would make once before handing anything to the validator.
// Arms ALTERNATE, medians of per-round medians, and an A/A floor (arm A run as
// two arms) gives the scale.
//
// validation-plugin is INSTALLED — these doors do not exist without it
// (`ctx.validator` is undefined in bare core and every callback is skipped).
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";

const ROUTES = [
  { name: "u", path: "/u/:id?tab" },
  { name: "home", path: "/home" },
];

const mkRouter = async (): Promise<ReturnType<typeof createRouter>> => {
  const r = createRouter(ROUTES as never, {} as never);

  r.usePlugin(validationPlugin() as never);
  await r.start("/home");

  return r;
};

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);

  return s.length % 2 === 1
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function timeOne(fn: () => void): Promise<number> {
  for (let i = 0; i < 2000; i++) fn();

  const stats = await measure(
    function* () {
      yield {
        bench() {
          do_not_optimize(fn());
        },
      };
    },
    { batch_samples: 4 * 1024, min_cpu_time: 220 * 1e6 },
  );

  return stats.avg;
}

async function ab(
  door: string,
  armA: () => void,
  armB: () => void,
  labelB: string,
): Promise<void> {
  const a: number[] = [];
  const b: number[] = [];

  for (let round = 0; round < 7; round++) {
    a.push(await timeOne(armA));
    b.push(await timeOne(armB));
  }

  const ma = median(a);
  const mb = median(b);

  console.log(
    `COST ${JSON.stringify({
      door,
      armB: labelB,
      baselineNs: Number(ma.toFixed(2)),
      withCopyNs: Number(mb.toFixed(2)),
      deltaPct: Number((((mb - ma) / ma) * 100).toFixed(2)),
      roundsA: a.map((x) => Number(x.toFixed(2))),
      roundsB: b.map((x) => Number(x.toFixed(2))),
      harness: "mitata measure, 7 alternating rounds, median of round means",
    })}`,
  );
}

void (async () => {
  const router = await mkRouter();
  const api = getPluginApi(router);
  const params = { id: "7" };
  const search = { tab: "a" };

  // A/A FLOOR — the identical arm run twice.
  await ab(
    "A/A floor · makeState",
    () => {
      api.makeState("u", params as never, search as never, "/u/7");
    },
    () => {
      api.makeState("u", params as never, search as never, "/u/7");
    },
    "identical (floor)",
  );

  await ab(
    "D1/D2 PluginApi.makeState",
    () => {
      api.makeState("u", params as never, search as never, "/u/7");
    },
    () => {
      api.makeState("u", { ...params } as never, { ...search } as never, "/u/7");
    },
    "shallow copy of both channels",
  );

  await ab(
    "D3/D4 PluginApi.forwardState",
    () => {
      api.forwardState("u", params as never, search as never);
    },
    () => {
      api.forwardState("u", { ...params } as never, { ...search } as never);
    },
    "shallow copy of both channels",
  );

  await ab(
    "D5/D6 PluginApi.buildNavigationState",
    () => {
      api.buildNavigationState("u", params as never, search as never);
    },
    () => {
      api.buildNavigationState("u", { ...params } as never, { ...search } as never);
    },
    "shallow copy of both channels",
  );
})();
