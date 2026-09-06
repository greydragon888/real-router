// Census-completeness probe: nested app-owned bags riding inside the
// `getOptions()` / `getCloneState().options` hand-outs. Does `cloneRouter`
// re-read the caller's `queryParams` bag through the clone's constructor
// (a second read of the same app object, via a hand-out), and does it
// re-read `limits` (expected NOT, #1880) or `defaultParams`?
import { createRouter } from "@real-router/core";
import { cloneRouter, getPluginApi } from "@real-router/core/api";
import { getInternals } from "@real-router/core/validation";

import { countingProxy } from "../../../../packages/core/tests/helpers/hostileBags";

const routes = [
  { name: "a", path: "/a" },
  { name: "home", path: "/home/:id" },
];

async function main(): Promise<void> {
  const qp = countingProxy({ arrayFormat: "none", booleanFormat: "none" });
  const lim = countingProxy({ maxListeners: 50 });
  const dp = countingProxy({ id: "7" });

  const router = createRouter(routes as never, {
    queryParams: qp.bag,
    limits: lim.bag,
    defaultRoute: "home",
    defaultParams: dp.bag,
  } as never);

  const snap = () => ({
    queryParams: { ...qp.reads },
    limits: { ...lim.reads },
    defaultParams: { ...dp.reads },
  });

  const afterCreate = snap();
  const opts = getPluginApi(router).getOptions();
  const cloneState = getInternals(router).getCloneState();
  const identity = {
    getOptions_queryParams_isAppBag: opts.queryParams === qp.bag,
    getOptions_limits_isAppBag: opts.limits === lim.bag,
    getOptions_defaultParams_isAppBag: opts.defaultParams === dp.bag,
    getCloneState_options_queryParams_isAppBag: cloneState.options.queryParams === qp.bag,
    getCloneState_options_limits_isAppBag: cloneState.options.limits === lim.bag,
    getCloneState_limits_isAppBag: cloneState.limits === (lim.bag as unknown),
  };
  const afterHandouts = snap();

  const clone = cloneRouter(router);
  const afterClone = snap();
  const cloneIdentity = {
    clone_getOptions_queryParams_isAppBag: getPluginApi(clone).getOptions().queryParams === qp.bag,
    clone_getOptions_defaultParams_isAppBag: getPluginApi(clone).getOptions().defaultParams === dp.bag,
  };

  await router.start("/a");
  await router.navigateToDefault();
  const afterBaseDefault = snap();
  await clone.start("/a");
  await clone.navigateToDefault();
  const afterCloneDefault = snap();

  console.log(
    JSON.stringify(
      {
        afterCreate,
        identity,
        afterHandouts,
        afterClone,
        cloneIdentity,
        afterBaseDefault,
        afterCloneDefault,
      },
      null,
      1,
    ),
  );
}

void main();
