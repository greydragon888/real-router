// Вспомогательная проба: какую форму отдаёт RoutesApi.get и где живёт custom-поле.
import { createRouter } from "@real-router/core";
import { getRoutesApi } from "@real-router/core/api";

const LEAF = { serviceLike: true };
const router = createRouter([
  {
    name: "u",
    path: "/u/:id",
    meta: LEAF,
    defaultParams: { id: "1" },
    children: [{ name: "kid", path: "/kid" }],
  },
] as never);

const u = getRoutesApi(router).get("u") as Record<string, unknown> | undefined;

console.log(
  JSON.stringify(
    {
      keys: u ? Object.keys(u) : null,
      metaIsLeaf: u?.meta === LEAF,
      meta: u?.meta,
      defaultParamsIsCallerBag: u?.defaultParams,
      frozen: u ? Object.isFrozen(u) : null,
      protoIsObjectProto: u ? Object.getPrototypeOf(u) === Object.prototype : null,
    },
    null,
    1,
  ),
);
