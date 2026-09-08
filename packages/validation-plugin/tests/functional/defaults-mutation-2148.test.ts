import { createRouter } from "@real-router/core";
import { cloneRouter } from "@real-router/core/api";
import { describe, it, expect } from "vitest";

import { validationPlugin } from "../../src";
import { DefaultsMutationWatch } from "../../src/validators/defaultsMutation";

import type { Router } from "@real-router/core";

/**
 * A defaults bag mutated after `createRouter()` is reported, once (#2148).
 *
 * ⚑ **The failure this exists for is SILENCE.** Core copies `defaultParams` and
 * `defaultSearch` at construction (#2171), so an application that mutates one
 * afterwards keeps running and simply stops having any effect — no throw, no
 * warning, no type error. Core cannot speak: it is the layer that degrades, and
 * this is the layer that reports.
 *
 * ⚠ The baseline is the bag AS THE APPLICATION HANDED IT, never core's adopted
 * copy. That copy is normalised — an own `__proto__` is dropped on the way in
 * (#1957) — so a comparison against it fires on a bag nobody touched. One cell
 * below carries exactly that shape, because it is the difference between a
 * diagnostic and noise.
 */
const ROUTES = [
  { name: "u", path: "/u/:id" },
  { name: "h", path: "/h" },
];

interface Harness {
  readonly router: Router;
  readonly reports: () => number;
  readonly warnings: () => string[];
}

const harness = (
  options: Record<string, unknown>,
  withPlugin = true,
): Harness => {
  const seen: string[] = [];
  const router = createRouter(
    ROUTES as never,
    {
      defaultRoute: "u",
      ...options,
      logger: {
        level: "all",
        callback: (...args: unknown[]) => seen.push(args.map(String).join(" ")),
      },
    } as never,
  );

  if (withPlugin) {
    router.usePlugin(validationPlugin());
  }

  return {
    router,
    reports: () =>
      seen.filter((line) => line.includes("no longer affects routing")).length,
    warnings: () => seen,
  };
};

describe("a mutated defaults bag is reported once (#2148)", () => {
  it("reports on the first navigateToDefault after the mutation, and not before", async () => {
    const bag: Record<string, unknown> = { id: "1" };
    const h = harness({ defaultParams: bag });

    try {
      await h.router.start("/h");
      await h.router.navigateToDefault();

      expect(h.reports(), "nothing has been mutated yet").toBe(0);

      bag.id = "999";
      await h.router.navigate("h");
      await h.router.navigateToDefault();

      expect(h.reports()).toBe(1);
      expect(h.warnings().join(" ")).toContain("callback form");
    } finally {
      h.router.dispose();
    }
  });

  it("says it ONCE, however many times the door is used again", async () => {
    // ⚠ The flag this pins is what separates a diagnostic from noise: this door
    // runs on every `navigateToDefault`, and a report that repeated is one an
    // application learns to filter out.
    const bag: Record<string, unknown> = { id: "1" };
    const h = harness({ defaultParams: bag });

    try {
      await h.router.start("/h");
      bag.id = "999";

      // ⚠ Default FIRST: the router starts on `h`, so opening the loop with
      // `navigate("h")` is a same-state navigation and throws before the door
      // under test is ever reached.
      await h.router.navigateToDefault();

      for (let i = 0; i < 2; i++) {
        await h.router.navigate("h");
        await h.router.navigateToDefault();
      }

      expect(h.reports()).toBe(1);
    } finally {
      h.router.dispose();
    }
  });

  it("watches BOTH slots, and names the one that moved", async () => {
    const params: Record<string, unknown> = { id: "1" };
    const search: Record<string, unknown> = { tab: "a" };
    const h = harness({ defaultParams: params, defaultSearch: search });

    try {
      await h.router.start("/h");
      search.tab = "b";
      await h.router.navigateToDefault();

      const said = h.warnings().join(" ");

      expect(said).toContain("`defaultSearch`");
      expect(said, "the slot nobody touched stays unmentioned").not.toContain(
        "`defaultParams`",
      );
    } finally {
      h.router.dispose();
    }
  });

  it("says NOTHING for a bag nobody mutated", async () => {
    const bag: Record<string, unknown> = { id: "1" };
    const h = harness({ defaultParams: bag });

    try {
      await h.router.start("/h");
      await h.router.navigateToDefault();
      await h.router.navigate("h");
      await h.router.navigateToDefault();

      expect(h.reports()).toBe(0);
    } finally {
      h.router.dispose();
    }
  });

  it("says NOTHING for an unmutated bag carrying an own `__proto__`", async () => {
    // ⚑ The cell that decides the baseline. Core's copy has this key dropped
    // (#1957), so a comparison against THAT copy sees a difference the
    // application never made — the exact shape that turns this diagnostic into
    // noise for a legitimate `JSON.parse`-shaped config.
    const bag: Record<string, unknown> = { id: "1" };

    Object.defineProperty(bag, "__proto__", {
      value: { pwned: true },
      enumerable: true,
      writable: true,
      configurable: true,
    });

    const h = harness({ defaultParams: bag });

    try {
      await h.router.start("/h");
      await h.router.navigateToDefault();

      expect(h.reports()).toBe(0);
    } finally {
      h.router.dispose();
    }
  });

  it("says NOTHING for the CALLBACK arm, which has nothing to go stale", async () => {
    // A function is called at the point of use, so there is no container a
    // mutation can silently detach — and no origin recorded for one.
    let n = 0;
    const h = harness({ defaultParams: () => ({ id: String(++n) }) });

    try {
      await h.router.start("/h");
      await h.router.navigateToDefault();
      await h.router.navigate("h");
      const second = await h.router.navigateToDefault();

      expect(h.reports()).toBe(0);
      expect(second.path, "the callback really is re-resolved").toBe("/u/2");
    } finally {
      h.router.dispose();
    }
  });

  it("BARE CORE says nothing, mutated or not", async () => {
    const bag: Record<string, unknown> = { id: "1" };
    const h = harness({ defaultParams: bag }, false);

    try {
      await h.router.start("/h");
      const before = await h.router.navigateToDefault();

      bag.id = "999";
      await h.router.navigate("h");
      const after = await h.router.navigateToDefault();

      expect(h.reports()).toBe(0);
      // CONTROL — the hazard is real: routing did NOT follow the mutation, which
      // is why the silence above is worth reporting from the layer that can.
      expect(before.path).toBe("/u/1");
      expect(after.path).toBe("/u/1");
    } finally {
      h.router.dispose();
    }
  });

  it("a CLONE carries no origin, and reports nothing of its base's", async () => {
    // ⚠ `cloneRouter` builds from the base's frozen copies, so a clone never held
    // a caller bag. Pinned because the opposite — a clone inheriting the base's
    // origins — would report the same mutation once per request under SSR.
    const bag: Record<string, unknown> = { id: "1" };
    const h = harness({ defaultParams: bag });

    try {
      await h.router.start("/h");

      const clone = cloneRouter(h.router);

      try {
        clone.usePlugin(validationPlugin());
        bag.id = "999";
        await clone.start("/h");
        await clone.navigateToDefault();

        expect(
          h.reports(),
          "the base reports on its own door, not the clone's",
        ).toBe(0);
      } finally {
        clone.dispose();
      }
    } finally {
      h.router.dispose();
    }
  });

  it("reports a key ADDED or REMOVED, not only a value that changed", async () => {
    // ⚠ Both directions on their own cell: a comparison that only walked the
    // snapshot's keys would miss an addition, and one that only walked the
    // bag's would miss a removal. Either miss is silent.
    for (const mutate of [
      (bag: Record<string, unknown>) => {
        bag.extra = "x";
      },
      (bag: Record<string, unknown>) => {
        delete bag.spare;
      },
    ]) {
      const bag: Record<string, unknown> = { id: "1", spare: "s" };
      const h = harness({ defaultParams: bag });

      try {
        await h.router.start("/h");
        mutate(bag);
        await h.router.navigateToDefault();

        expect(h.reports()).toBe(1);
      } finally {
        h.router.dispose();
      }
    }
  });

  it("a bag COLLECTED between install and check is silence, not a report", () => {
    // ⚑ The application dropped its own bag, so there is no mutation left for it
    // to make and nothing to tell anyone about. Driven by a reference that
    // answers once and then goes empty — which is what collection looks like
    // from this code's side, without asking a test to schedule a GC.
    const bag: Record<string, unknown> = { id: "1" };
    let handed = false;
    const ref = {
      deref: () => {
        if (handed) {
          return;
        }

        handed = true;

        return bag;
      },
    } as unknown as WeakRef<object>;

    const said: string[] = [];
    const logger = {
      warn: (_ctx: string, message: string) => said.push(message),
    } as never;

    const watch = new DefaultsMutationWatch();

    watch.watch({ defaultParams: ref });
    bag.id = "999";
    watch.check(logger);

    expect(said).toStrictEqual([]);

    // CONTROL — the same watcher DOES speak when the reference still answers,
    // so the silence above is the collection and not a watcher that never works.
    const live: Record<string, unknown> = { id: "1" };
    const watch2 = new DefaultsMutationWatch();

    watch2.watch({ defaultParams: new WeakRef(live) });
    live.id = "999";
    watch2.check(logger);

    expect(said).toHaveLength(1);
  });
});
