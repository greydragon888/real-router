import { createRouter, events } from "@real-router/core";
import {
  cloneRouter,
  getDependenciesApi,
  getLifecycleApi,
  getPluginApi,
} from "@real-router/core/api";
import { describe, it, expect, afterEach } from "vitest";

import { validationPlugin } from "@real-router/validation-plugin";

import type { Router } from "@real-router/core";

type NumDeps = Record<string, number>;

let router: Router;

describe("core/limits — with validationPlugin", () => {
  afterEach(() => {
    router.stop();
  });

  describe("valid limits flow through createRouter()", () => {
    it("should accept valid custom limit without error", () => {
      router = createRouter([], { limits: { maxPlugins: 10 } });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("should accept 0 (unlimited) without error", () => {
      router = createRouter([], { limits: { maxPlugins: 0 } });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("should accept empty limits object without error", () => {
      router = createRouter([], { limits: {} });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });

    it("should accept all valid limit keys", () => {
      router = createRouter([], {
        limits: {
          maxPlugins: 10,
          maxDependencies: 50,
          maxListeners: 30,
          maxEventDepth: 5,
          maxLifecycleHandlers: 100,
        },
      });

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });
  });

  describe("custom limits enforced", () => {
    it("should enforce custom maxPlugins limit", () => {
      router = createRouter([], { limits: { maxPlugins: 3 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        router.usePlugin(() => ({}));
        router.usePlugin(() => ({}));
      }).not.toThrow();

      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrow("Plugin limit exceeded");
    });

    it.todo(
      "should enforce custom maxDependencies limit — validateDependencyCount implemented in Task 8",
    );

    it("should enforce custom maxListeners limit", () => {
      router = createRouter([], { limits: { maxListeners: 1 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, () => {});
      }).not.toThrow();

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, () => {});
      }).toThrow("Listener limit");
    });
  });

  describe("0 = unlimited behavior", () => {
    it("should allow unlimited plugins when maxPlugins = 0", () => {
      router = createRouter([], { limits: { maxPlugins: 0 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 10; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrow();
    });

    it("should allow unlimited dependencies when maxDependencies = 0", () => {
      const r = createRouter<NumDeps>([], { limits: { maxDependencies: 0 } });

      r.usePlugin(validationPlugin());
      const deps = getDependenciesApi(r);

      const manyDeps: NumDeps = {};

      for (let i = 0; i < 150; i++) {
        manyDeps[`dep${i}`] = i;
      }

      expect(() => {
        deps.setAll(manyDeps);
      }).not.toThrow();

      expect(() => {
        deps.set("extraDep", 999);
      }).not.toThrow();
    });

    it("should allow unlimited listeners when maxListeners = 0", () => {
      router = createRouter([], { limits: { maxListeners: 0 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 10; i++) {
          getPluginApi(router).addEventListener(events.ROUTER_START, () => {});
        }
      }).not.toThrow();
    });

    it("should allow unlimited event depth when maxEventDepth = 0", async () => {
      router = createRouter([{ name: "home", path: "/" }], {
        limits: { maxEventDepth: 0 },
        defaultRoute: "home",
      });
      router.usePlugin(validationPlugin());

      let startEventReceived = false;

      getPluginApi(router).addEventListener(events.ROUTER_START, () => {
        startEventReceived = true;
      });

      await router.start("/home");

      expect(startEventReceived).toBe(true);
    });

    it("should allow unlimited lifecycle handlers when maxLifecycleHandlers = 0", () => {
      router = createRouter([], { limits: { maxLifecycleHandlers: 0 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 10; i++) {
          getLifecycleApi(router).addActivateGuard(`route${i}`, true);
          getLifecycleApi(router).addDeactivateGuard(`route${i}`, true);
        }
      }).not.toThrow();
    });
  });

  describe("default limits work", () => {
    it("should enforce default maxPlugins limit (50)", () => {
      router = createRouter([]);
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 49; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrow();

      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrow("Plugin limit exceeded");
    });

    it.todo(
      "should enforce default maxDependencies limit (100) — validateDependencyCount implemented in Task 8",
    );

    it("should enforce default maxListeners limit (10000)", () => {
      router = createRouter([]);
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 10_000; i++) {
          getPluginApi(router).addEventListener(events.ROUTER_START, () => {});
        }
      }).not.toThrow();

      expect(() => {
        getPluginApi(router).addEventListener(events.ROUTER_START, () => {});
      }).toThrow("Listener limit");
    });

    it("should work without explicit limits option", () => {
      router = createRouter([]);
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 49; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrow();

      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrow("Plugin limit exceeded");
    });
  });

  describe("lifecycle handler thresholds", () => {
    it("should enforce default maxLifecycleHandlers limit (200)", () => {
      router = createRouter([]);
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 200; i++) {
          getLifecycleApi(router).addActivateGuard(`route${i}`, true);
        }
      }).not.toThrow();

      expect(() => {
        getLifecycleApi(router).addActivateGuard("route200", true);
      }).toThrow(/limit exceeded.*200/i);
    });
  });

  describe("edge cases and combinations", () => {
    it("should handle mixed custom and default limits", () => {
      router = createRouter([], { limits: { maxPlugins: 6 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 5; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrow();

      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrow("Plugin limit exceeded");
    });

    it("should handle limit of 2 (validationPlugin + 1 user plugin)", () => {
      router = createRouter([], { limits: { maxPlugins: 2 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        router.usePlugin(() => ({}));
      }).not.toThrow();

      expect(() => {
        router.usePlugin(() => ({}));
      }).toThrow("Plugin limit exceeded");
    });

    it("should handle very large custom limits", () => {
      router = createRouter([], { limits: { maxPlugins: 1000 } });
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 100; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrow();
    });

    it("should preserve limits in cloned router (with separate plugin registration)", () => {
      router = createRouter([], { limits: { maxPlugins: 4 } });
      router.usePlugin(validationPlugin());

      const cloned = cloneRouter(router);

      cloned.usePlugin(validationPlugin());

      expect(() => {
        cloned.usePlugin(() => ({}));
        cloned.usePlugin(() => ({}));
      }).not.toThrow();

      expect(() => {
        cloned.usePlugin(() => ({}));
      }).toThrow("Plugin limit exceeded");
    });

    it("should handle all limits set to 0 (unlimited everything)", () => {
      router = createRouter([], {
        limits: {
          maxPlugins: 0,
          maxDependencies: 0,
          maxListeners: 0,
          maxEventDepth: 0,
          maxLifecycleHandlers: 0,
        },
      });
      router.usePlugin(validationPlugin());

      expect(() => {
        for (let i = 0; i < 20; i++) {
          router.usePlugin(() => ({}));
        }
      }).not.toThrow();
    });

    it("should accept limits: undefined (skip validation)", () => {
      router = createRouter([], { limits: undefined } as never);

      expect(() => router.usePlugin(validationPlugin())).not.toThrow();
    });
  });
});
