import { EnvironmentInjector } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { getPluginApi } from "@real-router/core/api";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

import { provideRealRouter } from "../../src/providers";

import type { Plugin, PluginFactory } from "@real-router/core";

const routes = [
  { name: "home", path: "/" },
  { name: "docs", path: "/docs" },
];

const urlContextPluginFactory: PluginFactory = (router) => {
  const api = getPluginApi(router);
  const claim = api.claimContextNamespace("url");

  return {
    onTransitionSuccess: (toState, _fromState, opts) => {
      const ctx = toState.context as { url?: { hash?: string } };
      const previousHash = ctx.url?.hash ?? "";
      const optsRecord = opts as { hash?: string; hashChange?: boolean };

      claim.write(toState, {
        hash: optsRecord.hash ?? previousHash,
        hashChanged: optsRecord.hashChange ?? false,
      });
    },
  } satisfies Plugin;
};

const ioInstances: {
  observe: Mock;
  unobserve: Mock;
  disconnect: Mock;
}[] = [];

function installFakeIntersectionObserver(): void {
  ioInstances.length = 0;

  const FakeIO = class implements IntersectionObserver {
    public readonly root: Element | Document | null = null;
    public readonly rootMargin: string = "";
    public readonly scrollMargin: string = "";
    public readonly thresholds: readonly number[] = [];

    public observe: Mock = vi.fn();
    public unobserve: Mock = vi.fn();
    public disconnect: Mock = vi.fn();

    constructor(_cb: IntersectionObserverCallback) {
      ioInstances.push({
        observe: this.observe,
        unobserve: this.unobserve,
        disconnect: this.disconnect,
      });
    }

    public takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  };

  vi.stubGlobal("IntersectionObserver", FakeIO);
}

describe("provideRealRouter — scrollSpy", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    document.body.innerHTML = "<section id='a'></section>";
    installFakeIntersectionObserver();
    router = createRouter(routes);
    router.usePlugin(urlContextPluginFactory);
    await router.start("/docs");
  });

  afterEach(() => {
    router.stop();
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it("no options — IntersectionObserver not instantiated", () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router)],
    });
    TestBed.inject(EnvironmentInjector);

    expect(ioInstances).toHaveLength(0);
  });

  it("scrollSpy with empty selector — no observer created", () => {
    TestBed.configureTestingModule({
      providers: [provideRealRouter(router, { scrollSpy: { selector: "" } })],
    });
    TestBed.inject(EnvironmentInjector);

    expect(ioInstances).toHaveLength(0);
  });

  it("scrollSpy provided with selector — IntersectionObserver instantiated", () => {
    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, { scrollSpy: { selector: "[id]" } }),
      ],
    });
    TestBed.inject(EnvironmentInjector);

    expect(ioInstances).toHaveLength(1);
    expect(ioInstances[0]?.observe).toHaveBeenCalled();
  });

  it("TestBed.resetTestingModule tears down the spy", () => {
    TestBed.configureTestingModule({
      providers: [
        provideRealRouter(router, { scrollSpy: { selector: "[id]" } }),
      ],
    });
    TestBed.inject(EnvironmentInjector);

    const disconnect = ioInstances[0]?.disconnect;

    TestBed.resetTestingModule();

    expect(disconnect).toHaveBeenCalled();
  });
});
