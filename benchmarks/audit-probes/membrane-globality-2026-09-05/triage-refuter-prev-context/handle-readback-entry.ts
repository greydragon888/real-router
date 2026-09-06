// Попытка ВЕРНУТЬ getRoutesApi·router (и getPluginApi·router / getInternals·router)
// в знаменатель: ручка — объект ЯДРА, но ядро читает её ОБРАТНО по имени в
// поздних кадрах (getRoutesApi.ts · api.replace → `router.getState()`), а
// экземпляр намеренно не заморожен (в него пишет extendRouter). Значит
// приложение может подменить собственное свойство `getState` ПОСЛЕ сборки api
// и вернуть СВОЙ объект State — тогда объект приложения пересекает границу
// через ручку. Проверяем исполнением: попадает ли содержимое подложенного
// context в закоммиченное состояние ядра.
// Позитивный контроль — тот же replace() без подмены.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Ctx = Record<string, unknown>;
type St = { name: string; path: string; context: Ctx };

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];
const ROUTES_PLUS = [...ROUTES, { name: "c", path: "/c" }];

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // 1. Подмена собственного метода ручки после сборки routesApi
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/a");
    const api = getRoutesApi(r);
    const real = r.getState.bind(r);
    const MARK = { app: "swapped" };
    const APP_STATE = {
      name: "a",
      path: "/a",
      params: {},
      search: {},
      context: { probe: MARK },
      transition: (real() as unknown as { transition: unknown }).transition,
    } as unknown as ReturnType<typeof r.getState>;
    let calls = 0;
    // Собственное свойство поверх метода прототипа — тот же механизм записи,
    // которым пользуется PluginApi.extendRouter (`router[key] = value`).
    (r as unknown as Record<string, unknown>).getState = () => {
      calls += 1;
      return APP_STATE;
    };
    await api.replace(ROUTES_PLUS as never);
    delete (r as unknown as Record<string, unknown>).getState;
    const committed = real() as unknown as St;
    out.swappedGetState = {
      "app getState called by replace": calls,
      "committed name": committed.name,
      "app context VALUE landed in core state": committed.context.probe === MARK,
      "app context CONTAINER identity kept": committed.context === APP_STATE.context,
      "core state === app state object": (committed as unknown) === APP_STATE,
    };
    r.dispose();
  }

  // 2. ПОЗИТИВНЫЙ КОНТРОЛЬ: тот же replace() без подмены
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/a");
    const MARK = { app: "control" };
    (r.getState() as unknown as St).context.probe = MARK;
    await getRoutesApi(r).replace(ROUTES_PLUS as never);
    const committed = r.getState() as unknown as St;
    out.control_noSwap = {
      "committed name": committed.name,
      "context value carried": committed.context.probe === MARK,
    };
    r.dispose();
  }

  // 3. Тот же вопрос к getInternals/getPluginApi: читают ли они ручку по имени
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/a");
    let reads = 0;
    const probe = new Proxy(r, {
      get(t, k, rec) {
        reads += 1;
        return Reflect.get(t, k, rec) as unknown;
      },
    });
    let threw = "";
    try {
      getInternals(probe as unknown as typeof r);
    } catch (e) {
      threw = (e as Error).message;
    }
    out.proxyHandle = {
      "reads before decision": reads,
      "getInternals(proxy) threw": threw,
    };
    r.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
