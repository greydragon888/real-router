// packages/router6-benchmarks/modules/02-navigation-plugins/2.1-sync-extensions.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// Helper: routes to alternate between to avoid same-state short-circuit
const alternatingRoutes = ["about", "home"];

// 2.1.1 Navigation with single synchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });
  router.start("/");

  bench("2.1.1 Navigation with single synchronous middleware", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.2 Navigation with chain of synchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  for (let i = 0; i < 5; i++) {
    router.useMiddleware(() => (_toState, _fromState, done) => {
      done();
    });
  }

  router.start("/");

  bench("2.1.2 Navigation with chain of synchronous middleware", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.3 Navigation with synchronous canActivate guard
{
  const router = createSimpleRouter();
  let index = 0;

  router.canActivate("about", () => () => true);
  router.canActivate("home", () => () => true);
  router.start("/");

  bench("2.1.3 Navigation with synchronous canActivate guard", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.4 Navigation with synchronous canDeactivate guard
{
  const router = createSimpleRouter();
  let index = 0;

  router.canDeactivate("home", () => () => true);
  router.canDeactivate("about", () => () => true);
  router.start("/");

  bench("2.1.4 Navigation with synchronous canDeactivate guard", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.5 Navigation with multiple guards
{
  const router = createSimpleRouter();
  let index = 0;

  router.canDeactivate("home", () => () => true);
  router.canDeactivate("about", () => () => true);
  router.canActivate("about", () => () => true);
  router.canActivate("home", () => () => true);
  router.canActivate("users", () => () => true);
  router.start("/");

  bench("2.1.5 Navigation with multiple guards", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.6 Navigation with event plugins
{
  const router = createSimpleRouter();
  let index = 0;

  router.usePlugin(() => ({
    onTransitionStart: () => {},
    onTransitionSuccess: () => {},
  }));
  router.start("/");

  bench("2.1.6 Navigation with event plugins", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.7 Navigation with middleware using dependencies
{
  const router = createSimpleRouter();
  let index = 0;

  router // @ts-expect-error - test dependency
    .setDependency("service", { check: () => true });
  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });
  router.start("/");

  bench("2.1.7 Navigation with middleware using dependencies", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.8 Navigation with guards using dependencies
{
  const router = createSimpleRouter();
  let index = 0;

  router // @ts-expect-error - test dependency
    .setDependency("auth", { isAllowed: () => true });
  router.canActivate("about", () => () => true);
  router.canActivate("home", () => () => true);
  router.start("/");

  bench("2.1.8 Navigation with guards using dependencies", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.9 Navigation with plugin modifying state
{
  const router = createSimpleRouter();
  let index = 0;

  router.usePlugin(() => ({
    onTransitionSuccess: () => {
      // Plugin executed
    },
  }));
  router.start("/");

  bench("2.1.9 Navigation with plugin modifying state", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}

// 2.1.10 Navigation with lightweight guards
{
  const router = createSimpleRouter();
  let index = 0;

  router.canActivate("about", () => () => true);
  router.canActivate("home", () => () => true);
  router.canActivate("users", () => () => true);
  router.start("/");

  bench("2.1.10 Navigation with lightweight guards", () => {
    router.navigate(alternatingRoutes[index++ % 2]);
  }).gc("inner");
}
