import { describe, it, expect } from "vitest";

import { createControllableSource } from "./helpers";
import { map, filter, distinctUntilChanged } from "../../src";

describe("RX2: Operator chain depth", () => {
  it("2.1: pipe(9 operators) × 1 subscription × 1000 values — all 1000 values passed through chain", () => {
    const { observable, emit } = createControllableSource<number>();
    const received: number[] = [];

    observable
      .pipe(
        map((x) => x + 1),
        map((x) => x + 1),
        map((x) => x + 1),
        map((x) => x + 1),
        map((x) => x + 1),
        map((x) => x + 1),
        map((x) => x + 1),
        map((x) => x + 1),
        map((x) => x + 1),
      )
      .subscribe((v) => received.push(v));

    for (let i = 0; i < 1000; i++) {
      emit(i);
    }

    expect(received).toHaveLength(1000);
    expect(received[0]).toStrictEqual(9);
    expect(received[999]).toStrictEqual(1008);
  });

  it("2.2: pipe(9 operators) × 50 concurrent subscriptions × 100 values — each subscriber got correct values", () => {
    const { observable, emit } = createControllableSource<number>();
    const receivedPerSub: number[][] = [];
    const piped = observable.pipe(
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
    );

    for (let s = 0; s < 50; s++) {
      const values: number[] = [];

      receivedPerSub.push(values);
      piped.subscribe((v) => values.push(v));
    }

    for (let i = 0; i < 100; i++) {
      emit(i);
    }

    for (const values of receivedPerSub) {
      expect(values).toHaveLength(100);
      expect(values[0]).toStrictEqual(9);
      expect(values[99]).toStrictEqual(108);
    }
  });

  it("2.3: pipe(map, filter, distinctUntilChanged, map, filter, distinctUntilChanged, map, filter, map) × 100 values — results match manual application", () => {
    const { observable, emit } = createControllableSource<number>();
    const received: string[] = [];

    observable
      .pipe(
        map((x) => x * 2),
        filter((x) => x % 3 !== 0),
        distinctUntilChanged(),
        map((x) => x + 10),
        filter((x) => x > 15),
        distinctUntilChanged(),
        map((x) => x.toString()),
        filter((x) => x.length <= 3),
        map((x) => `v:${x}`),
      )
      .subscribe((v) => received.push(v));

    for (let i = 0; i < 100; i++) {
      emit(i);
    }

    const expected = Array.from({ length: 100 }, (_, i) => i)
      .map((x) => x * 2)
      .filter((x) => x % 3 !== 0)
      .map((x) => x + 10)
      .filter((x) => x > 15)
      .map((x) => x.toString())
      .filter((x) => x.length <= 3)
      .map((x) => `v:${x}`);

    expect(received).toStrictEqual(expected);
  });

  it("2.4: pipe(9 operators) → subscribe → emit 100 → unsubscribe → teardown propagated through all 9 levels", () => {
    const { observable, emit } = createControllableSource<number>();
    const received: number[] = [];
    const piped = observable.pipe(
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
      map((x) => x + 1),
    );
    const sub = piped.subscribe((v) => received.push(v));

    for (let i = 0; i < 100; i++) {
      emit(i);
    }

    expect(received).toHaveLength(100);

    sub.unsubscribe();

    expect(sub.closed).toStrictEqual(true);

    for (let i = 100; i < 200; i++) {
      emit(i);
    }

    expect(received).toHaveLength(100);
  });

  it("2.5: Dynamic pipe building — chained .pipe() calls produce identical results to single .pipe() call", () => {
    const { observable, emit } = createControllableSource<number>();
    const op1 = map((x: number) => x + 1);
    const op2 = map((x: number) => x + 1);
    const op3 = map((x: number) => x + 1);
    const op4 = map((x: number) => x + 1);
    const op5 = map((x: number) => x + 1);
    const op6 = map((x: number) => x + 1);
    const op7 = map((x: number) => x + 1);
    const op8 = map((x: number) => x + 1);
    const op9 = map((x: number) => x + 1);
    const chained = observable
      .pipe(op1)
      .pipe(op2)
      .pipe(op3)
      .pipe(op4)
      .pipe(op5)
      .pipe(op6)
      .pipe(op7)
      .pipe(op8)
      .pipe(op9);
    const single = observable.pipe(op1, op2, op3, op4, op5, op6, op7, op8, op9);
    const chainedValues: number[] = [];
    const singleValues: number[] = [];

    chained.subscribe((v) => chainedValues.push(v));
    single.subscribe((v) => singleValues.push(v));

    for (let i = 0; i < 100; i++) {
      emit(i);
    }

    expect(chainedValues).toStrictEqual(singleValues);
  });

  it("2.6: distinctUntilChanged retained last reference — 200 subscribe/emit/unsubscribe cycles verify correct values", () => {
    for (let i = 0; i < 200; i++) {
      const { observable, emit } = createControllableSource<{
        data: number[];
      }>();
      const received: { data: number[] }[] = [];
      const pipeline = observable.pipe(distinctUntilChanged());
      const sub = pipeline.subscribe((v) => received.push(v));
      const largeObject = { data: Array.from({ length: 100 }, () => i) };

      emit(largeObject);
      sub.unsubscribe();

      expect(received).toHaveLength(1);
      expect(received[0].data[0]).toStrictEqual(i);
    }
  });
});
