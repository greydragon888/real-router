// #2207 — a config bag built with `Object.create(null)` is accepted, like every
// other own-enumerable bag the router takes.
//
// `isValidParamsConfig` asked `getPrototypeOf(config) !== Object.prototype` to
// refuse a `Date` / `Map` / class instance. Written without the `=== null` arm,
// it refused a null-prototype bag too.
//
// ⚠ SEVEN other sites in shipped code ask the same question, and every one of
// them carries the arm. Listed rather than counted, over `packages` + `shared`
// with tests and markdown excluded and the output NOT truncated:
//
//   core/engine/validation/route-batch.ts   core/helpers.ts
//   validation-plugin/…/guards/params.ts (twice)
//   validation-plugin/…/validators/navigation.ts
//   shared/browser-env/state-guard.ts (twice)
//
// (Two further sites — `core/guards.ts` and `validation-plugin`'s
// `validators/dependencies.ts` — ask it through `proto.constructor`, which is a
// deliberately different, cross-realm-tolerant question and not this pair.)
//
// ⚠ An earlier revision of this header said "three siblings". That number came
// from a scan read through `head -20` and was an undercount; the verdict it
// supported — that this file was the only drift — survived the recount, the
// number did not.
//
// The canon is on the accepting side. `packages/core/CLAUDE.md` › Supported
// Input Shapes states the contract as "own enumerable properties only", and a
// null-prototype bag is the most conformant shape that rule admits — it carries
// no chain to walk at all. This was the one door in the tree that turned it away.
//
// ⚠ The refusal of NON-plain objects is the point of the check and must survive:
// the cells below pin `Date`, `Map`, a class instance and a primitive as still
// refused. Relaxing the prototype question must not relax the object question.
//
// ⚑ And one cell asserts an outcome that does NOT change while its REASON does:
// a null-prototype bag holding an object value stays refused — before this fix
// by the prototype gate, after it by `isPrimitiveValue`. Without that cell a fix
// that merely deleted the gate would look identical here.

import { describe, expect, it } from "vitest";

import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";

import type { PersistentParamsConfig } from "@real-router/persistent-params-plugin";

/** The factory validates its config eagerly, so this is the whole door. */
function accepts(config: unknown): boolean {
  try {
    persistentParamsPluginFactory(config as PersistentParamsConfig);

    return true;
  } catch {
    return false;
  }
}

function nullBag(entries: Record<string, unknown>): Record<string, unknown> {
  const bag = Object.create(null) as Record<string, unknown>;

  for (const [key, value] of Object.entries(entries)) {
    bag[key] = value;
  }

  return bag;
}

describe("a null-prototype config is admitted (#2207)", () => {
  it("accepts a bag made with Object.create(null)", () => {
    expect(accepts(nullBag({ lang: "en" })), "the reported shape").toBe(true);

    expect(
      accepts({ lang: "en" }),
      "CONTROL — the same content on an ordinary literal",
    ).toBe(true);
  });

  it("accepts an EMPTY null-prototype bag, as it accepts an empty literal", () => {
    expect(accepts(Object.create(null) as PersistentParamsConfig)).toBe(true);
    expect(accepts({}), "CONTROL — the empty literal").toBe(true);
  });

  it("accepts a literal whose prototype was demoted after construction", () => {
    // The third spelling of the same shape: the bag is an ordinary literal and
    // only its prototype differs, so nothing about its keys or values changed.
    const demoted: Record<string, unknown> = { lang: "en" };

    Object.setPrototypeOf(demoted, null);

    expect(accepts(demoted)).toBe(true);
  });

  it("keeps refusing every non-plain object the check exists for", () => {
    expect(accepts(new Date()), "Date").toBe(false);
    expect(accepts(new Map()), "Map").toBe(false);
    expect(
      accepts(
        new (class {
          lang = "en";
        })(),
      ),
      "class instance — the shape core's CLAUDE.md calls the one that bites",
    ).toBe(false);
    expect(accepts(null), "null").toBe(false);
    expect(accepts("lang"), "a bare string").toBe(false);
    expect(accepts(42), "a number").toBe(false);
  });

  it("keeps refusing a non-primitive VALUE, whatever the bag's prototype", () => {
    // ⚠ Unchanged outcome, changed reason — see the header. Before the fix the
    // prototype gate refused this before any value was read; after it, the value
    // rule does. A fix that only deleted the gate would still pass this cell,
    // which is why the sibling below pins the accepting direction on the SAME
    // bag shape.
    expect(accepts(nullBag({ lang: { nested: true } })), "object value").toBe(
      false,
    );
    expect(accepts(nullBag({ lang: null })), "null value").toBe(false);

    expect(
      accepts(nullBag({ lang: "en", theme: "dark" })),
      "CONTROL — the same bag shape with primitive values is accepted",
    ).toBe(true);
  });

  it("still refuses an invalid param NAME in a null-prototype bag", () => {
    // The name rules (#1810's `__proto__` refusal, and the charset) are a
    // separate axis and must not be relaxed by admitting the bag's prototype.
    expect(accepts(nullBag({ "bad=name": "x" })), "charset").toBe(false);

    // ⚠ Built by assignment, NOT as `nullBag({ __proto__: "x" })`. In an object
    // literal `__proto__:` sets the prototype and creates no own key, so
    // `Object.entries` of it is empty and the helper would hand over an EMPTY
    // bag. Measured: that spelling passed this cell before the fix — refused as
    // an empty null-prototype bag, i.e. for a reason with nothing to do with the
    // name — and stopped passing the moment empty ones became legal. On a
    // null-prototype target the assignment DOES make an own key, because the
    // `Object.prototype` accessor is not in the chain.
    const protoNamed = Object.create(null) as Record<string, unknown>;

    protoNamed.__proto__ = "x";

    expect(
      Object.hasOwn(protoNamed, "__proto__"),
      "the bag really carries the key (#1810's shape)",
    ).toBe(true);
    expect(accepts(protoNamed), "__proto__ as a name").toBe(false);
  });
});
