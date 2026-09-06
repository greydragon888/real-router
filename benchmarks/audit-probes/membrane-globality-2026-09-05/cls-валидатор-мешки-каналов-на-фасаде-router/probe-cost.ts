/**
 * ЦЕНА (а) на горячих дверях семейства: buildPath / isActiveRoute с мешками
 * реальной формы (один ключ на канал), с установленным validation-plugin и без.
 *
 * A/B: дверь с ОРИГИНАЛОМ мешка против двери с КОПИЕЙ контейнера на границе
 * (копия эмулируется обёрткой на стороне вызывающего — src не правится).
 * Арм чередуем, берём медиану p50 по раундам; A/A-пол — тот же арм против себя.
 *
 * ⚠ tsx транспилирует TS на лету; числа — относительные, читать только дельту.
 */
import { do_not_optimize, measure } from "mitata";

import { createRouter } from "@real-router/core";
import { validationPlugin } from "../../../../packages/validation-plugin/src/index";

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b/:id?q" },
];

type R = ReturnType<typeof createRouter>;

async function mk(withPlugin: boolean): Promise<R> {
  const r = createRouter(routes as never, {} as never);

  if (withPlugin) {
    r.usePlugin(validationPlugin() as never);
  }
  await r.start("/b/1?q=x");

  return r as R;
}

const P = { id: "1" };
const S = { q: "x" };

async function p50(fn: () => void): Promise<number> {
  for (let i = 0; i < 2000; i++) {
    fn();
  }
  const stats = await measure(
    function* () {
      yield {
        bench() {
          do_not_optimize(fn());
        },
      };
    },
    { batch_samples: 4 * 1024, min_cpu_time: 250 * 1e6 },
  );

  return stats.p50;
}

const median = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

async function arm(
  name: string,
  a: () => void,
  b: () => void,
  rounds = 5,
): Promise<void> {
  const as: number[] = [];
  const bs: number[] = [];

  for (let i = 0; i < rounds; i++) {
    as.push(await p50(a));
    bs.push(await p50(b));
  }
  const A = median(as);
  const B = median(bs);

  console.log(
    JSON.stringify({
      arm: name,
      baselineNs: +A.toFixed(2),
      withCopyNs: +B.toFixed(2),
      deltaPct: +(((B - A) / A) * 100).toFixed(2),
      rounds,
      baselineSamples: as.map((x) => +x.toFixed(2)),
      copySamples: bs.map((x) => +x.toFixed(2)),
    }),
  );
}

void (async () => {
  const rP = await mk(true);
  const rN = await mk(false);

  // A/A-пол: тот же арм против себя, тем же протоколом.
  await arm(
    "AA-floor·buildPath·withPlugin",
    () => {
      rP.buildPath("b", P, S);
    },
    () => {
      rP.buildPath("b", P, S);
    },
  );

  await arm(
    "buildPath·withPlugin",
    () => {
      rP.buildPath("b", P, S);
    },
    () => {
      rP.buildPath("b", { ...P }, { ...S });
    },
  );

  await arm(
    "buildPath·noPlugin",
    () => {
      rN.buildPath("b", P, S);
    },
    () => {
      rN.buildPath("b", { ...P }, { ...S });
    },
  );

  await arm(
    "isActiveRoute·withPlugin",
    () => {
      rP.isActiveRoute("b", P, S, true, false);
    },
    () => {
      rP.isActiveRoute("b", { ...P }, { ...S }, true, false);
    },
  );

  await arm(
    "isActiveRoute·noPlugin",
    () => {
      rN.isActiveRoute("b", P, S, true, false);
    },
    () => {
      rN.isActiveRoute("b", { ...P }, { ...S }, true, false);
    },
  );
})();
