/* eslint-disable @typescript-eslint/no-extraneous-class -- Angular test host components use empty classes with @Component decorators */
import { Component, Directive, input, type OnInit } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { createRouter } from "@real-router/core";
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

    it("creates directive and runs ngOnInit with defaults", () => {
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

      const anchor = fixture.nativeElement.querySelector("a");

      expect(anchor).not.toBeNull();
      expect(anchor.hasAttribute("href")).toBe(false);

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
      expect(navigateSpy).toHaveBeenCalledWith("", {}, {});

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

      spy.mockRestore();
    });

    it("ngOnInit subscribe callback fires on navigation (covers isActive re-set)", async () => {
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

      spy.mockRestore();
    });

    it("swallows rejected router.navigate on click (no unhandled rejection)", async () => {
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      const unhandledRejections: unknown[] = [];
      const onUnhandled = (event: PromiseRejectionEvent): void => {
        unhandledRejections.push(event.reason);
      };

      globalThis.addEventListener("unhandledrejection", onUnhandled);

      vi.spyOn(router, "navigate").mockRejectedValue(
        new Error("rejected by guard"),
      );

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

      expect(unhandledRejections).toStrictEqual([]);

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

      fixture.destroy();

      await router.navigate("users");

      expect([...anchor.classList]).toStrictEqual(classesBefore);
      expect(anchor.getAttribute("href")).toBe(hrefBefore);

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

  it("returns empty string if buildUrl returns empty string (no fallback to buildPath)", async () => {
    const router = createRouter(routes);

    await router.start("/");

    (router as unknown as Record<string, unknown>).buildUrl = () => "";

    expect(buildHref(router, "home", {})).toBe("");

    delete (router as unknown as Record<string, unknown>).buildUrl;
    router.stop();
  });

  it("returns undefined when routeParams contains null value (router throws)", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const router = createRouter([{ name: "user", path: "/user/:id" }]);

    await router.start("/user/1");

    expect(
      buildHref(router, "user", { id: null as unknown as string }),
    ).toBeUndefined();
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
    expect(buildActiveClassName(true, "active", "   ")).toBe("active");
  });

  it("returns base when activeClassName is whitespace-only", () => {
    expect(buildActiveClassName(true, "   ", "base")).toBe("base");
  });

  it("returns undefined when activeClassName is whitespace-only and no base", () => {
    expect(buildActiveClassName(true, "   ", undefined)).toBeUndefined();
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
