// Round-trip для остальных восьми дверей батча «state.context закоммиченного
// State». Протокол тот же, что в roundtrip-read-back.ts: пишем прямым [[Set]]
// в ВОЗВРАЩЁННЫЙ контейнер (мимо claim.write), затем зовём
// getRoutesApi(...).replace(ROUTES) и смотрим, ПРОЧИТАЛО ли ядро запись обратно
// в НОВЫЙ закоммиченный контейнер. Сайт чтения в ядре — getRoutesApi ·
// replaceRoutes, арка «выживший»: `context: currentState.context` →
// commitRevalidated → EventBusNamespace · systemCommit → `{ ...toState.context }`.
// Позитивные контроли: (1) идентичность возврата с getState(); (2) прогон без
// записи — ключа нет; (3) для not-found-возвратов печатается имя закоммиченного
// состояния — арка «выживший» для него не срабатывает, это различитель
// handout vs roundtrip.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

type Ctx = Record<string, unknown>;
type St = { name: string; path: string; context: Ctx };

const ROUTES = [
  { name: "h", path: "/h" },
  { name: "a", path: "/a/:id" },
  { name: "d", path: "/d" },
];

const mk = async (at = "/h"): Promise<ReturnType<typeof createRouter>> => {
  const r = createRouter(ROUTES as never, { defaultRoute: "d" } as never);
  await r.start(at);
  return r;
};
const st = (r: ReturnType<typeof createRouter>): St =>
  r.getState() as unknown as St;

/** Общий хвост: пишем в хэндаут, зовём replace, читаем результат. */
const roundtrip = async (
  r: ReturnType<typeof createRouter>,
  handed: St,
  tag: string,
): Promise<Record<string, unknown>> => {
  const MARK = { app: tag };
  const before = handed.context;
  const identity = handed === (st(r) as unknown as St);
  handed.context.probe = MARK;
  const visibleNow = st(r).context.probe === MARK;
  const nameBefore = st(r).name;
  await getRoutesApi(r).replace(ROUTES as never);
  const after = st(r).context;
  return {
    "return === getState()": identity,
    "committed state name before replace": nameBefore,
    "write visible through getState() immediately": visibleNow,
    "new container after replace": after !== before,
    "core READ the app write back": after.probe === MARK,
    "committed state name after replace": st(r).name,
  };
};

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // 3. Router.navigateToDefault·return.context
  {
    const r = await mk();
    const ret = (await r.navigateToDefault()) as unknown as St;
    out["3_Router.navigateToDefault·return.context"] = await roundtrip(
      r,
      ret,
      "navigateToDefault",
    );
    r.dispose();
  }

  // 4. Router.navigateToNotFound·return.context
  {
    const r = await mk();
    const ret = r.navigateToNotFound("/zzz") as unknown as St;
    out["4_Router.navigateToNotFound·return.context"] = await roundtrip(
      r,
      ret,
      "navigateToNotFound",
    );
    r.dispose();
  }

  // 5. PluginApi.navigateToState·return.context
  {
    const r = await mk();
    const api = getPluginApi(r);
    const ret = (await api.navigateToState(
      api.matchPath("/a/5") as never,
    )) as unknown as St;
    out["5_PluginApi.navigateToState·return.context"] = await roundtrip(
      r,
      ret,
      "pluginApi.navigateToState",
    );
    r.dispose();
  }

  // 6. RouterInternals.navigateToState·return.context
  {
    const r = await mk();
    const api = getPluginApi(r);
    const ret = (await getInternals(r).navigateToState(
      api.matchPath("/a/6") as never,
    )) as unknown as St;
    out["6_RouterInternals.navigateToState·return.context"] = await roundtrip(
      r,
      ret,
      "internals.navigateToState",
    );
    r.dispose();
  }

  // 7. RouterInternals.navigateToNotFound·return.context
  {
    const r = await mk();
    const ret = getInternals(r).navigateToNotFound("/zzz") as unknown as St;
    out["7_RouterInternals.navigateToNotFound·return.context"] = await roundtrip(
      r,
      ret,
      "internals.navigateToNotFound",
    );
    r.dispose();
  }

  // 8. RouterInternals.revalidateToNotFound·return.context
  {
    const r = await mk();
    const ret = getInternals(r).revalidateToNotFound("/yyy") as unknown as St;
    out["8_RouterInternals.revalidateToNotFound·return.context"] =
      await roundtrip(r, ret, "internals.revalidateToNotFound");
    r.dispose();
  }

  // 9. RouterInternals.systemCommit·return.context
  //    Коммитим ЧУЖОЙ State на существующий маршрут — возврат = объект ядра.
  {
    const r = await mk();
    const internals = getInternals(r);
    const foreign = {
      name: "a",
      params: { id: "9" },
      search: {},
      path: "/a/9",
      context: { fromApp: 1 },
    };
    const ret = internals.systemCommit(
      foreign as never,
      r.getState() as never,
      {} as never,
    ) as unknown as St;
    out["9_RouterInternals.systemCommit·return.context"] = {
      "committed context !== foreign.context (container copied)":
        ret.context !== (foreign.context as unknown),
      ...(await roundtrip(r, ret, "systemCommit")),
    };
    r.dispose();
  }

  // 10. InterceptorFn<"start">·next·return.context
  {
    const r = createRouter(ROUTES as never, { defaultRoute: "d" } as never);
    const api = getPluginApi(r);
    let handed: St | undefined;
    api.addInterceptor("start", (async (
      next: (p?: string) => Promise<unknown>,
      path?: string,
    ) => {
      const s = (await next(path)) as St;
      handed = s;
      return s;
    }) as never);
    await r.start("/h");
    out["10_InterceptorFn<start>·next·return.context"] = await roundtrip(
      r,
      handed as St,
      "startInterceptor",
    );
    r.dispose();
  }

  // КОНТРОЛЬ инструмента: тот же replace БЕЗ записи — ключа нет
  {
    const r = await mk();
    await r.navigateToDefault();
    await getRoutesApi(r).replace(ROUTES as never);
    out.control_noWrite = {
      "'probe' in committed context": "probe" in st(r).context,
      keys: Object.keys(st(r).context),
    };
    r.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
