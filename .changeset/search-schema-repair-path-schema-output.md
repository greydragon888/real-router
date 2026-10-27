---
"@real-router/search-schema-plugin": minor
---

Keys kept after a failed validation now carry the schema's output (#2824)

When validation fails, the plugin strips the rejected keys and restores their `defaultSearch` values, as before, and now validates that repaired query once more and writes back what the schema outputs for it. The keys the schema had accepted used to come back as decoded:

- `z.coerce.number()` under `numberFormat: "none"`: `?status=nope&page=2` gave `{ page: "2" }` and now gives `{ page: 2 }`, as `?page=2` does.
- Transforms and `.default()` apply: `?q=%20shoes%20&status=nope` gave `{ q: " shoes " }` and now gives `{ q: "shoes", sort: "name" }`.

The second run happens only when the first one fails, and never when `onError` is set. A repaired query the schema still rejects — a path-less `refine` issue, for one, names no key to repair — is written back as decoded, as before.

**Breaking change:** the documentation said a failed validation leaves the other keys as decoded and, under `strict: true`, keeps the keys the schema does not declare. When the repaired query passes:

- The kept keys are the schema's output, as after a valid query: code that read `"2"` there reads `2`.
- `strict: true` drops the keys the schema does not declare. Declare a key in the schema to keep it.
- An absent key takes the schema's `.default()` ahead of its `defaultSearch` value, as on a valid query. Where the two differ, keep one.

On every repair, a rejected key's `defaultSearch` value goes through the schema, so write it in the form the schema outputs (`page: 1`, not `"1"`); a schema that throws on it refuses the navigation. The schema runs twice, so a side effect in it runs twice.
