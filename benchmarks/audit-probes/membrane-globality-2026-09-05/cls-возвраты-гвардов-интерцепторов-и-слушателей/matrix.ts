// Матрица классификации семейства «возвраты-гвардов-интерцепторов-и-слушателей».
// Строки — 6 дверей, столбцы — эксперимент (а), P1, P2, P3, P4.
//
// Двери и потребители (из исходника):
//   GuardFn·return                          guardPhase.ts · runStep (instanceof Promise) +
//                                           errorHandling.ts · resolveAsyncGuard (await)
//   Router.subscribeLeave·LeaveFn·return    EventBusNamespace.ts · awaitLeaveListeners (duck `then`)
//   InterceptorFn<"start">·return           Router.ts · #runStart (duck `then`, затем `.catch`)
//   PluginApi.addEventListener·cb·return    EventEmitter.ts · #invokeIsolated (duck `then` + Promise.resolve)
//   RouterInternals.addEventListener·cb·return  тот же #invokeIsolated
//   Router.subscribe·SubscribeFn·return     тот же #invokeIsolated
import { createRouter } from "@real-router/core";
import { getLifecycleApi, getPluginApi } from "@real-router/core/api";

import { getInternals } from "../../../../packages/core/src/internals";

type Bag = Record<string, unknown>;
const out: Record<string, unknown> = {};
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

const ROUTES = (): Bag[] => [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
  { name: "c", path: "/c" },
];
const mk = (): any => createRouter(ROUTES() as never, {} as never);

// ── инструмент: счётчик чтений/вызовов `then` на объекте вызывающего ──────────
interface Counted {
  reads: number;
  calls: number;
  obj: unknown;
}
const countingThenable = (resolveWith: unknown = undefined): Counted => {
  const c: Counted = { reads: 0, calls: 0, obj: undefined };

  c.obj = {
    get then() {
      c.reads++;

      return (res: (v: unknown) => void) => {
        c.calls++;
        res(resolveWith);
      };
    },
  };

  return c;
};

// ── инструмент P1: ДРЕЙФУЮЩИЙ `then` — первое чтение отдаёт then, резолвящий
// одним значением, второе — другим. Если наблюдаемый результат пришёл от
// ВТОРОГО чтения, дверь читает ключ дважды и берёт не то, что проверяла (#1899).
const driftingThenable = (
  firstValue: unknown,
  laterValue: unknown,
): { obj: unknown; reads: () => number; resolvedWith: () => unknown } => {
  let n = 0;
  let resolved: unknown = "<never-resolved>";
  const obj = {
    get then() {
      n++;
      const v = n === 1 ? firstValue : laterValue;

      return (res: (x: unknown) => void) => {
        resolved = v;
        res(v);
      };
    },
  };

  return { obj, reads: () => n, resolvedWith: () => resolved };
};

// ─────────────────────────────────────────────────────────────────────────────
// ШАПКА: позитивные контроли инструмента — каждая позиция реально вызывается,
// и обычный (легальный) возврат тем же кодом даёт ожидаемое поведение.
// ─────────────────────────────────────────────────────────────────────────────
async function header(): Promise<void> {
  const r = mk();
  const hit: Record<string, number> = {};

  getLifecycleApi(r).addActivateGuard("b", ((): (() => boolean) => () => {
    hit.guard = (hit.guard ?? 0) + 1;

    return true; // легальный возврат
  }) as never);
  r.subscribeLeave(() => {
    hit.leave = (hit.leave ?? 0) + 1;
  });
  r.subscribe(() => {
    hit.subscribe = (hit.subscribe ?? 0) + 1;
  });
  getPluginApi(r).addEventListener("$$success", (() => {
    hit.pluginApiListener = (hit.pluginApiListener ?? 0) + 1;
  }) as never);
  getInternals(r).addEventListener("$$success", (() => {
    hit.internalsListener = (hit.internalsListener ?? 0) + 1;
  }) as never);
  getPluginApi(r).addInterceptor("start", ((next: any, p: string) => {
    hit.startInterceptor = (hit.startInterceptor ?? 0) + 1;

    return next(p); // легальный возврат
  }) as never);

  await r.start("/a");
  await r.navigate("b");
  await sleep(10);

  out["HEADER.positiveControl.callbackHits"] = hit;
  out["HEADER.positiveControl.legalGuardTrue.committed"] = r.getState().name;
  r.dispose();

  // Негативный полюс гарда тем же кодом: легальный `false` отклоняет навигацию.
  const r2 = mk();

  getLifecycleApi(r2).addActivateGuard(
    "b",
    ((): (() => boolean) => () => false) as never,
  );
  await r2.start("/a");
  try {
    await r2.navigate("b");
    out["HEADER.positiveControl.legalGuardFalse"] = "NO-THROW (unexpected)";
  } catch (e) {
    out["HEADER.positiveControl.legalGuardFalse"] = String(
      (e as { code?: string }).code ?? e,
    );
  }
  out["HEADER.positiveControl.legalGuardFalse.committed"] = r2.getState().name;
  r2.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// P1 — сколько раз ядро читает `then` на объекте вызывающего, и от КАКОГО
// чтения приходит наблюдаемый результат (дрейфующий вход).
// ─────────────────────────────────────────────────────────────────────────────
async function p1(): Promise<void> {
  // A. три двери EventEmitter · #invokeIsolated
  const r = mk();
  const cSub = countingThenable();
  const cPlugin = countingThenable();
  const cInternals = countingThenable();

  r.subscribe(() => cSub.obj);
  getPluginApi(r).addEventListener("$$success", (() => cPlugin.obj) as never);
  getInternals(r).addEventListener(
    "$$success",
    (() => cInternals.obj) as never,
  );

  await r.start("/a");
  await r.navigate("b");
  await sleep(20);

  out["P1.Router.subscribe·SubscribeFn·return"] = {
    thenReads: cSub.reads,
    thenCalls: cSub.calls,
  };
  out["P1.PluginApi.addEventListener·cb·return"] = {
    thenReads: cPlugin.reads,
    thenCalls: cPlugin.calls,
  };
  out["P1.RouterInternals.addEventListener·cb·return"] = {
    thenReads: cInternals.reads,
    thenCalls: cInternals.calls,
  };
  r.dispose();

  // A′. ДРЕЙФ на emitter-двери: первое чтение отдаёт then→"FIRST-READ",
  // второе — then→"SECOND-READ". Кто победил?
  const r2 = mk();
  const drift = driftingThenable("FIRST-READ", "SECOND-READ");

  r2.subscribe(() => drift.obj);
  await r2.start("/a");
  await r2.navigate("b");
  await sleep(20);
  out["P1.drift.Router.subscribe"] = {
    thenReadsOverTwoEmits: drift.reads(), // 2 эмита $$success: start + navigate
    coreConsumedValueFrom: drift.resolvedWith(),
  };
  r2.dispose();

  // B. LeaveFn — duck `then` в awaitLeaveListeners, затем Promise.allSettled.
  const r3 = mk();
  const cLeave = countingThenable();

  r3.subscribeLeave(() => cLeave.obj);
  await r3.start("/a");
  await r3.navigate("b");
  await sleep(20);
  out["P1.Router.subscribeLeave·LeaveFn·return"] = {
    thenReads: cLeave.reads,
    thenCalls: cLeave.calls,
  };
  r3.dispose();

  const r4 = mk();
  const driftLeave = driftingThenable("FIRST-READ", "SECOND-READ");

  r4.subscribeLeave(() => driftLeave.obj);
  await r4.start("/a");
  await r4.navigate("b");
  await sleep(20);
  out["P1.drift.subscribeLeave"] = {
    thenReadsOnOneLeave: driftLeave.reads(),
    coreConsumedValueFrom: driftLeave.resolvedWith(),
    committed: r4.getState().name,
  };
  r4.dispose();

  // C. GuardFn — `instanceof Promise` (НЕ чтение ключа) + await.
  //    Подкласс Promise: считаем вызовы then, наложенные ядром.
  const r5 = mk();
  let subclassThenCalls = 0;

  class CountedPromise<T> extends Promise<T> {
    then(...args: never[]): any {
      subclassThenCalls++;

      return (Promise.prototype.then as any).apply(this, args);
    }
  }
  getLifecycleApi(r5).addActivateGuard(
    "b",
    ((): (() => any) => () => CountedPromise.resolve(true)) as never,
  );
  await r5.start("/a");
  await r5.navigate("b");
  await sleep(10);
  out["P1.GuardFn·return.promiseSubclass"] = {
    thenCallsByCore: subclassThenCalls,
    committed: r5.getState().name,
  };
  r5.dispose();

  // C′. ДРЕЙФУЮЩИЙ `then` на гарде: объект НЕ instanceof Promise →
  //     ядро его вообще не читает и трактует как truthy.
  const r6 = mk();
  const driftGuard = driftingThenable(false, false);

  getLifecycleApi(r6).addActivateGuard(
    "b",
    ((): (() => any) => () => driftGuard.obj) as never,
  );
  await r6.start("/a");
  let guardVerdict = "committed";

  try {
    await r6.navigate("b");
  } catch (e) {
    guardVerdict = String((e as { code?: string }).code ?? e);
  }
  out["P1.GuardFn·return.nonPromiseThenable"] = {
    thenReadsByCore: driftGuard.reads(),
    verdict: guardVerdict,
    committed: r6.getState().name,
  };
  r6.dispose();

  // D. InterceptorFn<"start">·return — duck `then`, затем `.catch`.
  const r7 = mk();
  let thenReads = 0;
  let catchReads = 0;

  getPluginApi(r7).addInterceptor("start", ((next: any, p: string) => {
    const inner: Promise<unknown> = next(p);
    const wrapper = {
      get then() {
        thenReads++;

        return inner.then.bind(inner);
      },
      get catch() {
        catchReads++;

        return inner.catch.bind(inner);
      },
    };

    return wrapper;
  }) as never);
  const started = await r7.start("/a");

  out["P1.InterceptorFn·start·return"] = {
    thenReadsByCore: thenReads,
    catchReadsByCore: catchReads,
    committed: r7.getState().name,
    startResolvedIsCoreState: started === r7.getState(),
  };
  r7.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// P2 — перечисление ключей / hasOwn на объекте вызывающего.
// Лгущий Proxy: ownKeys НЕ называет `then`, getOwnPropertyDescriptor
// утверждает, что он собственный, get отдаёт функцию.
// ─────────────────────────────────────────────────────────────────────────────
async function p2(): Promise<void> {
  let ownKeysAsked = 0;
  let gopdAsked = 0;
  let getAsked = 0;
  let hasAsked = 0;
  let called = 0;

  const lying = new Proxy(
    {},
    {
      ownKeys(): ArrayLike<string | symbol> {
        ownKeysAsked++;

        return []; // лжёт: `then` не назван
      },
      getOwnPropertyDescriptor(_t, k): PropertyDescriptor | undefined {
        gopdAsked++;

        return k === "then"
          ? { configurable: true, enumerable: true, value: undefined }
          : undefined;
      },
      has(_t, k): boolean {
        hasAsked++;

        return k === "then";
      },
      get(_t, k): unknown {
        getAsked++;

        if (k === "then") {
          return (res: (v: unknown) => void) => {
            called++;
            res(undefined);
          };
        }

        return undefined;
      },
    },
  );

  const r = mk();

  r.subscribe(() => lying);
  await r.start("/a");
  await r.navigate("b");
  await sleep(20);
  out["P2.lyingProxy.emitterDoor"] = {
    ownKeysAsked,
    getOwnPropertyDescriptorAsked: gopdAsked,
    hasAsked,
    getAsked,
    thenCalled: called,
  };
  r.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// P3 — унаследованный аксессор под именем ключа + собственный "__proto__".
// Ядро в возврат вызывающего НЕ пишет; проверяем (1) что запись не уходит в
// унаследованный сеттер и (2) что унаследованный ГЕТТЕР `then` на
// Object.prototype превращает любой обычный возврат в «thenable» для ядра.
// ─────────────────────────────────────────────────────────────────────────────
async function p3(): Promise<void> {
  let inheritedGetterHits = 0;
  let inheritedSetterHits = 0;
  let thenCalled = 0;
  const plain: Bag = { ordinary: "return-value" };

  Object.defineProperty(Object.prototype, "then", {
    configurable: true,
    get(): unknown {
      inheritedGetterHits++;

      return (res: (v: unknown) => void) => {
        thenCalled++;
        res(undefined);
      };
    },
    set(): void {
      inheritedSetterHits++;
    },
  });

  try {
    const r = mk();

    r.subscribe(() => plain); // обычный объект, `then` только на прототипе
    await r.start("/a");
    await r.navigate("b");
    await sleep(20);
    out["P3.inheritedThenOnObjectPrototype"] = {
      inheritedGetterHits,
      inheritedSetterHits,
      thenCalledOnPlainReturn: thenCalled,
      callersObjectStillOwnKeys: Object.keys(plain),
      callersObjectMutatedByCore:
        JSON.stringify(plain) !== JSON.stringify({ ordinary: "return-value" }),
    };
    r.dispose();
  } finally {
    delete (Object.prototype as Bag).then;
  }
  out["P3.cleanup.objectPrototypeThenGone"] = !("then" in {});

  // Собственный "__proto__" из JSON.parse в возврате слушателя: ядро не должно
  // подменить прототип ни себе, ни объекту вызывающего.
  const hostile = JSON.parse('{"__proto__":{"pwned":1},"then":null}') as Bag;
  const r2 = mk();

  r2.subscribe(() => hostile);
  await r2.start("/a");
  await r2.navigate("b");
  await sleep(20);
  out["P3.ownProtoKeyInReturn"] = {
    ownProtoKeyPreserved: Object.hasOwn(hostile, "__proto__"),
    prototypeOfHostileIsObject:
      Object.getPrototypeOf(hostile) === Object.prototype,
    globalPolluted: (({} as Bag).pwned ?? null) !== null,
    committed: r2.getState().name,
  };
  r2.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// P4 — морозит ли ядро возврат вызывающего (и его вложенный уровень).
// ─────────────────────────────────────────────────────────────────────────────
async function p4(): Promise<void> {
  const nested: Bag = { deep: "x" };
  const subReturn: Bag = { nested };
  const leaveReturn: Bag = { nested };
  const guardBox: Bag = { nested };
  const r = mk();

  r.subscribe(() => subReturn);
  r.subscribeLeave(() => leaveReturn);
  getLifecycleApi(r).addActivateGuard(
    "b",
    ((): (() => any) => () => guardBox) as never,
  );
  await r.start("/a");
  await r.navigate("b");
  await sleep(20);
  out["P4.callerReturnsFrozenByCore"] = {
    subscribeReturn: Object.isFrozen(subReturn),
    subscribeReturnNested: Object.isFrozen(nested),
    leaveReturn: Object.isFrozen(leaveReturn),
    guardReturn: Object.isFrozen(guardBox),
  };
  // Позитивный контроль замораживателя: уровень, порождённый ядром (LeaveState),
  // — заморожен; это доказывает, что freeze в этом кадре РАБОТАЕТ.
  let leaveStateFrozen: unknown = "<listener-not-run>";
  const r2 = mk();

  r2.subscribeLeave((s: unknown) => {
    leaveStateFrozen = Object.isFrozen(s);
  });
  await r2.start("/a");
  await r2.navigate("b");
  await sleep(10);
  out["P4.positiveControl.coreOwnLevelFrozen.LeaveState"] = leaveStateFrozen;
  r.dispose();
  r2.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// ЭКСПЕРИМЕНТ (а) — «скопировать контейнер на границе». Для возврата-thenable
// копия контейнера = усыновление одним примитивом: Promise.resolve(x).
// Эмулируем обёрткой колбэка: та же дверь, тот же ввод, но ядру достаётся
// НОВЫЙ, ядру-эквивалентный контейнер вместо ручки вызывающего.
// Сравниваем ВСЕ наблюдаемые следствия.
// ─────────────────────────────────────────────────────────────────────────────
async function expA(): Promise<void> {
  const run = async (copy: boolean): Promise<Bag> => {
    const seen: Bag = {};
    const r = mk();
    const wrap = (v: unknown): unknown => (copy ? Promise.resolve(v) : v);
    const errors: string[] = [];

    getPluginApi(r).addEventListener("$$error", ((e: unknown) => {
      errors.push(String(e));
    }) as never);
    r.subscribe(() => wrap(Promise.reject(new Error("boom-sub"))));
    getPluginApi(r).addEventListener("$$success", (() =>
      wrap(Promise.reject(new Error("boom-plugin")))) as never);
    getInternals(r).addEventListener("$$success", (() =>
      wrap(Promise.reject(new Error("boom-internals")))) as never);

    // leave-слушатель, отказ которого ОБЯЗАН отклонить навигацию.
    r.subscribeLeave(() => wrap(Promise.reject(new Error("boom-leave"))));

    // гард, возвращающий Promise<false>.
    getLifecycleApi(r).addActivateGuard(
      "c",
      ((): (() => any) => () => wrap(Promise.resolve(false))) as never,
    );

    // start-интерцептор.
    getPluginApi(r).addInterceptor("start", ((next: any, p: string) =>
      wrap(next(p))) as never);

    seen.started = (await r.start("/a")).name;

    try {
      await r.navigate("b");
      seen.navB = "resolved";
    } catch (e) {
      seen.navB = String((e as { code?: string }).code ?? e);
    }
    seen.afterB = r.getState().name;

    try {
      await r.navigate("c");
      seen.navC = "resolved";
    } catch (e) {
      seen.navC = String((e as { code?: string }).code ?? e);
    }
    seen.afterC = r.getState().name;
    await sleep(30);
    seen.buildPath = r.buildPath("a", {});
    seen.stateShape = JSON.stringify({
      name: r.getState().name,
      params: r.getState().params,
      path: r.getState().path,
    });
    seen.errorSink = errors.length;
    r.dispose();

    return seen;
  };

  const original = await run(false);
  const copied = await run(true);

  out["EXP-a.original"] = original;
  out["EXP-a.withBoundaryCopy"] = copied;
  out["EXP-a.identical"] = JSON.stringify(original) === JSON.stringify(copied);

  // Идентичность: требует ли КТО-ТО ниже по потоку тот же объект?
  // Единственный кандидат — InterceptorFn<"start">·return: start() отдаёт
  // РЕЗУЛЬТАТ вызывающему. Проверяем, что усыновление контейнера сохраняет
  // идентичность резолв-ЗНАЧЕНИЯ (лист по ссылке).
  const sentinel = { iAm: "resolved-by-interceptor" };
  const mkStart = async (copy: boolean): Promise<boolean> => {
    const r = mk();

    getPluginApi(r).addInterceptor("start", ((next: any, p: string) => {
      const inner = (next(p) as Promise<unknown>).then(() => sentinel);

      return copy ? Promise.resolve(inner) : inner;
    }) as never);
    const res = await r.start("/a");

    r.dispose();

    return (res as unknown) === sentinel;
  };

  out["EXP-a.start.resolvedValueIdentity"] = {
    original: await mkStart(false),
    withBoundaryCopy: await mkStart(true),
  };

  // Обратная видимость: мутируем возвращённый объект ПОСЛЕ прохода двери —
  // видит ли ядро? (и наоборот: меняет ли ядро объект вызывающего?)
  const box: Bag = { marker: "before" };
  const r = mk();

  r.subscribe(() => box);
  await r.start("/a");
  await r.navigate("b");
  await sleep(20);
  box.marker = "after";
  await r.navigate("c");
  await sleep(20);
  out["EXP-a.backVisibility"] = {
    coreStateMentionsMarker: JSON.stringify(r.getState()).includes("after"),
    callerObjectUnchangedByCore: box.marker === "after",
    callerObjectOwnKeys: Object.keys(box),
  };
  r.dispose();
}

async function main(): Promise<void> {
  await header();
  await p1();
  await p2();
  await p3();
  await p4();
  await expA();
  console.log(JSON.stringify(out, null, 1));
}

void main();
