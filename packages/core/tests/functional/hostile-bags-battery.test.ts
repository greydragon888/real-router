import { describe, expect, it } from "vitest";

import {
  CONTAINER_SHAPES,
  NON_OBJECT_CONTAINERS,
  countingBag,
  driftingBag,
  throwingBag,
} from "../helpers/hostileBags";

/**
 * The battery's own self-test.
 *
 * ⚑ A fixture is novel code, and novel code has a defect rate — this run's four
 * guard defects were all in guards written to protect a fix. So each shape is
 * pinned on the property that makes it useful, not merely on being constructible:
 * an `inherited` bag that accidentally carried own keys would report every door
 * as correct, silently, which is the failure mode the battery exists to remove.
 *
 * ⚠ Nothing here tests the router. This file answers "is the instrument
 * calibrated"; the doors are measured where they live.
 */
describe("the adversarial input battery is calibrated", () => {
  const SOURCE = { alpha: "A", beta: "B" };

  it("countingBag answers exactly like its source, and counts every read", () => {
    const { bag, reads } = countingBag(SOURCE);

    expect({ alpha: bag.alpha, beta: bag.beta }).toStrictEqual(SOURCE);
    expect(reads).toStrictEqual({ alpha: 1, beta: 1 });

    void bag.alpha;

    expect(reads).toStrictEqual({ alpha: 2, beta: 1 });

    // The whole point: identical answers, so only the count moves. A door that
    // reads twice is invisible to any assertion on the outcome.
    expect(bag.alpha).toBe(SOURCE.alpha);
  });

  it("driftingBag answers `first` once, then `then` — per key", () => {
    const { bag, reads } = driftingBag(SOURCE, { beta: "DRIFTED" });

    expect([bag.alpha, bag.beta]).toStrictEqual(["A", "B"]);
    // Second read: `beta` drifts, `alpha` (absent from `then`) does not.
    expect([bag.alpha, bag.beta]).toStrictEqual(["A", "DRIFTED"]);
    expect([bag.alpha, bag.beta]).toStrictEqual(["A", "DRIFTED"]);
    expect(reads).toStrictEqual({ alpha: 3, beta: 3 });
  });

  it("throwingBag throws from the read, not from construction", () => {
    const boom = new Error("the caller's getter failed");
    const bag = throwingBag(SOURCE, boom);

    expect(() => bag.alpha).toThrow(boom);
  });

  it("every shape is exactly what it claims — one fingerprint, no branching", () => {
    // ⚑ A signature per shape, compared in ONE assertion. The alternative — an
    // `it.each` branching on the label — puts a conditional in a test and, worse,
    // lets a shape whose label nobody wrote a branch for pass by falling through
    // the `else`. Here a shape that stops discriminating changes its row.
    const fingerprint = Object.fromEntries(
      CONTAINER_SHAPES.map(([label, wrap]) => {
        const wrapped = wrap(SOURCE);

        return [
          label,
          {
            answers: wrapped.alpha,
            ownEnumerable: Object.keys(wrapped).length,
            survivesASpread: Object.keys({ ...wrapped }).length,
            nullPrototype: Object.getPrototypeOf(wrapped) === null,
            ownProtoKey: Object.hasOwn(wrapped, "__proto__"),
          },
        ];
      }),
    );

    expect(fingerprint).toStrictEqual({
      "own enumerable (control)": {
        answers: "A",
        ownEnumerable: 2,
        survivesASpread: 2,
        nullPrototype: false,
        ownProtoKey: false,
      },
      // The two the supported-input rule drops: they ANSWER but do not survive
      // an own-enumerable copy. That gap is the whole point of the shape.
      "inherited through the prototype": {
        answers: "A",
        ownEnumerable: 0,
        survivesASpread: 0,
        nullPrototype: false,
        ownProtoKey: false,
      },
      "own non-enumerable": {
        answers: "A",
        ownEnumerable: 0,
        survivesASpread: 0,
        nullPrototype: false,
        ownProtoKey: false,
      },
      "pass-through Proxy (a reactive store)": {
        answers: "A",
        ownEnumerable: 2,
        survivesASpread: 2,
        nullPrototype: false,
        ownProtoKey: false,
      },
      "null-prototype": {
        answers: "A",
        ownEnumerable: 2,
        survivesASpread: 2,
        nullPrototype: true,
        ownProtoKey: false,
      },
      // The own `__proto__` key an ordinary literal cannot express.
      "an own __proto__ key, as JSON.parse yields": {
        answers: "A",
        ownEnumerable: 3,
        survivesASpread: 3,
        nullPrototype: false,
        ownProtoKey: true,
      },
    });
  });

  it("CONTROL — both tables are populated", () => {
    // ⚑ Non-vacuity, OUTSIDE `it.each`: an empty list registers ZERO cells in
    // silence. One threshold per table — a count on one does not reach the other.
    expect(CONTAINER_SHAPES).toHaveLength(6);
    expect(NON_OBJECT_CONTAINERS).toHaveLength(6);

    // The non-object table must carry BOTH classes, since they take different
    // paths: falsy values short-circuit a `!bag` guard, truthy ones reach the
    // field reads.
    expect(NON_OBJECT_CONTAINERS.filter(([, v]) => !v).length).toBeGreaterThan(
      0,
    );
    expect(NON_OBJECT_CONTAINERS.filter(([, v]) => v).length).toBeGreaterThan(
      0,
    );
  });
});
