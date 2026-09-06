// Кандидаты MUST-(б) внутри семейства: места, где мешок вызывающего (или
// транзиентная копия) ОТДАЁТСЯ приложению обратно, — единственный критерий,
// по которому копия контейнера на границе могла бы сломать семантику.
//
// (1) canNavigateTo → activate-гвард приложения получает toState (транзиентная
//     копия): проверяем идентичность и глубину заморозки — P4 на ядровом уровне.
// (2) isActiveRoute / buildPath / navigate на ФОРВАРДЯЩЕМ маршруте: динамический
//     `forwardTo(params, deps)` получает мешок ВЫЗЫВАЮЩЕГО. Если он приходит по
//     идентичности — это единственное место семейства, где копия на границе
//     видна приложению. Печатаем `=== callerBag` по каждому входу.
//
// Позитивные контроли: гвард/колбэк ДОЛЖНЫ быть вызваны (счётчики > 0), и
// легальный вход даёт ожидаемый ответ (true / '/dst/7').
import { createRouter } from "@real-router/core";
import { getLifecycleApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const out: Record<string, unknown> = {};

// ---------------------------------------------------------------------------
// (1) canNavigateTo — транзиентный toState в руках гварда приложения
// ---------------------------------------------------------------------------
{
  const r = createRouter(
    [
      { name: "u", path: "/u/:id?tab" },
      { name: "plain", path: "/plain/:id" },
    ] as never,
    {} as never,
  );
  r.start("/plain/1");
  const leaf = { deep: 1 };
  const callerBag: Bag = { id: "7", extra: leaf };
  let calls = 0;
  const seen: Record<string, unknown> = {};

  getLifecycleApi(r).addActivateGuard("u", () => (toState) => {
    calls += 1;
    const p = toState.params as Bag;
    seen.paramsIsCallerBag = (p as unknown) === (callerBag as unknown);
    seen.paramsFrozen = Object.isFrozen(p);
    seen.stateShellFrozen = Object.isFrozen(toState);
    seen.leafIdentity = p.extra === leaf;
    seen.leafFrozen = Object.isFrozen(leaf);
    seen.keys = Object.keys(p);
    try {
      (p as Bag).injected = 1;
      seen.paramsWritable = true;
    } catch {
      seen.paramsWritable = false;
    }
    return true;
  });

  const verdict = r.canNavigateTo("u", callerBag as never);
  out["canNavigateTo · guard handout"] = {
    verdict,
    guardCalls: calls,
    ...seen,
    callerBagFrozenAfter: Object.isFrozen(callerBag),
    callerLeafFrozenAfter: Object.isFrozen(leaf),
  };
}

// ---------------------------------------------------------------------------
// (2) динамический forwardTo — мешок вызывающего в колбэке приложения
// ---------------------------------------------------------------------------
const forwardRoutes = (record: (params: unknown) => void) =>
  [
    {
      name: "src",
      path: "/src/:id",
      // ⚠ Форма прочитана из ИСХОДНИКА (types/router.ts · ForwardToCallback):
      // `(getDependency, params) => string`, params — ВТОРОЙ аргумент.
      forwardTo: (_getDependency: unknown, params: unknown) => {
        record(params);
        return "dst";
      },
    },
    { name: "dst", path: "/dst/:id" },
    { name: "plain", path: "/plain/:id" },
  ] as never;

const forwardCase = async (
  label: string,
  call: (r: ReturnType<typeof createRouter>, bag: Bag) => unknown,
) => {
  const received: unknown[] = [];
  const r = createRouter(forwardRoutes((p) => received.push(p)), {} as never);
  const callerBag: Bag = { id: "7" };
  let verdict: unknown;
  try {
    verdict = await call(r, callerBag);
  } catch (e) {
    verdict = `THROW ${String((e as Error).message).slice(0, 80)}`;
  }
  out[label] = {
    verdict,
    callbackCalls: received.length,
    anyArgIsCallerBag: received.some((p) => (p as unknown) === callerBag),
    argShapes: received.map((p) => ({
      keys: p && typeof p === "object" ? Object.keys(p as object) : String(p),
      frozen: Object.isFrozen(p),
      isCallerBag: (p as unknown) === callerBag,
    })),
  };
};

async function main(): Promise<void> {
  await forwardCase("isActiveRoute · forwardTo callback", (r, bag) => {
    r.start("/dst/7");
    return r.isActiveRoute("src", bag as never, undefined, false, true);
  });

  await forwardCase("buildPath · forwardTo callback", (r, bag) =>
    r.buildPath("src", bag as never),
  );

  await forwardCase("navigate · forwardTo callback", async (r, bag) => {
    r.start("/plain/1");
    const s = await r.navigate("src", bag as never);
    return (s as { path: string }).path;
  });

  // Позитивный контроль формы: тот же маршрут без враждебности — колбэк зовётся.
  console.log(JSON.stringify(out, null, 1));
}

void main();
