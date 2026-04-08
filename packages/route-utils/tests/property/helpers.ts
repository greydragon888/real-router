import { fc } from "@fast-check/vitest";

export const NUM_RUNS = { standard: 100, lifecycle: 50, async: 30 } as const;

export const arbSegment: fc.Arbitrary<string> = fc.stringMatching(
  /^[a-zA-Z][a-zA-Z0-9_-]{0,19}$/,
);

export const arbRouteName: fc.Arbitrary<string> = fc
  .array(arbSegment, { minLength: 1, maxLength: 5 })
  .map((segs) => segs.join("."));

export const arbMultiSegmentName: fc.Arbitrary<string> = fc
  .array(arbSegment, { minLength: 2, maxLength: 5 })
  .map((segs) => segs.join("."));

export function getLastSegment(name: string): string {
  const dotIndex = name.lastIndexOf(".");

  return dotIndex === -1 ? name : name.slice(dotIndex + 1);
}

export function getParentSegment(name: string): string {
  const dotIndex = name.lastIndexOf(".");

  return dotIndex === -1 ? "" : name.slice(0, dotIndex);
}

export function getFirstSegment(name: string): string {
  const dotIndex = name.indexOf(".");

  return dotIndex === -1 ? name : name.slice(0, dotIndex);
}

export const arbDisjointPair: fc.Arbitrary<[string, string]> = fc
  .tuple(arbSegment, arbSegment)
  .filter(([a, b]) => a !== b)
  .chain(([segA, segB]) =>
    fc
      .tuple(
        fc
          .array(arbSegment, { minLength: 0, maxLength: 3 })
          .map((tail) => [segA, ...tail].join(".")),
        fc
          .array(arbSegment, { minLength: 0, maxLength: 3 })
          .map((tail) => [segB, ...tail].join(".")),
      )
      .filter(([a, b]) => a !== b),
  );
