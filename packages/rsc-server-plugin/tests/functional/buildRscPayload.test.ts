import { describe, expect, it } from "vitest";

import { buildRscPayload, type RscActionResult } from "../../src";

import type { State } from "@real-router/core";
import type { ReactNode } from "react";

const node = (kind: string, props: Record<string, unknown> = {}): ReactNode =>
  ({
    type: kind,
    props,
    key: null,
    $$typeof: Symbol.for("react.element"),
  }) as unknown as ReactNode;

const buildState = (
  context: Record<string, unknown> = {},
  overrides: Partial<State> = {},
): State => ({
  name: "users.profile",
  params: { id: "42" },
  path: "/users/42",
  transition: {
    phase: "activating",
    reason: "success",
    segments: { deactivated: [], activated: [], intersection: "" },
  },
  ...overrides,
  context,
});

describe("buildRscPayload", () => {
  describe("root", () => {
    it("uses state.context.rsc when no override is provided", () => {
      const rsc = node("HomePage");
      const payload = buildRscPayload(buildState({ rsc }));

      expect(payload.root).toBe(rsc);
    });

    it("uses rootOverride when provided", () => {
      const stateRsc = node("HomePage");
      const wrapped = node("Wrapped");
      const payload = buildRscPayload(buildState({ rsc: stateRsc }), wrapped);

      expect(payload.root).toBe(wrapped);
    });

    it("returns root === undefined when neither rsc nor override are set", () => {
      const payload = buildRscPayload(buildState({}));

      expect(payload.root).toBeUndefined();
    });

    it("preserves explicit null override (does NOT fall back to state.context.rsc)", () => {
      const stateRsc = node("Default");
      const payload = buildRscPayload(buildState({ rsc: stateRsc }), null);

      expect(payload.root).toBeNull();
    });

    it("treats explicit undefined override as 'use the default'", () => {
      const rsc = node("Default");
      // Explicit-`undefined`-second-arg variant of the omitted-arg default.
      // Threaded via a local so sonarjs/no-undefined-argument does not flag
      // the literal at the call site.
      const explicitlyUndefined: ReactNode | undefined = undefined;
      const payload = buildRscPayload(buildState({ rsc }), explicitlyUndefined);

      expect(payload.root).toBe(rsc);
    });

    it("supports string ReactNode (text node)", () => {
      const payload = buildRscPayload(buildState({ rsc: "hello" }));

      expect(payload.root).toBe("hello");
    });

    it("supports array ReactNode (Fragment-like)", () => {
      const fragment = [node("A"), node("B")];
      const payload = buildRscPayload(buildState({ rsc: fragment }));

      expect(payload.root).toStrictEqual(fragment);
    });
  });

  describe("rscAction passthrough", () => {
    it("propagates returnValue when rscAction.returnValue is set", () => {
      const action: RscActionResult = {
        returnValue: { ok: true, data: { id: "42" } },
      };
      const payload = buildRscPayload(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      expect(payload.returnValue).toBe(action.returnValue);
    });

    it("propagates formState when rscAction.formState is set", () => {
      const formState = ["form-key", "ok"] as unknown;
      const action: RscActionResult = { formState };
      const payload = buildRscPayload(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      expect(payload.formState).toBe(formState);
    });

    it("propagates both returnValue and formState", () => {
      const action: RscActionResult = {
        returnValue: { ok: true, data: 7 },
        formState: ["k", "ok"] as unknown,
      };
      const payload = buildRscPayload(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      expect(payload.returnValue).toBe(action.returnValue);
      expect(payload.formState).toBe(action.formState);
    });

    it("preserves returnValue.ok=false (error path)", () => {
      const error = new Error("validation failed");
      const action: RscActionResult = {
        returnValue: { ok: false, data: error },
      };
      const payload = buildRscPayload(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      expect(payload.returnValue?.ok).toBe(false);
      expect(payload.returnValue?.data).toBe(error);
    });
  });

  describe("omit semantics (exactOptionalPropertyTypes safety)", () => {
    it("omits the returnValue key entirely when state.context.rscAction is absent", () => {
      const payload = buildRscPayload(buildState({ rsc: node("Page") }));

      expect("returnValue" in payload).toBe(false);
    });

    it("omits the formState key entirely when state.context.rscAction is absent", () => {
      const payload = buildRscPayload(buildState({ rsc: node("Page") }));

      expect("formState" in payload).toBe(false);
    });

    it("omits returnValue when rscAction.returnValue is undefined (formState-only action)", () => {
      const action: RscActionResult = { formState: ["k", "ok"] as unknown };
      const payload = buildRscPayload(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      expect("returnValue" in payload).toBe(false);
      expect("formState" in payload).toBe(true);
    });

    it("omits formState when rscAction.formState is undefined (returnValue-only action)", () => {
      const action: RscActionResult = {
        returnValue: { ok: true, data: 1 },
      };
      const payload = buildRscPayload(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      expect("formState" in payload).toBe(false);
      expect("returnValue" in payload).toBe(true);
    });

    it("returns object with only `root` key when context has no action", () => {
      const payload = buildRscPayload(buildState({ rsc: node("Page") }));

      expect(Object.keys(payload)).toStrictEqual(["root"]);
    });

    it("does not invent returnValue/formState from a wholly empty rscAction", () => {
      const action: RscActionResult = {};
      const payload = buildRscPayload(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      expect(Object.keys(payload)).toStrictEqual(["root"]);
    });
  });

  describe("composition with rootOverride", () => {
    it("override + action passthrough — both ride together", () => {
      const action: RscActionResult = {
        returnValue: { ok: true, data: { saved: true } },
      };
      const wrapped = node("LayoutChrome");
      const payload = buildRscPayload(
        buildState({ rsc: node("Inner"), rscAction: action }),
        wrapped,
      );

      expect(payload.root).toBe(wrapped);
      expect(payload.returnValue).toBe(action.returnValue);
    });
  });

  describe("type narrowing (TReturn / TFormState generics)", () => {
    it("preserves the concrete shape declared by the consumer", () => {
      interface MyData {
        savedId: string;
      }

      const action: RscActionResult<MyData, [string, "ok" | "error"]> = {
        returnValue: { ok: true, data: { savedId: "abc" } },
        formState: ["form-key", "ok"],
      };

      const payload = buildRscPayload<MyData, [string, "ok" | "error"]>(
        buildState({ rsc: node("Page"), rscAction: action }),
      );

      // Type-level: narrow access without `unknown` casts.
      expect(payload.returnValue?.data.savedId).toBe("abc");
      expect(payload.formState?.[0]).toBe("form-key");
      expect(payload.formState?.[1]).toBe("ok");
    });
  });
});
