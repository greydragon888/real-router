import { describe, it, expect } from "vitest";

import { createRouter, events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";

/**
 * `addEventListener` refuses an event name outside the seven (#1888).
 *
 * The same shape as the four guard doors, one operand over: the emitter keys
 * its listener map by the value handed in, so a name nothing ever emits — an
 * object, or a typo'd string — registers cleanly and never fires. The door
 * returns an unsubscribe either way, so there is no answer to inspect.
 *
 * ⚑ The predicate here is MEMBERSHIP, not a type check: unlike a route name,
 * the valid set is closed and core owns it (`events`). That closes the typo the
 * route-name half cannot.
 */
describe("addEventListener refuses an unknown event name (#1888)", () => {
  const REFUSED: readonly (readonly [string, unknown])[] = [
    ["a bag whose toString names an event", { toString: () => "$$success" }],
    ["a typo'd name", "$$sucess"],
    ["null", null],
    ["a number", 42],
  ];

  const routes = () => [
    { name: "u", path: "/u" },
    { name: "h", path: "/h" },
  ];
  const EXPECTED =
    "Must be one of: $start, $stop, $$start, $$leaveApprove, $$cancel, $$success, $$error";

  it("CONTROL — the table cannot shrink to nothing in silence", () => {
    expect(REFUSED).toHaveLength(4);
    expect(Object.values(events)).toHaveLength(7);
  });

  it.each(REFUSED)("refuses %s", (_label, name) => {
    const router = createRouter(routes());

    expect(() => {
      getPluginApi(router).addEventListener(name as never, (() => {}) as never);
    }).toThrow(
      new TypeError(
        `[router.addEventListener] Invalid event name: ${String(name)}. ${EXPECTED}`,
      ),
    );

    router.dispose();
  });

  it("CONTROL — every one of the seven still registers and fires", async () => {
    const router = createRouter(routes());
    let fired = 0;

    for (const name of Object.values(events)) {
      getPluginApi(router).addEventListener(
        name as never,
        (() => {
          fired += 1;
        }) as never,
      );
    }

    await router.start("/u");
    await router.navigate("h");

    expect(fired).toBeGreaterThan(0);

    router.dispose();
  });
});
