<script lang="ts">
  import User from "../../_shared/User.svelte";
  import { route } from "./router";
</script>

<User id={route.params.id ?? ""} />
<!-- Literal href (sv-router's global click handler auto-intercepts matching
     anchors); route.params.id is reactive so both href + data-id advance. -->
<a
  href={`/users/${Number(route.params.id ?? 0) + 1}`}
  data-testid="link-user-next"
>
  Next
</a>
