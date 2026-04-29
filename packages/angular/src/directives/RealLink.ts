import {
  Directive,
  ElementRef,
  computed,
  inject,
  input,
  signal,
  DestroyRef,
  type OnInit,
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
export class RealLink implements OnInit {
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
  private readonly destroyRef = inject(DestroyRef);
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

  ngOnInit(): void {
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

    this.destroyRef.onDestroy(() => {
      unsub();
      source.destroy();
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

    if (href !== undefined) {
      this.anchor.setAttribute("href", href);
    }

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
