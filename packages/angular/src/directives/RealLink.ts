import {
  Directive,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from "@angular/core";
import { createActiveRouteSource } from "@real-router/sources";

import { buildHref, navigateWithHash, shouldNavigate } from "../dom-utils";
import { injectRouter } from "../functions/injectRouter";

import type { Params, NavigationOptions } from "@real-router/core";

@Directive({
  selector: "a[realLink]",
  host: {
    "(click)": "onClick($event)",
  },
})
export class RealLink {
  readonly routeName = input<string>("");
  readonly routeParams = input<Params>({});
  readonly routeOptions = input<NavigationOptions>({});
  readonly activeClassName = input<string>("active");
  readonly activeStrict = input(false);
  readonly ignoreQueryParams = input(true);
  /**
   * URL fragment (decoded form, no leading "#") (#532).
   * - omitted/`undefined` → preserve current fragment on same-route navigation
   * - `""` → clear fragment
   * - non-empty → set fragment
   */
  readonly hash = input<string | undefined>(undefined);

  private readonly router = injectRouter();
  private readonly anchor = inject(ElementRef)
    .nativeElement as HTMLAnchorElement;
  private readonly isActive = signal(false);
  private readonly href = computed(() => {
    const hashValue = this.hash();

    return buildHref(
      this.router,
      this.routeName(),
      this.routeParams(),
      hashValue === undefined ? undefined : { hash: hashValue },
    );
  });
  private prevActiveClass = "";
  private prevHref: string | undefined = undefined;

  constructor() {
    // Reactive source-creation effect (#630 fix).
    //
    // Previously this setup lived in `ngOnInit` with a one-time read of the
    // signal inputs — meaning `createActiveRouteSource` captured the
    // ROUTE-NAME / ROUTE-PARAMS / HASH values at mount and never recreated
    // the source when those inputs changed. In AOT compilation (where signal
    // inputs are template-bindable via `<a [realLink]="signal()">`), the
    // active-class tracking would silently drift away from the bound values,
    // even though `href` (a `computed`) updated correctly. Asymmetric
    // reactivity → real AOT bug.
    //
    // The fix: read the inputs inside `effect(...)` so Angular's signal
    // graph tracks them. When any input changes:
    //   1. `onCleanup` of the previous run fires → unsubscribe + destroy
    //      (destroy is a no-op for the cached source returned by
    //      `createActiveRouteSource` — safe even on rapid input changes).
    //   2. Effect re-runs → new source created with current input values →
    //      new subscribe wires up.
    //
    // Effect cleanup is bound to the injection-context's DestroyRef
    // automatically (the same way `inject(DestroyRef).onDestroy(...)`
    // would have been wired in ngOnInit), so no manual destroyRef plumbing
    // is needed.
    //
    // The `ngOnInit` rationale that previously sat here ("signal inputs not
    // available during construction") is outdated for Angular 16+: signal
    // inputs *are* readable inside `effect()` callbacks even from
    // constructor scope, because the effect's first run is scheduled after
    // the input bindings have been applied.
    effect((onCleanup) => {
      // Hash-aware active state (#532): pass `hash` so that tab-style links
      // (same routeName, different `hash` input) only mark the active variant.
      const hashValue = this.hash();
      const source = createActiveRouteSource(
        this.router,
        this.routeName(),
        this.routeParams(),
        hashValue === undefined
          ? {
              strict: this.activeStrict(),
              ignoreQueryParams: this.ignoreQueryParams(),
            }
          : {
              strict: this.activeStrict(),
              ignoreQueryParams: this.ignoreQueryParams(),
              hash: hashValue,
            },
      );

      this.isActive.set(source.getSnapshot());
      this.updateDom();

      const unsub = source.subscribe(() => {
        this.isActive.set(source.getSnapshot());
        this.updateDom();
      });

      onCleanup(() => {
        unsub();
        source.destroy();
      });
    });
  }

  onClick(event: MouseEvent): void {
    if (!shouldNavigate(event) || this.anchor.target === "_blank") {
      return;
    }

    event.preventDefault();
    navigateWithHash(
      this.router,
      this.routeName(),
      this.routeParams(),
      this.hash(),
      this.routeOptions(),
    ).catch(() => {});
  }

  private updateDom(): void {
    const href = this.href();

    // Skip-same-value: `updateDom` fires on every active-source subscribe-fire
    // (every navigation that affects this link), but href only changes when
    // route inputs change (or hash changes via `[realLink hash]`). For a
    // grid of N <a realLink> on a page, this eliminates N redundant
    // `setAttribute("href")` DOM writes per navigation. Mirrors the
    // `prevActiveClass` pattern below.
    if (href !== undefined && href !== this.prevHref) {
      this.anchor.setAttribute("href", href);
    }

    this.prevHref = href;

    const activeClass = this.activeClassName();

    if (this.prevActiveClass && this.prevActiveClass !== activeClass) {
      this.anchor.classList.remove(this.prevActiveClass);
    }

    if (activeClass) {
      this.anchor.classList.toggle(activeClass, this.isActive());
    }

    this.prevActiveClass = activeClass;
  }
}
