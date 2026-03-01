// packages/router-benchmarks/modules/09-redirects/9.5-edge-cases.bench.ts

import { bench } from "mitata";

import { createRouter, createSimpleRouter } from "../helpers";

import type { Route } from "../helpers";

// 9.5.1 Redirect to the same route
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      if (toState.name === "about") {
        void router.makeState("about", {}, "/about");
      }
    },
  }));
  router.start("/");

  bench("9.5.1 Redirect to the same route", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.5.2 Multiple middleware with redirects
{
  const router = createSimpleRouter();
  let redirectCount = 0;

  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      if (toState.name === "about") {
        const target = redirectCount++ % 2 === 0 ? "home" : "users";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      }
    },
  }));
  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      if (toState.name === "about") {
        void router.makeState("users", {}, "/users");
      }
    },
  }));
  router.start("/");

  bench("9.5.2 Multiple middleware with redirects", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.5.3 Redirect with maximum chain depth
{
  const routes: Route[] = [
    { name: "finalA", path: "/finalA" },
    { name: "finalB", path: "/finalB" },
  ];

  // Two chains ending at different destinations to avoid SAME_STATES
  for (let i = 0; i < 10; i++) {
    routes.push(
      {
        name: `stepA${i}`,
        path: `/stepA${i}`,
        forwardTo: i === 9 ? "finalA" : `stepA${i + 1}`,
      },
      {
        name: `stepB${i}`,
        path: `/stepB${i}`,
        forwardTo: i === 9 ? "finalB" : `stepB${i + 1}`,
      },
    );
  }

  const router = createRouter(routes);
  const starts = ["stepA0", "stepB0"];
  let index = 0;

  router.start("/");

  bench("9.5.3 Redirect with maximum chain depth", () => {
    router.navigate(starts[index++ % 2]);
  }).gc("inner");
}

// 9.5.5 Canceling navigation during redirect
{
  const router = createSimpleRouter();
  let redirectCount = 0;

  // Redirect to alternating destinations (though cancel prevents completion)
  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      if (toState.name === "about") {
        const target = redirectCount++ % 2 === 0 ? "users" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      }
    },
  }));
  router.start("/");

  bench("9.5.5 Canceling navigation during redirect", () => {
    void router.navigate("about");

    router.stop();
    router.start("/");
  }).gc("inner");
}

// 9.5.6 Redirect with transition options
{
  const router = createSimpleRouter();

  // Redirect to alternating destinations to avoid SAME_STATES
  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "about") {
        const target = fromState?.name === "home" ? "users" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      }
    },
  }));
  router.start("/");

  bench("9.5.6 Redirect with transition options", () => {
    router.navigate("about", {}, { reload: true });
  }).gc("inner");
}

// 9.5.8 Redirect with very long parameter chain
{
  const router = createSimpleRouter();
  const params: Record<string, string> = {};

  for (let i = 0; i < 50; i++) {
    params[`param${i}`] = `value${i}`;
  }

  // Redirect to alternating destinations to avoid SAME_STATES
  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "about") {
        const target = fromState?.name === "home" ? "users" : "home";

        void router.makeState(
          target,
          params,
          target === "home" ? "/" : "/users",
        );
      }
    },
  }));
  router.start("/");

  bench("9.5.8 Redirect with very long parameter chain", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.5.9 Conditional redirect depending on parameters
{
  const router = createSimpleRouter();

  // Redirect to alternating destinations to avoid SAME_STATES
  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "user" && toState.params.id === "admin") {
        const target = fromState?.name === "home" ? "about" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/about");
      } else if (toState.name === "user") {
        const target = fromState?.name === "about" ? "users" : "about";

        void router.makeState(
          target,
          {},
          target === "about" ? "/about" : "/users",
        );
      }
    },
  }));
  router.start("/");

  bench("9.5.9 Conditional redirect depending on parameters", () => {
    router.navigate("user", { id: "admin" });
  }).gc("inner");
}
