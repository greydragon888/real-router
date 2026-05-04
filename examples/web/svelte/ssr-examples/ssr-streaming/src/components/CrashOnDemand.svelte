<script lang="ts">
  // Helper for ProductActions's <svelte:boundary> demo.
  //
  // Throws inside a $derived expression so the throw happens on every
  // reactive re-evaluation — not just at init. The parent's boundary
  // catches the throw and renders its @failed snippet.
  //
  // Throwing in plain top-level <script> code wouldn't work for "trigger
  // crash later" UX, because top-level code only runs once at mount.
  const { crashed }: { crashed: boolean } = $props();

  const message = $derived.by((): string => {
    if (crashed) {
      throw new Error("Intentional reactive error");
    }

    return "All systems go";
  });
</script>

<p data-testid="actions-message">{message}</p>
