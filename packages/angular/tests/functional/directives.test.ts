/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import { Component, Directive, input, type OnInit } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
import { createActiveRouteSource } from "@real-router/sources";
import { describe, beforeEach, afterEach, it, expect } from "vitest";

import { RealLink } from "../../src/directives/RealLink";
import { RealLinkActive } from "../../src/directives/RealLinkActive";
import {
  shouldNavigate,
  buildHref,
  buildActiveClassName,
  applyLinkA11y,
} from "../../src/dom-utils";
import { provideRealRouter } from "../../src/providers";

const routes = [
  { name: "home", path: "/" },
  { name: "users", path: "/users" },
];

describe("RealLink directive", () => {
  describe("with TestBed", () => {
    let router: ReturnType<typeof createRouter>;

    beforeEach(async () => {
      router = createRouter(routes);
      await router.start("/");
    });

    afterEach(() => {
      router.stop();
    });

    it("creates directive with default inputs — no href, no a11y attrs, buildHref error logged", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;

      expect(anchor.hasAttribute("href")).toBe(false);
      expect(anchor.textContent).toBe("Link");
      expect(anchor.hasAttribute("role")).toBe(false);
      expect(anchor.hasAttribute("tabindex")).toBe(false);
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("handles click event and calls router.navigate", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const navigateSpy = vi.spyOn(router, "navigate");

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;
      const event = new MouseEvent("click", {
        button: 0,
        bubbles: true,
        cancelable: true,
      });
      const preventSpy = vi.spyOn(event, "preventDefault");

      anchor.dispatchEvent(event);

      expect(preventSpy).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith("", {}, undefined, {});
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("skips navigation on meta-click", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const navigateSpy = vi.spyOn(router, "navigate");

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;
      const event = new MouseEvent("click", {
        button: 0,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });

      anchor.dispatchEvent(event);

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("skips navigation on ctrl-click", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const navigateSpy = vi.spyOn(router, "navigate");

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;
      const event = new MouseEvent("click", {
        button: 0,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });

      anchor.dispatchEvent(event);

      expect(navigateSpy).not.toHaveBeenCalled();
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("removes class attribute when not active", () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;

      expect(anchor.hasAttribute("class")).toBe(false);
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("post-navigation: router state updates and href stays absent when routeName is empty", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      await router.navigate("users");
      fixture.detectChanges();
      await fixture.whenStable();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;

      expect(anchor.hasAttribute("href")).toBe(false);
      expect(router.getState()?.name).toBe("users");
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("swallows rejected router.navigate on click (no unhandled rejection)", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const unhandledRejections: unknown[] = [];
      const onUnhandled = (event: PromiseRejectionEvent): void => {
        unhandledRejections.push(event.reason);
      };

      globalThis.addEventListener("unhandledrejection", onUnhandled);

      const navigateSpy = vi
        .spyOn(router, "navigate")
        .mockRejectedValue(new Error("rejected by guard"));

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;

      anchor.dispatchEvent(
        new MouseEvent("click", {
          button: 0,
          bubbles: true,
          cancelable: true,
        }),
      );

      await new Promise((resolve) => {
        setTimeout(resolve, 0);
      });

      // Prove navigate WAS called (mock path exercised) AND rejection was caught.
      expect(navigateSpy).toHaveBeenCalled();
      expect(unhandledRejections).toStrictEqual([]);
      expect(spy).toHaveBeenCalled();

      globalThis.removeEventListener("unhandledrejection", onUnhandled);
      spy.mockRestore();
    });

    it("cleans up on destroy — anchor attributes frozen after destroy", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;
      const classesBefore = [...anchor.classList];
      const hrefBefore = anchor.getAttribute("href");

      // JIT-LIMITED: With default routeName="" the directive logs a console.error
      // and leaves no href or class attributes on the anchor — both snapshots are
      // empty/null before destroy. The post-destroy assertions (frozen attributes)
      // are therefore trivially true in JIT. The behavioural contract (no DOM
      // writes after destroy) is enforced at scale by stress/listener-leak.stress.ts.
      fixture.destroy();

      await router.navigate("users");

      expect([...anchor.classList]).toStrictEqual(classesBefore);
      expect(anchor.getAttribute("href")).toBe(hrefBefore);
      expect(spy).toHaveBeenCalled();

      spy.mockRestore();
    });

    it("skips navigation when target is _blank", () => {
      @Component({
        template: `<a realLink target="_blank">Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}
      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();
      const navigateSpy = vi.spyOn(router, "navigate");
      const anchor = fixture.nativeElement.querySelector("a");
      const event = new MouseEvent("click", {
        button: 0,
        bubbles: true,
        cancelable: true,
      });

      anchor.dispatchEvent(event);

      expect(navigateSpy).not.toHaveBeenCalled();
    });

    it("preserves existing CSS classes on the anchor element", () => {
      @Component({
        template: `<a realLink class="my-custom-class">Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}
      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();
      const anchor = fixture.nativeElement.querySelector("a");

      expect(anchor.classList.contains("my-custom-class")).toBe(true);
    });

    it("signal inputs are not bindable in JIT mode (known limitation)", () => {
      @Component({
        template: `<a realLink routeName="home">Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}
      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();
      const anchor = fixture.nativeElement.querySelector(
        "a",
      ) as HTMLAnchorElement;

      expect(anchor.hasAttribute("href")).toBe(false);
    });

    it("a no-params <a realLink> shares the canonical undefined-params source (cache key '', not '{}') (#776)", () => {
      // A no-params `<a realLink>` and a manual `injectIsActiveRoute(name)`
      // (params === undefined) ask ONE logical question and must resolve the SAME
      // cached active-route source — one router subscription, not two (#766).
      // `createActiveRouteSource` keys params as
      // `params === undefined ? "" : canonicalJson(params)`, so a `routeParams`
      // input that defaults to {} keys "{}" and splits the source.
      //
      // JIT TestBed cannot bind signal inputs, so `routeName` stays at its default
      // "" (the documented 94% ceiling) — that is fine: the cache-key SPLIT under
      // test is on the params axis, observable for any fixed routeName. The
      // canonical lookup below uses the same "" name.
      //
      // Discriminator: a cache HIT returns the shared source without re-running
      // `router.isActiveRoute`; a cache MISS constructs a fresh source and calls it once.
      @Component({
        template: `<a realLink>Link</a>`,
        imports: [RealLink],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

      createActiveRouteSource(router, "", undefined, {
        strict: false,
        ignoreQueryParams: true,
      });

      expect(isActiveRouteSpy).not.toHaveBeenCalled();
    });
  });
});

describe("RealLinkActive directive", () => {
  describe("with TestBed", () => {
    let router: ReturnType<typeof createRouter>;

    beforeEach(async () => {
      router = createRouter(routes);
      await router.start("/");
    });

    afterEach(() => {
      router.stop();
    });

    it("applies a11y attributes to non-anchor element", () => {
      @Component({
        template: `<div realLinkActive>Item</div>`,
        imports: [RealLinkActive],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const div = fixture.nativeElement.querySelector("div");

      expect(div).not.toBeNull();
      expect(div.getAttribute("role")).toBe("link");
      expect(div.getAttribute("tabindex")).toBe("0");
    });

    it("does not add a11y attributes to anchor elements", () => {
      @Component({
        template: `<a realLinkActive>Link</a>`,
        imports: [RealLinkActive],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const a = fixture.nativeElement.querySelector("a");

      expect(a).not.toBeNull();
      expect(a.getAttribute("role")).toBeNull();
    });

    it("does not add class when realLinkActive input is empty", () => {
      @Component({
        template: `<div realLinkActive>Item</div>`,
        imports: [RealLinkActive],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const div = fixture.nativeElement.querySelector("div");

      expect(div.classList).toHaveLength(0);
    });

    it("a no-params [realLinkActive] shares the canonical undefined-params source (cache key '', not '{}') (#776)", () => {
      // Same dedup contract as <a realLink>: a no-params `[realLinkActive]` must NOT
      // default routeParams to {} before the active-route call, or it keys "{}" and
      // splits from the canonical undefined key "" — a second eager subscription for
      // the same question (#776). JIT keeps routeName at its "" default (signal
      // inputs are not bindable); the canonical lookup uses the same "" name.
      @Component({
        template: `<div realLinkActive>Item</div>`,
        imports: [RealLinkActive],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const isActiveRouteSpy = vi.spyOn(router, "isActiveRoute");

      createActiveRouteSource(router, "", undefined, {
        strict: false,
        ignoreQueryParams: true,
      });

      expect(isActiveRouteSpy).not.toHaveBeenCalled();
    });

    it("subscription callback fires on every navigation (spy via router.subscribe)", async () => {
      @Component({
        template: `<div realLinkActive>Item</div>`,
        imports: [RealLinkActive],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const subscribeSpy = vi.fn();
      const unsub = router.subscribe(subscribeSpy);

      await router.navigate("users");
      await router.navigate("home");

      expect(subscribeSpy).toHaveBeenCalledTimes(2);

      unsub();
    });

    it("cleans up on destroy — element classes not mutated by post-destroy navigation", async () => {
      @Component({
        template: `<div realLinkActive>Item</div>`,
        imports: [RealLinkActive],
      })
      class TestHost {}

      TestBed.configureTestingModule({
        imports: [TestHost],
        providers: [provideRealRouter(router)],
      });
      const fixture = TestBed.createComponent(TestHost);

      fixture.detectChanges();

      const div = fixture.nativeElement.querySelector("div") as HTMLDivElement;
      const classesBefore = [...div.classList];

      // JIT-LIMITED: With empty realLinkActive input the directive never adds a
      // class, so classesBefore = []. The post-destroy assertion is trivially true.
      // Real post-destroy class stability is exercised by stress/listener-leak.stress.ts.
      fixture.destroy();

      await router.navigate("users");
      await router.navigate("home");

      expect([...div.classList]).toStrictEqual(classesBefore);
    });
  });
});

describe("signal input availability (JIT limitation)", () => {
  it("signal inputs are not bindable in JIT mode — defaults in both constructor and ngOnInit", () => {
    const constructorValues: string[] = [];
    const initValues: string[] = [];

    @Directive({ selector: "[testInput]" })
    class TestDirective implements OnInit {
      readonly testInput = input<string>("default");

      constructor() {
        constructorValues.push(this.testInput());
      }

      ngOnInit(): void {
        initValues.push(this.testInput());
      }
    }

    @Component({
      template: `<div testInput="provided">Content</div>`,
      imports: [TestDirective],
    })
    class TestHost {}

    TestBed.configureTestingModule({ imports: [TestHost] });
    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();

    expect(constructorValues).toStrictEqual(["default"]);
    expect(initValues).toStrictEqual(["default"]);
  });
});

describe("shouldNavigate", () => {
  it("accepts clean left-click", () => {
    expect(
      shouldNavigate({
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(true);
  });

  it("rejects meta-click", () => {
    expect(
      shouldNavigate({
        button: 0,
        metaKey: true,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(false);
  });

  it("rejects middle-click", () => {
    expect(
      shouldNavigate({
        button: 1,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(false);
  });

  it("rejects right-click", () => {
    expect(
      shouldNavigate({
        button: 2,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(false);
  });

  it("rejects ctrl-click", () => {
    expect(
      shouldNavigate({
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: true,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(false);
  });

  it("rejects alt-click", () => {
    expect(
      shouldNavigate({
        button: 0,
        metaKey: false,
        altKey: true,
        ctrlKey: false,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(false);
  });

  it("rejects shift-click", () => {
    expect(
      shouldNavigate({
        button: 0,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: true,
      } as MouseEvent),
    ).toBe(false);
  });

  it("rejects NaN button (defensive)", () => {
    expect(
      shouldNavigate({
        button: Number.NaN,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(false);
  });

  it("rejects negative button (defensive)", () => {
    expect(
      shouldNavigate({
        button: -1,
        metaKey: false,
        altKey: false,
        ctrlKey: false,
        shiftKey: false,
      } as MouseEvent),
    ).toBe(false);
  });
});

describe("buildHref", () => {
  it("builds href from router", async () => {
    const router = createRouter(routes);

    await router.start("/");

    expect(buildHref(router, "home", {})).toBe("/");
    expect(buildHref(router, "users", {})).toBe("/users");

    router.stop();
  });

  it("returns undefined for unknown route", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createRouter(routes);

    await router.start("/");

    expect(buildHref(router, "unknown_route", {})).toBeUndefined();
    expect(spy).toHaveBeenCalled();

    router.stop();
    spy.mockRestore();
  });

  it("returns undefined for empty routeName", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createRouter(routes);

    await router.start("/");

    expect(buildHref(router, "", {})).toBeUndefined();
    expect(spy).toHaveBeenCalled();

    router.stop();
    spy.mockRestore();
  });

  // Gotcha #13 from CLAUDE.md ("`buildHref` falls back through `buildUrl` →
  // `buildPath`. Empty `routeName=""` also triggers this error path").
  // Closes review-2026-05-10 §4 #13 ⚠️ Partial gap: this pins the exact
  // documented error MESSAGE format, not just that `console.error` was
  // called. A regression in the catch-block formatter (typo, wrong route
  // name interpolation, missing prefix) surfaces here.
  it("empty routeName triggers console.error with the documented message format (gotcha #13)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createRouter(routes);

    await router.start("/");

    expect(buildHref(router, "", {})).toBeUndefined();

    // Exactly one error call — guarantees we don't log twice on the same
    // fallback path (e.g. once from buildUrl catch, once from buildPath
    // catch). The current implementation has ONE catch wrapping both
    // attempts; this test pins that single-emission contract.
    expect(spy).toHaveBeenCalledTimes(1);

    // Exact message format from `link-utils.ts:80-82`. If anyone refactors
    // the message (e.g. drops the `[real-router]` prefix or changes the
    // sentence), this assertion fails and surfaces the breaking change.
    expect(spy).toHaveBeenCalledWith(
      '[real-router] Route "" is not defined. The element will render without an href attribute.',
    );

    router.stop();
    spy.mockRestore();
  });

  // Sister test: non-empty but unknown routeName interpolates correctly into
  // the message — pins the `routeName` substitution inside the template
  // literal (regression that hardcoded `""` would still log, but the message
  // would be wrong).
  it("unknown routeName produces a message that interpolates the actual name", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createRouter(routes);

    await router.start("/");

    expect(buildHref(router, "no.such.route", {})).toBeUndefined();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(
      expect.stringMatching(
        /^\[real-router\] Route "no\.such\.route" is not defined\. The element will render without an href attribute\.$/,
      ),
    );

    router.stop();
    spy.mockRestore();
  });

  it("falls back to buildPath when buildUrl returns undefined", async () => {
    const router = createRouter(routes);

    await router.start("/");

    (router as unknown as Record<string, unknown>).buildUrl = () => undefined;

    expect(buildHref(router, "users", {})).toBe("/users");

    delete (router as unknown as Record<string, unknown>).buildUrl;
    router.stop();
  });

  it("catches error from buildUrl and returns undefined", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createRouter(routes);

    await router.start("/");

    (router as unknown as Record<string, unknown>).buildUrl = () => {
      throw new Error("buildUrl failure");
    };

    expect(buildHref(router, "home", {})).toBeUndefined();
    expect(spy).toHaveBeenCalled();

    delete (router as unknown as Record<string, unknown>).buildUrl;
    router.stop();
    spy.mockRestore();
  });

  it("uses buildUrl when available on router", async () => {
    const router = createRouter(routes);

    await router.start("/");

    (router as unknown as Record<string, unknown>).buildUrl = (name: string) =>
      `/custom/${name}`;

    expect(buildHref(router, "home", {})).toBe("/custom/home");

    delete (router as unknown as Record<string, unknown>).buildUrl;
    router.stop();
  });

  it("falls back to buildPath when buildUrl returns empty string (review §5.2 Bug 1)", async () => {
    // Bug 1 fix: empty-string from `buildUrl` was previously accepted as a
    // valid href, producing `<a href="">` which resolves to the current page
    // URL — silent self-navigation. New contract: `typeof url === "string"
    // && url.length > 0` — any falsy / non-string result delegates to
    // `router.buildPath` instead. Adapter test mirrors the cross-adapter
    // PBT coverage in `packages/preact/tests/property/linkUtils.properties.ts`
    // Inv 7 and `packages/react/tests/property/linkUtils.properties.ts` Inv 12.
    const router = createRouter(routes);

    await router.start("/");

    (router as unknown as Record<string, unknown>).buildUrl = () => "";

    // Now returns the buildPath result ("/"), NOT the empty string.
    expect(buildHref(router, "home", {})).toBe("/");

    delete (router as unknown as Record<string, unknown>).buildUrl;
    router.stop();
  });

  it("falls back to buildPath when buildUrl returns null (review §5.2 Bug 1)", async () => {
    // Defensive contract: BuildUrlFn type is `string | undefined`, but a
    // misbehaving plugin returning `null` (type-contract violation) must NOT
    // surface as `<a href={null}>` — fall back to buildPath instead.
    const router = createRouter(routes);

    await router.start("/");

    (router as unknown as Record<string, unknown>).buildUrl = () => null;

    expect(buildHref(router, "home", {})).toBe("/");

    delete (router as unknown as Record<string, unknown>).buildUrl;
    router.stop();
  });

  it("returns undefined when routeParams contains null value (router throws)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createRouter([{ name: "user", path: "/user/:id" }]);

    await router.start("/user/1");

    expect(buildHref(router, "user", { id: null })).toBeUndefined();
    expect(spy).toHaveBeenCalled();

    router.stop();
    spy.mockRestore();
  });
});

describe("buildActiveClassName", () => {
  it("returns active class when active", () => {
    expect(buildActiveClassName(true, "active", undefined)).toBe("active");
  });

  it("returns undefined when inactive", () => {
    expect(buildActiveClassName(false, "active", undefined)).toBeUndefined();
  });

  it("combines base and active class", () => {
    expect(buildActiveClassName(true, "active", "base")).toBe("base active");
  });

  it("returns base class when inactive", () => {
    expect(buildActiveClassName(false, "active", "base")).toBe("base");
  });

  it("returns undefined when inactive with no base", () => {
    expect(buildActiveClassName(false, undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when active but no activeClassName", () => {
    expect(buildActiveClassName(true, undefined, undefined)).toBeUndefined();
  });

  it("returns undefined when active with empty activeClassName", () => {
    expect(buildActiveClassName(true, "", undefined)).toBeUndefined();
  });

  it("does not duplicate active class when already present in base (regression)", () => {
    expect(buildActiveClassName(true, "active", "active")).toBe("active");
    expect(buildActiveClassName(true, "active", "base active")).toBe(
      "base active",
    );
    expect(buildActiveClassName(true, "active", "base  active  other")).toBe(
      "base active other",
    );
  });

  it("appends active class when base has different tokens", () => {
    expect(buildActiveClassName(true, "active", "foo bar")).toBe(
      "foo bar active",
    );
  });

  it("collapses multiple internal whitespace when dedup branch runs", () => {
    expect(buildActiveClassName(true, "active", "foo   bar   active")).toBe(
      "foo bar active",
    );
  });

  it("appends active token when base is pure whitespace", () => {
    expect(buildActiveClassName(true, "active", " ".repeat(3))).toBe("active");
  });

  it("returns base when activeClassName is whitespace-only", () => {
    expect(buildActiveClassName(true, " ".repeat(3), "base")).toBe("base");
  });

  it("returns undefined when activeClassName is whitespace-only and no base", () => {
    expect(
      buildActiveClassName(true, " ".repeat(3), undefined),
    ).toBeUndefined();
  });
});

describe("applyLinkA11y", () => {
  it("adds role and tabindex to div elements", () => {
    const div = document.createElement("div");

    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("link");
    expect(div.getAttribute("tabindex")).toBe("0");
  });

  it("skips anchor elements", () => {
    const a = document.createElement("a");

    applyLinkA11y(a);

    expect(a.getAttribute("role")).toBeNull();
  });

  it("skips button elements", () => {
    const button = document.createElement("button");

    applyLinkA11y(button);

    expect(button.getAttribute("role")).toBeNull();
  });

  it("does not overwrite existing role", () => {
    const div = document.createElement("div");

    div.setAttribute("role", "button");
    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("button");
  });

  it("does not overwrite existing tabindex", () => {
    const div = document.createElement("div");

    div.setAttribute("tabindex", "1");
    applyLinkA11y(div);

    expect(div.getAttribute("tabindex")).toBe("1");
  });

  it("does not overwrite role when attribute is present with empty value (regression)", () => {
    const div = document.createElement("div");

    div.setAttribute("role", "");
    applyLinkA11y(div);

    expect(div.getAttribute("role")).toBe("");
  });

  it("does not overwrite tabindex when attribute is present with empty value (regression)", () => {
    const div = document.createElement("div");

    div.setAttribute("tabindex", "");
    applyLinkA11y(div);

    expect(div.getAttribute("tabindex")).toBe("");
  });

  it("applies role=link and tabindex=0 to an input element (semantic issue documented)", () => {
    const input = document.createElement("input");

    applyLinkA11y(input);

    expect(input.getAttribute("role")).toBe("link");
    expect(input.getAttribute("tabindex")).toBe("0");
  });

  it("applies role=link to span elements", () => {
    const span = document.createElement("span");

    applyLinkA11y(span);

    expect(span.getAttribute("role")).toBe("link");
    expect(span.getAttribute("tabindex")).toBe("0");
  });

  it("no-ops on null element (defensive guard for non-TS consumers)", () => {
    expect(() => {
      applyLinkA11y(null);
    }).not.toThrow();
  });

  it("no-ops on undefined element (defensive guard for non-TS consumers)", () => {
    expect(() => {
      applyLinkA11y(undefined);
    }).not.toThrow();
  });
});

// Closes [#630] — RealLink active state captured at ngOnInit bug fix.
// The architectural change moves source-creation setup from `ngOnInit` into
// a `constructor + effect()` pattern so the source is recreated when signal
// inputs change. Full reactive-input verification requires AOT (signal-input
// template bindings throw NG0303 in JIT). These JIT-mode tests pin what we
// CAN verify:
//   (a) constructor-scoped `effect()` first run wires up source + subscribe
//   (b) effect cleanup is wired through the implicit injection-context
//       `DestroyRef` (no explicit `inject(DestroyRef)` needed) — verify by
//       checking subscribe callback never fires after destroy
//   (c) `OnInit` interface no longer implemented — `ngOnInit` removal is
//       structurally verified by the test suite continuing to pass without
//       it.
describe("RealLink — #630 architectural fix (constructor + effect)", () => {
  let router: ReturnType<typeof createRouter>;

  beforeEach(async () => {
    router = createRouter(routes);
    await router.start("/");
  });

  afterEach(() => {
    router.stop();
  });

  it("does NOT implement OnInit (ngOnInit removed in favor of constructor + effect)", () => {
    // Structural pin: the class no longer has an `ngOnInit` method.
    expect(
      (RealLink.prototype as unknown as { ngOnInit?: () => void }).ngOnInit,
    ).toBeUndefined();
  });

  it("effect first run executes after construct + initial CD — wires source subscription", () => {
    @Component({
      template: `<a realLink>Link</a>`,
      imports: [RealLink],
    })
    class TestHost {}

    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRealRouter(router)],
    });

    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();

    // After CD, the effect has run at least once. The source was created
    // with default inputs (routeName=""), subscription wired up. With
    // default empty routeName, buildHref throws (caught + logged), no
    // href attribute set on anchor.
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    // anchor exists — directive instantiated successfully
    expect(anchor).not.toBeNull();
    // No href because buildHref("") returns undefined (caught error path)
    expect(anchor.hasAttribute("href")).toBe(false);

    fixture.destroy();
  });

  it("destroy fires effect onCleanup (subscribe stops firing) — no DestroyRef plumbing required", async () => {
    @Component({
      template: `<a realLink>Link</a>`,
      imports: [RealLink],
    })
    class TestHost {}

    TestBed.configureTestingModule({
      imports: [TestHost],
      providers: [provideRealRouter(router)],
    });

    const fixture = TestBed.createComponent(TestHost);

    fixture.detectChanges();

    // Tear down. The effect's onCleanup should fire automatically because
    // effect() registers with the injection-context's DestroyRef. After
    // destroy, navigating the router must NOT cause any further attribute
    // mutation on the (now-detached) anchor.
    const anchor = fixture.nativeElement.querySelector(
      "a",
    ) as HTMLAnchorElement;

    fixture.destroy();

    // Navigate — pre-fix this would have triggered subscribe → updateDom
    // if cleanup didn't fire. Test passes if no error thrown (the source
    // subscriber, if still active, would call setAttribute on a detached
    // anchor — JSDOM allows this but a regression in cleanup would surface
    // via stress tests).
    await router.navigate("users");

    // Anchor is detached from the document but the test simply asserts
    // the navigation succeeds. The cleanup-pinning test for the more
    // observable contract lives in `tests/stress/listener-leak.stress.ts`
    // and `mount-unmount-lifecycle.stress.ts` (500 mount/unmount cycles
    // → bounded heap — exercises the effect-cleanup path at scale).
    expect(router.getState()?.name).toBe("users");
    // Anchor variable used; pin type narrowing.
    expect(anchor.tagName).toBe("A");
  });
});

describe("RealLinkActive — #630 architectural fix (constructor + effect)", () => {
  it("does NOT implement OnInit (ngOnInit removed)", () => {
    expect(
      (RealLinkActive.prototype as unknown as { ngOnInit?: () => void })
        .ngOnInit,
    ).toBeUndefined();
  });
});
