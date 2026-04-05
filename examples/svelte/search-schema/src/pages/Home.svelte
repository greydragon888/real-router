<script lang="ts">
  import { Link } from "@real-router/svelte";
</script>

<div>
  <h1>Search Schema Plugin</h1>
  <p>
    This example demonstrates <code>@real-router/search-schema-plugin</code> —
    Zod-based validation and coercion of URL search parameters.
  </p>
  <p>
    Navigate to
    <Link routeName="products">Products</Link>
    to see validated search params in action.
  </p>
  <div class="card">
    <p><strong>Features:</strong></p>
    <ul style="margin-top: 8px; padding-left: 20px">
      <li>Type coercion — string "2" becomes number 2</li>
      <li>Default values — missing params get schema defaults</li>
      <li>Validation — invalid values are replaced with defaults</li>
      <li>Enum enforcement — sort must be "name", "price", or "date"</li>
    </ul>
  </div>
</div>
