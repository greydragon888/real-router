/**
 * RouterValidator — the type of the slot `RouterInternals.validator`. It
 * declares no member: core refuses through check positions and reports through
 * diagnostic kinds, and asks nothing through the slot (#2388).
 *
 * `@real-router/validation-plugin` writes an object here when it is installed,
 * and a second installation on the same router reads the slot and is refused
 * (#2349).
 */

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- the slot's type declares no member, because core asks nothing through it (#2388)
export interface RouterValidator {}
