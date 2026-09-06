// Различитель handout vs roundtrip для трёх not-found-возвратов
// (Router.navigateToNotFound / RouterInternals.navigateToNotFound /
// revalidateToNotFound): единственный сайт, где ядро ЧИТАЕТ закоммиченный
// `context` обратно, — арка «выживший» в getRoutesApi · replaceRoutes
// (`context: currentState.context`). Для состояния UNKNOWN_ROUTE она не
// достижима: (A) путь не матчится → ветка revalidateToNotFound (свежий {});
// (B) приложение ДОБАВЛЯЕТ маршрут на тот же путь → арка «смена идентичности»,
// которая строит `{ ...revalidated, transition }` БЕЗ поля context.
// Позитивный контроль в обоих прогонах: тот же протокол на матчащемся
// состоянии — запись читается обратно (значит, инструмент видит read-back).
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Ctx = Record<string, unknown>;
type St = { name: string; path: string; context: Ctx };

const ROUTES = [{ name: "h", path: "/h" }];
const ROUTES_PLUS = [...ROUTES, { name: "z", path: "/zzz" }];

const st = (r: ReturnType<typeof createRouter>): St =>
  r.getState() as unknown as St;

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // A. not-found + replace тем же набором (путь не матчится)
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/h");
    const ret = r.navigateToNotFound("/zzz") as unknown as St;
    const MARK = { app: "A" };
    ret.context.probe = MARK;
    await getRoutesApi(r).replace(ROUTES as never);
    out.A_sameRoutes = {
      "name after replace": st(r).name,
      "app write read back": st(r).context.probe === MARK,
    };
    r.dispose();
  }

  // B. not-found + replace, ДОБАВЛЯЮЩИЙ маршрут на тот же путь
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/h");
    const ret = getInternals(r).navigateToNotFound("/zzz") as unknown as St;
    const MARK = { app: "B" };
    ret.context.probe = MARK;
    await getRoutesApi(r).replace(ROUTES_PLUS as never);
    out.B_routeAddedAtSamePath = {
      "name after replace": st(r).name,
      "app write read back": st(r).context.probe === MARK,
    };
    r.dispose();
  }

  // C. то же для revalidateToNotFound
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/h");
    const ret = getInternals(r).revalidateToNotFound("/zzz") as unknown as St;
    const MARK = { app: "C" };
    ret.context.probe = MARK;
    await getRoutesApi(r).replace(ROUTES_PLUS as never);
    out.C_revalidateToNotFound = {
      "name after replace": st(r).name,
      "app write read back": st(r).context.probe === MARK,
    };
    r.dispose();
  }

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: матчащееся состояние — тот же протокол читается назад
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/h");
    const MARK = { app: "control" };
    st(r).context.probe = MARK;
    await getRoutesApi(r).replace(ROUTES_PLUS as never);
    out.control_matchedState = {
      "name after replace": st(r).name,
      "app write read back": st(r).context.probe === MARK,
    };
    r.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
