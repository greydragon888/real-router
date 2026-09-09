// #2141 / #1852 — `navigateWithHash` builds its options bag with a spread and
// then writes the fragment slot into it.
//
// The spread produces no own key for that slot when the caller passed no extra
// options carrying one, so the assignment walks the prototype: an ambient
// accessor an application or a polyfill put on `Object.prototype` takes the
// value, and the navigation runs without the fragment it was asked for.
//
// ⚠ `shared/dom-utils` feeds six packages, so one unguarded write here
// multiplies by six. This package is the dir's coverage owner (#1065 / #1086).
import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { navigateWithHash } from "../../../src/dom-utils/link-utils";

import type { Router } from "@real-router/core";

describe("#2141 — the fragment option is defined, not assigned", () => {
  type Any = Record<string, unknown>;

  const proto = Object.prototype as unknown as Any;

  const routes = [
    { name: "a", path: "/a" },
    { name: "b", path: "/b" },
  ];

  const under = async <T>(
    withSetter: boolean,
    scenario: () => Promise<T>,
  ): Promise<{ seen: unknown[]; result: T | string }> => {
    const seen: unknown[] = [];
    const descriptor: PropertyDescriptor = {
      configurable: true,
      get: (): unknown => undefined,
    };

    if (withSetter) {
      descriptor.set = function (value: unknown): void {
        seen.push(value);
      };
    }

    Object.defineProperty(proto, "hash", descriptor);

    try {
      return { seen, result: await scenario() };
    } catch (error) {
      return {
        seen,
        result: `throws:${(error as Error).message.slice(0, 70)}`,
      };
    } finally {
      delete proto.hash;
    }
  };

  const navigate = async (): Promise<string> => {
    const router: Router = createRouter(routes as never, {});

    await router.start("/a");

    try {
      const state = (await navigateWithHash(
        router,
        "b",
        {},
        undefined,
        "SECTION",
      )) as unknown as { name: string };

      return `navigated:${state.name}`;
    } finally {
      router.dispose();
    }
  };

  it("an ambient setter never sees the fragment slot", async () => {
    const run = await under(true, navigate);

    expect({ setterSaw: run.seen, outcome: run.result }).toStrictEqual({
      setterSaw: [],
      outcome: "navigated:b",
    });
  });

  it("a getter-only ambient slot does not make the navigation throw", async () => {
    const run = await under(false, navigate);

    expect(run.result).toStrictEqual("navigated:b");
  });

  it("CONTROL — with no ambient member the navigation still runs", async () => {
    await expect(navigate()).resolves.toBe("navigated:b");
  });
});
