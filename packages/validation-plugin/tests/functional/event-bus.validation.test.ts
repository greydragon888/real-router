import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { events } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import { validationPlugin } from "@real-router/validation-plugin";

import { createValidationRouter } from "../helpers";

import type { Router } from "@real-router/core";

let router: Router;

describe("event bus validation — with validationPlugin", () => {
  beforeEach(() => {
    router = createValidationRouter();
  });

  afterEach(() => {
    router.stop();
  });

  describe("addEventListener validation", () => {
    it("should throw TypeError when callback is not a function", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        addEventListener(e: unknown, cb: unknown): unknown;
      };
      expect(() => raw.addEventListener(events.ROUTER_START, "not-fn")).toThrow(
        TypeError,
      );
    });

    it("should throw TypeError for non-function types", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        addEventListener(e: unknown, cb: unknown): unknown;
      };
      expect(() => raw.addEventListener(events.ROUTER_START, 123)).toThrow(
        TypeError,
      );
      expect(() => raw.addEventListener(events.ROUTER_START, null)).toThrow(
        TypeError,
      );
    });

    it("should throw Error for invalid event name", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        addEventListener(e: unknown, cb: unknown): unknown;
      };
      expect(() => raw.addEventListener("invalidEvent", () => {})).toThrow(
        Error,
      );
      expect(() => raw.addEventListener("invalidEvent", () => {})).toThrow(
        /Invalid event name/,
      );
    });

    it("should validate both parameters", () => {
      const api = getPluginApi(router);
      const raw = api as unknown as {
        addEventListener(e: unknown, cb: unknown): unknown;
      };
      expect(() => raw.addEventListener("bad-event", "bad-fn")).toThrow();
    });

    it("should accept valid event and callback", () => {
      const api = getPluginApi(router);
      expect(() =>
        api.addEventListener(events.ROUTER_START, () => {}),
      ).not.toThrow();
    });

    it("should accept all valid event names", () => {
      const api = getPluginApi(router);
      const validEvents = [
        events.ROUTER_START,
        events.ROUTER_STOP,
        events.TRANSITION_START,
        events.TRANSITION_CANCEL,
        events.TRANSITION_SUCCESS,
        events.TRANSITION_ERROR,
      ];
      for (const evt of validEvents) {
        expect(() => api.addEventListener(evt, () => {})).not.toThrow();
      }
    });
  });

  describe("subscribe", () => {
    it("should accept function listener", () => {
      expect(() => router.subscribe(() => {})).not.toThrow();
    });
  });
});
