---
"@real-router/core": minor
---

Replace rou3 with custom Segment Trie path matcher (#63)

The internal path matching engine has been replaced from rou3's radix tree to a custom Segment Trie matcher. Each trie edge represents an entire URL segment (not per-character prefix), enabling hierarchical named routing with static cache, pre-computed `buildPath` templates, and zero-allocation match.

The public API (`matchPath`, `buildPath`, `buildState`) is unchanged.
