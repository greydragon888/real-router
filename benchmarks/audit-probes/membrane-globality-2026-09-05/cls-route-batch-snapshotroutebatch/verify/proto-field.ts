/**
 * VERIFY · поле `recordProtoUnchanged` из props.ts (P3c) печатает FALSE, а
 * классификатор процитировал блок P3c без него, утверждая «прототип записи
 * ядра не подменяет». Проверяем, что именно false: подмена прототипа или
 * мискнейминг поля (`getPrototypeOf(cfg) === null` — не тот тест).
 *
 * Позитивный контроль: маршрут зарегистрирован, ключ жив как ДАННЫЕ.
 */
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const route = JSON.parse('{"name":"u","path":"/u","__proto__":{"polluted":1}}') as never;
const router = createRouter([route]);
const cfg = getPluginApi(router).getRouteConfig("u") as unknown as object;
const proto = Object.getPrototypeOf(cfg) as unknown;

console.log(
  JSON.stringify(
    {
      "cfg proto === Object.prototype": proto === Object.prototype,
      "cfg proto === null": proto === null,
      "cfg proto is the injected {polluted:1}?":
        (proto as Record<string, unknown> | null)?.polluted !== undefined,
      "own __proto__ is a data property": Object.getOwnPropertyDescriptor(cfg, "__proto__")
        ?.value !== undefined,
      "POSITIVE CONTROL route registered": getRoutesApi(router).has("u"),
      "global Object not polluted": ({} as Record<string, unknown>).polluted === undefined,
    },
    null,
    1,
  ),
);
router.dispose();
