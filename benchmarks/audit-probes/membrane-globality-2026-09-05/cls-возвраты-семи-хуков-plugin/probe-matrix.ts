// Матрица классификации семейства «возвраты семи хуков Plugin».
//
// Строки — семь хуков (onStart, onStop, onTransitionStart,
// onTransitionLeaveApprove, onTransitionSuccess, onTransitionError,
// onTransitionCancel). Колонки — армы:
//   hostile      — враждебный thenable: сколько раз ядро читает `.then` (P1-база)
//   plain        — НЕГАТИВНЫЙ КОНТРОЛЬ: `.then` не функция → одно чтение, ноль вызовов
//   stableReject — ПОЗИТИВНЫЙ КОНТРОЛЬ: стабильный отвергающий thenable → ошибка в sink
//   driftReject  — P1: read#1 отдаёт отвергающий `then`, read#2 отдаёт не-функцию
//   origPromise  — эксперимент (а), плечо «оригинал»: реальный отвергнутый Promise
//   copyPromise  — эксперимент (а), плечо «копия контейнера на границе»: {...promise}
//   lyingProxy   — P2: ownKeys молчит про "then", getOwnPropertyDescriptor лжёт
//   protoAccessor— P3: `then` — УНАСЛЕДОВАННЫЙ аксессор (get+set) на чужом прототипе
//   writeTrap    — P3: Proxy считает ЛЮБУЮ запись ядра в объект двери
//
// Единственный потребитель на все семь дверей — EventEmitter.ts · #invokeIsolated
// (`typeof (result as PromiseLike<unknown>).then === "function"` →
// `Promise.resolve(result).catch(...)`). Реестр слушателей —
// PluginsNamespace.ts · #startPlugin по EVENTS_MAP.
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

const HOOKS = [
  "onStart",
  "onStop",
  "onTransitionStart",
  "onTransitionLeaveApprove",
  "onTransitionSuccess",
  "onTransitionError",
  "onTransitionCancel",
] as const;

type Hook = (typeof HOOKS)[number];

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Инструментация (вся СНАРУЖИ ядра: враждебные возвраты + logger-callback)
// ---------------------------------------------------------------------------
let ARM = "";
let reads: Record<string, number> = {};
let calls: Record<string, number> = {};
let sink: string[] = [];
let handed: Record<string, unknown> = {};
let protoSetterCalls = 0;
let trapWrites = 0;

const unhandled: string[] = [];

process.on("unhandledRejection", (e: unknown) => {
  unhandled.push(`${ARM}:${String((e as Error)?.message ?? e)}`);
});

const bump = (m: Record<string, number>, h: string): void => {
  m[h] = (m[h] ?? 0) + 1;
};

// Прототип с УНАСЛЕДОВАННЫМ аксессором `then` (форма #1852, без загрязнения
// Object.prototype — глобальный `then` сделал бы thenable каждый await ядра).
const accessorProto = {} as Record<string, unknown>;

Object.defineProperty(accessorProto, "then", {
  configurable: true,
  get(): unknown {
    bump(reads, "protoGet");

    return (resolve: (v: unknown) => void) => {
      bump(calls, "protoCall");
      resolve(undefined);
    };
  },
  set(): void {
    protoSetterCalls += 1;
  },
});

function makeReturn(hook: Hook): unknown {
  switch (ARM) {
    case "hostile": {
      const o = {
        get then() {
          bump(reads, hook);

          return (resolve: (v: unknown) => void) => {
            bump(calls, hook);
            resolve(undefined);
          };
        },
      };

      handed[hook] = o;

      return o;
    }
    case "plain": {
      return {
        get then() {
          bump(reads, hook);

          return 42;
        },
      };
    }
    case "stableReject": {
      return {
        get then() {
          bump(reads, hook);

          return (_res: unknown, rej: (e: unknown) => void) => {
            bump(calls, hook);
            rej(new Error(`REJECTED_${hook}`));
          };
        },
      };
    }
    case "driftReject": {
      let n = 0;

      return {
        get then() {
          bump(reads, hook);
          n += 1;

          // Первое чтение — та самая функция, по которой ядро ПРИНИМАЕТ решение
          // «это thenable, подпишу .catch». Второе — не функция.
          return n === 1
            ? (_res: unknown, rej: (e: unknown) => void) => {
                bump(calls, hook);
                rej(new Error(`REJECTED_${hook}`));
              }
            : 42;
        },
      };
    }
    case "origPromise": {
      const p = Promise.reject(new Error(`REJECTED_${hook}`));

      handed[hook] = p;

      return p;
    }
    case "copyPromise": {
      const p = Promise.reject(new Error(`REJECTED_${hook}`));
      // Стратегия (а) на этой двери: мелкая копия контейнера на границе.
      const copy = { ...p };

      handed[hook] = copy;

      return copy;
    }
    case "lyingProxy": {
      return new Proxy(
        {},
        {
          get: (_t, k) =>
            k === "then"
              ? (resolve: (v: unknown) => void) => {
                  bump(calls, hook);
                  resolve(undefined);
                }
              : undefined,
          has: (_t, k) => {
            if (k === "then") bump(reads, `${hook}·has`);

            return false;
          },
          ownKeys: () => {
            bump(reads, `${hook}·ownKeys`);

            return [];
          },
          getOwnPropertyDescriptor: (_t, k) => {
            if (k === "then") {
              bump(reads, `${hook}·gOPD`);

              return { configurable: true, enumerable: true, value: 1 };
            }

            return undefined;
          },
        },
      );
    }
    case "protoAccessor": {
      return Object.create(accessorProto) as unknown;
    }
    case "writeTrap": {
      const o = new Proxy(
        {},
        {
          get: (_t, k) =>
            k === "then"
              ? (resolve: (v: unknown) => void) => {
                  bump(calls, hook);
                  resolve(undefined);
                }
              : undefined,
          set: () => {
            trapWrites += 1;

            return true;
          },
          defineProperty: () => {
            trapWrites += 1;

            return true;
          },
          deleteProperty: () => {
            trapWrites += 1;

            return true;
          },
          setPrototypeOf: () => {
            trapWrites += 1;

            return true;
          },
        },
      );

      handed[hook] = o;

      return o;
    }
    default: {
      return undefined;
    }
  }
}

// ---------------------------------------------------------------------------
// Один прогон роутера доводит вход до ВСЕХ СЕМИ хуков.
// ---------------------------------------------------------------------------
async function drive(arm: string): Promise<void> {
  ARM = arm;
  reads = {};
  calls = {};
  sink = [];
  handed = {};

  const routes = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
    { name: "c", path: "/c" },
  ];

  const router = createRouter(routes as never, {
    logger: {
      level: "none",
      callbackIgnoresLevel: true,
      callback: (level: string, ctx: string, msg: string, ...rest: unknown[]) => {
        if (level === "error") {
          sink.push(
            `${ctx}|${msg}|${String((rest[0] as Error)?.message ?? rest[0])}`,
          );
        }
      },
    },
  } as never);

  const hooks: Record<string, unknown> = {};

  for (const h of HOOKS) hooks[h] = () => makeReturn(h);

  router.usePlugin((() => hooks) as never);

  await router.start("/a");
  // b активируется, a деактивируется → TRANSITION_LEAVE_APPROVE + SUCCESS
  await router.navigate("b");

  // ОШИБОЧНАЯ арка
  try {
    await router.navigate("nope" as never);
  } catch {
    /* ожидаемо */
  }

  // АРКА ОТМЕНЫ: медленный canActivate держит первую навигацию, вторая её отменяет
  getLifecycleApi(router).addActivateGuard("c", ((): (() => Promise<boolean>) =>
    () =>
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(true), 50);
      })) as never);

  const first = router.navigate("c").catch(() => undefined);

  await sleep(5);

  const second = router.navigate("a").catch(() => undefined);

  await Promise.all([first, second]);
  await sleep(80);

  router.stop();
  await sleep(30);
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const table: Record<string, Record<string, unknown>> = {};

  for (const arm of [
    "hostile",
    "plain",
    "stableReject",
    "driftReject",
    "origPromise",
    "copyPromise",
    "lyingProxy",
    "protoAccessor",
    "writeTrap",
  ]) {
    await drive(arm);

    const row: Record<string, unknown> = {};

    for (const h of HOOKS) {
      row[h] = { reads: reads[h] ?? 0, calls: calls[h] ?? 0 };
    }

    if (arm === "lyingProxy") {
      row.__ownKeysAsked = Object.keys(reads).filter((k) =>
        k.endsWith("·ownKeys"),
      ).length;
      row.__hasAsked = Object.keys(reads).filter((k) =>
        k.endsWith("·has"),
      ).length;
      row.__gOPDAsked = Object.keys(reads).filter((k) =>
        k.endsWith("·gOPD"),
      ).length;
    }

    if (arm === "protoAccessor") {
      row.__protoGetReads = reads.protoGet ?? 0;
      row.__protoThenCalls = calls.protoCall ?? 0;
      row.__protoSetterCalls = protoSetterCalls;
    }

    if (arm === "writeTrap") row.__trapWrites = trapWrites;

    if (arm === "hostile") {
      // P4: уровень вызывающего после прохода через дверь
      row.__frozenAfter = HOOKS.map(
        (h) => `${h}:${String(handed[h] ? Object.isFrozen(handed[h]) : "n/a")}`,
      ).join(",");
    }

    row.__sink = sink.filter((s) => s.includes("REJECTED_"));
    row.__unhandled = unhandled.filter((u) => u.startsWith(`${arm}:`));

    table[arm] = row;
  }

  // ПОЗИТИВНЫЙ КОНТРОЛЬ ИНСТРУМЕНТАЦИИ (что счётчики вообще умеют считать):
  const ctlProto = Object.create(accessorProto) as Record<string, unknown>;
  const before = protoSetterCalls;

  ctlProto.then = 1;

  const ctlTrapBefore = trapWrites;
  const ctlProxy = new Proxy(
    {},
    {
      set: () => {
        trapWrites += 1;

        return true;
      },
    },
  ) as Record<string, unknown>;

  ctlProxy.x = 1;

  console.log(
    JSON.stringify(
      {
        table,
        instrumentationControls: {
          protoSetterFiresOnRealWrite: protoSetterCalls - before,
          trapFiresOnRealWrite: trapWrites - ctlTrapBefore,
        },
      },
      null,
      1,
    ),
  );
}

void main().catch((e: unknown) => {
  console.log("THROWN", e);
});
