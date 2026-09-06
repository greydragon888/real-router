// Триаж: createSsrLoaderPlugin·SsrLoaderFnFactory·router — handout или roundtrip?
// Ядро отдаёт СВОЙ инстанс Router в фабрику лоадера приложения (compile), и ПОСЛЕ
// этого shared/ssr читает члены того же инстанса: getInternals(router) (WeakMap по
// идентичности) и router.subscribeLeave (member read → цепочка прототипа).
// Вердикт исполнением: если приложение в своей фабрике положит собственный
// subscribeLeave на переданный router, вызовет ли shared/ssr его?
import { createRouter } from "@real-router/core";

import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";

const routes = [{ name: "a", path: "/a/:id?q" }];

function run(shadow: boolean): Record<string, unknown> {
  const router = createRouter(routes as never, {} as never);
  const seen: Record<string, unknown> = {};
  let shadowCalls = 0;

  const plugin = createSsrLoaderPlugin(
    {
      a: (r: unknown) => {
        // приложение получило инстанс ядра
        seen.sameInstanceAsOuter = r === router;
        seen.extensible = Object.isExtensible(r as object);
        seen.ownSubscribeLeaveBefore = Object.hasOwn(
          r as object,
          "subscribeLeave",
        );

        if (shadow) {
          // законная для приложения запись: собственное свойство поверх метода
          (r as Record<string, unknown>).subscribeLeave = (
            ...args: unknown[]
          ) => {
            shadowCalls += 1;
            void args;

            return () => undefined;
          };
        }

        return () => "loaded";
      },
    } as never,
    { namespace: "data", modeNamespace: "dataMode", errorPrefix: "[probe]" },
  );

  router.usePlugin(plugin as never);

  seen.shadowCalls = shadowCalls;

  return seen;
}

// позитивный контроль: без затирания плагин ставится штатно
console.log(
  JSON.stringify({ control: run(false), shadowed: run(true) }, null, 1),
);
