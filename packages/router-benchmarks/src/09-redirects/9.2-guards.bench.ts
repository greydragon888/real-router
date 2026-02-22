// packages/router-benchmarks/modules/09-redirects/9.2-guards.bench.ts

import { bench } from "mitata";

import { createSimpleRouter } from "../helpers";

// 9.2.1 Redirect from middleware
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
  router.start("/");

  bench("9.2.1 Redirect from middleware (canActivate)", () => {
    router.navigate("about");
  }).gc("inner");
}

// 9.2.2 Redirect from middleware
{
  const router = createSimpleRouter();
  let redirectCount = 0;

  router.usePlugin(() => ({
    onTransitionSuccess: (toState, fromState) => {
      if (fromState?.name === "about") {
        const target = redirectCount++ % 2 === 0 ? "home" : "users";

        void router.makeState(target, {}, target === "home" ? "/" : "/users");
      } else if (toState.name !== "about" && fromState?.name !== "about") {
        void router.makeState("about", {}, "/about");
      }
    },
  }));
  router.start("/");
  router.navigate("about");

  const routes = ["users", "home"];
  let index = 0;

  bench("9.2.2 Redirect from middleware (canDeactivate)", () => {
    router.navigate(routes[index++ % 2]);
  }).gc("inner");
}

// 9.2.3 Redirect with context preservation
{
  const router = createSimpleRouter();
  let redirectCount = 0;

  router.usePlugin(() => ({
    onTransitionSuccess: (toState) => {
      if (toState.name === "user" && toState.params.id === "protected") {
        const target = redirectCount++ % 2 === 0 ? "home" : "about";

        void router.makeState(target, {}, target === "home" ? "/" : "/about");
      }
    },
  }));
  router.start("/");

  bench("9.2.3 Redirect with context preservation", () => {
    router.navigate("user", { id: "protected" });
  }).gc("inner");
}
