---
"@real-router/validation-plugin": patch
---

the option validators judge a bag by its prototype (#2217)

`validateLimits` and `validateDefaultBag` asked `value.constructor !== Object`.
That walks the VALUE's own chain, so `Object.create(null)` answers `undefined`
and was refused — along with a literal demoted through
`Object.setPrototypeOf(x, null)` — while every other site in the tree accepts
both. A bag with no prototype at all is the most conformant shape
`packages/core/CLAUDE.md` › Supported Input Shapes admits.

Both now test the prototype pair, through an intrinsic captured at module load
beside the three this file already captured (#1971). The previous form resolved
`constructor` through the writable `Object.prototype.constructor` and compared
against the live global.

⚠ **No behaviour change reaches an application, and that is measured rather than
claimed.** `validateOptions` has one non-test caller — the plugin's own
retrospective pass over `ctx.getOptions()`, which is core's COPY of the options;
core itself never calls it. A router constructed with a null-prototype
`defaultParams` and `limits` installs the plugin without a throw both before and
after. The shapes that start passing were unreachable through the only door.
What changes is that the predicate stops being wrong for the day a door hands it
a bag the caller still owns.

`option-bag-prototype-2217` pins the pair on the functions rather than the door,
for the same reason, and `prototype-term-authority-2197`'s third-spelling
backlog empties.
