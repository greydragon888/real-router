// Опровергатель триажа: PluginFactory·router помечен handout ("ядро обратно не
// читает"). Вопрос: читает ли ЯДРО отданный фабрике инстанс ОБРАТНО по имени
// свойства после того, как приложение/плагин могло его изменить.
// Сайт чтения из исходника: packages/core/src/api/getRoutesApi.ts · replace —
// `const currentState = router.getState();` (значение уходит в replaceRoutes →
// matchPath → commitRevalidated).
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

type Bag = Record<string, unknown>;

const routes = [
  { name: "a", path: "/a" },
  { name: "b", path: "/b" },
] as never;

async function arm(attack: boolean): Promise<unknown> {
  let handedOut: unknown;
  let lieCalls = 0;
  const seen: string[] = [];

  const router = createRouter(routes, {} as never);

  router.usePlugin(((r: unknown) => {
    handedOut = r;
    if (attack) {
      // писать может только тот, кому ручку ОТДАЛИ — это и есть хэндаут
      (r as Bag).getState = (): unknown => {
        lieCalls += 1;
        return {
          name: "a",
          params: {},
          search: {},
          path: "/b", // ложь: пользователь на /a
          meta: undefined,
          context: {},
        };
      };
    }
    return { onStart: (): void => undefined };
  }) as never);

  await router.start("/a");
  router.subscribe((s) => {
    seen.push(`${s.route.name}@${s.route.path}`);
  });

  getRoutesApi(router).replace([
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ] as never);

  return {
    handoutIsCoreInstance: handedOut === router,
    lieCallsByCore: lieCalls,
    committedSeenBySubscriber: seen,
  };
}

async function main(): Promise<void> {
  const positive = await arm(false); // позитивный контроль: без подмены
  const attackArm = await arm(true);
  console.log(JSON.stringify({ positive, attackArm }, null, 1));
}

void main();
