import { test } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  arbIntArray,
  arbNumFn,
  collectSync,
  makeSource,
  NUM_RUNS,
} from "./helpers";
import { filter, map } from "../../src/operators";

describe("Pipe Composition Properties", () => {
  describe("associativity: pipe(a, b, c) ≡ pipe(a, b).pipe(c) ≡ pipe(a).pipe(b, c)", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.standard })(
      "operator composition order is associative",
      (values) => {
        const double = (x: number): number => x * 2;
        const addOne = (x: number): number => x + 1;
        const isEven = (x: number): boolean => x % 2 === 0;

        const result1 = collectSync(
          makeSource(values).pipe(map(double), map(addOne), filter(isEven)),
        );
        const result2 = collectSync(
          makeSource(values)
            .pipe(map(double), map(addOne))
            .pipe(filter(isEven)),
        );
        const result3 = collectSync(
          makeSource(values)
            .pipe(map(double))
            .pipe(map(addOne), filter(isEven)),
        );

        expect(result1).toStrictEqual(result2);
        expect(result1).toStrictEqual(result3);
      },
    );
  });

  describe("empty-pipe: obs.pipe() returns the same observable reference", () => {
    test.prop([arbIntArray], { numRuns: NUM_RUNS.fast })(
      "pipe() with no operators returns the same observable instance",
      (values) => {
        const source = makeSource(values);
        const piped = source.pipe();

        expect(piped).toBe(source);

        const results = collectSync(piped);

        expect(results).toStrictEqual(values);
      },
    );
  });

  describe("single-operator pipe: source.pipe(op) ≡ op(source)", () => {
    test.prop([arbIntArray, arbNumFn], { numRuns: NUM_RUNS.standard })(
      "pipe with a single operator equals direct operator application",
      (values, f) => {
        const source = makeSource(values);
        const op = map(f);

        const viaPipe = collectSync(source.pipe(op));
        const direct = collectSync(op(source));

        expect(viaPipe).toStrictEqual(direct);
      },
    );
  });
});
