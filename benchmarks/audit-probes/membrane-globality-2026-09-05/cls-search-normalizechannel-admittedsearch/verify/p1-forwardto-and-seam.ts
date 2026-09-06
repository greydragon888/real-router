// ОПРОВЕРГАТЕЛЬ, P1 на двери Router.navigate·routeSearch.
// Классификатор оставил в unverified ДВЕ ветки, каждая из которых способна
// добавить ВТОРОЙ проход по мешку вызывающего и уронить P1:
//   (1) forwardTo-цепочка (#layerChainDefaults + повторный normalizeChannel);
//   (2) плечо шва forwardState с УСТАНОВЛЕННЫМ интерцептором
//       (Router.ts · snapshotForwarded спредит мешок).
// Инструмент — ДРЕЙФУЮЩИЙ вход: стабильный мешок второе чтение не показал бы.
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

function driftBag(first: unknown, second: unknown) {
  const reads: Record<string, number> = {};
  const values: string[] = [];
  const bag = {} as Record<string, unknown>;
  Object.defineProperty(bag, "tab", {
    enumerable: true,
    configurable: true,
    get() {
      reads.tab = (reads.tab ?? 0) + 1;
      const v = reads.tab === 1 ? first : second;
      values.push(String(v));
      return v;
    },
  });
  return { bag, reads, values };
}

const out: Record<string, unknown> = {};

async function arm(
  label: string,
  routes: unknown,
  withInterceptor: boolean,
  target: string,
) {
  const r = createRouter(routes as never, {
    queryParamsMode: "default",
  } as never);
  let interceptorRan = 0;
  if (withInterceptor) {
    // ⚠ addInterceptor живёт на PluginApi, НЕ на экземпляре Router — форма
    // читана из types/api.ts · PluginApi.addInterceptor и getPluginApi.ts.
    // Сигнатура интерцептора: (next, ...args) => ReturnType.
    const api = getPluginApi(r as never) as unknown as {
      addInterceptor: (m: string, fn: (...a: never[]) => unknown) => unknown;
    };
    api.addInterceptor("forwardState", ((
      next: (...a: unknown[]) => unknown,
      ...args: unknown[]
    ) => {
      interceptorRan += 1;
      return next(...args);
    }) as never);
  }
  r.start("/plain/1");

  const d = driftBag("FIRST", "SECOND");
  let res: unknown;
  try {
    const st = await r.navigate(target, { id: "7" } as never, d.bag as never);
    res = { path: (st as { path?: string } | undefined)?.path };
  } catch (e) {
    res = `THROW ${(e as Error).message}`;
  }
  const state = r.getState() as { path?: string; search?: unknown } | undefined;
  out[label] = {
    reads: d.reads,
    valuesHandedOut: d.values,
    interceptorRan,
    navigateResult: res,
    statePath: state?.path,
    stateSearch: state?.search,
  };
}

const PLAIN = { name: "plain", path: "/plain/:id" };

async function main() {
await arm(
  "0·control·noForward·noInterceptor",
  [PLAIN, { name: "u", path: "/u/:id?tab" }],
  false,
  "u",
);

await arm(
  "1·forwardTo·chain",
  [
    PLAIN,
    { name: "src", path: "/src/:id?tab", forwardTo: "dst" },
    { name: "dst", path: "/dst/:id?tab" },
  ],
  false,
  "src",
);

await arm(
  "2·seam·withInterceptor",
  [PLAIN, { name: "u", path: "/u/:id?tab" }],
  true,
  "u",
);

await arm(
  "3·forwardTo·withInterceptor",
  [
    PLAIN,
    { name: "src", path: "/src/:id?tab", forwardTo: "dst" },
    { name: "dst", path: "/dst/:id?tab" },
  ],
  true,
  "src",
);

console.log(JSON.stringify(out, null, 1));
}

void main();
