// Positive control of the probe environment: does `@real-router/core` resolve
// to src (no dist in this worktree), do the hostile-bag fixtures import, and
// does a door's read count register?
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

import { countingBag } from "../../../../packages/core/tests/helpers/hostileBags";

const router = createRouter(
  [{ name: "u", path: "/u/:id?tab" }] as never,
  {} as never,
);
const { bag, reads } = countingBag({ id: "7", tab: "x" });
const href = router.buildPath("u", bag as never);

console.log(
  JSON.stringify({
    href,
    reads,
    hasPluginApi: typeof getPluginApi(router).makeState,
  }),
);
