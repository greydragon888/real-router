<script lang="ts">
  import CrashOnDemand from "./CrashOnDemand.svelte";

  // Demonstrates <svelte:boundary> — Svelte 5's component-level error
  // boundary. The boundary catches errors thrown during a child
  // component's reactive lifecycle (init, derivations, effects, render).
  // Similar in spirit to React's ErrorBoundary and Angular's @error block,
  // implemented as a built-in language primitive.
  //
  // Important: <svelte:boundary> catches reactive errors. It does NOT
  // catch errors thrown asynchronously inside event handlers — those
  // bubble out as a window-level pageerror. ({#await} {:catch} handles
  // async loader rejections — see Reviews.svelte.) The crash trigger
  // here flips a state signal that re-renders the child <CrashOnDemand>,
  // and the child throws during its init, which the boundary catches.
  //
  // The `onerror` prop is the production-observability hook: it fires
  // BEFORE the @failed snippet renders, with the error and a reset
  // callback. Real apps wire it to Sentry / Datadog / OTel; here we just
  // log to console, and an e2e spy verifies the callback ran with the
  // expected error shape.

  let crashed = $state(false);

  function logBoundaryError(error: unknown): void {
    // In production this would be `Sentry.captureException(error)` etc.
    // The console.error makes the path observable in the e2e test.
    console.error(
      "[product-actions:boundary] caught error:",
      (error as Error).message,
    );
  }
</script>

<svelte:boundary onerror={logBoundaryError}>
  <section data-testid="product-actions">
    <h3>Actions</h3>
    <CrashOnDemand {crashed} />
    <button
      type="button"
      data-testid="trigger-client-error"
      onclick={() => {
        crashed = true;
      }}
    >
      Trigger client error
    </button>
  </section>

  {#snippet failed(error, reset)}
    <section data-testid="product-actions-error">
      <h3>Actions unavailable</h3>
      <p data-testid="actions-error-message">
        {(error as Error).message}
      </p>
      <button
        type="button"
        data-testid="actions-error-reset"
        onclick={() => {
          crashed = false;
          reset();
        }}
      >
        Try again
      </button>
    </section>
  {/snippet}
</svelte:boundary>
