// Цена (а) на горячей двери семейства: Router.subscribe·SubscribeFn·return
// (самая населённая — адаптеры держат на ней подписки; арка per-navigation).
//
// Что именно сравнивается. Сегодня ядро держит РУЧКУ возвращённого объекта:
// EventEmitter.ts · #invokeIsolated спрашивает `typeof result.then === "function"`
// и только потом усыновляет (`Promise.resolve(result).catch(...)`);
// EventBusNamespace.ts · awaitLeaveListeners складывает ручку в локальный
// массив и усыновляет её в Promise.allSettled. Стратегия (а) — усыновить
// контейнер ОДИН раз на границе. Правку src делать нельзя, поэтому копия
// эмулируется со стороны вызывающего, и ОБЕ армы возвращают thenable (иначе
// сравнивались бы синхронная и асинхронная фазы, а не копия против ручки):
//   A (baseline) — возвращается чужой thenable: ядро держит ручку вызывающего;
//   B (withCopy) — тот же лист, усыновлённый Promise.resolve НА ГРАНИЦЕ.
// Арма A′ — тот же код, что A, под другим именем: A/A-пол.
import { createRouter } from "@real-router/core";

type Bag = Record<string, unknown>;
const ROUTES = (): Bag[] => [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];

// Обе армы возвращают thenable — иначе сравнивались бы синхронная и
// асинхронная фазы, а не копия против ручки. A отдаёт ЧУЖОЙ (не-нативный)
// thenable — ядро держит ручку вызывающего; B отдаёт тот же thenable, уже
// усыновлённый одним примитивом на границе (`Promise.resolve`), — ядру
// достаётся его собственный контейнер.
// (Promise.resolve НАД нативным промисом вернул бы его же — копии не было бы,
// поэтому лист именно чужой thenable.)
const foreignThenable = (): PromiseLike<void> => ({
  then(res: (v: void) => void): void {
    res();
  },
});

const ARMS = {
  A_baseline: (): unknown => foreignThenable(),
  B_withCopy: (): unknown => Promise.resolve(foreignThenable()),
  Aprime_floor: (): unknown => foreignThenable(),
} as const;

type ArmName = keyof typeof ARMS;

// Сценарий выбирается аргументом: "subscribe" (EventEmitter · #invokeIsolated —
// три двери) или "leave" (EventBusNamespace · awaitLeaveListeners).
const SCENARIO = (process.argv[2] ?? "subscribe") as "subscribe" | "leave";

async function once(arm: ArmName, iters: number): Promise<number> {
  const router: any = createRouter(ROUTES() as never, {} as never);

  if (SCENARIO === "leave") {
    router.subscribeLeave(ARMS[arm]);
  } else {
    router.subscribe(ARMS[arm]);
  }
  await router.start("/a");

  const t0 = process.hrtime.bigint();

  for (let i = 0; i < iters; i++) {
    await router.navigate(i % 2 === 0 ? "b" : "a");
  }

  const t1 = process.hrtime.bigint();

  router.dispose();

  return Number(t1 - t0) / iters; // ns на навигацию
}

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);

  return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

async function main(): Promise<void> {
  const ITERS = 400;
  const ROUNDS = 25;
  const WARMUP = 4;
  const samples: Record<ArmName, number[]> = {
    A_baseline: [],
    B_withCopy: [],
    Aprime_floor: [],
  };
  const order: ArmName[] = ["A_baseline", "B_withCopy", "Aprime_floor"];

  for (let round = 0; round < ROUNDS + WARMUP; round++) {
    // чередование арм внутри раунда + разворот порядка на нечётных раундах
    const seq = round % 2 === 0 ? order : [...order].reverse();

    for (const arm of seq) {
      const ns = await once(arm, ITERS);

      if (round >= WARMUP) {
        samples[arm].push(ns);
      }
    }
  }

  const a = median(samples.A_baseline);
  const b = median(samples.B_withCopy);
  const aa = median(samples.Aprime_floor);

  console.log(
    JSON.stringify(
      {
        door: SCENARIO,
        shape: "обе армы возвращают чужой thenable; A — ручка вызывающего, B — тот же лист, усыновлённый Promise.resolve на границе; 1 подписчик, 2 маршрута, navigate туда-обратно",
        harness: `process.hrtime, ${ROUNDS} раундов × ${ITERS} навигаций, ${WARMUP} прогревочных раундов, чередование арм с разворотом порядка, медианы`,
        baselineNs: Number(a.toFixed(1)),
        withCopyNs: Number(b.toFixed(1)),
        deltaPct: Number((((b - a) / a) * 100).toFixed(2)),
        aaFloorPct: Number((((aa - a) / a) * 100).toFixed(2)),
        rounds: ROUNDS,
        itersPerRound: ITERS,
      },
      null,
      1,
    ),
  );
}

void main();
