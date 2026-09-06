// ЦЕНА (а) на реестровых дверях. Формы мешка — реальные для этой двери:
// один path-слот + один объявленный ?-ключ.
// Арма A — как сегодня (ручка на живой кэш).
// Арма B — (а) «копия на границе»: кэш отдаёт СВЕЖИЙ массив каждому читателю.
// Арма C — (а)-эквивалент по цене: массив морозится ОДИН раз при заполнении
//          кэша, ручка остаётся той же (записи вызывающего невозможны).
// Чередование арм, медианы по батчам, A/A-пол.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type AnyRec = Record<string, unknown>;
type R = { buildPath: (n: string, p?: AnyRec, s?: AnyRec) => string };

class CopyOnGetMap extends Map<string, string[]> {
  override get(k: string): string[] | undefined {
    const v = super.get(k);
    return v === undefined ? undefined : [...v];
  }
}
class FreezeOnSetMap extends Map<string, string[]> {
  override set(k: string, v: string[]): this {
    return super.set(k, Object.freeze(v) as string[]);
  }
}

const ROUTES = [
  { name: "home", path: "/home" },
  { name: "q", path: "/q/:id?tab" },
] as never;

const mk = (arm: "A" | "B" | "C") => {
  const router = createRouter(ROUTES, { defaultRoute: "home" } as never);
  const int = getInternals(router) as unknown as {
    getQueryParams: (n: string) => readonly string[];
    routeGetStore: () => AnyRec;
  };
  const store = int.routeGetStore();
  if (arm === "B") {
    store.urlParamsCache = new CopyOnGetMap();
    store.queryParamsCache = new CopyOnGetMap();
  } else if (arm === "C") {
    store.urlParamsCache = new FreezeOnSetMap();
    store.queryParamsCache = new FreezeOnSetMap();
  }
  const api = getPluginApi(router as never) as unknown as {
    makeState: (n: string, p?: AnyRec, s?: AnyRec) => AnyRec;
  };
  return { router: router as unknown as R, api };
};

const OPS = 2000;
const BATCHES = 41;
const params = { id: "1" };
const search = { tab: "x" };

let sink = 0;
const runBuild = (rig: ReturnType<typeof mk>): void => {
  for (let i = 0; i < OPS; i++) {
    sink += rig.router.buildPath("q", params, search).length;
  }
};
const runState = (rig: ReturnType<typeof mk>): void => {
  for (let i = 0; i < OPS; i++) {
    sink += Object.keys(rig.api.makeState("q", params, search).search as AnyRec)
      .length;
  }
};

const median = (xs: number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

function race(
  work: (rig: ReturnType<typeof mk>) => void,
  arms: ("A" | "B" | "C")[],
): Record<string, number> {
  const rigs = Object.fromEntries(arms.map((a) => [a, mk(a)])) as Record<
    string,
    ReturnType<typeof mk>
  >;
  const samples: Record<string, number[]> = Object.fromEntries(
    arms.map((a) => [a, [] as number[]]),
  );
  // прогрев
  for (const a of arms) {
    for (let i = 0; i < 5; i++) {
      work(rigs[a]!);
    }
  }
  for (let b = 0; b < BATCHES; b++) {
    for (const a of arms) {
      const t0 = process.hrtime.bigint();
      work(rigs[a]!);
      samples[a]!.push(Number(process.hrtime.bigint() - t0) / OPS);
    }
  }
  return Object.fromEntries(arms.map((a) => [a, median(samples[a]!)]));
}

const pct = (base: number, x: number): number =>
  Math.round(((x - base) / base) * 1000) / 10;

const out: AnyRec = {};
for (const [name, work] of [
  ["buildPath", runBuild],
  ["makeState", runState],
] as [string, (r: ReturnType<typeof mk>) => void][]) {
  const r = race(work, ["A", "B", "C"]);
  // A/A-пол: две независимые арма-A в том же чередовании
  const aa = race(work, ["A", "A"] as ("A" | "B" | "C")[]);
  out[name] = {
    baselineNs: Math.round(r.A! * 10) / 10,
    withCopyNs: Math.round(r.B! * 10) / 10,
    withFreezeNs: Math.round(r.C! * 10) / 10,
    deltaPct_copy: pct(r.A!, r.B!),
    deltaPct_freeze: pct(r.A!, r.C!),
    aaFloorPct: Math.abs(pct(aa.A!, aa.A!)) || 0,
  };
}
// A/A-пол честно: два РАЗНЫХ рига одной армы
{
  const rigs = [mk("A"), mk("A")];
  const s: number[][] = [[], []];
  for (const rig of rigs) {
    for (let i = 0; i < 5; i++) {
      runBuild(rig);
    }
  }
  for (let b = 0; b < BATCHES; b++) {
    for (let k = 0; k < 2; k++) {
      const t0 = process.hrtime.bigint();
      runBuild(rigs[k]!);
      s[k]!.push(Number(process.hrtime.bigint() - t0) / OPS);
    }
  }
  const m0 = median(s[0]!);
  const m1 = median(s[1]!);
  out.aaFloor_buildPath = {
    a1Ns: Math.round(m0 * 10) / 10,
    a2Ns: Math.round(m1 * 10) / 10,
    floorPct: pct(m0, m1),
  };
}
out.harness = `hrtime.bigint, ${OPS} ops/batch, ${BATCHES} batches, alternating arms, median; sink=${sink > 0}`;
console.log(JSON.stringify(out, null, 1));
