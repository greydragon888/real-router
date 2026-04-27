<template>
  <div>
    <h1>About</h1>
    <p>
      This example uses <code>@real-router/vue</code> with the
      <code>viewTransitions</code> prop on <code>RouterProvider</code>. The
      utility lives in <code>shared/dom-utils/view-transitions.ts</code> and
      uses only the public <code>subscribeLeave</code> and
      <code>subscribe</code> router APIs — no private internals.
    </p>

    <p><strong>How the timing works</strong></p>
    <ol>
      <li>
        <code>subscribeLeave</code> fires at <code>LEAVE_APPROVED</code> —
        utility calls <code>document.startViewTransition()</code> and
        <strong>returns a Promise</strong>. The router awaits it.
      </li>
      <li>
        The browser captures the old DOM snapshot (per CSS VT spec §7.3 —
        mandatory before <code>updateCallback</code> runs), then invokes the
        callback. Inside the callback we call <code>resolveLeave()</code> —
        the router unblocks and proceeds through activation guards and
        <code>setState</code>.
      </li>
      <li>
        <code>subscribe</code> fires at <code>TRANSITION_SUCCESS</code>.
        <code>browser-plugin</code> pushes the new URL here — under the VT
        freeze frame, not before it.
      </li>
      <li>
        Utility resolves the deferred via <code>setTimeout(0)</code>. Vue's
        reactivity flushes on the microtask queue, which runs earlier than our
        <code>setTimeout</code> task — so the DOM is committed by the time our
        callback runs. Browser then captures the new snapshot and plays
        <code>::view-transition-old()</code> /
        <code>::view-transition-new()</code> animations.
      </li>
    </ol>

    <p>
      <strong>
        Why <code>setTimeout(0)</code>, not
        <code>requestAnimationFrame</code>?
      </strong>
    </p>
    <p>
      Once <code>updateCallback</code> has been invoked, VT enters the
      <code>update-callback-called</code> phase and Chromium sets rendering
      suppression on the document — which <em>also blocks rAF callbacks</em>.
      An rAF scheduled from <code>subscribe</code> would never fire, the
      deferred would hang, and after 4 s Chromium aborts with
      <code>TimeoutError: Transition was aborted because of timeout in DOM
      update</code>. <code>setTimeout</code> runs on the task queue independent
      of the rendering pipeline, so it fires regardless of suppression. This
      is the one non-obvious detail of the whole design — see
      <code>shared/dom-utils/view-transitions.ts</code> for the comments.
    </p>

    <p><strong>Why clicks feel blocked during long animations</strong></p>
    <p>
      While a View Transition is animating, the document is under
      <strong>rendering suppression</strong>
      (<a href="https://drafts.csswg.org/css-view-transitions-1/">CSS VT L1
      §4</a>): the real DOM is still mounted, but it is not painted and is
      effectively absent from the hit-test tree. Only the
      <code>::view-transition</code> pseudo stack is visible and hit-testable.
      A click during playback lands on the overlay — not on the underlying
      Link — so <code>Link.onClick</code> never fires and no new navigation
      starts.
    </p>
    <p>
      Adding <code>pointer-events: none</code> to
      <code>::view-transition</code> is the documented workaround, and it does
      work <em>when part of the page is outside the captured scope</em>. In
      scoped transitions (e.g. only a list container has
      <code>view-transition-name</code>) the surrounding DOM stays in the
      hit-test tree, so clicks on that surrounding area pass through. For
      <strong>root-scope</strong> transitions like this demo's default 2400 ms
      fade, the entire viewport is captured — there is nothing underneath to
      hit, so the overlay-transparency trick cannot rescue interactivity.
    </p>
    <p>
      Production guidance: keep VT durations under ~400 ms. At that length the
      block is imperceptible to the user. This demo intentionally runs long so
      each phase is clearly visible for teaching.
    </p>
  </div>
</template>
