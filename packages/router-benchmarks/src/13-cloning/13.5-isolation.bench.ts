// packages/router-benchmarks/modules/13-cloning/13.5-isolation.bench.ts

import { bench, do_not_optimize } from "mitata";

import { createSimpleRouter, cloneRouter, IS_ROUTER5 } from "../helpers";

// 13.5.1 Clone state changes do not affect the original
if (IS_ROUTER5) {
  const router = createSimpleRouter();

  router.start();

  bench("13.5.1 Clone state changes do not affect the original", () => {
    const cloned = cloneRouter(router);

    cloned.start();
    cloned.navigate("about");

    do_not_optimize(router.getState());
    do_not_optimize(cloned.getState());

    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();

  router.start();

  bench("13.5.1 Clone state changes do not affect the original", () => {
    const cloned = router.clone();

    cloned.start();
    cloned.navigate("about");

    do_not_optimize(router.getState());
    do_not_optimize(cloned.getState());

    cloned.stop();
  }).gc("inner");
}

// 13.5.2 Adding routes to clone does not affect the original
if (!IS_ROUTER5) {
  const router = createSimpleRouter();
  let routeIndex = 0;

  router.start();

  bench("13.5.2 Adding routes to clone does not affect the original", () => {
    const cloned = router.clone();
    const routeName = `new-route-${routeIndex++}`;

    cloned.addRoute({ name: routeName, path: `/${routeName}` });

    // Original should not have the new route (navigate returns error via callback, not throw)
    router.navigate(routeName);

    // Fallback: remove added route
    cloned.removeRoute(routeName);
  }).gc("inner");
}

// 13.5.3 Adding listeners to clone does not affect the original
if (IS_ROUTER5) {
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  router.addEventListener("$$success", () => {});
  router.start();

  bench("13.5.3 Adding listeners to clone does not affect the original", () => {
    let clonedCalled = false;

    const cloned = cloneRouter(router);

    // Save reference for cleanup
    const listener = () => {
      clonedCalled = true;
    };

    cloned.addEventListener("$$success", listener);

    router.navigate(routes[index++ % 2]);

    cloned.start();
    cloned.navigate("users");

    do_not_optimize(clonedCalled);

    // Fallback: remove listener and stop
    cloned.removeEventListener("$$success", listener);
    cloned.stop();
  }).gc("inner");
} else {
  const router = createSimpleRouter();
  const routes = ["about", "home"];
  let index = 0;

  router.addEventListener("$$success", () => {});
  router.start();

  bench("13.5.3 Adding listeners to clone does not affect the original", () => {
    let clonedCalled = false;

    const cloned = router.clone();

    const unsub = cloned.addEventListener("$$success", () => {
      clonedCalled = true;
    });

    router.navigate(routes[index++ % 2]);

    cloned.start();
    cloned.navigate("users");

    do_not_optimize(clonedCalled);

    // Cleanup: remove listener and stop
    unsub();
    cloned.stop();
  }).gc("inner");
}
