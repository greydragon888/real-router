// packages/real-router-benchmarks/modules/02-navigation-plugins/2.2-async-extensions.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// Helper: routes to alternate between to avoid same-state short-circuit
const alternatingRoutes = ["about", "home"];

// 2.2.1 Navigation with single asynchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async (_toState, _fromState, done) => {
    await Promise.resolve();
    done();
  });
  router.start("/");

  bench("2.2.1 Navigation with single asynchronous middleware", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 2.2.2 Navigation with chain of asynchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  for (let i = 0; i < 5; i++) {
    router.useMiddleware(() => async (_toState, _fromState, done) => {
      await Promise.resolve();
      done();
    });
  }

  router.start("/");

  bench("2.2.2 Navigation with chain of asynchronous middleware", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 2.2.3 Navigation with asynchronous canActivate guard
{
  const router = createSimpleRouter();
  let index = 0;

  router.canActivate("about", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.canActivate("home", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.start("/");

  bench("2.2.3 Navigation with asynchronous canActivate guard", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 2.2.4 Navigation with asynchronous canDeactivate guard
{
  const router = createSimpleRouter();
  let index = 0;

  router.canDeactivate("home", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.canDeactivate("about", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.start("/");

  bench("2.2.4 Navigation with asynchronous canDeactivate guard", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 2.2.5 Navigation with mixed synchronous and asynchronous middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });
  router.useMiddleware(() => async (_toState, _fromState, done) => {
    await Promise.resolve();
    done();
  });
  router.useMiddleware(() => (_toState, _fromState, done) => {
    done();
  });
  router.start("/");

  bench(
    "2.2.5 Navigation with mixed synchronous and asynchronous middleware",
    async () => {
      await new Promise<void>((resolve) => {
        router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
          resolve();
        });
      });
    },
  ).gc("inner");
}

// 2.2.6 Navigation with parallel async operations in middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async (_toState, _fromState, done) => {
    await Promise.all([Promise.resolve(), Promise.resolve()]);
    done();
  });
  router.start("/");

  bench(
    "2.2.6 Navigation with parallel async operations in middleware",
    async () => {
      await new Promise<void>((resolve) => {
        router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
          resolve();
        });
      });
    },
  ).gc("inner");
}

// 2.2.7 Navigation with long-running async operations
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async (_toState, _fromState, done) => {
    await new Promise((resolve) => setTimeout(resolve, 10));
    done();
  });
  router.start("/");

  bench("2.2.7 Navigation with long-running async operations", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 2.2.8 Navigation with async plugin
{
  const router = createSimpleRouter();
  let index = 0;

  router.usePlugin(() => ({
    onTransitionStart: () => {
      void Promise.resolve();
    },
    onTransitionSuccess: () => {
      void Promise.resolve();
    },
  }));
  router.start("/");

  bench("2.2.8 Navigation with async plugin", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 2.2.9 Navigation with async data loading in middleware
{
  const router = createSimpleRouter();
  let index = 0;

  router.useMiddleware(() => async (_toState, _fromState, done) => {
    // Simulate data fetching
    await Promise.resolve({ user: "test" });
    done();
  });
  router.start("/");

  bench("2.2.9 Navigation with async data loading in middleware", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}

// 2.2.10 Navigation with deferred validation in guards
{
  const router = createSimpleRouter();
  let index = 0;

  router.canActivate("about", () => async () => {
    // Simulate async validation
    await Promise.resolve();

    return true;
  });
  router.canActivate("home", () => async () => {
    await Promise.resolve();

    return true;
  });
  router.start("/");

  bench("2.2.10 Navigation with deferred validation in guards", async () => {
    await new Promise<void>((resolve) => {
      router.navigate(alternatingRoutes[index++ % 2], {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}
