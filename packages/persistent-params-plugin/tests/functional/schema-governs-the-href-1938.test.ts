import { createRouter } from "@real-router/core";
import { searchSchemaPlugin } from "@real-router/search-schema-plugin";
import { describe, expect, it } from "vitest";

import { persistentParamsPluginFactory } from "../../src";

import type {
  StandardSchemaV1,
  StandardSchemaV1Issue,
} from "@real-router/search-schema-plugin";

/**
 * A stored value the route's schema rejects must not reach the printed URL.
 *
 * The two plugins meet on ONE seam: this one injects into the query channel at
 * `forwardState`, `search-schema-plugin` validates the result of the same seam,
 * and `router.buildPath` runs it (core #2087). Registration order decides who
 * wraps whom — the recommended order puts the schema outermost, so it sees the
 * injection — and there is no second injection point below it for a rejected
 * value to re-enter through.
 *
 * ⚠ The snapshot has to be INTACT for this to mean anything. A committed state
 * that lacks a tracked key retires that key for the router's remaining life
 * (#803), so a call made after the first commit measures a plugin that no longer
 * tracks `page`, and passes however the seams are wired.
 */
const rejects = (bad: string): StandardSchemaV1 => ({
  "~standard": {
    version: 1,
    vendor: "test",
    validate: (value) => {
      const query = value as Record<string, unknown>;

      return query.page === bad
        ? {
            issues: [
              { message: "page rejected", path: ["page"] },
            ] as readonly StandardSchemaV1Issue[],
          }
        : { value: query };
    },
  },
});

describe("the schema governs the href a stored value rides on (#1938)", () => {
  const makeRouter = () => {
    const router = createRouter([
      { name: "list", path: "/list?q&page", searchSchema: rejects("-99") },
    ]);

    // Recommended order — the schema ends up outermost and sees the injection.
    router.usePlugin(persistentParamsPluginFactory({ page: "-99" }));
    router.usePlugin(searchSchemaPlugin());

    return router;
  };

  it("keeps a rejected stored value off the rendered href", () => {
    const router = makeRouter();

    expect(router.buildPath("list", {}, { q: "x" })).toBe("/list?q=x");

    router.stop();
  });

  it("CONTROL — a stored value the schema ACCEPTS still reaches the href", () => {
    const router = createRouter([
      { name: "list", path: "/list?q&page", searchSchema: rejects("-99") },
    ]);

    router.usePlugin(persistentParamsPluginFactory({ page: "7" }));
    router.usePlugin(searchSchemaPlugin());

    // Without this the assertion above is satisfied by a plugin that injects
    // nothing at all.
    expect(router.buildPath("list", {}, { q: "x" })).toBe("/list?page=7&q=x");

    router.stop();
  });
});
