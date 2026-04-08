import { bench, boxplot, do_not_optimize, run, summary } from "mitata";

import { createRouter } from "../../../src";

import type { Route } from "../../../src";

const routes: Route[] = [
  { name: "home", path: "/" },
  { name: "about", path: "/about" },
  { name: "users", path: "/users" },
];

const TARGETS = ["about", "users", "home"] as const;

// ============================================================================
// subscribeLeave overhead on navigate hot path (no guards)
// ============================================================================

boxplot(() => {
  summary(() => {
    {
      const router = createRouter(routes);

      void router.start("/");

      let i = 0;

      bench("navigate: no leave listeners (baseline)", () => {
        do_not_optimize(void router.navigate(TARGETS[i++ % TARGETS.length]));
      }).gc("inner");
    }

    {
      const router = createRouter(routes);

      void router.start("/");

      router.subscribeLeave(() => {});

      let i = 0;

      bench("navigate: 1 sync leave listener", () => {
        do_not_optimize(void router.navigate(TARGETS[i++ % TARGETS.length]));
      }).gc("inner");
    }

    {
      const router = createRouter(routes);

      void router.start("/");

      router.subscribeLeave(() => {});
      router.subscribeLeave(() => {});
      router.subscribeLeave(() => {});

      let i = 0;

      bench("navigate: 3 sync leave listeners", () => {
        do_not_optimize(void router.navigate(TARGETS[i++ % TARGETS.length]));
      }).gc("inner");
    }

    {
      const router = createRouter(routes);

      void router.start("/");

      router.subscribeLeave(() => {
        throw new Error("sync error");
      });
      router.subscribeLeave(() => {});

      let i = 0;

      bench("navigate: sync leave listener with throw", () => {
        do_not_optimize(void router.navigate(TARGETS[i++ % TARGETS.length]));
      }).gc("inner");
    }
  });
});

if (process.argv[1]?.includes("leave-listeners")) {
  void run();
}
