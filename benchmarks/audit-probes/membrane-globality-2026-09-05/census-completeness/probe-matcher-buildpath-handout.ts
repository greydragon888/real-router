// Census-completeness probe: the census lists `RouterInternals.routeGetStore·return`
// and four `.matcher.*·return` hand-outs, plus `port().buildPath·params|search`
// as a PARAMETER door. The same store hand-out exposes `matcher.buildPath` —
// a parameter door that takes the caller's params/search bags straight into the
// engine printer with no `canonicalize` / `normalizeChannel` in front of it.
import { createRouter } from "@real-router/core";
import { getInternals } from "@real-router/core/validation";

import { countingBag, driftingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const routes = [{ name: "u", path: "/u/:id?tab" }];

const router = createRouter(routes as never, {} as never);
const store = getInternals(router).routeGetStore();

const params = countingBag({ id: "7" });
const search = countingBag({ tab: "x" });
const printed = store.matcher.buildPath("u", params.bag as never, search.bag as never, {
  trailingSlash: "preserve",
  queryParamsMode: "loose",
} as never);

// A drifting search bag: what the engine printed vs what a second read answers
// — the bag is consumed by identity, not through a copy.
const drift = driftingBag({ tab: "first" }, { tab: "second" });
const printedDrift = store.matcher.buildPath("u", { id: "1" } as never, drift.bag as never, {
  trailingSlash: "preserve",
  queryParamsMode: "loose",
} as never);

// POSITIVE CONTROL: the public door prints the same URL for the same intent.
const publicHref = router.buildPath("u", { id: "7" }, { tab: "x" });

console.log(
  JSON.stringify(
    {
      matcherBuildPath: { printed, paramsReads: params.reads, searchReads: search.reads },
      driftingSearch: { printedDrift, reads: drift.reads },
      publicControl: { publicHref, same: publicHref === printed },
    },
    null,
    1,
  ),
);
