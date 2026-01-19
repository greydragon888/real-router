// packages/router6-benchmarks/modules/09-redirects/9.5-edge-cases.bench.ts

import { bench } from "mitata";

import { createRouter, createSimpleRouter } from "../helpers";

import type { Route } from "../helpers";

// 9.5.1 Redirect to the same route
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("about", {}, "/about"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.5.1 Redirect to the same route", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.5.2 Multiple middleware with redirects
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("home", {}, "/"));
    } else {
      done();
    }
  });
  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("users", {}, "/users"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.5.2 Multiple middleware with redirects", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.5.3 Redirect with maximum chain depth
{
  const routes: Route[] = [{ name: "final", path: "/final" }];

  for (let i = 0; i < 10; i++) {
    routes.push({
      name: `step${i}`,
      path: `/step${i}`,
      forwardTo: i === 9 ? "final" : `step${i + 1}`,
    });
  }

  const router = createRouter(routes);

  router.start();

  bench("9.5.3 Redirect with maximum chain depth", () => {
    router.navigate("step0");
  }).gc("inner");
}

// 9.5.5 Canceling navigation during redirect
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("users", {}, "/users"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.5.5 Canceling navigation during redirect", () => {
    const cancel = router.navigate("about");

    cancel();
  }).gc("inner");
}

// 9.5.6 Redirect with meta.options preservation
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

  bench("9.5.6 Redirect with meta.options preservation", () => {
    router.navigate("about", {}, { reload: true });
  }).gc("inner");
}

// 9.5.7 Redirect with meta.redirected setting
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      const redirectState = _router.makeState("home", {}, "/", {
        params: {},
        options: {},
        redirected: true,
      });

      done(undefined, redirectState);
    } else {
      done();
    }
  });
  router.start();

  bench("9.5.7 Redirect with meta.redirected setting", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.5.8 Redirect with very long parameter chain
{
  const router = createSimpleRouter();
  const params: Record<string, string> = {};

  for (let i = 0; i < 50; i++) {
    params[`param${i}`] = `value${i}`;
  }

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "about") {
      done(undefined, _router.makeState("home", params, "/"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.5.8 Redirect with very long parameter chain", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.5.9 Conditional redirect depending on parameters
{
  const router = createSimpleRouter();

  router.useMiddleware((_router) => (toState, _fromState, done) => {
    if (toState.name === "user" && toState.params.id === "admin") {
      done(undefined, _router.makeState("home", {}, "/"));
    } else if (toState.name === "user") {
      done(undefined, _router.makeState("about", {}, "/about"));
    } else {
      done();
    }
  });
  router.start();

  bench("9.5.9 Conditional redirect depending on parameters", () => {
    router.navigate("user", { id: "admin" });
  }).gc("inner");
}
