// packages/real-router/modules/createRouter.ts

import { CONFIG_SYMBOL } from "./constants";
import { withDependencies } from "./core/dependencies";
import { withMiddleware } from "./core/middleware";
import { withNavigation } from "./core/navigation";
import { withObservability } from "./core/observable";
import { withOptions } from "./core/options";
import { withPlugins } from "./core/plugins";
import { withRouteLifecycle } from "./core/routeLifecycle";
import { withRouterLifecycle } from "./core/routerLifecycle";
import { withRoutes } from "./core/routes";
import { withState } from "./core/state";

import type {
  Config,
  DefaultDependencies,
  Options,
  Route,
  Router,
} from "router6-types";

type Enhancer<Dependencies extends DefaultDependencies = DefaultDependencies> =
  (router: Router<Dependencies>) => Router<Dependencies>;

const pipe =
  <Dependencies extends DefaultDependencies = DefaultDependencies>(
    ...fns: Enhancer<Dependencies>[]
  ) =>
  (arg: Router<Dependencies>): Router<Dependencies> =>
    // eslint-disable-next-line unicorn/no-array-reduce
    fns.reduce((prev: Router<Dependencies>, fn) => fn(prev), arg);

/**
 * Creates a new router instance.
 */
export const createRouter = <
  Dependencies extends DefaultDependencies = DefaultDependencies,
>(
  routes: Route<Dependencies>[] = [],
  options: Partial<Options> = {},
  dependencies: Dependencies = {} as Dependencies,
): Router<Dependencies> => {
  const config: Config = {
    decoders: {},
    encoders: {},
    defaultParams: {},
    forwardMap: {},
  };

  const uninitializedRouter = {
    [CONFIG_SYMBOL]: config,
  };

  return pipe<Dependencies>(
    withOptions(options),
    withDependencies(dependencies),
    withObservability,
    withState,
    withRouterLifecycle,
    withRouteLifecycle,
    withNavigation,
    withPlugins,
    withMiddleware,
    withRoutes(routes),
  )(uninitializedRouter as unknown as Router<Dependencies>);
};
