---
"@real-router/core": patch
---

An unrecognised `urlParamsEncoding` degrades to the default encoder (#1811)

The option indexes two plain object literals — `ENCODING_METHODS` and
`DECODING_METHODS` — and did so with no existence check, so whatever the lookup
returned became the live encoder. Measured on `/x/:id` with
`buildPath("x", { id: "a b" })`:

- `"toString"` / `"valueOf"` built `/x/[object Object]`, and `matchPath` read it
  straight back — the param VALUE destroyed in both directions, silently;
- `"constructor"` made `Object` the encoder, which passes the value through, so a
  space landed **raw** in `state.path`;
- an ordinary typo produced `undefined` and deferred a
  `TypeError: slot.encoder is not a function` from inside `buildPath`, naming
  nothing.

`Object.hasOwn` on the table now selects the encoder, falling back to `"default"`
for anything it does not carry. One check covers all three index sites, which all
read `#options.urlParamsEncoding` after the constructor fixes it once.

**Bare core degrades rather than throws, and that matched a measurement rather
than a preference.** `options.test.ts` carries a `🔴 CRITICAL` family asserting
that bare core does not throw on an invalid `trailingSlash` / `queryParamsMode` /
`urlParamsEncoding`, and of those three this option was the only one that did not
tolerate anything — its cell passed merely because the crash arrived later, from a
different call. Rejecting the value by NAME remains
`@real-router/validation-plugin`'s job; it already owns this exact allowed list,
and a throw in core would have shadowed its better-worded message.

⚠ Two scope notes, both measured, because the obvious wording overstates this.
First, "degrades to its default" is exact only for `trailingSlash`: an
unrecognised `queryParamsMode` behaves like `"default"` / `"strict"`, **not** like
the documented default `"loose"` — it silently drops an undeclared query key that
`loose` would print and commit. Second, the router has six string-enum options,
not three: the four `queryParams` formats are enums too, and they **throw** by
name (#1318, extended by #1796 in this same PR). So core's answer to an invalid
enum is not uniform, and this change does not make it so.

⚠ The **match** direction changes as well, not only the build direction. An
unrecognised encoding used to leave the decoder `undefined`, which short-circuits
`#decodeParams` — so decoding *and* percent-validation were both skipped and the
matcher behaved like `"none"`. With the fallback both run: `/x/a%40b` now decodes
to `a@b` where it stayed raw, and `/x/%E0%41` is now rejected where it used to
match. Only a misconfigured router is affected, but a URL that resolved can now
404.

Nothing changes for a valid configuration.
