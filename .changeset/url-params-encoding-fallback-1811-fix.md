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
than a preference.** Its two sibling enums already behave this way — an
unrecognised `trailingSlash` or `queryParamsMode` falls back to its default and
the router keeps working — while this option was the odd one out, its
"does not throw" contract holding only because the crash arrived later, from a
different call. Rejecting the value by NAME remains
`@real-router/validation-plugin`'s job; it already owns this exact allowed list,
and a throw in core would have shadowed its better-worded message.

Nothing changes for a valid configuration.
