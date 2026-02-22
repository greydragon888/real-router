// packages/router-benchmarks/modules/09-redirects/9.1-middleware.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 9.1.1 Simple redirect from middleware
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "about") {
        const target = fromState?.name === "home" ? "users" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      }
    },
  }));
  router.start("/");

  bench("9.1.1 Simple redirect from middleware", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.1.2 Redirect with parameters
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "user") {
        const target = fromState?.name === "home" ? "about" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/about");
      }
    },
  }));
  router.start("/");

  bench("9.1.2 Redirect with parameters", () => {
    router.navigate("user", { id: "123" });
  }).gc("inner");
}

// 9.1.3 Redirect by returning State object
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "about") {
        const target = fromState?.name === "home" ? "users" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      }
    },
  }));
  router.start("/");

  bench("9.1.3 Redirect by returning State object", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.1.4 Chain of redirects
{
  const router = createSimpleRouter();
  // Track redirect count to alternate final destination
  let redirectCount = 0;

  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      if (toState.name === "about") {
        void router.makeState("users", {}, "/users");
      }
    },
  }));
  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      if (toState.name === "users") {
        const target = redirectCount++ % 2 === 0 ? "home" : "user";

        void router.makeState(
          target,
          target === "user" ? { id: "1" } : {},
          target === "home" ? "/" : "/users/1",
        );
      }
    },
  }));
  router.start("/");

  bench("9.1.4 Chain of redirects", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.1.5 Conditional redirect
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "user" && toState.params.id === "admin") {
        const target = fromState?.name === "home" ? "about" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/about");
      }
    },
  }));
  router.start("/");

  bench("9.1.5 Conditional redirect", () => {
    router.navigate("user", { id: "admin" });
  }).gc("inner");
}

// 9.1.6 Redirect with replace flag
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (toState.name === "about") {
        const target = fromState?.name === "home" ? "users" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      }
    },
  }));
  router.start("/");

  bench("9.1.6 Redirect with replace flag", () => {
    router.navigate("about", {}, { replace: true });
  }).gc("inner");
}

// 9.1.7 Async redirect
{
  const router = createSimpleRouter();

  router.usePlugin(() => ({
    onTransitionSuccess: async (toState, fromState) => {
      if (toState.name === "about") {
        await Promise.resolve();
        const target = fromState?.name === "home" ? "users" : "home";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      }
    },
  }));
  router.start("/");

  bench("9.1.7 Async redirect", async () => {
    await router.navigate("about");
  }).gc("inner");
}
