// Позиция `options` двери routeGetStore().matcher.buildPath: BuildPathOptions —
// объект ВЫЗЫВАЮЩЕГО, читаемый по имени (trailingSlash, queryParamsMode) без копии.
// Счёт чтений на countingProxy + ДРЕЙФУЮЩИЙ мешок (второе чтение отвечает иначе).
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const router = createRouter(
  [{ name: "u", path: "/u/:id?tab" }] as never,
  {} as never,
);
const store = getInternals(router).routeGetStore();

const opts = countingProxy({
  trailingSlash: "preserve",
  queryParamsMode: "loose",
});
const printed = store.matcher.buildPath(
  "u",
  { id: "7" } as never,
  { tab: "x", extra: "e" } as never,
  opts.bag as never,
);

// ДРЕЙФ: первый ответ queryParamsMode "strict", второй "loose" — печатает ли
// движок по ответу, который он же и получил (одно чтение на ключ)?
const drifting = countingProxy(
  { trailingSlash: "preserve", queryParamsMode: "loose" },
  (key, nth) =>
    key === "queryParamsMode"
      ? nth === 1
        ? "strict"
        : "loose"
      : "preserve",
);
let driftPrinted: string | undefined;
let driftThrew: string | undefined;

try {
  driftPrinted = store.matcher.buildPath(
    "u",
    { id: "7" } as never,
    { tab: "x", extra: "e" } as never,
    drifting.bag as never,
  );
} catch (error) {
  driftThrew = (error as Error).message;
}

// ПОЗИТИВНЫЙ КОНТРОЛЬ: без options печатается дефолтный режим.
const control = store.matcher.buildPath(
  "u",
  { id: "7" } as never,
  { tab: "x", extra: "e" } as never,
);

console.log(
  JSON.stringify(
    {
      withOptions: { printed, optionsReads: opts.reads },
      drifting: { driftPrinted, driftThrew, reads: drifting.reads },
      control,
    },
    null,
    1,
  ),
);
