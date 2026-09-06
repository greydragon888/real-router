// RouterInternals.buildStateResolved·return — the last object-typed hand-out on
// the family's surface: fresh shell? params by identity? meta frozen?
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

const router = createRouter(
  [
    { name: "u", path: "/u/:id?tab", children: [{ name: "c", path: "/c/:cid" }] },
  ] as never,
  {} as never,
);
const ctx = getInternals(router);
const bag = { id: "1", cid: "2" };
const r1 = ctx.buildStateResolved("u.c", bag as never)!;
const r2 = ctx.buildStateResolved("u.c", bag as never)!;
console.log(
  JSON.stringify({
    control_name: r1.name,
    control_missingRoute: ctx.buildStateResolved("nope", bag as never),
    shellFreshPerCall: r1 !== r2,
    shellFrozen: Object.isFrozen(r1),
    paramsIsCallersBag: r1.params === bag,
    searchFreshLiteral:
      r1.search !== r2.search && Object.keys(r1.search).length === 0,
    searchFrozen: Object.isFrozen(r1.search),
    metaFrozen: Object.isFrozen(r1.meta),
    metaIsGetMetaForState: r1.meta === ctx.getMetaForState("u.c"),
  }),
);
