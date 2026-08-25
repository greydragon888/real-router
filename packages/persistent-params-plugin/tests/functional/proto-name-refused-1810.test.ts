// #1810 — a persistent-param name the router can never publish is refused at the
// factory, instead of being accepted and then silently never working.
//
// `validateParamKey` only ever checked a charset (`= & ? # % / \` and whitespace),
// so `"__proto__"` was accepted as a param name. It can never persist: the router
// withholds that one key from `state.params` / `state.search` at the channel copy
// (#1792 / #1852), so the value never reaches a URL. Measured before this fix:
//
//   persistentParamsPluginFactory(["__proto__", "mode"])   ACCEPTED
//   navigate("page", {}, { __proto__: "V", mode: "dev" })
//     href                                    /page?mode=dev      ← never printed
//     state.context.persistentParams          { __proto__: undefined, mode: "dev" }
//
// So the plugin published a key that is both unusable AND `undefined`-valued.
//
// ⚠ The refusal is NARROW on purpose, and the control below is what keeps it so.
// Measured across ALL TWELVE own members of `Object.prototype`, each tracked and
// navigated with a value: eleven print `/page?<name>=V` and land in
// `state.search` — including the four `__define*__` / `__lookup*__` accessors,
// which look dangerous and are not. Only `__proto__` never arrives. Refusing any
// of the other eleven would retire a working capability.
//
// ⚑ The control list is DERIVED from `Object.getOwnPropertyNames`, not written
// out: a hand-listed control silently stops covering a member the runtime adds,
// and an empty derived list would make every `each` cell vanish without failing
// anything — hence the length assertions below.

import { createRouter } from "@real-router/core";
import { describe, expect, it } from "vitest";

import { persistentParamsPluginFactory } from "../../src";

/** An OWN `"__proto__"` key — a source literal would set the prototype instead. */
const ownProto = (value: unknown): Record<string, unknown> =>
  Object.fromEntries([["__proto__", value]]);

const PROTOTYPE_MEMBERS = Object.getOwnPropertyNames(Object.prototype);
const PUBLISHABLE = PROTOTYPE_MEMBERS.filter((name) => name !== "__proto__");

describe("a persistent-param name the router cannot publish is refused (#1810)", () => {
  it("the ARRAY config form refuses `__proto__`", () => {
    expect(() => persistentParamsPluginFactory(["__proto__"])).toThrow(
      TypeError,
    );
  });

  it("the RECORD config form refuses it too", () => {
    // ⚠ Built with `Object.fromEntries`, not `{ __proto__: "x" }`: the source
    // literal sets the object's prototype and creates NO own key, so it never
    // reaches the name at all. The issue's own first comment fell into that.
    expect(() =>
      persistentParamsPluginFactory(ownProto("x") as Record<string, string>),
    ).toThrow(TypeError);
  });

  it("CONTROL — a SOURCE-LITERAL `{ __proto__: … }` is not the refused shape", () => {
    // It sets the object's prototype and creates no own key, so `Object.entries`
    // sees an empty config and the factory accepts it — there is no param by
    // that name to refuse. Pinned so the refusal is understood to key on OWN
    // names, and because the issue's own first comment reported this spelling as
    // the failing one and had to correct itself.
    expect(() =>
      persistentParamsPluginFactory({ __proto__: "x" }),
    ).not.toThrow();
  });

  it("the message says WHY, not just that the name is invalid", () => {
    let message = "";

    try {
      persistentParamsPluginFactory(["__proto__"]);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("__proto__");
    expect(message).toMatch(/never|cannot|withheld/i);
  });

  it("the added clause is TARGETED — a charset rejection does not carry it", () => {
    // Vector-1 finding: without this, deleting the `includes` guard in
    // `unpublishableClause` left all 144 tests green, i.e. the clause could be
    // appended to every configuration error and nothing would notice.
    let message = "";

    try {
      persistentParamsPluginFactory(["has space"]);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain("Invalid params configuration");
    expect(message).not.toContain("never publishes");
  });

  it.each([null, 42, "str"])(
    "a non-object config (%s) still reports the PLUGIN's error, not the engine's",
    (config) => {
      // The key scan runs on a config that is already known invalid, so it sees
      // shapes `Object.keys` refuses. `null` is the live one — measured, it is
      // rejected here while `undefined` and `{}` are ACCEPTED as an empty config
      // and never reach the scan at all. Without the `?? {}`, `Object.keys(null)`
      // throws `Cannot convert undefined or null to object` — still a TypeError,
      // so every `toThrow(TypeError)` assertion in the package stays green while
      // the caller gets an engine message about a config they can see is wrong.
      let message = "";

      try {
        persistentParamsPluginFactory(config as never);
      } catch (error) {
        message = (error as Error).message;
      }

      expect(message).toContain("Invalid params configuration");
    },
  );

  it("CONTROL — the derived member list is populated and excludes the refused name", () => {
    // Without this, a runtime whose `Object.prototype` enumerated nothing would
    // reduce every cell below to zero and the file would pass with 3 tests.
    expect(PROTOTYPE_MEMBERS).toHaveLength(12);
    expect(PUBLISHABLE).toHaveLength(11);
    expect(PUBLISHABLE).not.toContain("__proto__");
  });

  it.each(PUBLISHABLE)(
    "CONTROL — %s is still accepted AND still reaches the URL",
    async (name) => {
      const router = createRouter([
        { name: "home", path: "/" },
        { name: "page", path: "/page" },
      ]);

      router.usePlugin(persistentParamsPluginFactory([name]));
      await router.start("/home");
      await router.navigate("page", {}, { [name]: "V" });

      const href = router.buildPath("page");

      router.dispose();

      expect(href).toBe(`/page?${name}=V`);
    },
  );
});
