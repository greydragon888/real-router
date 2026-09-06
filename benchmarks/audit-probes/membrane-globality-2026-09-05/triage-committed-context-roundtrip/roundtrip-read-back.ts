// Триаж батча «state.context закоммиченного State — возвраты и fromState хука».
// Вопрос: ЧИТАЕТ ли ядро контейнер `context` обратно ПОСЛЕ того, как приложение
// могло его изменить через хэндаут? Сайт чтения в ядре —
// getRoutesApi · replaceRoutes (арка «выживший»): `context: currentState.context`
// → commitRevalidated → EventBusNamespace · systemCommit → `{ ...toState.context }`.
// Round-trip проверяется так: пишем в хэндаут прямым [[Set]], зовём replace()
// тем же набором маршрутов, смотрим, дошло ли СОДЕРЖИМОЕ в НОВЫЙ закоммиченный
// контейнер (и что контейнер именно новый — иначе это не чтение, а та же ручка).
// Позитивный контроль инструмента: (1) запись видна через getState() сразу
// (хэндаут = контейнер ядра); (2) контрольный прогон БЕЗ записи — ключа нет.
// Негативный контроль: тот же протокол для getPreviousState().context —
// ревалидация читает только `current`.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

type Ctx = Record<string, unknown>;
type St = { name: string; path: string; context: Ctx };

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a/:id" },
];

const mk = async (at = "/h"): Promise<ReturnType<typeof createRouter>> => {
  const r = createRouter(ROUTES as never, {} as never);
  await r.start(at);
  return r;
};
const st = (r: ReturnType<typeof createRouter>): St =>
  r.getState() as unknown as St;
const prev = (r: ReturnType<typeof createRouter>): St | undefined =>
  r.getPreviousState() as unknown as St | undefined;

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // 1. Round-trip через хэндаут `Router.start·return` (=== getState())
  {
    const r = createRouter(ROUTES as never, {} as never);
    const startRet = (await r.start("/h")) as unknown as St;
    const MARK = { app: "startRet" };
    const before = startRet.context;
    startRet.context.probe = MARK; // прямой [[Set]], мимо claim.write
    const seenNow = st(r).context.probe === MARK;
    const idNow = startRet === (st(r) as unknown);
    await getRoutesApi(r).replace(ROUTES as never);
    const after = st(r).context;
    out["1_start·return.context"] = {
      "Router.start·return === getState() (before replace)": idNow,
      "write visible through getState() immediately": seenNow,
      "replace(): committed context is a NEW container": after !== before,
      "core READ the app write back into the new container":
        after.probe === MARK,
    };
  }

  // 2. Тот же протокол для Router.navigate·return
  {
    const r = await mk();
    const navRet = (await r.navigate("a", { id: "1" })) as unknown as St;
    const MARK = { app: "navRet" };
    const before = navRet.context;
    navRet.context.probe = MARK;
    const idNav = navRet === (st(r) as unknown);
    await getRoutesApi(r).replace(ROUTES as never);
    const after = st(r).context;
    out["2_navigate·return.context"] = {
      "navigate·return === getState() (before replace)": idNav,
      "new container after replace": after !== before,
      "app write read back": after.probe === MARK,
    };
  }

  // 3. КОНТРОЛЬ: без записи ключа нет (инструмент не выдумывает)
  {
    const r = await mk();
    await getRoutesApi(r).replace(ROUTES as never);
    out["3_control_noWrite"] = {
      "'probe' in committed context": "probe" in st(r).context,
      "Object.keys": Object.keys(st(r).context),
    };
  }

  // 4. НЕГАТИВ: getPreviousState().context — ядро его не читает
  {
    const r = await mk();
    await r.navigate("a", { id: "2" }); // теперь previous = "h"
    const p = prev(r) as St;
    const MARK = { app: "prevRet" };
    p.context.probePrev = MARK;
    const before = p.context;
    await getRoutesApi(r).replace(ROUTES as never);
    out["4_getPreviousState·return.context"] = {
      "previous handout is writable": p.context.probePrev === MARK,
      "previous slot after replace is a different state's context": prev(r)?.context !== before,
      "leaked into committed(current) context": "probePrev" in st(r).context,
    };
  }

  // 5. Plugin.onTransitionStart·fromState.context
  //   fromState = getState() на входе executeNavigation, т.е. ТОТ ЖЕ контейнер
  //   `current`. Окно round-trip: навигация отменена/провалена → current не
  //   сменился → последующий replace() читает записанное.
  {
    const r = createRouter(
      [
        ...ROUTES,
        { name: "refused", path: "/refused", canActivate: () => () => false },
      ] as never,
      {} as never,
    );
    const MARK = { app: "fromStateHook" };
    let sameAsGetState: boolean | undefined;
    r.usePlugin(() => ({
      onTransitionStart: (_to: unknown, from: unknown) => {
        if (from === undefined) {
          return;
        }
        sameAsGetState = (from as St) === (st(r) as unknown as St);
        (from as St).context.probeFrom = MARK;
      },
    }));
    await r.start("/h");
    const beforeCtx = st(r).context;
    await r.navigate("refused").catch(() => undefined); // отказ guard'а
    const stillCurrent = st(r).context === beforeCtx;
    await getRoutesApi(r).replace(ROUTES as never);
    const after = st(r).context;
    out["5_onTransitionStart·fromState.context"] = {
      "fromState === getState() at hook time": sameAsGetState,
      "write landed in the committed container": beforeCtx.probeFrom === MARK,
      "current unchanged after the refused navigation": stillCurrent,
      "new container after replace": after !== beforeCtx,
      "app write read back": after.probeFrom === MARK,
    };
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
