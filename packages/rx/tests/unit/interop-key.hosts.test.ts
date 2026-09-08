import { describe, it, expect, afterEach, vi } from "vitest";

/**
 * What `RxObservable` installs, as a function of what the host offers on
 * `Symbol.observable` — at the moment the module is evaluated, and at every
 * construction after that.
 *
 * Every arm loads its own fresh copy of the module through `vi.resetModules()`
 * plus a dynamic `import()`. That is a precondition, not a convenience: several
 * arms expect a prototype byte-identical to the bare-host one, so a module
 * evaluated under some *other* host would satisfy them without testing
 * anything. The first test is the control that re-evaluation really happens.
 *
 * ⚠ The readers below fall into two families and the difference is the whole
 * subject of the late-polyfill arms: `ownNames`/`ownSymbols` construct an
 * instance to reach the prototype, and constructing is itself what tops the
 * alias up. `protoSymbolsUnconstructed` reads the prototype off the class
 * without constructing.
 */

type Loaded = typeof import("../../src/RxObservable");

/** A host with no `Symbol.observable` at all, as opposed to one holding `undefined`. */
const ABSENT = Symbol("absent");

function protoOf(value: object): object {
  return Object.getPrototypeOf(value) as object;
}

function setHost(value: unknown): void {
  if (value === ABSENT) {
    Reflect.deleteProperty(Symbol, "observable");

    return;
  }

  Object.defineProperty(Symbol, "observable", {
    value,
    writable: false,
    enumerable: false,
    configurable: true,
  });
}

/** Evaluates a fresh copy of the module under a host carrying `value`. */
async function loadUnderHost(value: unknown): Promise<Loaded> {
  vi.resetModules();
  setHost(value);

  return import("../../src/RxObservable.js");
}

/** Evaluates a fresh copy under a bare host, then installs `value`. */
async function loadThenInstall(value: unknown): Promise<Loaded> {
  vi.resetModules();
  setHost(ABSENT);

  const loaded = await import("../../src/RxObservable.js");

  setHost(value);

  return loaded;
}

function prototypeOfFresh(module_: Loaded): object {
  return protoOf(new module_.RxObservable(() => {}));
}

function ownNames(module_: Loaded): string[] {
  return Object.getOwnPropertyNames(prototypeOfFresh(module_));
}

function ownSymbols(module_: Loaded): symbol[] {
  return Object.getOwnPropertySymbols(prototypeOfFresh(module_));
}

/** The prototype's symbols without constructing anything — no alias top-up. */
function protoSymbolsUnconstructed(module_: Loaded): symbol[] {
  return Object.getOwnPropertySymbols(module_.RxObservable.prototype);
}

describe("TC39 interop key — as a function of the host, at evaluation and after", () => {
  afterEach(() => {
    // The polyfill is a global mutation; drop it so nothing downstream of this
    // file inherits a host that this file invented.
    Reflect.deleteProperty(Symbol, "observable");
  });

  it("re-evaluates the module under the host each arm installs", async () => {
    // Control for the whole file. Two loads under two different hosts must
    // produce two different classes carrying two different symbols; one cached
    // module would fail both halves.
    const first = Symbol("first");
    const second = Symbol("second");

    const a = await loadUnderHost(first);
    const b = await loadUnderHost(second);

    expect(ownSymbols(a)).toContain(first);
    expect(ownSymbols(b)).toContain(second);
    expect(a.RxObservable).not.toBe(b.RxObservable);
  });

  it("aliases the interop method onto a host symbol installed first", async () => {
    const installed = Symbol("observable");
    const module_ = await loadUnderHost(installed);
    const obs = new module_.RxObservable(() => {});
    const proto = protoOf(obs);

    const viaSymbol = (proto as Record<symbol, unknown>)[installed];
    const viaString = (proto as Record<string, unknown>)["@@observable"];

    // Control: without it the identity below is `undefined === undefined`.
    expect(typeof viaSymbol).toBe("function");
    expect(viaSymbol).toBe(viaString);
    expect((viaSymbol as () => unknown).call(obs)).toBe(obs);
    expect(ownNames(module_)).not.toContain("undefined");
  });

  it("gives the alias the descriptor a class method carries", async () => {
    const installed = Symbol("observable");
    const module_ = await loadUnderHost(installed);
    const proto = prototypeOfFresh(module_);

    // Control: the comparison below is only worth something if the string
    // member really carries a class method's descriptor.
    expect(
      Object.getOwnPropertyDescriptor(proto, "@@observable"),
    ).toStrictEqual({
      value: expect.any(Function),
      writable: true,
      enumerable: false,
      configurable: true,
    });
    expect(Object.getOwnPropertyDescriptor(proto, installed)).toStrictEqual(
      Object.getOwnPropertyDescriptor(proto, "@@observable"),
    );
  });

  it("reaches the prototype at the next construction when the polyfill lands after evaluation", async () => {
    const late = Symbol("late");
    const module_ = await loadThenInstall(late);

    // Controls: the polyfill really is on the host by now — the arm is about
    // *when* it arrived, not whether it did — and module evaluation genuinely
    // did not install it, so what the assertion below observes is the top-up
    // and not a second copy of the "polyfill first" arm.
    expect((Symbol as { observable?: symbol }).observable).toBe(late);
    expect(protoSymbolsUnconstructed(module_)).not.toContain(late);

    const obs = new module_.RxObservable(() => {});
    const proto = protoOf(obs);

    expect(protoSymbolsUnconstructed(module_)).toContain(late);
    expect((proto as Record<symbol, unknown>)[late]).toBe(
      (proto as Record<string, unknown>)["@@observable"],
    );
    expect(ownNames(module_)).toContain("@@observable");
    expect(ownNames(module_)).not.toContain("undefined");
  });

  it("repairs an instance held across the polyfill's arrival, but only once something is constructed", async () => {
    // The residual window the top-up leaves open, and the retroactivity that
    // bounds it: the alias lands on the *prototype*, so the repair reaches an
    // instance that predates it — but nothing looks at the host until a
    // construction asks.
    vi.resetModules();
    setHost(ABSENT);

    const module_ = await import("../../src/RxObservable.js");
    const held = new module_.RxObservable(() => {});
    const late = Symbol("late");

    setHost(late);

    // Control: the host carries the symbol, so what the next line reports is
    // the missing top-up rather than a missing polyfill.
    expect((Symbol as { observable?: symbol }).observable).toBe(late);
    expect((held as unknown as Record<symbol, unknown>)[late]).toBeUndefined();

    const fresh = new module_.RxObservable(() => {});

    expect((fresh as unknown as Record<symbol, unknown>)[late]).toBe(
      (protoOf(fresh) as Record<string, unknown>)["@@observable"],
    );
    expect((held as unknown as Record<symbol, unknown>)[late]).toBe(
      (protoOf(held) as Record<string, unknown>)["@@observable"],
    );
  });

  it("picks up a second host symbol installed after the first", async () => {
    // The latch is on the host value examined, not on "we already looked":
    // a latch of the second kind, set by a pass that ran before the polyfill,
    // would lock in its own negative answer and never install anything.
    const first = Symbol("first");
    const module_ = await loadThenInstall(first);
    const underFirst = new module_.RxObservable(() => {});

    // Control: the first top-up happened, so the second one below is measured
    // against a prototype that already carries a symbol.
    expect(protoSymbolsUnconstructed(module_)).toContain(first);

    const second = Symbol("second");

    setHost(second);

    const underSecond = new module_.RxObservable(() => {});
    const symbols = protoSymbolsUnconstructed(module_);

    expect(symbols).toContain(first);
    expect(symbols).toContain(second);

    // Both spellings answer, on an instance from either side of the change:
    // the alias accumulates, it does not move.
    for (const obs of [underFirst, underSecond]) {
      for (const key of [first, second]) {
        expect((obs as unknown as Record<symbol, () => unknown>)[key]()).toBe(
          obs,
        );
      }
    }
  });

  it("installs nothing under a host value that is not a symbol", async () => {
    // `null` alone would not pin this: it is the one non-symbol value for which
    // a nullish guard behaves exactly like the `typeof === "symbol"` one. The
    // truthy and falsy-but-defined rows are what fail a widened guard.
    const nonSymbols: [string, unknown][] = [
      ["null", null],
      ["undefined", undefined],
      ["a number", 42],
      ["zero", 0],
      ["a string", "not-a-symbol"],
      ["an empty string", ""],
      ["false", false],
      ["an object", {}],
    ];

    const bare = await loadUnderHost(ABSENT);
    const baseline = ownNames(bare);

    // Controls: the door works, and the baseline it compares against is the
    // clean prototype rather than an empty read.
    expect(baseline).toContain("@@observable");
    expect(baseline).not.toContain("undefined");
    expect(nonSymbols).toHaveLength(8);

    const offenders: string[] = [];

    for (const [label, value] of nonSymbols) {
      const module_ = await loadUnderHost(value);

      if (
        ownNames(module_).join("\u0000") !== baseline.join("\u0000") ||
        ownSymbols(module_).length !== 1
      ) {
        offenders.push(label);
      }
    }

    expect(offenders).toStrictEqual([]);
  });

  it("refuses to overwrite a member the class already declares", async () => {
    // Nothing real aliases `Symbol.observable` onto another well-known symbol;
    // the arm pins the `hasOwn` half of the guard. The alias runs after the
    // class body, so without it this replaces the async iterator.
    const module_ = await loadUnderHost(Symbol.asyncIterator);
    const proto = prototypeOfFresh(module_);

    expect((proto as Record<symbol, unknown>)[Symbol.asyncIterator]).not.toBe(
      (proto as Record<string, unknown>)["@@observable"],
    );

    const observed: number[] = [];
    const obs = new module_.RxObservable<number>((observer) => {
      observer.next?.(1);
      observer.complete?.();
    });

    for await (const value of obs) {
      observed.push(value);
    }

    expect(observed).toStrictEqual([1]);
  });
});
