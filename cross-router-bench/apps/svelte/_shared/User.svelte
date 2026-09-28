<script lang="ts">
  // Param page — `data-id` lets the driver detect the param actually changed.
  let { id }: { id: string } = $props();
</script>

<main data-testid="page-user" data-id={id}>
  <h1>User {id}</h1>
</main>
