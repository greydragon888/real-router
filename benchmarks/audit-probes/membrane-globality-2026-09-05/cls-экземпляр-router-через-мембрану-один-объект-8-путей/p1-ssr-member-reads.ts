// P1 на SSR-пути семейства: сколько РАЗ shared/ssr читает именованные члены
// инстанса ядра, отданного в SsrLoaderFnFactory, за кадр установки плагина.
// Счётчик — собственный аксессор-делегат на самом инстансе (инструментация
// СНАРУЖИ src): каждое чтение имени проходит через getter.
import { createRouter } from "@real-router/core";

import { createSsrLoaderPlugin } from "../../../../shared/ssr/createSsrLoaderPlugin";

const routes = [{ name: "a", path: "/a" }];

function instrument(
  router: object,
  names: string[],
  reads: Record<string, number>,
): void {
  for (const name of names) {
    const value = (router as Record<string, unknown>)[name];

    Object.defineProperty(router, name, {
      configurable: true,
      get() {
        reads[name] = (reads[name] ?? 0) + 1;

        return value;
      },
    });
  }
}

async function main(): Promise<void> {
  const out: Record<string, unknown> = {};
  const router = createRouter(routes as never, {} as never);
  const reads: Record<string, number> = {};

  instrument(router, ["subscribeLeave", "getState", "navigate", "start"], reads);

  let handed: unknown;
  const plugin = createSsrLoaderPlugin(
    {
      a: (r: unknown) => {
        handed = r;

        return () => "loaded";
      },
    } as never,
    { namespace: "data", modeNamespace: "dataMode", errorPrefix: "[probe]" },
  );

  router.usePlugin(plugin as never);
  out.handedIsInstance = handed === router;
  out.readsDuringInstall = { ...reads };

  // позитивный контроль: инструментированный инстанс жив и стартует
  await router.start("/a");
  out.control_started = router.getState()?.name;
  out.readsAfterStart = { ...reads };

  console.log(JSON.stringify(out, null, 1));
}

void main();
