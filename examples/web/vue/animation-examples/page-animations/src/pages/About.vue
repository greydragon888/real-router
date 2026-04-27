<script setup lang="ts">
import { ref } from "vue";

import { useRouteAnimation } from "../use-route-animation";

const root = ref<HTMLDivElement | null>(null);

useRouteAnimation(root, { entryClass: "fade-in", exitClass: "fade-out" });
</script>

<template>
  <div ref="root">
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
      Centralised via three thin composables
      (<code>usePageAnimator</code>, <code>useHeroMorph</code>,
      <code>useListFlip</code>) called once at the top of
      <code>App</code>. Each composable wraps
      <code>useRouteExit</code> from <code>@real-router/vue</code>
      with its own DOM recipe. Cross-route coordination (hero rect
      capture, list FLIP, ghost clones) works because state lives in
      plain <code>let</code> variables (closure-captured) inside the
      composables. Pages stay declarative — they only mark
      <code>[data-route-root]</code> / <code>[data-flip-key]</code>
      attributes; the composables find them via DOM queries.
    </p>

    <h2>page-animations/ (this example)</h2>
    <p>
      Distributed via <code>useRouteAnimation(ref, …)</code> per page.
      Each page subscribes to the router for its own lifetime; no
      central module. Encapsulated, simpler mental model, less
      boilerplate per new page after the composable is in place. The
      trade-off: each component instance only sees its own lifecycle.
      Hero morph between routes needs shared state because the source
      rect is captured in page A but the destination is in page B.
      Same for list FLIP with ghost exits — survivors live in the new
      page's DOM, ghosts live nowhere unless something orchestrates
      them centrally.
    </p>

    <h2>motion-animations/</h2>
    <p>
      Router-coordinated via Vue's built-in
      <code>&lt;Transition&gt;</code> component wrapped in a keyed
      block. Library-free, language-native. Same URL-and-UI lock-step
      semantics as the other three examples, but the entry / exit
      choreography is expressed through Vue's first-class transition
      directives.
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
        Cross-browser, library-free declarative page transitions
        via Vue's built-in <code>&lt;Transition&gt;</code>? →
        <code>motion-animations/</code>.
      </li>
    </ul>

    <h2>The composable</h2>
    <p>
      See <code>src/use-route-animation.ts</code> (~120 LOC).
      <code>useRouteExit</code> from <code>@real-router/vue</code>
      wraps <code>subscribeLeave</code> with abort/skip-same-route
      guards; the handler awaits
      <code>Element.getAnimations() + .finished</code> (reduced-motion
      fast-path: <code>allSettled([])</code> resolves synchronously).
      Entry plays on nav-driven mount via <code>useRouteEnter</code>
      from the same package — skip-initial built in.
    </p>
    <p>
      <strong>Vue pattern:</strong> pages declare
      <code>const ref = ref&lt;HTMLDivElement | null&gt;(null)</code>,
      bind via <code>:ref="ref"</code> (template ref), and pass the
      ref to the composable. The composable reads
      <code>ref.value</code> inside the handler at exit / enter time.
    </p>
  </div>
</template>
