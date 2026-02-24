import type { Router } from "../Router";
import type { DefaultDependencies } from "@real-router/types";

export function cloneRouter<
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  router: Router<Dependencies>,
  dependencies?: Dependencies,
): Router<Dependencies> {
  return router.clone(dependencies);
}
