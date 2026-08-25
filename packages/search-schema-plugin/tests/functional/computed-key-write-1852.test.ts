// #1852 — the plugin rebuilds `params` and `search` key by key, under names it
// did not choose: a path slot from the route, a validated key from the schema's
// own output. A plain `dst[key] = value` consults the destination's chain, so an
// application defining `Object.prototype.id` — the name it routes under —
// intercepts the write.
//
// ⚠ Written because NOTHING covered the four call sites: reverting any one to a
// plain store left the whole package green, and core's static scan walks
// `packages/core/src` only.
//
// Measured before the fix:
//
//   getter-only / non-writable   the navigation was REJECTED outright
//   getter+setter                no throw — the path slot was lost and core
//                                reported `Missing required param 'id'` about a
//                                value the caller had supplied; on the query
//                                side the schema ran, reported success, and its
//                                output reached neither `state.search` nor the URL

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { searchSchemaPlugin } from "@real-router/search-schema-plugin";

import { searchSchema } from "./test-utils";

/** The three ways `Object.prototype[name]` can intercept a `[[Set]]`. */
const HAZARDS: readonly (readonly [string, () => PropertyDescriptor])[] = [
  ["getter-only", () => ({ get: () => "hijack", configurable: true })],
  [
    "getter+setter",
    () => {
      let sink: unknown;

      return {
        get: () => sink,
        set: (value: unknown) => {
          sink = value;
        },
        configurable: true,
      };
    },
  ],
  [
    "non-writable",
    () => ({ value: "frozen", writable: false, configurable: true }),
  ],
];

/** `act` under a pristine prototype and under each hazard, answers keyed by shape. */
async function underHazard(
  name: string,
  act: () => Promise<unknown> | unknown,
): Promise<Record<string, unknown>> {
  const settle = async (): Promise<unknown> => {
    try {
      return { ok: await act() };
    } catch (error) {
      return { threw: (error as Error).message };
    }
  };

  const answers: Record<string, unknown> = { control: await settle() };

  for (const [label, descriptor] of HAZARDS) {
    Object.defineProperty(Object.prototype, name, descriptor());

    try {
      answers[label] = await settle();
    } finally {
      Reflect.deleteProperty(Object.prototype, name);
    }
  }

  return answers;
}

/**
 * The shape a cell expects: every hazard answering exactly what the pristine run
 * answered.
 *
 * ⚠ This comparison alone is NOT a test — it is blind to a UNIFORM failure, and
 * that is measured rather than theoretical: with `putField`'s body replaced by a
 * no-op, all four answers agree on the wrong value and the cell stays green.
 * Every cell therefore pins the CONTROL's content first.
 */
const uniform = (
  answers: Record<string, unknown>,
): Record<string, unknown> => ({
  control: answers.control,
  "getter-only": answers.control,
  "getter+setter": answers.control,
  "non-writable": answers.control,
});

/**
 * ⚠ The store goes through a helper on purpose: `eslint --fix` folds
 * `bag.k = v` into an object literal, and a literal DEFINES — which silently
 * turns this control into one that consults no chain and can never fail.
 */

describe("a rebuilt channel survives an ambient accessor of its own name (#1852)", () => {
  it("a PATH slot the schema copies through still reaches the state and the URL", async () => {
    // `plugin.ts`'s params rebuild — the key is a path slot's name, taken from
    // the route.
    const answers = await underHazard("id", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "user", path: "/users/:id?q", searchSchema: searchSchema() },
      ] as never);

      router.usePlugin(searchSchemaPlugin());
      await router.start("/");

      const state = await router.navigate("user", { id: "7" }, { q: "x" });
      const answer = { params: { ...state.params }, path: state.path };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: { params: { id: "7" }, path: "/users/7?q=x" },
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("the schema's OWN output still reaches state.search and the URL", async () => {
    // `plugin.ts`'s search rebuild — the key comes from the validated result, so
    // it is the schema's, not the caller's.
    const answers = await underHazard("q", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "s", path: "/s?q", searchSchema: searchSchema() },
      ] as never);

      router.usePlugin(searchSchemaPlugin());
      await router.start("/");

      const state = await router.navigate("s", {}, { q: "hello" });
      const answer = { search: { ...state.search }, path: state.path };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: { search: { q: "hello" }, path: "/s?q=hello" },
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("a non-path key riding the params bag survives both copies", async () => {
    // Two sites at once, and the input shape is what reaches them — verified by
    // instrumenting both lines rather than by reasoning:
    //
    //   `helpers.omitKeys`   strips path params out of the params bag, so it
    //                        copies only what is left — a key the route does not
    //                        declare as a slot. It was absent from the original
    //                        sweep entirely and is the FIRST site any such key
    //                        meets.
    //   `plugin.ts`'s `else` arm  writes that same key back when the schema
    //                        validated it.
    //
    // ⚠ Both are unreachable through the query channel, which is why the three
    // cells above leave them green: an undeclared key has to ride `params`. A
    // DECLARED one cannot — core's channel guard (#1572) refuses it there.
    const answers = await underHazard("sort", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "u", path: "/users/:id", searchSchema: searchSchema() },
      ] as never);

      router.usePlugin(searchSchemaPlugin());
      await router.start("/");

      const state = await router.navigate("u", { id: "7", sort: "date" });
      const answer = {
        params: { ...state.params },
        search: { ...state.search },
        path: state.path,
      };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: { params: { id: "7", sort: "date" }, search: {}, path: "/users/7" },
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("CONTROL — the hazard is live in this environment", () => {
    // ⚠ Without this every cell above could pass because the accessor never
    // installed. The store goes through a helper on purpose: `eslint --fix`
    // folds `bag.k = v` into an object literal, and a literal DEFINES — which
    // would silently turn this control into one that consults no chain at all.
    const store = (bag: Record<string, unknown>, key: string): void => {
      bag[key] = "mine";
    };

    const outcomes = HAZARDS.map(([label, descriptor]) => {
      Object.defineProperty(Object.prototype, "zzLive", descriptor());

      try {
        const bag: Record<string, unknown> = {};

        store(bag, "zzLive");

        return [label, Object.hasOwn(bag, "zzLive") ? "stored" : "LOST"];
      } catch {
        return [label, "THREW"];
      } finally {
        Reflect.deleteProperty(Object.prototype, "zzLive");
      }
    });

    expect(Object.fromEntries(outcomes)).toStrictEqual({
      "getter-only": "THREW",
      "getter+setter": "LOST",
      "non-writable": "THREW",
    });
  });
});
