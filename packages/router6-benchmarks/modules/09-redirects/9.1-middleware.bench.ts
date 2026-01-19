// packages/router6-benchmarks/modules/09-redirects/9.1-middleware.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 9.1.1 Simple redirect from middleware
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("home", {}, "/"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.1.1 Simple redirect from middleware", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.1.2 Redirect with parameters
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "user") {
      done(undefined, _router.makeState("home", {}, "/"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.1.2 Redirect with parameters", () => {
    router.navigate("user", { id: "123" });
  }).gc("inner");
}

// 9.1.3 Redirect by returning State object
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      const redirectState = _router.makeState("home", {}, "/");

      done(undefined, redirectState);
    } else {
      done();
    }
  });
  router.start();

  bench("9.1.3 Redirect by returning State object", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.1.4 Chain of redirects
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("users", {}, "/users"));
    } else {
      done();
    }
  });
  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "users") {
      done(undefined, _router.makeState("home", {}, "/"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.1.4 Chain of redirects", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.1.5 Conditional redirect
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "user" && toState.params.id === "admin") {
      done(undefined, _router.makeState("home", {}, "/"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.1.5 Conditional redirect", () => {
    router.navigate("user", { id: "admin" });
  }).gc("inner");
}

// 9.1.6 Redirect with replace flag
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("home", {}, "/"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.1.6 Redirect with replace flag", () => {
    router.navigate("about", {}, { replace: true });
  }).gc("inner");
}

// 9.1.7 Async redirect
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => async (toState, _fromState, done) => {
    if (toState.name === "about") {
      await Promise.resolve();
      done(undefined, _router.makeState("home", {}, "/"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.1.7 Async redirect", async () => {
    await new Promise<void>((resolve) => {
      router.navigate("about", {}, {}, () => {
        resolve();
      });
    });
  }).gc("inner");
}
