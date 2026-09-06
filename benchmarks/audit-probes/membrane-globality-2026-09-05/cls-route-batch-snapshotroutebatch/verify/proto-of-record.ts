// Опровергатель: props.ts · P3c печатает поле recordProtoUnchanged=false, но
// классификатор процитировал блок БЕЗ этого поля и заключил «прототип записи
// ядра не подменён». Проверяем, ЧЕЙ прототип у выданной записи.
import { createRouter } from "@real-router/core";
import { getPluginApi, getRoutesApi } from "@real-router/core/api";

const out: Record<string, unknown> = {};

const route = JSON.parse(
  '{"name":"u","path":"/u","__proto__":{"polluted":1}}',
) as Record<string, unknown>;

const injectedProto = Object.getOwnPropertyDescriptor(route, "__proto__")
  ?.value as object;

const router = createRouter([route] as never);
const cfg = getPluginApi(router).getRouteConfig("u") as object | undefined;
const got = getRoutesApi(router).get("u") as object | undefined;

out["positive control: route registered"] = getRoutesApi(router).has("u");
out["caller own __proto__ is data"] =
  Object.getOwnPropertyDescriptor(route, "__proto__")?.value !== undefined;
out["cfg proto === Object.prototype"] =
  cfg !== undefined && Object.getPrototypeOf(cfg) === Object.prototype;
out["cfg proto === injected object"] =
  cfg !== undefined && Object.getPrototypeOf(cfg) === injectedProto;
out["cfg proto === null"] =
  cfg !== undefined && Object.getPrototypeOf(cfg) === null;
out["cfg polluted visible?"] = (cfg as Record<string, unknown> | undefined)
  ?.polluted;
out["get(u) proto === injected object"] =
  got !== undefined && Object.getPrototypeOf(got) === injectedProto;
out["get(u) polluted visible?"] = (got as Record<string, unknown> | undefined)
  ?.polluted;
out["global Object not polluted"] =
  ({} as Record<string, unknown>).polluted === undefined;

// Позитивный контроль инструмента: объект С подменённым прототипом
// распознаётся тем же сравнением.
const control = Object.create(injectedProto) as object;
out["control: detector sees a real proto swap"] =
  Object.getPrototypeOf(control) === injectedProto;

router.dispose();
console.log(JSON.stringify(out, null, 1));
