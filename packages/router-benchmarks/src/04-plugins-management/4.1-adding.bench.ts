// packages/router-benchmarks/modules/04-plugins-management/4.1-adding.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

const IS_ROUTER5 = process.env.BENCH_ROUTER === "router5";

// 4.1.1 Adding single plugin with cleanup
{
  const router = createSimpleRouter();

  bench("4.1.1 Adding single plugin with cleanup", () => {
    const unsubscribe = router.usePlugin(() => ({
      onTransitionSuccess: () => {},
    }));

    unsubscribe();
  }).gc("inner");
}

// 4.1.2 Adding multiple plugins in single call with cleanup
{
  const router = createSimpleRouter();

  bench("4.1.2 Adding multiple plugins in single call with cleanup", () => {
    const unsubscribe = router.usePlugin(
      () => ({ onTransitionStart: () => {} }),
      () => ({ onTransitionSuccess: () => {} }),
      () => ({ onTransitionError: () => {} }),
    );

    unsubscribe();
  }).gc("inner");
}

// 4.1.3 Sequential plugin adding with cleanup
{
  const router = createSimpleRouter();

  bench("4.1.3 Sequential plugin adding with cleanup", () => {
    const unsubscribers: (() => void)[] = [];

    for (let i = 0; i < 5; i++) {
      unsubscribers.push(
        router.usePlugin(() => ({
          onTransitionSuccess: () => {},
        })),
      );
    }
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  }).gc("inner");
}

// 4.1.4 Adding single middleware with cleanup
{
  const router = createSimpleRouter();

  bench("4.1.4 Adding single middleware with cleanup", () => {
    const unsubscribe = router.useMiddleware(
      () => (_toState, _fromState, done) => {
        done();
      },
    );

    unsubscribe();
  }).gc("inner");
}

// 4.1.5 Adding multiple middleware in single call with cleanup
{
  const router = createSimpleRouter();

  bench("4.1.5 Adding multiple middleware in single call with cleanup", () => {
    const unsubscribe = router.useMiddleware(
      () => (_toState, _fromState, done) => {
        done();
      },
      () => (_toState, _fromState, done) => {
        done();
      },
      () => (_toState, _fromState, done) => {
        done();
      },
    );

    unsubscribe();
  }).gc("inner");
}

// 4.1.6 Sequential middleware adding with cleanup
{
  const router = createSimpleRouter();

  bench("4.1.6 Sequential middleware adding with cleanup", () => {
    const unsubscribers: (() => void)[] = [];

    for (let i = 0; i < 5; i++) {
      unsubscribers.push(
        router.useMiddleware(() => (_toState, _fromState, done) => {
          done();
        }),
      );
    }
    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }
  }).gc("inner");
}

// 4.1.7 Adding canActivate guard for route with cleanup
{
  const router = createSimpleRouter();

  if (IS_ROUTER5) {
    bench("4.1.7 Adding canActivate guard for route with cleanup", () => {
      router.canActivate("about", () => () => true);
      // router5 does not have clearCanActivate, so we overwrite with true
      router.canActivate("about", true);
    }).gc("inner");
  } else {
    bench("4.1.7 Adding canActivate guard for route with cleanup", () => {
      router.canActivate("about", () => () => true);
      router.clearCanActivate("about");
    }).gc("inner");
  }
}

// 4.1.8 Adding canDeactivate guard for route with cleanup
{
  const router = createSimpleRouter();

  bench("4.1.8 Adding canDeactivate guard for route with cleanup", () => {
    router.canDeactivate("about", () => () => true);
    router.clearCanDeactivate("about");
  }).gc("inner");
}

// 4.1.9 Adding guards for multiple routes with cleanup
{
  const router = createSimpleRouter();

  if (IS_ROUTER5) {
    bench("4.1.9 Adding guards for multiple routes with cleanup", () => {
      router.canActivate("home", () => () => true);
      router.canActivate("about", () => () => true);
      router.canActivate("users", () => () => true);
      router.canDeactivate("home", () => () => true);
      router.canDeactivate("about", () => () => true);
      // router5 does not have clearCanActivate, so we overwrite with true
      router.canActivate("home", true);
      router.canActivate("about", true);
      router.canActivate("users", true);
      router.clearCanDeactivate("home");
      router.clearCanDeactivate("about");
    }).gc("inner");
  } else {
    bench("4.1.9 Adding guards for multiple routes with cleanup", () => {
      router.canActivate("home", () => () => true);
      router.canActivate("about", () => () => true);
      router.canActivate("users", () => () => true);
      router.canDeactivate("home", () => () => true);
      router.canDeactivate("about", () => () => true);
      router.clearCanActivate("home");
      router.clearCanActivate("about");
      router.clearCanActivate("users");
      router.clearCanDeactivate("home");
      router.clearCanDeactivate("about");
    }).gc("inner");
  }
}

// 4.1.10 Adding guards for nested routes with cleanup
{
  const router = createSimpleRouter();

  if (IS_ROUTER5) {
    bench("4.1.10 Adding guards for nested routes with cleanup", () => {
      router.canActivate("users", () => () => true);
      router.canActivate("user", () => () => true);
      router.canDeactivate("users", () => () => true);
      router.canDeactivate("user", () => () => true);
      // router5 does not have clearCanActivate, so we overwrite with true
      router.canActivate("users", true);
      router.canActivate("user", true);
      router.clearCanDeactivate("users");
      router.clearCanDeactivate("user");
    }).gc("inner");
  } else {
    bench("4.1.10 Adding guards for nested routes with cleanup", () => {
      router.canActivate("users", () => () => true);
      router.canActivate("user", () => () => true);
      router.canDeactivate("users", () => () => true);
      router.canDeactivate("user", () => () => true);
      router.clearCanActivate("users");
      router.clearCanActivate("user");
      router.clearCanDeactivate("users");
      router.clearCanDeactivate("user");
    }).gc("inner");
  }
}
