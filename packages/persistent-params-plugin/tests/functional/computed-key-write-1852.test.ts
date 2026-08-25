// #1852 — the plugin's own records are written under keys it did not choose.
//
// Every bag this plugin builds is keyed by a persistent-param NAME: from its own
// config in the factory, from the caller's bag in `extractOwnParams`, from the
// committed snapshot in `mergeParams`. A plain `dst[key] = value` consults the
// destination's prototype chain first, so an application that also defines
// `Object.prototype.lang` — the very name it routes under — intercepts the
// write. `putField` (`@real-router/core/utils`) closes it.
//
// ⚠ These cells exist because NOTHING else covered the four call sites:
// reverting any one of them to a plain store left the whole package green, and
// core's static `computed-key-write-authority-1852` scan walks `packages/core/src`
// only. A guard nothing can red is a guard nobody can keep.
//
// Measured before the fix, all three shapes:
//
//   getter-only     `persistentParamsPluginFactory(["lang"])` THREW at boot
//   non-writable    same
//   getter+setter   NO throw — `buildPath("page")` printed `/page` instead of
//                   `/page?lang=fr`, and `state.context.persistentParams` was
//                   `undefined`
//
// The middle one is why a throw-shaped assertion would not do: the plugin
// reports success and the parameter is simply gone from the URL.

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { persistentParamsPluginFactory } from "@real-router/persistent-params-plugin";

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
  act: () => Promise<unknown>,
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

describe("a persistent param survives an ambient accessor of its own name (#1852)", () => {
  it("the factory builds its initial bag, the plugin installs, and the param reaches the URL", async () => {
    // Covers `factory.ts` — BOTH forms: the array config writes each name into a
    // fresh bag key by key, and the record config commits with `copyFields`,
    // which is `Object.assign`'s `[[Set]]` per key wearing a different name.
    const answers = await underHazard("lang", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "page", path: "/page?lang" },
      ]);

      router.usePlugin(persistentParamsPluginFactory(["lang"]));
      await router.start("/page?lang=fr");

      const answer = {
        href: router.buildPath("page"),
        context: { ...router.getState()?.context },
      };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: {
        href: "/page?lang=fr",
        context: { persistentParams: { lang: "fr" } },
      },
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("the RECORD config form does too", async () => {
    // The `copyFields` arm of the same factory, reached only by the object form.
    const answers = await underHazard("lang", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "page", path: "/page?lang" },
      ]);

      router.usePlugin(persistentParamsPluginFactory({ lang: "en" }));
      await router.start("/home");

      const answer = { href: router.buildPath("page") };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: { href: "/page?lang=en" },
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("a key the CALLER supplies is copied, not dropped", async () => {
    // `extractOwnParams` — the guard that exists to sanitise a caller's bag, and
    // which was itself the leak: measured, a setter made the caller's own
    // `?lang=fr` disappear from the built URL with no error anywhere.
    const answers = await underHazard("lang", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "page", path: "/page?lang" },
      ]);

      router.usePlugin(persistentParamsPluginFactory(["lang"]));
      await router.start("/home");

      const answer = { href: router.buildPath("page", {}, { lang: "fr" }) };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: { href: "/page?lang=fr" },
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("a NAVIGATION that changes the value updates the snapshot", async () => {
    // The COMMIT path rather than the build path — `onTransitionSuccess` updates
    // the snapshot and republishes `state.context.persistentParams`.
    //
    // ⚠ This cell does NOT discriminate `plugin.ts`'s own write, and saying so
    // is the point: instrumented, that line is reached twice here and its
    // outcome is identical with a plain store, because `newParams` is a spread
    // of the snapshot and therefore already owns the key. The site's guard is
    // inert today (see the comment there). What this cell does cover is that the
    // three UPSTREAM sites keep working across a commit, which the build-only
    // cells above cannot show.
    const answers = await underHazard("lang", async () => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "page", path: "/page?lang" },
      ]);

      router.usePlugin(persistentParamsPluginFactory(["lang"]));
      await router.start("/home");
      await router.navigate("page", {}, { lang: "fr" });

      const answer = {
        context: { ...router.getState()?.context },
        href: router.buildPath("page"),
      };

      router.dispose();

      return answer;
    });

    expect(
      answers.control,
      "the control must SUCCEED with the right answer — a uniform failure agrees with itself",
    ).toStrictEqual({
      ok: {
        context: { persistentParams: { lang: "fr" } },
        href: "/page?lang=fr",
      },
    });
    expect(answers).toStrictEqual(uniform(answers));
  });

  it("CONTROL — the hazard is live in this environment", () => {
    // ⚠ Without this every cell above could pass because the accessor never
    // installed. The store is written through a helper on purpose: `eslint --fix`
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
