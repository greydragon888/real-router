// Различитель handout vs roundtrip для context ПРЕДЫДУЩЕГО закоммиченного
// состояния: (1) Plugin.onTransitionSuccess·fromState.context,
// (2) Router.subscribe·SubscribeFn·state.previousRoute.context.
// Инвентарь read-back-сайтов закоммиченного context (git ls-files packages/core/src
// | xargs grep -n '\.context'): getRoutesApi · replaceRoutes «выживший»
// (`context: currentState.context`) — читает ТЕКУЩЕЕ состояние; EventBus ·
// systemCommit `{ ...toState.context }` и NavigationNamespace · #copyChannels
// `{ ...state.context }` — копии на входе с объекта, переданного вызывающим.
// Проверяем исполнением: метка, записанная приложением в context объекта,
// отданного как fromState/previousRoute, ищется в состоянии после (a) обратной
// навигации на тот же маршрут, (b) replace().
// Позитивный контроль — та же метка в context ТЕКУЩЕГО состояния: read back.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

type Ctx = Record<string, unknown>;
type St = { name: string; path: string; context: Ctx };

const ROUTES = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
];
const ROUTES_PLUS = [...ROUTES, { name: "c", path: "/c" }];

const st = (r: ReturnType<typeof createRouter>): St =>
  r.getState() as unknown as St;

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};

  // 1. onTransitionSuccess · fromState.context
  {
    const r = createRouter(ROUTES as never, {} as never);
    const MARK = { app: "hook" };
    let seen: St | undefined;
    r.usePlugin(
      (() => ({
        onTransitionSuccess: (_to: unknown, from: unknown) => {
          const f = from as St | undefined;
          if (f?.name === "a" && seen === undefined) {
            seen = f;
            f.context.probe = MARK;
          }
        },
      })) as never,
    );
    await r.start("/a");
    await r.navigate("b");
    const isPrev = seen === (r.getPreviousState() as unknown as St);
    await r.navigate("a"); // возврат на тот же маршрут
    const afterBack = st(r).context.probe === MARK;
    await getRoutesApi(r).replace(ROUTES_PLUS as never);
    out.onTransitionSuccess_fromState = {
      "hook fired, mark written": seen !== undefined,
      "fromState === getPreviousState()": isPrev,
      "read back after navigate back": afterBack,
      "read back after replace": st(r).context.probe === MARK,
      "current name": st(r).name,
    };
    r.dispose();
  }

  // 2. subscribe · state.previousRoute.context
  {
    const r = createRouter(ROUTES as never, {} as never);
    const MARK = { app: "subscribe" };
    let seen: St | undefined;
    r.subscribe(((s: { previousRoute?: St }) => {
      const p = s.previousRoute;
      if (p?.name === "a" && seen === undefined) {
        seen = p;
        p.context.probe = MARK;
      }
    }) as never);
    await r.start("/a");
    await r.navigate("b");
    await r.navigate("a");
    const afterBack = st(r).context.probe === MARK;
    await getRoutesApi(r).replace(ROUTES_PLUS as never);
    out.subscribe_previousRoute = {
      "callback fired, mark written": seen !== undefined,
      "read back after navigate back": afterBack,
      "read back after replace": st(r).context.probe === MARK,
      "current name": st(r).name,
    };
    r.dispose();
  }

  // ПОЗИТИВНЫЙ КОНТРОЛЬ: та же метка в context ТЕКУЩЕГО состояния
  {
    const r = createRouter(ROUTES as never, {} as never);
    await r.start("/a");
    await r.navigate("b");
    const MARK = { app: "control" };
    st(r).context.probe = MARK;
    await getRoutesApi(r).replace(ROUTES_PLUS as never);
    out.control_currentState = {
      "read back after replace": st(r).context.probe === MARK,
      "current name": st(r).name,
    };
    r.dispose();
  }

  console.log(JSON.stringify(out, null, 2));
}

void main();
