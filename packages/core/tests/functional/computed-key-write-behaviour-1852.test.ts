// #1852 — what the guarded write BUYS, at the doors whose only other guard is a
// static scan.
//
// `computed-key-write-authority-1852.test.ts` is the closed-set half: it walks
// `src` and reds when a site stops going through `putField`. That is exactly the
// wrong instrument for asking whether the guard WORKS — it reads text, so a
// present-but-broken guard passes it, and it says nothing about the outcome a
// user would see. Measured before this file existed: reverting any one of NINE
// sites to a plain store reds the scan and NOTHING else.
//
// ⚠ The nine are not a random remainder. They are every door whose defect is
// invisible in a green suite: a `<Link>` that stops printing a query key, a
// navigation that rejects with a `TypeError` from a diagnostic, a route that
// still MATCHES while its params come back empty. Each cell below asserts the
// OUTCOME under all three shapes of the hazard, against the same call with a
// pristine prototype.
//
// The hazard shapes, and why all three:
//
//   getter-only     — `[[Set]]` throws in a module (every core file is one)
//   getter+setter   — no throw at all; the value is diverted and the key is lost
//   non-writable    — throws, with a different message
//
// The middle one is the one a throw-shaped assertion cannot see, and it is the
// one that produces a committed state contradicting its own URL.

import { describe, expect, it } from "vitest";

import { createRouter } from "@real-router/core";
import {
  getLifecycleApi,
  getPluginApi,
  getRoutesApi,
} from "@real-router/core/api";

/**
 * The three ways an application can make `Object.prototype[name]` intercept a
 * write, installed for the duration of one call and removed whatever happens.
 *
 * ⚑ `configurable: true` on every one, so the `finally` can always take it back
 * off — a leaked accessor changes unrelated files rather than failing this one.
 */
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

/**
 * Run `act` once with a pristine prototype and once under each hazard, and
 * require every answer to match the pristine one.
 *
 * ⚑ Comparing against the CONTROL rather than against a literal is what keeps a
 * cell from passing on a router that broke in some other way: if `act` starts
 * throwing for an unrelated reason, the control throws too and the cell fails on
 * the shape of the control instead of silently agreeing.
 */
async function unaffectedBy(
  name: string,
  act: () => unknown | Promise<unknown>,
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
 * ⚠ This comparison alone is NOT a test, and the gap is measured rather than
 * theoretical: it is blind to a UNIFORM failure. With `putField`'s body replaced
 * by `return;` — a router that stores nothing at all — six of these cells stayed
 * green, because all four answers agreed on the wrong value. The cell named
 * "a leaf splat still captures the rest of the path" passed while nothing was
 * captured, and "a declared `?name` still prints" passed while `/q` printed
 * without the key. Those are verbatim the two defects this file's header gives
 * as its reason to exist.
 *
 * So every cell pins the CONTROL's content first and only then compares the
 * hazards to it. `not.toHaveProperty("threw")` was the earlier guard and it
 * catches only a throw.
 *
 * ⚑ Built FROM the control rather than from a literal, so a cell cannot pass by
 * agreeing on a wrong answer — and paired at every call site with a check that
 * the control did not itself throw, which is what stops "all four threw
 * identically" from reading as success.
 */
const uniform = (
  answers: Record<string, unknown>,
): Record<string, unknown> => ({
  control: answers.control,
  "getter-only": answers.control,
  "getter+setter": answers.control,
  "non-writable": answers.control,
});

describe("a guarded write keeps its door's OUTCOME (#1852)", () => {
  describe("channels", () => {
    it("modeGate — a DECLARED query name still reaches state.search and the URL", async () => {
      // The key is one the route declares with `?`, which is the whole point:
      // these are the names an application also routes under. Measured before
      // the guard: `navigate` rejected with `TypeError: Cannot set property page
      // of #<Object> which has only a getter`.
      const answers = await unaffectedBy("page", async () => {
        const local = createRouter([{ name: "p", path: "/p?page" }], {
          queryParamsMode: "default",
        });

        await local.start("/p");

        const state = await local.navigate("p", {}, { page: "2" });
        const answer = { search: { ...state.search }, path: state.path };

        local.dispose();

        return answer;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: { search: { page: "2" }, path: "/p?page=2" },
      });
      expect(answers).toStrictEqual(uniform(answers));
    });

    it("defaults — a withheld-slot walk still prints the route's own defaultSearch", async () => {
      // `withholdFilledSlots` copies the route's `defaultSearch` key by key, so
      // the key comes from the route CONFIG. Measured: `buildPath` threw instead
      // of printing a URL.

      const answers = await unaffectedBy("theme", () => {
        const local = createRouter([
          { name: "u", path: "/u/:id?theme", defaultSearch: { theme: "dark" } },
        ]);

        const href = local.buildPath("u", { id: "1" });

        local.dispose();

        return href;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: "/u/1?theme=dark",
      });
      expect(answers).toStrictEqual(uniform(answers));
    });
  });

  describe("the URL BUILD direction", async () => {
    it("a declared `?name` still prints", async () => {
      const answers = await unaffectedBy("tab", () => {
        const local = createRouter([{ name: "q", path: "/q?tab" }]);
        const href = local.buildPath("q", {}, { tab: "x" });

        local.dispose();

        return href;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: "/q?tab=x",
      });
      expect(answers).toStrictEqual(uniform(answers));
    });

    it("an UNDECLARED key under `loose` still prints", async () => {
      // The sibling arm, and the one where the key is the CALLER's rather than
      // the route's — same write, different provenance.

      const answers = await unaffectedBy("extra", () => {
        const local = createRouter([{ name: "l", path: "/l?a" }], {
          queryParamsMode: "loose",
        });
        const href = local.buildPath("l", {}, { a: "1", extra: "2" });

        local.dispose();

        return href;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: "/l?a=1&extra=2",
      });
      expect(answers).toStrictEqual(uniform(answers));
    });
  });

  describe("the URL MATCH direction", async () => {
    it("a leaf splat still captures the rest of the path", async () => {
      const answers = await unaffectedBy("rest", () => {
        const local = createRouter([{ name: "f", path: "/files/*rest" }]);
        const matched = getPluginApi(local).matchPath("/files/a/b");
        const answer = { name: matched?.name, params: { ...matched?.params } };

        local.dispose();

        return answer;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: { name: "f", params: { rest: "a/b" } },
      });
      expect(answers).toStrictEqual(uniform(answers));
    });

    it("a splat WITH children still captures when the specific child misses", async () => {
      // `#matchSplat`'s second write — reached only when a more specific child
      // exists and fails, which is why the route carries one.

      const answers = await unaffectedBy("rest", () => {
        const local = createRouter([
          {
            name: "f",
            path: "/files/*rest",
            children: [{ name: "edit", path: "/edit" }],
          },
        ]);
        const matched = getPluginApi(local).matchPath("/files/a/b");
        const answer = { name: matched?.name, params: { ...matched?.params } };

        local.dispose();

        return answer;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: { name: "f", params: { rest: "a/b" } },
      });
      expect(answers).toStrictEqual(uniform(answers));
    });

    it("the junction commit still carries the param past a splat sibling", async () => {
      // ⚑ `copyFields`, not `putField` — `Object.assign` is the same `[[Set]]`
      // per key and was the form no `dst[key] = …` census could see. Measured
      // with a setter: the route still MATCHED and `state.params` came back
      // EMPTY, which is the shape a throw-shaped assertion is blind to.

      const answers = await unaffectedBy("id", () => {
        const local = createRouter([
          { name: "j", path: "/j/*rest" },
          { name: "k", path: "/j/:id/x" },
        ]);
        const matched = getPluginApi(local).matchPath("/j/7/x");
        const answer = { name: matched?.name, params: { ...matched?.params } };

        local.dispose();

        return answer;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: { name: "k", params: { id: "7" } },
      });
      expect(answers).toStrictEqual(uniform(answers));
    });

    it("the splat's own junction commit does too", async () => {
      // The second `copyFields`, inside `#matchSplat`.

      const answers = await unaffectedBy("id", () => {
        const local = createRouter([
          {
            name: "s",
            path: "/s/*rest",
            children: [{ name: "deep", path: "/:id/x" }],
          },
        ]);
        const matched = getPluginApi(local).matchPath("/s/7/x");
        const answer = { name: matched?.name, params: { ...matched?.params } };

        local.dispose();

        return answer;
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: { name: "s.deep", params: { id: "7" } },
      });
      expect(answers).toStrictEqual(uniform(answers));
    });
  });

  describe("diagnostics must not become the failure", () => {
    it("a thrown object's own field still reaches the error metadata", async () => {
      // The keys here belong entirely to the application code that THREW, so
      // this door has no say in them at all. Measured: the navigation rejected
      // with a `TypeError` raised by the metadata filter — a diagnostic
      // replacing the fault it was built to report — and under a setter the
      // field's value was silently swapped for the accessor's.
      const answers = await unaffectedBy("userId", async () => {
        const local = createRouter([
          { name: "h", path: "/h" },
          { name: "g", path: "/g" },
        ]);

        await local.start("/h");
        getLifecycleApi(local).addActivateGuard("g", () => () => {
          // ⚑ A plain object, not an `Error`, and that is the SUBJECT rather
          // than sloppiness: the metadata filter this cell covers exists to copy
          // the own fields of whatever application code threw, so its keys are
          // entirely outside core's control.
          // eslint-disable-next-line @typescript-eslint/only-throw-error -- the thrown non-Error IS the input under test
          throw { userId: "123", reason: "nope" };
        });

        try {
          await local.navigate("g");

          return "navigated, which it must not";
        } catch (error) {
          const err = error as Record<string, unknown>;

          return { code: err.code, userId: err.userId, reason: err.reason };
        } finally {
          local.dispose();
        }
      });

      expect(
        answers.control,
        "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
      ).toStrictEqual({
        ok: { code: "CANNOT_ACTIVATE", userId: "123", reason: "nope" },
      });
      expect(answers).toStrictEqual(uniform(answers));
    });
  });

  describe("CONTROL — the instrument discriminates", () => {
    it("an unguarded write under the same hazard really does break", async () => {
      // ⚑ Without this, every cell above could be passing because the hazard is
      // inert in this environment. A bare `[[Set]]` of the same shape must fail
      // all three ways — and it is the exact code each door used to run.
      // ⚠ The store MUST stay a `[[Set]]` through a computed key, and it is
      // written through a helper for exactly that reason: `eslint --fix` folds
      // `bag.zzControl = "mine"` into an object literal, and a literal DEFINES —
      // which silently turns this control into one that consults no chain at all
      // and can never fail. It has done so once already in this file.
      const store = (bag: Record<string, unknown>, key: string): void => {
        bag[key] = "mine";
      };

      const outcomes = HAZARDS.map(([label, descriptor]) => {
        Object.defineProperty(Object.prototype, "zzControl", descriptor());

        try {
          const bag: Record<string, unknown> = {};

          store(bag, "zzControl");

          return [label, Object.hasOwn(bag, "zzControl") ? "stored" : "LOST"];
        } catch {
          return [label, "THREW"];
        } finally {
          Reflect.deleteProperty(Object.prototype, "zzControl");
        }
      });

      expect(Object.fromEntries(outcomes)).toStrictEqual({
        "getter-only": "THREW",
        "getter+setter": "LOST",
        "non-writable": "THREW",
      });
    });

    it("the route-CRUD door is covered by its own file, and is named here so the set reads complete", async () => {
      // `prepareCustomFields` (`routesStore`) is the tenth site of this family.
      // It is NOT re-tested here — `prototype-shadowing-fields-1788.test.ts`
      // owns it by descriptor across all four doors — but a reader counting
      // sites in this file would otherwise conclude it was missed.
      const local = createRouter([{ name: "home", path: "/home", keep: 1 }]);

      getRoutesApi(local).update("home", { zzField: 42 } as never);

      expect(getPluginApi(local).getRouteConfig("home")).toStrictEqual({
        keep: 1,
        zzField: 42,
      });

      local.dispose();
    });
  });
});
