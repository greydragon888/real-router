---
"@real-router/core": patch
---

Comments in `src` describe the present, and a guard keeps them that way (#2071)

CLAUDE.md bans comments that narrate how the code got here — history belongs to the issue, the changeset and IMPLEMENTATION_NOTES, where nobody has to keep a second copy true. Nothing enforced it, so 108 such comments had accumulated. They are rewritten as statements of what holds now, and `comment-historiography-authority.test.ts` holds the line: it scans `src` comments through the TS scanner and compares the found set to a frozen table, failing both when a new site appears and when a fixed one is not removed from the table.

Two of the rewrites correct claims that mutation showed were false rather than merely stale — `SegmentMatcher`'s "third thrower" argument (the write goes through `putField`, so the setter is never invoked) and "neutralising any single write changes nothing observable" (reverting the `#traverseFrom` write reds three behavioural cells).

⚠ **Nothing ships differently.** The change is comments and one test. Both build pipelines drop comments — tsdown minifies, ng-packagr's FESM output carries none — so every published artifact is byte-identical, verified against the built `dist` rather than assumed. The other public packages whose comments were touched are deliberately not versioned for the same reason.
