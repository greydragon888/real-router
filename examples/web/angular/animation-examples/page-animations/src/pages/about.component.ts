import { Component, ElementRef, inject } from "@angular/core";

import { installRouteAnimation } from "../route-animation";

@Component({
  selector: "about-page",
  template: `
    <h1>Three approaches, side by side</h1>
    <p>
      This monorepo ships three first-class examples of
      router-coordinated animations. They cover overlapping ground but
      emphasise different trade-offs.
    </p>

    <h2>view-transitions/</h2>
    <p>
      Browser-driven via the <code>document.startViewTransition</code>
      API. Pixel-level snapshots of old and new DOM, automatic FLIP
      for named regions, automatic crossfade for everything else.
      Smallest code, biggest browser support gap (Firefox 145- has no
      API). Hero morphs and persistent-shell crossfades come free.
    </p>

    <h2>route-animations/</h2>
    <p>
      Centralised via three thin factories
      (<code>installPageAnimator</code>, <code>installHeroMorph</code>,
      <code>installListFlip</code>) called once in
      <code>AppComponent</code>'s constructor. Each factory wraps
      <code>injectRouteExit</code> from
      <code>&#64;real-router/angular</code> with its own DOM recipe.
      Cross-route coordination (hero rect capture, list FLIP, ghost
      clones) works because state lives in plain <code>let</code>
      variables (closure-captured) inside the factories. Pages stay
      declarative — they only mark <code>[data-route-root]</code> /
      <code>[data-flip-key]</code> attributes; the factories find them
      via DOM queries.
    </p>

    <h2>page-animations/ (this example)</h2>
    <p>
      Distributed via
      <code>installRouteAnimation(hostRef, &hellip;)</code> per page.
      Each page subscribes to the router for its own lifetime; no
      central module. Encapsulated, simpler mental model, less
      boilerplate per new page after the factory is in place. The
      trade-off: each component instance only sees its own lifecycle.
      Hero morph between routes needs shared state because the source
      rect is captured in page A but the destination is in page B.
      Same for list FLIP with ghost exits — survivors live in the new
      page's DOM, ghosts live nowhere unless something orchestrates
      them centrally.
    </p>

    <h2>motion-animations/</h2>
    <p>
      Router-coordinated via Angular's
      <code>&#64;angular/animations</code> trigger system bound to
      <code>routeName</code>. Library-bundled (the
      <code>@angular/animations</code> package is part of the Angular
      framework). Same URL-and-UI lock-step semantics as the other
      three examples, but the entry / exit choreography is expressed
      through Angular's declarative trigger DSL.
    </p>

    <h2>Decision tree</h2>
    <ul>
      <li>
        Hero morph or persistent-shell static regions, modern
        browsers? → <code>view-transitions/</code>.
      </li>
      <li>
        Cross-browser, custom timing per route, hero morph,
        <em>and</em> list FLIP with ghosts? →
        <code>route-animations/</code>.
      </li>
      <li>
        Cross-browser, simple entry / exit per page, no hero morph,
        no coordinated reorder? → <code>page-animations/</code>
        (this).
      </li>
      <li>
        Cross-browser, declarative page transitions via Angular's
        <code>&#64;angular/animations</code> triggers? →
        <code>motion-animations/</code>.
      </li>
    </ul>

    <h2>The factory</h2>
    <p>
      See <code>src/route-animation.ts</code> (~130 LOC).
      <code>injectRouteExit</code> from
      <code>&#64;real-router/angular</code> wraps
      <code>subscribeLeave</code> with abort/skip-same-route guards;
      the handler awaits
      <code>Element.getAnimations() + .finished</code>
      (reduced-motion fast-path:
      <code>allSettled([])</code> resolves synchronously).
      Entry plays on nav-driven mount via <code>injectRouteEnter</code>
      from the same package — skip-initial built in via
      <code>route.transition.from</code>.
    </p>
    <p>
      <strong>Angular pattern:</strong> pages declare
      <code>private host = inject(ElementRef&lt;HTMLElement&gt;)</code>
      in the constructor and pass it to
      <code>installRouteAnimation</code>. The factory reads
      <code>hostRef.nativeElement</code> inside the handler at exit /
      entry time. The host element <em>is</em> the animated wrapper —
      no inner div needed.
    </p>
  `,
})
export class AboutComponent {
  constructor() {
    const hostRef = inject(ElementRef<HTMLElement>);
    installRouteAnimation(hostRef, {
      entryClass: "fade-in",
      exitClass: "fade-out",
    });
  }
}
