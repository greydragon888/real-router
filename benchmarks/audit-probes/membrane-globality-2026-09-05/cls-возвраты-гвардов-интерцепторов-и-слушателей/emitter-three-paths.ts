// Добавление к matrix.ts: три двери EventEmitter · #invokeIsolated —
// Router.subscribe·SubscribeFn·return, PluginApi.addEventListener·cb·return,
// RouterInternals.addEventListener·cb·return — это ОДИН символ-потребитель и
// ТРИ пути регистрации. Здесь:
//   (1) ОДИН эмит (подписка ставится ПОСЛЕ start) → точный счёт чтений `then`
//       на эмит по каждому пути (в matrix.ts счёт шёл на двух эмитах);
//   (2) ДРЕЙФУЮЩИЙ `then` на один эмит по каждому пути — от какого чтения
//       пришёл результат, которым ядро реально воспользовалось;
//   (3) по каждому пути: заморожен ли возврат вызывающего, изменён ли он ядром,
//       и одинаково ли ведёт себя сток ошибок при reject (обратная видимость);
//   (4) позитивный контроль инструмента: обычный (не-thenable) возврат тем же
//       кодом даёт 0 чтений и 0 вызовов, а слушатель всё равно вызван.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { getInternals } from "../../../../packages/core/src/internals";

type Bag = Record<string, unknown>;
const out: Record<string, unknown> = {};
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
const ROUTES = (): Bag[] => [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];
const mk = (): any => createRouter(ROUTES() as never, {} as never);

type Path = "subscribe" | "pluginApi" | "internals";
const PATHS: Path[] = ["subscribe", "pluginApi", "internals"];

const register = (router: any, path: Path, cb: () => unknown): void => {
  if (path === "subscribe") {
    router.subscribe(cb as never);
  } else if (path === "pluginApi") {
    getPluginApi(router).addEventListener("$$success", cb as never);
  } else {
    getInternals(router).addEventListener("$$success", cb as never);
  }
};

// ── (1)+(3) один эмит: счёт чтений/вызовов, заморозка, мутация ────────────────
async function singleEmit(): Promise<void> {
  for (const path of PATHS) {
    const router = mk();

    await router.start("/a"); // подписка ставится ПОСЛЕ start → ровно один эмит

    let reads = 0;
    let calls = 0;
    let listenerRuns = 0;
    const nested = { deep: 1 };
    const ret = {
      get then() {
        reads++;

        return (res: (v: unknown) => void) => {
          calls++;
          res(undefined);
        };
      },
      nested,
      ordinary: 1,
    };

    register(router, path, () => {
      listenerRuns++;

      return ret;
    });

    await router.navigate("b");
    await sleep(20);

    out[`emit1.${path}`] = {
      listenerRuns,
      thenReadsPerEmit: reads,
      thenCallsPerEmit: calls,
      returnFrozenByCore: Object.isFrozen(ret),
      nestedFrozenByCore: Object.isFrozen(nested),
      ownKeysAfter: Object.keys(ret).sort(),
      nestedUnchanged: nested.deep === 1,
    };
    router.dispose();
  }
}

// ── (2) дрейф на ОДИН эмит по каждому пути ───────────────────────────────────
async function driftOneEmit(): Promise<void> {
  for (const path of PATHS) {
    const router = mk();

    await router.start("/a");

    let n = 0;
    let resolvedWith: unknown = "<never-resolved>";
    const ret = {
      get then() {
        n++;
        const v = n === 1 ? "FIRST-READ" : "SECOND-READ";

        return (res: (x: unknown) => void) => {
          resolvedWith = v;
          res(v);
        };
      },
    };

    register(router, path, () => ret);
    await router.navigate("b");
    await sleep(20);

    out[`drift1.${path}`] = {
      thenReadsOnOneEmit: n,
      coreConsumedValueFrom: resolvedWith,
      committed: router.getState().name,
    };
    router.dispose();
  }
}

// ── (3b) сток ошибок: reject из возврата по каждому пути ─────────────────────
// Сток per-listener ошибок — `onListenerError` роутера, который пишет в
// logger.error (Router.ts · конструктор EventEmitter). Перехватываем вывод.
async function errorSink(): Promise<void> {
  for (const path of PATHS) {
    const sink: string[] = [];
    const realError = console.error;

    console.error = (...args: unknown[]): void => {
      sink.push(args.map(String).join(" "));
    };
    const router: any = mk();

    await router.start("/a");
    register(router, path, () => ({
      then(_res: unknown, rej: (e: unknown) => void) {
        rej(new Error(`reject-from-${path}`));
      },
    }));
    await router.navigate("b");
    await sleep(30);
    console.error = realError;

    out[`errorSink.${path}`] = {
      sinkEntries: sink.length,
      sinkMentionsRejection: sink.some((s) => s.includes(`reject-from-${path}`)),
      committedAfterRejectingListener: router.getState().name,
    };
    router.dispose();
  }
}

// ── (4) позитивный контроль инструмента: не-thenable возврат ─────────────────
async function control(): Promise<void> {
  for (const path of PATHS) {
    const router = mk();

    await router.start("/a");

    let reads = 0;
    let listenerRuns = 0;
    const ret = {
      get then() {
        reads++;

        return undefined; // НЕ функция → duck-гейт обязан отвергнуть
      },
    };

    register(router, path, () => {
      listenerRuns++;

      return ret;
    });
    await router.navigate("b");
    await sleep(20);
    out[`control.nonCallableThen.${path}`] = {
      listenerRuns,
      thenReads: reads,
      committed: router.getState().name,
    };
    router.dispose();
  }
}

async function main(): Promise<void> {
  await singleEmit();
  await driftOneEmit();
  await errorSink();
  await control();
  console.log(JSON.stringify(out, null, 1));
}

void main();
