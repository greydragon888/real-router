// packages/route-tree/tests/property/segments.properties.ts

import { test } from "@fast-check/vitest";

import {
  arbDeepTreeRouteName,
  arbShallowDeepTreeRouteName,
  arbUnknownRouteName,
  DEEP_TREE,
  getSegmentsByName,
  NUM_RUNS,
} from "./helpers";

describe("getSegmentsByName Properties (nameToIDs equivalent)", () => {
  describe("correctness — last segment fullName equals the queried name (high)", () => {
    test.prop([arbDeepTreeRouteName], { numRuns: NUM_RUNS.thorough })(
      "last segment fullName matches the searched route name",
      (name: string) => {
        const segments = getSegmentsByName(DEEP_TREE, name);

        expect(segments).not.toBeNull();
        expect(segments!.at(-1)!.fullName).toBe(name);
      },
    );
  });

  describe("length — segments count equals dot-segment count (high)", () => {
    test.prop([arbDeepTreeRouteName], { numRuns: NUM_RUNS.thorough })(
      "number of segments returned equals the number of dot-separated parts",
      (name: string) => {
        const segments = getSegmentsByName(DEEP_TREE, name);

        expect(segments).not.toBeNull();
        expect(segments!).toHaveLength(name.split(".").length);
      },
    );
  });

  describe("prefix property — each segment fullName is a prefix of the next (high)", () => {
    test.prop([arbDeepTreeRouteName], { numRuns: NUM_RUNS.thorough })(
      "segment[i].fullName + '.' is a prefix of segment[i+1].fullName",
      (name: string) => {
        const segments = getSegmentsByName(DEEP_TREE, name);

        expect(segments).not.toBeNull();

        for (let i = 0; i < segments!.length - 1; i++) {
          const current = segments![i].fullName;
          const next = segments![i + 1].fullName;

          expect(next.startsWith(`${current}.`)).toBe(true);
        }
      },
    );
  });

  describe("fast-path consistency — 1–4 segment results match general algorithm (medium)", () => {
    test.prop([arbShallowDeepTreeRouteName], { numRuns: NUM_RUNS.standard })(
      "single-segment names use fast path but produce identical structure to multi-segment logic",
      (name: string) => {
        const segments = getSegmentsByName(DEEP_TREE, name);

        expect(segments).not.toBeNull();

        const parts = name.split(".");
        let lastFullName = "";

        for (const part of parts) {
          lastFullName = lastFullName ? `${lastFullName}.${part}` : part;
        }

        expect(segments!.at(-1)!.fullName).toBe(lastFullName);
        expect(segments!).toHaveLength(parts.length);
      },
    );
  });

  describe("null return — unknown route name yields null (high)", () => {
    test.prop([arbUnknownRouteName], { numRuns: NUM_RUNS.standard })(
      "getSegmentsByName returns null for names not in the tree",
      (name: string) => {
        const result = getSegmentsByName(DEEP_TREE, name);

        expect(result).toBeNull();
      },
    );
  });

  describe("fullName — equals dot-joined ancestor names for every segment (high)", () => {
    test.prop([arbDeepTreeRouteName], { numRuns: NUM_RUNS.thorough })(
      "every segment's fullName is the dot-joined path from root to that node",
      (name: string) => {
        const segments = getSegmentsByName(DEEP_TREE, name);

        expect(segments).not.toBeNull();

        for (const segment of segments!) {
          const parts: string[] = [];
          let current = segment;

          while (current.name !== "") {
            parts.unshift(current.name);

            if (!current.parent) {
              break;
            }

            current = current.parent;
          }

          expect(segment.fullName).toBe(parts.join("."));
        }
      },
    );
  });
});
